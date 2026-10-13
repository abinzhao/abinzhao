---
title: Electron 打包、签名与更新边界
description: 用锁定版本的 electron-builder 打包本地应用，理解 asar、平台签名和更新渠道。
---

# Electron 打包、签名与更新边界

## 目标与前提

把[进程与 IPC](./process-ipc)的五文件项目打成当前平台的独立桌面应用。
所有命令只在该实验的 `electron-ipc` 目录执行，输出到其 `release/`，不使用教程主站的共享 `dist`。
打包不是发布：先本机目录包验收，再生成安装包；上传、签名、更新渠道各有单独授权与验证。

本章明确采用 electron-builder **26.0.12** 的配置格式；不同大版本可能调整签名和 asar 配置，
不要把最新文档字段直接混进旧版本配置。Electron 使用上一章安装并锁定的版本，
发布前检查它是否仍受支持、是否需要安全升级，并重跑兼容验收。

## 目录如何进入制品

```text [目录]
electron-ipc/
  package.json
  package-lock.json
  main.cjs
  preload.cjs
  index.html
  renderer.js
  electron-builder.yml
  build-resources/
  release/
```

`directories.app` 是应用源码根目录，`directories.buildResources` 存放图标等构建素材，
`directories.output` 是制品目录。不要把开发服务器或 `node_modules` 整目录复制到安装包。
`files` 显式列出运行文件；运行时依赖由打包器按依赖关系处理，本例没有额外生产依赖。
主进程的 `__dirname` 在 asar 内仍能用于加载已打包的页面/preload，不应依赖当前工作目录。

## 配置与运行命令

保留上一章四个代码文件，将 package 改为以下内容；先前锁定的 Electron 会通过安装命令恢复为精确依赖。

::: code-group
```json [package.json]
{
  "name": "electron-ipc-lab",
  "version": "1.0.0",
  "description": "Local isolated IPC tutorial",
  "author": "Tutorial Author",
  "private": true,
  "main": "main.cjs",
  "scripts": {
    "start": "electron .",
    "pack": "electron-builder --dir --publish never",
    "dist": "electron-builder --publish never"
  }
}
```

```yaml [electron-builder.yml] {7,9-14}
appId: org.example.tutorial.ipc
productName: IPC Tutorial
directories:
  app: .
  output: release
  buildResources: build-resources
asar: true
npmRebuild: false
files:
  - package.json
  - main.cjs
  - preload.cjs
  - index.html
  - renderer.js
mac:
  target: dmg
  identity: null
win:
  target: nsis
linux:
  target: AppImage
publish: null
```

```bash [终端：electron-ipc]
npm install --save-dev --save-exact electron@latest electron-builder@26.0.12
npm ls electron electron-builder
npm run pack
```
:::

`identity: null` 明确禁用本章 macOS 代码签名，只用于本机教学验收；
未签名包不能宣称可向普通用户可信分发。Windows/Linux 也没有因为指定 target 就自动获得签名。
`npmRebuild: false` 只适用于本例无原生模块；引入原生模块后需恢复重建并匹配 Electron ABI。
保留安装产生的锁文件，干净实验目录使用 `npm ci` 复现，不能只靠 `@latest` 长期复现。

目录包启动路径随 CPU 架构和版本输出不同，先列目录再选择真实路径：

```bash [终端：electron-ipc]
find release -maxdepth 3 -type d
```

macOS 打开 `release/mac-arm64/IPC Tutorial.app` 或实际输出的 `mac/` 目录；
Windows 打开 `release/win-unpacked/IPC Tutorial.exe`；
Linux 运行 `release/linux-unpacked/ipc-tutorial`，以实际文件名为准。
目录包验收完成后运行 `npm run dist`，生成当前平台 DMG、NSIS 或 AppImage。
不运行它完成跨平台承诺：要为其他系统建包，使用相应系统的独立 CI runner 和工具链。

## Asar 是归档，不是安全边界

`resources/app.asar` 把源码归档，减少散文件并方便读取；它不加密，不阻止提取或逆向，
不能保护 API key。密钥不能进入源码、`.env`、`extraResources` 或客户端配置。
原生 `.node`、外部进程使用的文件可能需 `asarUnpack`，只解包必要内容；
静态 JS/HTML 不需要为了“兼容”关闭 asar。

本例没有 `child_process`、远程脚本或按路径启动程序的 IPC。
“执行用户提供的命令”“更新后运行任意安装脚本”不是打包器自动提供的合法能力。
打包时再次检查 preload、导航、CSP 与 sender 校验，安装包不会自动修复运行时漏洞。

## 签名与平台限制

macOS 面向站外分发通常涉及 Developer ID 签名、Hardened Runtime、必要 entitlements 与 notarization；
需要 Apple 账号、证书和 macOS 工具链。App Store 是另一套 target、沙箱和审核要求。
Windows 签名需要可信代码签名证书或签名服务，并按目标机器检查签名链及 SmartScreen；
有效签名不保证信誉提示立即消失。Linux 的发行方式、权限和依赖应按目标发行版验收。
证书、密码、私钥只通过受控 CI 密钥存储注入，不写进 package、YAML 或日志。

```bash [终端：macOS，替换成实际目录包路径]
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/IPC Tutorial.app"
spctl --assess --type execute --verbose=4 "release/mac-arm64/IPC Tutorial.app"
```

本章未签名教学包可能在上述命令失败，这是预期限制，不应关闭 Gatekeeper 制造“成功”。
签名后的制品才应在干净机器验证证书、信任、启动与安装/卸载。

## 更新不是自带服务

electron-builder 负责制品生成；即使它可生成更新元数据，也不会自动托管或让应用自动更新。
Electron 自带 `autoUpdater` 与第三方 `electron-updater` 是不同集成，后者需要额外依赖和主进程代码，
以及兼容的 target、版本、HTTPS 渠道、元数据与签名验证。本章没有接入更新，`publish: null` 明确不发布。
更新功能须验证降级/回滚策略、失败恢复、用户确认与重启时机，不能把 `npm run dist` 等同于“更新完成”。

## 效果验证、故障与练习

离开源码目录启动目录包，版本按钮仍显示 `1.0.0`，离线可用，renderer 无 Node，导航和新窗口仍被拒绝。
安装包还需全新安装、普通权限运行、关窗重开、卸载测试；记录系统、架构、制品 SHA-256 和签名状态。
“找不到 preload”检查 `files` 与真实文件名；“下载失败”区分网络问题，不更换不可信二进制镜像；
“原生模块 ABI 错误”重新评估重建，不在 renderer 开 Node 来绕过。
练习：版本升到 `1.0.1` 后重新目录打包，验收显示新版本、运行文件不含测试/密钥，并明确记录“无自动更新”。

- [26.0.12 配置类型源文件](https://github.com/electron-userland/electron-builder/blob/v26.0.12/packages/app-builder-lib/src/configuration.ts)
- [当前 electron-builder 配置文档](https://www.electron.build/configuration.html)
- [平台构建限制](https://www.electron.build/multi-platform-build.html)
- [Electron 应用分发](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
- [Electron 更新应用](https://www.electronjs.org/docs/latest/tutorial/updates)
