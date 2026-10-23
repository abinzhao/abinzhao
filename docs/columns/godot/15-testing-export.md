---
title: "第 15 章：规则测试、运行回归与跨平台导出"
description: "区分解析、headless、真实渲染和平台交付证据，掌握 Godot 4.7.2 桌面、Web、Android 与 iOS 的导出条件和验收边界。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, 游戏测试, 跨平台导出]
series:
  order: 15
---

# 第 15 章：规则测试、运行回归与跨平台导出

游戏能在编辑器运行，只证明一个开发路径成立。规则、交互、渲染、设备性能和发布包是不同层次的验证，本章为它们分别建立证据。示例已经用官方下载的 4.7.2 标准版执行导入、冒烟、主场景与三维场景启动，以及桌面二维截图；**没有执行 Web、移动或桌面发布包导出**。

## 15.1 验证层次与完成标准

静态解析可以发现语法、类型和缺失资源，不能证明碰撞正确。规则测试可以断言收集、胜负、迁移与失败恢复，不能证明按钮在小屏幕可点击。headless 可以启动场景与运行物理，但没有真实显示与音频体验；桌面截图可以检查画面，不能证明手柄、触屏或浏览器存储。

先把功能写成可观察条件：移动会改变位置，墙体阻止越界，重复收集不增加进度，坏存档不改变世界，终局后停止规则，重开恢复状态。再写交互条件：键盘与按钮都可用，暂停后能够继续，焦点可见，重要内容不遮挡。最后为每个平台定义启动、安装、资源与设备条件。

失败需要分类。解析错误属于代码或资源问题，找不到导出模板属于工具链缺失，浏览器拒绝音频可能属于平台策略，竖屏遮挡则属于适配不足。不能把这些错误都写成“测试环境问题”，也不能在未运行的平台上标为通过。

## 15.2 无额外测试依赖的冒烟入口

`examples/godot/tools/smoke.gd` 继承 SceneTree，加载真实主场景，模拟输入并等待物理帧，断言规则，最后使用非零退出码表达失败。它不需要第三方测试插件。独立验证入口与游戏主场景分开，能够在命令行重复运行，也避免通过 UI 操作才能构造每种异常。

```bash
godot --version
godot --headless --path examples/godot --editor --import --quit \
  --log-file "$PWD/examples/godot/validation/import.log"
godot --headless --path examples/godot --script tools/smoke.gd \
  --log-file "$PWD/examples/godot/validation/smoke.log"
```

命令从仓库根目录执行，用真实引擎可执行路径替代 godot。导入先运行，确保源资源已生成所需缓存；脚本退出码与 `SMOKE: PASS (0 failures)` 一起检查。不要只搜索日志中出现 PASS 而忽略后续错误，也不要把脚本没有打印任何内容理解为通过。

探针中既有真实 Input 输入与 Area2D 接触，也有直接调用事件入口构造边界。前者证明部分引擎接线，后者便于稳定验证幂等与终局，不应混为同样强度的证据。它覆盖本项目重要路径，但不宣称所有物理接触顺序与平台行为均已穷举。

## 15.3 异步与运行回归

物理状态在物理帧更新，queue_free 在延迟阶段完成。测试改变位置后要等待合适物理帧，释放后要等延迟清理，再检查场景树；任意等待几秒会让测试慢且不稳定。明确等待事件或帧边界，才能知道断言依赖什么。

```bash
godot --headless --path examples/godot --quit-after 180 \
  --log-file "$PWD/examples/godot/validation/run.log"
godot --headless --path examples/godot res://scenes/primitive_3d.tscn \
  --quit-after 60 --log-file "$PWD/examples/godot/validation/3d.log"
godot --path examples/godot --script tools/render_preview.gd \
  --log-file "$PWD/examples/godot/validation/render.log"
```

quit-after 表示主循环迭代次数，不是秒数。这两个短启动检查用于发现运行错误，不是长时间稳定性测试。渲染探针必须有图形显示，等待 frame_post_draw 后保存二维画面到 validation/preview.png；在 headless 执行会明确失败，而不是生成假截图。

正常回归仍需手动游玩一局、用按钮暂停恢复、失败重开和有效读档。异常回归包括坏存档、窗口大小变化、失焦恢复、快速重复操作和终局后的输入。声音要真实听取，三维要实际显示，不能用一张二维截图覆盖全部体验。

## 15.4 同版模板与发布配置

