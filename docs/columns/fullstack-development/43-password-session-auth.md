---
title: "第 43 章：密码与 Session 鉴权"
description: "实现慢哈希、随机盐、数据库 Session、Cookie 轮换与 CSRF，验证登录、注销、过期和认证资源边界。"
date: '2026-10-23'
category: 后端安全
tags: [密码, Session, Cookie, CSRF]
series:
  order: 44
---

# 第 43 章：密码与 Session 鉴权

鉴权回答“当前请求是谁”，授权回答“这个人能做什么”。浏览器提交的 userId、页面显示的用户名、localStorage 中的角色都不是可信身份。本章用随机 Cookie 找到数据库中的会话，再由第 45 章判断资源权限；不将登录状态与租户角色混成一个长期不可撤销的客户端对象。

## 43.1 选择适合博客的认证模型

同域浏览器博客优先选择服务器 Session：浏览器保存无业务含义的随机令牌，服务器保存摘要、用户与期限。删除数据库会话即可撤销访问，不必为 JWT 增加撤销列表后再重新实现 Session。JWT 适合有明确签发者、受众与验证边界的场景，不是“现代后端必须使用”的标配。

密码必须使用慢哈希。SHA-256 适合摘要高熵会话令牌，不适合抵抗人类密码字典攻击。OWASP 推荐新系统优先 Argon2id；课程为减少原生扩展和部署差异，采用 Node 内置异步 scrypt，参数按其推荐的 `N=2^17, r=8, p=1` 起步。参数需要在目标机器压测，不能把学习值当成无限并发的生产配置。[密码存储指南](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

每次运算约需要百兆级内存，多请求会累积；异步不等于零成本，它仍占用工作线程与内存。先限制输入长度、请求速率和并行密码任务，再进行哈希。不要使用同步 scrypt 阻塞事件循环，也不要为了让接口更快降到快速散列。

## 43.2 可验证的密码原语

在学习项目创建 `src/security.ts`：

```ts
import {
  createHash, randomBytes, scrypt, timingSafeEqual,
} from 'node:crypto';

const cost = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, cost, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt-v1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const parts = /^scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(stored);
  if (!parts) return false;
  const actual = await derive(password, Buffer.from(parts[1]!, 'hex'));
  return timingSafeEqual(actual, Buffer.from(parts[2]!, 'hex'));
}

export function sessionDigest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
```

盐不需要保密，随机且每次独立即可；摘要包含版本，为将来调参保留识别边界。这个格式只接受一种固定成本，不允许攻击者通过损坏的数据库字符串任意指定超大 N。升级时增加新版本解析，在成功登录后重算，不直接重写旧摘要或声称能“解密密码”。

注册输入要求至少 15 字符、最多 128 字符是本课程的单因素策略，生产还需弱密码阻止、邮箱验证、找回密码与 MFA/Passkey 方案。密码不 `trim()`，不静默截断，不强迫周期性修改；Unicode 规范化必须有一致政策，不能注册与登录各自处理。邮箱统一小写是第 40 章的产品规则，不是所有邮箱语义的普遍结论。

## 43.3 Session 表与创建事务

新增迁移：

```sql
CREATE TABLE sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
```

这里使用独立随机 CSRF 值便于理解。第 54 章最小项目改为从会话令牌派生 CSRF，所以其迁移没有 `csrf_token` 列；两种方案不要同时照抄进同一表。CSRF 值可以交给当前页面，Session 令牌则只放在 HttpOnly Cookie。

```ts
import type { PoolClient } from 'pg';
import { randomBytes } from 'node:crypto';
import { sessionDigest } from './security.js';

export async function issueSession(
  db: PoolClient, userId: string, oldToken?: string,
) {
  if (oldToken) {
    await db.query('DELETE FROM sessions WHERE token_hash=$1',
      [sessionDigest(oldToken)]);
  }
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  await db.query(
    `INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at)
     VALUES($1,$2,$3,now()+interval '7 days')`,
    [sessionDigest(token), userId, csrfToken],
  );
  return { token, csrfToken };
}
```

注册的用户、空间、owner 成员和 Session 放在同一事务内；哈希在事务外完成，避免持锁等待密码计算。提交后才设置 Cookie，否则数据库回滚但浏览器拿到不存在的会话。登录成功时撤销当前旧会话并创建新令牌，避免固定会话攻击；“保留所有设备”或“撤销其他设备”是额外产品选择，不能暗中把所有历史会话永久保留。

数据库只保存令牌摘要，备份泄漏时不直接暴露可用 Cookie。仍然要保护数据库与摘要，因为攻击者若能写库可以自行建立会话。绝对期限防止无限滑动续期；空闲期限、设备管理与定期清理是生产扩展，清理任务失败也不能让过期会话重新有效。

## 43.4 Fastify Cookie 与身份解析

安装 `@fastify/cookie@11.1.3`，在需要读取 Cookie 的 hooks 之前注册：

```ts
import cookie from '@fastify/cookie';
await app.register(cookie);

const cookieName = secureCookie ? '__Host-blog-session' : 'blog-session';
const cookieOptions = {
  path: '/', httpOnly: true, secure: secureCookie, sameSite: 'lax' as const,
};
reply.setCookie(cookieName, token, {
  ...cookieOptions, maxAge: 7 * 86400,
});
```

