# 标准 uni-app 本地预约练习

标准 uni-app、Vue 3、TypeScript、`.vue` 页面；不是 uni-app x 或 `.uvue`。
创建、取消和恢复仅在本设备保存，不含服务器、身份认证、库存、付款或云端调用。

## 打开

1. 用 HBuilderX 正式版 `5.26.2026091802` 打开本目录。新建工程的默认项可能是 x，不能按默认项重新生成本工程。
2. 检查 `manifest.json` 的 `vueVersion` 为 `3`，入口为 `main.js` 的 `createSSRApp`。
3. 运行到 Web 浏览器。微信目标需要读者配置自己的合法 AppID，或在工具允许范围使用游客模式检查端侧流程。
4. `manifest.json` 的 DCloud 和微信 AppID 均为空，不代表已取得真实平台资格；按目标工具提示设置学习工程标识。无需配置网络域名、地图或登录模块。
5. App 需要目标 SDK、基座、签名和设备。没有执行打包或发布；Web 运行不能证明 App 正常。

CLI 路径应先建立独立官方 `vite-ts` 模板工程，将 `App.vue`、`main.js`、`pages.json`、
`manifest.json`、`pages/`、`utils/` 放入该模板的 `src/`，入口只保留一份。
保持模板编译器与锁文件，不在本可视化工程临时安装另一套编译器。

## 文件

- `utils/domain.ts`：纯领域、版本解析、日期和存储控制器，不依赖 Vue 或 uni。
- `pages/index/index.vue`：服务、日期、时段、备注、创建、取消、恢复、确认清除。
- `verify.mjs`：Node 内置断言和故障注入，不需要安装依赖。

## 纯逻辑验证

在包含 `examples` 的父工程目录运行：

```bash
node --experimental-strip-types examples/uni-app/appointment/verify.mjs
TZ=Asia/Shanghai node --experimental-strip-types examples/uni-app/appointment/verify.mjs
TZ=America/New_York node --experimental-strip-types examples/uni-app/appointment/verify.mjs
```

已使用 Node `22.22.0` 运行。验证包括创建/重复、非法日历、过去/过远日期、已过时段、
长度、ID、取消幂等、版本、容量、独立副本、日历夏令时和读写删除失败。
上海和纽约命令输出分别记录于 `verification-shanghai.log`、`verification-new-york.log`。

纯断言通过不代表页面 UI、平台编译或设备存储通过。完整教学见专题第十二章。

## 手工验收

选择明天创建，重复组合应拒绝；取消后允许再次创建。重开恢复两种状态。
备注超限时保留内容并拒绝提交。未知缓存版本时阻写，重试读取恢复后解除。
清除需确认，只处理 `uni-local-appointment:v1`，不清空全局存储。

单设备上限 100 条，默认日期按本地日历推进一天。日期用于本地练习；
真实跨地区预约应以服务所在时区、服务器会话、库存事务和操作查询为准。

## 验证边界

HBuilderX 目标编译、Web 浏览器交互、微信 Android/iOS/桌面/鸿蒙客户端、
Android/iOS/HarmonyOS App、其他小程序均未实测。OAuth、定位、图片上传、
平台 CI、提审和商店发布未执行。本工程没有提供这些能力的成功证据。

版本依据：[正式工具](https://www.dcloud.io/hbuilderx.html)、
[官方 CLI](https://uniapp.dcloud.net.cn/quickstart-cli.html)、
[标准 Vue 3](https://uniapp.dcloud.net.cn/tutorial/vue3-basics.html)。