安装与编辑器相同的 4.7.2 导出模板，在 Project 的 Export 面板创建目标预设，选择资源包含方式、图标、启动和平台选项。标准版 GDScript 路线不需要 .NET SDK；C# 路线使用对应编辑器与工具链，能力边界不能与 GDScript 混写。

每个导出预设的名称用于命令行选择，示例中的 Web 只是约定，需先在面板创建。输出目录提前建立，绝对输出路径避免项目目录与当前工作目录混淆。发布模式可能关闭部分调试功能，因此开发构建通过后仍要运行实际发布包。

```bash
godot --headless --path examples/godot --export-release "Web" \
  "$PWD/examples/godot/exports/web/index.html"
```

此命令是安装模板、创建预设与目录后的读者步骤，不是已执行结果。导出资源选择要覆盖动态加载的场景与原始数据；排除不必要源素材，但不能把运行时仍需要的 JSON 一并删掉。最终产物实际加载失败时，回到导出清单而不是修改本机路径凑合。

## 15.5 Web 的图形、线程和存储限制

Godot 4.7 Web 基线为 WebAssembly 与 WebGL 2.0，并使用 Compatibility。Forward+ 与 Mobile 不在该 Web 导出路径中，不能保留所有桌面效果。Godot 4 的 C# 项目当前不能导出 Web；选择 GDScript 可以避开这一语言限制，但仍需浏览器图形能力与资源预算。

默认单线程 Web 导出不要求跨源隔离，多线程需要 SharedArrayBuffer 等能力与正确 COOP、COEP 响应头。普通静态服务器不一定能配置这些头，HTTPS 本身也不等于完成隔离。先选择线程模式，再确认部署服务器支持，不通过关闭浏览器安全功能来制造成功。

单线程实验可以用本机 HTTP 服务，不能双击 file 地址运行：

```bash
python3 -m http.server 8080 --directory examples/godot/exports/web
```

这个简单服务器适合本机单线程检查，不自动提供多线程所需隔离头。进入浏览器后检查控制台、WASM 加载、资源 MIME、首次用户手势音频、后台恢复与缩放。浏览器存储可能因隐私模式、配额或用户清理而丢失；user 路径并不意味着永久云备份。

移动浏览器还受内存、GPU、触控、虚拟键盘和电池限制。二维示例没有触控移动，导出成功后在手机上看见画面仍不能正常游玩。需要方向输入与安全区适配，再做真机验收；不要把键盘可用写成跨平台输入已完成。

## 15.6 桌面、Android 与 iOS

桌面导出要核对目标系统与架构，并在没有编辑器的机器上启动。Windows、Linux 与 macOS 的资源大小写、动态库和权限可能不同。macOS 对外分发还涉及签名、公证与 Gatekeeper，开发机能打开不等于陌生设备能安装；这些发布操作需要独立凭据与授权。

Android 按版本化官方文档安装匹配的 JDK、Android SDK 与构建工具，在编辑器配置路径，选择目标架构并建立调试或发布签名。不要从旧文章复制已经不匹配的工具版本。密钥与签名口令不进入项目源码或日志，发布签名还影响后续更新能否安装。

Android 还要处理触控、多指、返回行为、暂停恢复、安全区域与热降频；存档权限和路径使用引擎用户数据入口，不硬编码外部存储。调试 APK 安装成功不证明商店发布 AAB、签名与政策要求全部满足，二者应分开验证。

iOS 导出需要 macOS 与匹配 Xcode、Apple 工具链及签名条件。导出的 Xcode 工程仍需完成设备、团队与能力配置，再在真机上运行。模拟器不替代真实 GPU、触摸、声音和后台生命周期测试，平台授权也不应为教程自动申请或提交。

## 15.7 验收表与作业

每个平台至少记录引擎与模板版本、预设、构建模式、设备、系统、启动、移动、暂停、存读档、声音、分辨率和性能。用通过、失败、未验证区分状态；不适用项写明原因。通过项必须关联可复现步骤或实际产物，不用统一绿色勾选掩盖缺失。

作业是选择一个真正能运行的目标平台完成发布包验收，并保留一个坏存档拒绝用例。要求不安装编辑器也能启动、资源完整、控制方式可用、错误有反馈、日志没有运行异常。额外平台若缺少设备或工具链，提交条件与剩余风险，不宣称全平台发布成功。

## 官方参考

- [命令行教程](https://docs.godotengine.org/en/4.7/tutorials/editor/command_line_tutorial.html)
- [导出项目](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_projects.html)
- [Web 导出](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html)
- [Android 导出](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_android.html)
- [iOS 导出](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_ios.html)

下一章：[毕业项目](./16-capstone.md)。
