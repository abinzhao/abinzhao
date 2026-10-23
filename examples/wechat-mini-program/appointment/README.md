# 原生微信小程序本地预约练习

这是可直接导入的原生 JavaScript 工程。数据只写入当前设备的 `local-appointment:v1`，不调用服务器，不代表真实预约、库存、身份或付款。

## 运行

1. 使用微信开发者工具 Stable 导入本目录。2026-10-23 核验的官方 Stable 为 `2.02.2608080`。
2. 保留 `touristappid`，选择游客模式；按开发者工具提示完成工具本身的登录。
3. 选择服务、日期和时段，填写可选备注，创建本地记录。
4. 重复创建同一组合应拒绝；取消后可重新创建；重新打开页面应恢复已保存记录。
5. 清除按钮只删除此示例的 key，需确认且不可恢复。

日期采用本地日历，允许今天至 30 天后；今天已到或已过的时段不能创建。最多保留 100 条记录，备注最多 120 个 UTF-16 编码单元。未知版本和非法缓存会停止写入，可重试读取或确认清除。

## 可复跑验证

从包含 `examples` 的项目根目录执行，使用 Node 22：

```bash
node examples/wechat-mini-program/appointment/verify.cjs
TZ=Asia/Shanghai node examples/wechat-mini-program/appointment/verify.cjs
TZ=America/New_York node examples/wechat-mini-program/appointment/verify.cjs
```

验证包括真实领域模块的创建、重复、校验、取消幂等、恢复副本、坏缓存和容量边界，以及注入式页面存储失败、恢复、写入阻止、清除确认和夏令时日历计算。测试不连接微信运行时，注入的 `wx` 适配器不证明实际存储或界面已通过真机验收。

## 平台边界

微信 Android、iOS、Windows、macOS、鸿蒙客户端和开发者工具 UI 未实测；真实 AppID、服务端会话、定位、媒体、支付、提审与发布未执行。使用真实账号前需要按微信官方规则配置主体、类目、接口资格、域名和隐私声明；不要把游客工程视为可发布业务系统。

课程对应 `docs/columns/wechat-mini-program/12-appointment-project.md`。正式工具来源：[微信开发者工具下载](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
