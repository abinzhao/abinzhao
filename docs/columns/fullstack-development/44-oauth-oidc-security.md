---
title: "第 44 章：OAuth、OIDC 与登录安全"
description: "区分授权与身份，用 Authorization Code、PKCE、state、nonce 和服务端会话完成 OIDC 登录，控制回调、绑定与令牌泄漏。"
date: '2026-10-23'
category: 后端安全
tags: [OAuth, OIDC, PKCE, 登录安全]
series:
  order: 45
---

# 第 44 章：OAuth、OIDC 与登录安全

第三方登录不是“拿一个 access token 当用户 ID”。OAuth 处理客户端访问受保护资源的授权，OIDC 在其上增加身份协议。博客应由后端验证身份，再签发自己的 Session；浏览器不需要持有提供方 access token，也不能自行解码 JWT 后宣布已经登录。

## 44.1 协议角色与版本依据

浏览器是用户代理，博客后端是客户端，身份提供方是 OpenID Provider。授权服务器发 access token 给目标 API；ID token 面向登录客户端，必须核验签发者、受众、期限与登录上下文。签名合法不代表 token 对本博客有效，其他应用的 ID token 也可能来自同一提供方。

本章选择 Authorization Code + PKCE，使用 `S256`，同时保留随机 state 和 nonce。不要新建 Implicit Flow，也不要让用户把身份提供方密码交给博客换 token；客户端凭据流程代表应用，不代表交互用户。[OAuth 安全最佳实践 RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)

2026-10-23 npm 官方 registry 核验 `openid-client` 稳定版 **6.8.8**，发布时间为 2026-09-05。v6 使用 ESM 与标准 Web API，不能照抄 v5 的 `Issuer.discover()` 和旧 Client 构造写法。这里只安装到独立后端：

```bash
npm install --save-exact openid-client@6.8.8
```

生产先注册固定 HTTPS callback，例如 `https://blog.example.org/api/auth/callback`；学习环境按提供方允许规则登记 loopback callback。issuer、clientId、clientSecret 与 callback 由可信配置给出，不接受用户传入任意 issuer 去 discovery，否则可能形成 SSRF 或登录混淆。缺配置时禁用该入口并说明原因，不伪造本地登录成功。

## 44.2 一次登录的完整生命周期

```text
点击登录 → 后端创建短期事务 → 重定向提供方
→ 用户认证与同意 → callback(code,state)
→ 后端消费事务并交换令牌 → 验证 ID token
→ 查 issuer+sub 身份 → 创建博客 Session → 固定站内页面
```

PKCE verifier 是一次登录的秘密，challenge 是其 SHA-256 表示；拦截 code 的人没有 verifier 就不能完成同一交换。state 绑定请求与回调，nonce 将 ID token 绑定到本次登录。它们作用不同，不能拿一个固定字符串充当全部三项。

短期事务还需要绑定发起浏览器，否则攻击者可以把自己的登录回调发给受害者，导致受害者进入攻击者账号。课程用独立 HttpOnly 的 pre-auth Cookie，数据库保存其摘要；不能只按回调 state 在全局 Map 找到事务就认定属于当前浏览器。

## 44.3 短期事务与身份映射

新增学习迁移：

```sql
CREATE TABLE oidc_transactions (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  verifier text NOT NULL,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX oidc_transactions_expiry_idx ON oidc_transactions(expires_at);

CREATE TABLE external_identities (
  issuer text NOT NULL,
  subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject)
);
```

verifier 需要取回交换，不能只保存摘要；它属于短期敏感数据，需要数据库访问控制、过期清理与禁止日志输出。记录有效期设置为五分钟是课程选择，须与提供方和用户流程共同调整。重复点击登录可以覆盖当前浏览器事务，用户看到旧页面时应得到“请重新开始”，不能静默放宽关联校验。

身份主键是 `(issuer, subject)`。subject 在某个 issuer 下唯一，邮箱则可能变更、复用或未经验证。不要根据相同邮箱自动绑定已有密码账号。绑定流程要求已登录用户重新认证，发起一个带绑定意图的短期事务，再确认 provider 身份；登录事务不能直接升级成绑定事务。

