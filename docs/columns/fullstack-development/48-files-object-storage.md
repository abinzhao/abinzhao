---
title: "第 48 章：文件与对象存储"
description: "从上传意图到隔离对象、版本固定、服务端验证和图片重编码，建立带租户授权、配额与清理策略的文件生命周期。"
date: '2026-10-23'
category: 后端开发
tags: [对象存储, S3, 文件上传, 图片安全]
series:
  order: 49
---

# 第 48 章：文件与对象存储

浏览器选到一个文件，只证明它拿到了某些字节。扩展名、MIME、文件名和“上传成功”都不是内容安全证据。本章让原文件先进入私有隔离区域，后端固定对象版本、校验并重编码，只有 ready 的结果才能关联文章；数据库管理生命周期，对象存储承载字节。

## 48.1 确定最小上传政策

博客第一阶段只接受 JPEG、PNG、WebP，单文件最多 2 MiB，最多 1600 万输入像素，拒绝动画、多页和 SVG。SVG 可以承载主动内容，PDF、压缩包和视频需要不同扫描流程，不因为“也是文件”就共用图片处理器。限制是课程政策，生产需按成本与资源进一步调整。

数据库保存随机 assetId、tenantId、状态、对象 key、对象版本、大小和派生信息。原文件名只做展示并限制长度，不能拼成服务器路径；服务器生成 `quarantine/{tenantId}/{assetId}`。客户端不能决定 bucket、ACL、最终 key 或 owner。

2026-10-23 核验 `@aws-sdk/client-s3` 与 `@aws-sdk/s3-request-presigner` 均为 **3.1156.0**，图片处理库 `sharp` 为 **0.35.5**。固定安装到学习后端：

```bash
npm install --save-exact @aws-sdk/client-s3@3.1156.0
npm install --save-exact @aws-sdk/s3-request-presigner@3.1156.0 sharp@0.35.5
```

S3 兼容服务并不保证 AWS 所有特性一致，版本、checksum、预签名、CORS 与权限要按所选平台实测。课程示例采用启用版本控制的私有 bucket；未配置版本控制时不能直接使用下面的固定版本流程。

## 48.2 建立上传状态机

```sql
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  owner_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','processing','ready','rejected','deleted')),
  quarantine_key text NOT NULL UNIQUE,
  quarantine_version text,
  declared_size integer NOT NULL CHECK(declared_size BETWEEN 1 AND 2097152),
  declared_type text NOT NULL,
  public_key text UNIQUE,
  width integer,
  height integer,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id)
);
```

上传申请检查 Session、CSRF、当前成员写权限、租户配额与待处理数量，再建立 requested 记录。申请阶段应预留额度，避免并发申请绕过配额；同一事务内锁租户配额行。签名失败可留下短期 requested，由清理器处理，不能把它当 ready 返回。

完成上传接口只能将 requested 变成 processing，重复调用返回当前状态，不生成多个扫描任务。失败进入 rejected 并释放预留额度；ready 后绑定文章时仍校验同租户与可用状态。删除只更改数据库而忘记对象会留下费用和隐私问题，需要幂等清理任务。

## 48.3 预签名不是授权永久生效

```ts
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: storageRegion });
const command = new PutObjectCommand({
  Bucket: privateBucket,
  Key: asset.quarantine_key,
  ContentType: asset.declared_type,
});
const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 120 });
```

生产优先用工作负载身份或最小权限角色，不把长期 access key 放进浏览器。签名 URL 是短期 bearer 能力，拿到的人可能上传到指定 key，必须禁止日志与分析平台收集完整 URL。两分钟期限是学习选择，用户离开或成员被撤销后旧 URL 在期限内仍可能可用；最终完成与关联时必须重新授权。

浏览器执行 PUT，按签名要求设置 Content-Type；bucket CORS 只允许确定的站点与必要方法、请求头，不设任意源加 credentials。原始 bucket 保持禁止公开读，上传成功也不能直接把 quarantine URL 显示给所有读者。

重要限制：上述预签名 PUT 的 declared_size 并不在存储侧自动限制实际字节，前端 `file.size` 也可绕过。需要强制上传前大小限制时使用带 `content-length-range` 的预签名 POST 政策，或通过有流量上限的后端代理；无论采用哪种仍要服务端验内容。PUT 方案须承担隔离大对象被上传后清理的成本，不能称它“安全限制了大小”。[S3 预签名上传](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)

## 48.4 完成阶段固定对象版本

后端只对数据库记录的 key 执行 HEAD：

```ts
const metadata = await s3.send(new HeadObjectCommand({
  Bucket: privateBucket, Key: asset.quarantine_key,
}));
if (!metadata.VersionId || metadata.VersionId === 'null' ||
    !metadata.ContentLength ||
    metadata.ContentLength !== asset.declared_size ||
    metadata.ContentLength > 2 * 1024 * 1024) {
  throw new AppError(400, 'UPLOAD_INVALID', '文件版本或大小不符合要求');
}
```

HEAD 不证明字节真的是图片，也不证明恶意内容已经消除。ETag 不总是文件 MD5，特别是分段或加密对象；不能用它当可靠内容校验算法。需要 checksum 时按平台支持显式提交与核验，不能自行假设其语义。