生产 `__Host-` Cookie 必须 Secure、Path=/、没有 Domain，并通过 HTTPS 传输。HttpOnly 限制脚本读取 Cookie，却不阻止浏览器发送，也不能消除 XSS。SameSite=Lax 是跨站请求的部分防线，不替代 CSRF。开发用固定 `127.0.0.1` 域名与同源代理，不混用 localhost，以免出现“注册成功但刷新退出”。

每次请求先检查令牌格式，再用摘要查询：

```ts
const token = request.cookies[cookieName];
if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
const result = await pool.query<{ id: string; csrf_token: string }>(
  `SELECT u.id,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id
   WHERE s.token_hash=$1 AND s.expires_at > now()`,
  [sessionDigest(token)],
);
return result.rows[0] ?? null;
```

接口只返回必要用户字段与 CSRF，设置 `Cache-Control: no-store`。退出时删除摘要并用相同 Cookie 属性清除；只清浏览器 Cookie 不能撤销被复制的会话。密码修改、账号停用和敏感身份绑定需要重新认证与会话撤销，不能仅修改前端状态。

## 43.5 CSRF、登录枚举与限流

浏览器状态变更请求先校验完整 Origin，再要求会话绑定的 CSRF 请求头。注册和登录尚无认证会话，至少校验 Origin，防止登录 CSRF；敏感操作不要设计成 GET。比较 token 前先限制类型与长度，再用恒定时间比较。

```ts
function sameToken(expected: string, value: unknown) {
  if (typeof value !== 'string' || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(value));
}
const pathname = new URL(request.url, appOrigin).pathname;
```

路由判断使用解析后的 pathname，不比较含 query 的整个 URL；否则 `/api/logout?x=1` 可能绕过退出保护，`/api/login?x=1` 可能绕过限流。更稳妥的封装是给保护路由明确注册 hook，减少依赖字符串匹配。反向代理提供的 Origin、IP 与 Host 也有信任边界，不任意开启 `trustProxy: true`。

登录不存在的邮箱时仍验证一份启动时生成的 dummy hash，再统一返回“邮箱或密码错误”。这只能减少明显时序差异，不是恒定时间登录的数学保证。认证限流同时考虑 IP、账户与整体容量；单进程 Map 仅适合学习，不适合多实例。达到并行运算上限返回 503，速率上限返回 429，并避免错误日志包含密码、Cookie 或请求体。

## 43.6 失败证据、排错与练习

先运行密码原语检查：同密码两次摘要不同；正确密码 true；错误密码 false；损坏格式 false。不能用 mock 的“密码正确”替代真实 scrypt。

再在隔离数据库验证：注册后刷新仍登录；错误密码 401；缺 CSRF 和错误 Origin 403；过期 Session 401；退出后重放旧 Cookie 401；带 query 的保护路由仍拒绝。并发提交重复邮箱只允许一个事务成功，另一个返回已知唯一约束冲突，不留下孤立租户。

Cookie 不发送时按域名、Path、Secure、SameSite、代理和 credentials 顺序排查；不要把 Secure 永久关闭来修复生产 HTTPS。scrypt 报内存错误时核对 maxmem 与成本参数，慢登录时检查工作线程竞争与内存，不先降低安全成本。401 与 403 分别表示身份缺失和权限拒绝，前端不应把所有错误自动跳到登录页。

练习为会话增加绝对期限测试、用户主动撤销全部设备接口与密码更新后的会话撤销。完成标准是正确与错误路径有可重复验证、旧令牌不能复用、数据库无明文密码、前端无法读取 Session Cookie，且用户 A 的身份仍需接受下一章的资源授权。

## 43.7 找回密码是独立的敏感流程

忘记密码时不能查询旧密码，也不能把一个新密码通过邮件发给用户。恢复入口统一返回“若账号存在将收到邮件”，生成高熵一次性令牌，数据库只保存摘要、用户、用途与短期限。令牌不能兼任邮箱验证或登录会话；消费时在同一事务锁定记录、检查期限、更新密码摘要并撤销旧会话。邮件中的地址来自固定站点配置，不从请求 Host 拼接，避免恢复链接被替换到攻击者域名。

恢复请求与消费接口都需要限流，邮件任务需要上一章之外的可靠投递机制。发出邮件不代表用户已验证，点击链接也不应立刻执行状态变更；显示表单并以明确提交完成，防止邮件安全扫描器预取链接导致令牌被提前消费。令牌不进入页面分析、第三方脚本或 Referer，恢复页面使用严格来源策略，成功后跳到无令牌地址。

账号停用应在会话解析中立即生效，不能等七天自然过期。服务端可以额外检查用户状态或统一撤销全部 Session；哪一种都要测试停用与并发请求的边界。课程最小项目没有恢复、邮箱验证和停用管理，部署前必须建立这些流程，不能把“密码登录正确”当作账号生命周期已经完整。

## 官方参考

- [Node.js Crypto：scrypt 与 timingSafeEqual](https://nodejs.org/docs/latest-v24.x/api/crypto.html)。
- [OWASP：密码存储](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)、[会话管理](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[CSRF 防护](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)。
- [Fastify Cookie 官方插件](https://github.com/fastify/fastify-cookie)。

下一章：[OAuth、OIDC 与登录安全](./44-oauth-oidc-security)。