## 44.4 发起登录的真实代码

以下函数延续第 39 章 app、pool 与第 43 章 Cookie/session 工具。配置初始化只在启动时完成一次：

```ts
import * as oidc from 'openid-client';
import { randomBytes } from 'node:crypto';
import { sessionDigest } from './security.js';

const config = await oidc.discovery(
  new URL(issuer), clientId, clientSecret,
);
const callback = new URL('/api/auth/callback', appOrigin).href;
const preCookie = secureCookie ? '__Host-blog-oidc' : 'blog-oidc';
const preOptions = {
  path: '/', httpOnly: true, secure: secureCookie,
  sameSite: 'lax' as const,
};

app.get('/api/auth/start', async (_request, reply) => {
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const verifier = oidc.randomPKCECodeVerifier();
  const browser = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO oidc_transactions
      (state_hash,browser_hash,verifier,nonce,expires_at)
     VALUES($1,$2,$3,$4,now()+interval '5 minutes')`,
    [sessionDigest(state), sessionDigest(browser), verifier, nonce],
  );
  const redirect = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callback, scope: 'openid email',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256', state, nonce,
  });
  reply.header('Cache-Control', 'no-store');
  reply.setCookie(preCookie, browser, { ...preOptions, maxAge: 300 });
  return reply.redirect(redirect.href);
});
```

scope 只申请所需身份，不因为“以后可能用”索要日历、联系人或长期离线访问。discovery 返回的元数据由库按 issuer 校验，但网络出口仍要约束，不能把配置中心也当成无边界输入。提供方要求 PAR、特定 client authentication 或组织策略时，以其官方接入说明为准。

## 44.5 回调必须一次消费

```ts
type LoginAttempt = { verifier: string; nonce: string };
app.get('/api/auth/callback', async (request, reply) => {
  const url = new URL(request.url, appOrigin);
  const state = url.searchParams.get('state');
  const browser = request.cookies[preCookie];
  if (!state || state.length > 512 ||
      !browser || !/^[A-Za-z0-9_-]{43}$/.test(browser)) {
    throw new AppError(400, 'LOGIN_RESTART', '请重新发起登录');
  }
  const consumed = await pool.query<LoginAttempt>(
    `DELETE FROM oidc_transactions
     WHERE state_hash=$1 AND browser_hash=$2 AND expires_at > now()
     RETURNING verifier,nonce`,
    [sessionDigest(state), sessionDigest(browser)],
  );
  reply.clearCookie(preCookie, preOptions);
  const attempt = consumed.rows[0];
  if (!attempt) throw new AppError(400, 'LOGIN_RESTART', '登录已过期或已使用');
  const tokens = await oidc.authorizationCodeGrant(config, url, {
    pkceCodeVerifier: attempt.verifier,
    expectedState: state, expectedNonce: attempt.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new AppError(401, 'IDENTITY_INVALID', '身份无效');
  const found = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM external_identities WHERE issuer=$1 AND subject=$2`,
    [config.serverMetadata().issuer, claims.sub],
  );
  const identity = found.rows[0];
  if (!identity) {
    throw new AppError(409, 'IDENTITY_NOT_LINKED', '请先完成身份注册或安全绑定');
  }
  const session = await transaction(pool, db =>
    issueSession(db, identity.user_id, request.cookies[sessionCookie]),
  );
  reply.setCookie(sessionCookie, session.token, {
    ...sessionOptions, maxAge: 7 * 86400,
  });
  return reply.redirect('/manage');
});
```

`AppError`、transaction、issueSession 与 Session Cookie 配置来自前章；此入口只登录已有安全绑定，不隐式创建或合并账号。首次注册需单独页面与政策：核验邮箱声明、避免与现有账号冲突、确认资料再建立用户与身份关系，事务中处理唯一约束竞争。课程不把未实现的注册政策藏在 `getOrCreateUser()` 里。

库负责协议校验，不能先 `tokens.claims()` 再自行绕过交换异常。提供方取消授权、code 过期、nonce 错误或 issuer 不符都必须失败。失败后短期事务已消费，重新登录即可；为了“自动重试”复用 code 或 verifier 会破坏一次性语义。错误页不反射回调 query，不记录 code、ID token、access token 或 client secret。

## 44.6 令牌保存与退出边界

只用 OIDC 登录时，完成身份映射后不持久化提供方 access token；刷新博客 Session 不需要 refresh token。若确需调用提供方 API，服务器加密存储令牌、最小 scope、记录有效期，并实现刷新轮换及失败撤销。密钥不能与密文同库明文保存，也不能进入 `VITE_*` 环境变量。

博客退出撤销本地 Session，不等于退出身份提供方全部应用。RP-Initiated Logout 是否支持、需要什么参数应核对 provider 元数据；不能给未知 URL 带上 ID token。返回地址仅允许固定站内路径，`returnTo=https://attacker.example`、协议相对地址和编码绕过都应拒绝。

## 44.7 验证、排错与完成标准

正常路径用真实测试身份完成发起、同意、回调和 Session 创建，确认后端没有将 provider token 返回前端。异常路径分别修改 state、删除 pre-auth Cookie、重放 callback、使用过期事务、取消授权、换 issuer 与换 client audience。每种失败都不能产生 Session。

callback 报不匹配时先核对登记 URI 的协议、主机、端口、Path，再查可信代理后的固定 APP_ORIGIN；不要支持任意 Host 来适配。Cookie 丢失时检查 SameSite 与 callback method，若提供方使用跨站 POST 回调需重新设计 Cookie 策略，不能照搬本章 GET/Lax。时钟偏移应校时，不能把 token 容忍期扩大到数小时。

练习实现安全绑定页面、绑定意图与用户 ID 的事务关联、解绑时保留至少一种可用登录方式。完成标准是协议异常和回调重放均失败、邮箱不能自动接管账号、所有 provider 令牌只在后端短期使用。仅 mock 身份提供方的测试证明应用分支，不证明真实 OIDC 联通；第 54 章最小项目未实现 OIDC，必须单独记录外部验证结果。

## 44.8 身份声明不能直接成为业务权限

ID token 中的 email、name 和组织字段只是提供方声明，不自动具有博客权限。即使 email_verified=true，也仅说明提供方按自己的流程验证了邮箱；它不意味着这个人应该是某租户 owner。企业限制域名登录时必须确定信任的 issuer、组织租户与官方声明语义，不能只用字符串结尾判断后缀，或相信浏览器提交的部门字段。

若通过 UserInfo 获取资料，必须核对返回 sub 与已经验证的 ID token sub 相同。姓名可能包含 HTML、极长字符或控制字符，进入界面前仍走长度校验与安全文本渲染。资料同步不能修改本地权限和身份主键；邮箱变更需要独立处理，不把新的邮箱静默合并到另一个账户。

签名密钥会轮换，客户端应使用受信任 issuer 的元数据和官方库获取验证密钥；不能把某次下载的单个公钥永久写死，也不能接受 token 头部提供的任意远程密钥地址。故障时区分 discovery 网络失败、提供方拒绝、协议校验失败和本地账号未绑定，向用户显示可恢复的动作，日志只记录稳定错误码与请求标识。库抛出的异常对象可能带响应或协议参数，不直接整体序列化。

验收应准备两个客户端和两位测试用户：将另一个客户端签发的令牌送来必须失败；在用户 A 发起的浏览器事务中使用用户 B 的另一回调也不能建立错误账号。再测试密钥轮换后的新登录、提供方短暂失联以及旧会话仍然有效的行为。提供方不可用时是否保留既有博客会话是本地策略，不能退回无需验证的“临时登录”。

## 官方参考

- [openid-client v6 文档与示例](https://github.com/panva/openid-client)、[registry](https://registry.npmjs.org/openid-client)。
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)。
- [PKCE RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html)、[OAuth 安全 BCP RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)。

下一章：[访问控制与多租户隔离](./45-authorization-multitenancy)。