在短事务内重新授权、锁 asset 行，并写 `quarantine_version=metadata.VersionId` 和 processing 状态，再写 Outbox 扫描事件。第 47 章 outbox 的 event_type CHECK 需要以新迁移扩展 `asset.scan.v1`，不手改已应用迁移。网络 HEAD 在事务外执行，固定 VersionId 后扫描时只读取这一版本，防止预签名 URL 再次 PUT 将刚验证的对象覆盖。

数据库提交后进程退出，Outbox 能恢复扫描。若存储平台没有版本能力，应改用一次完成后服务器复制到不可变内部 key，再扫描内部副本并核验；不要声称只在客户端禁用第二次上传就防住竞争。

## 48.5 有界读取与图片重编码

扫描 worker 使用固定版本获取对象，流式限制实际读取量：

```ts
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

async function verifiedImage(key: string, versionId: string) {
  const object = await s3.send(new GetObjectCommand({
    Bucket: privateBucket, Key: key, VersionId: versionId,
  }));
  if (!(object.Body instanceof Readable)) throw new Error('Missing Node stream');
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of object.Body) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > 2 * 1024 * 1024) throw new Error('Image byte limit exceeded');
      chunks.push(bytes);
    }
  } finally {
    object.Body.destroy();
  }
  const input = Buffer.concat(chunks, total);
  const image = sharp(input, { limitInputPixels: 16000000, failOn: 'warning' });
  const info = await image.metadata();
  if (!info.format || !['jpeg','png','webp'].includes(info.format) ||
      !info.width || !info.height || (info.pages ?? 1) > 1) {
    throw new Error('Unsupported image');
  }
  const result = await image.rotate().resize({
    width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true,
  }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  return result;
}
```

`rotate()` 按方向信息整理展示，重新编码默认不保留原始 EXIF 等元数据，有助于减少位置隐私。输出仍需大小和宽高检查，写入独立安全结果 key，设置服务端 Content-Type=image/webp：

```ts
const result = await verifiedImage(asset.quarantine_key, asset.quarantine_version);
await s3.send(new PutObjectCommand({
  Bucket: privateBucket,
  Key: `ready/${asset.tenant_id}/${asset.id}.webp`,
  Body: result.data, ContentType: 'image/webp',
}));
```

之后以任务租约和 asset 状态条件更新 ready、输出尺寸和 public_key。对象写成功而数据库更新失败可能留下孤立结果，重试覆盖同一派生 key 或按内容摘要生成不可变 key，再由清理器修复。不要将外部 S3 调用夹在数据库事务里期待一起回滚。

图片解码器也会有漏洞，必须保持安全补丁、限制 worker 并发、内存和处理期限，必要时运行隔离进程。重编码不是对所有恶意文件的形式化安全证明；接受通用附件时需要病毒扫描、格式解析与下载隔离政策，不能沿用此图片例子。

## 48.6 发布、下载与清理

文章只关联同租户 ready 资产，组合外键见第 45 章。公开文章图片可以使用明确公开的派生对象与 CDN，私有草稿图片需要服务端权限检查后短期 GET 签名；URL 猜测困难不等于授权。不要让扫描前原文件与公开派生对象共用公开 bucket 前缀。

返回下载响应时使用正确 MIME、`X-Content-Type-Options: nosniff` 与必要的 attachment，用户文件不与应用 HTML 放在同一可执行源。客户端文件名需安全编码，禁止 CRLF 进入响应头。移除文章引用时按引用计数或关联查询判断是否还能删除，不能删除仍被其他文章使用的图片。

清理 requested 过期、rejected 原文件、孤立输出和已删除资产时，数据库与存储都要可重试。版本化 bucket 中删除当前 key 不一定删除历史版本，需配置生命周期和版本清理政策；否则“用户删除图片”仍可能保留历史字节。备份与审计期限也要明确。

## 48.7 验证与练习

正常实验完成申请、PUT、完成、processing、ready、绑定文章与读取派生图片。异常分别上传假 PNG、SVG 改后缀、超限字节、超大像素、动画、截断文件；ready 不应出现。A 租户不能完成或绑定 B 的 assetId，撤销成员后不能完成旧申请。

同一 URL 再次 PUT 后，固定 VersionId 的扫描仍读取第一次完成的版本；重复完成不重复入队。worker 在对象写入后终止再恢复，状态最终可收敛且不会向公众暴露 quarantine。CORS 错误、签名过期、区域错误和时钟偏移分别排查，不通过公开 bucket 或永久签名规避。

练习补配额预留、资产删除、历史版本清理与私有图片访问测试。完成标准包含真实存储联通、隔离扫描、授权、覆盖竞态和清理证据。第 54 章配套最小项目尚未实现上传，本文是独立扩展实践，不能以 API/密码测试通过代替文件链路验证。

## 官方参考

- [AWS SDK JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html)、[S3 预签名上传](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html)。
- [S3 POST policy](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html)、[版本控制](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)。
- [sharp 输入与限制](https://sharp.pixelplumbing.com/api-constructor/)、[输出与元数据](https://sharp.pixelplumbing.com/api-output/)、[registry](https://registry.npmjs.org/sharp)。
- [OWASP 文件上传指南](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)。

下一章：[SSE、WebSocket 与实时状态](./49-sse-websocket-realtime)。
