---
title: "Godot 4 游戏开发：从引擎原理到完整收集关卡"
description: "以核验后的 Godot 4.7.2 stable 为基线，16 章学习 GDScript、2D、UI、存档、AI、音频、3D、性能、测试与跨平台导出，并完成可运行毕业项目。"
status: ongoing
featured: true
engine_version: "4.7.2-stable"
verified_at: "2026-10-23"
sources:
  - https://godotengine.org/download/macos/
  - https://godotengine.org/download/archive/
  - https://godotengine.org/article/maintenance-release-godot-4-7-2/
  - https://docs.godotengine.org/en/4.7/
---

# Godot 4 游戏开发：从引擎原理到完整收集关卡

这是一套面向第一次完整制作游戏的开发者的中文教程。它不以背记节点名称为终点，而是通过一个几何收集关卡，把输入、物理、场景组织、状态变化、反馈、存档、验证和交付连成一条可运行的开发路径。无需付费素材或外部图片，玩家、晶体、墙体与敌人均由引擎图元绘制。

## 版本与证据

**2026-10-23 核验：最新 Godot 4 稳定版本为 4.7.2 stable，发布于 2026-08-18。** 不根据版本号推测，也不把更高版本的预览构建称为稳定版。

| 官方来源 | 核验内容 | 教程采用方式 |
| --- | --- | --- |
| [macOS 下载页](https://godotengine.org/download/macos/) | 标准版、.NET 版与导出模板均指向 4.7.2，下载参数为 `flavor=stable` | 使用标准版 GDScript 路线 |
| [发布归档](https://godotengine.org/download/archive/) | 4.7.2 为 stable；4.8 当前列为 beta1，日期 2026-10-15 | 不采用 beta、RC、dev 或 nightly |
| [4.7.2 发布说明](https://godotengine.org/article/maintenance-release-godot-4-7-2/) | 维护版发布日期 2026-08-18，说明建议使用 4.7.2 | 将 4.7.2 固定为教学目标 |
| [4.7 版本化文档](https://docs.godotengine.org/en/4.7/) | 稳定分支对应的教程与类参考 | 章节链接固定为 `/en/4.7/` |

可核对的官方原文：下载页标题下列出 **“4.7.2”** 与 **“18 August 2026”**，标准版下载链接包含 `version=4.7.2&flavor=stable`；发布说明标题为 **“Maintenance release: Godot 4.7.2”**，正文写明 **“We encourage all users to upgrade to 4.7.2.”**，并提供 **“Download Godot 4.7.2 stable”** 入口。发布说明还记录构建提交 `ed1daf0bf001b61586d9930840f2f1394092c079`，可用于比对发行版本。

这些是同一官方项目的不同发布证据，不是相互独立的第三方验证。`stable` 文档别名未来会移动；`latest` 面向开发版本；RC 是发布候选，并不等于最终稳定。nightly 也可能来自任意开发提交。后续发布时应重新核验，不能让文中的“最新”脱离上面的核验日期。

示例已使用官方下载的 **4.7.2.stable.official.ed1daf0bf** 标准版实际运行，压缩包通过官方 SHA-512 校验，应用通过 macOS 代码签名校验。源码采用现行 Godot 4 API，并以 4.7 文档核对；也已在 4.6.2 基线运行。项目 `config/features` 保留共同 API 的 4.6 标记，不表示使用了 4.7 专属功能。

## 学习路径

每章包含学习目标、工作原理、编辑器步骤、可定位的代码、正常与异常验证、排错、作业验收以及官方参考。建议按顺序完成前八章，再扩展系统和平台知识，最后用完整项目做一次独立交付。

| 章节 | 内容 | 可观察产物 |
| --- | --- | --- |
| [01 编辑器与项目](./01-editor-project.md) | 稳定版、项目管理、界面、目录、主场景 | 独立启动项目 |
| [02 静态类型 GDScript](./02-gdscript-types.md) | 值与引用、类型、流程、异步、错误边界 | 可检查的游戏规则函数 |
| [03 节点、场景与资源](./03-scenes-resources.md) | 生命周期、实例、资源共享、所有权 | 可复用角色与晶体场景 |
| [04 输入、时间与物理](./04-input-physics.md) | InputMap、速度单位、delta、碰撞层 | 无斜向加速的角色移动 |
| [05 2D 关卡与相机](./05-world-camera.md) | 坐标变换、TileMapLayer、几何关卡、Camera2D | 可探索且有边界的世界 |
| [06 动画与反馈](./06-animation-feedback.md) | AnimatedSprite2D、AnimationPlayer、Tween、动画状态 | 不干扰碰撞的视觉反馈 |
| [07 UI、主题与适配](./07-ui-theme.md) | Control、锚点、容器、焦点、拉伸与安全区 | 可暂停、可导航的 HUD |
| [08 信号与组件](./08-signals-components.md) | 信号契约、组合、状态机、事件幂等 | 收集到胜负的闭环 |
| [09 存档与版本](./09-save-versioning.md) | JSON 校验、迁移、临时写入、恢复事务 | 可拒绝坏存档的恢复系统 |
| [10 敌人 AI 与导航](./10-ai-navigation.md) | 巡逻、追逐、视线、导航地图同步、避障 | 可解释的敌人行为 |
| [11 音频系统](./11-audio.md) | 总线、分贝、空间音频、采样、Web 限制 | 可控制的游戏音效 |
| [12 资源导入](./12-assets-import.md) | 图像、字体、音频、glTF、UID、许可证 | 可重建的资源流水线 |
| [13 3D 与渲染](./13-3d-rendering.md) | 3D 坐标、灯光、材质、物理、渲染器选择 | 独立原生图元 3D 场景 |
| [14 性能与分析](./14-performance-profiler.md) | Profiler、帧预算、CPU / GPU、资源生命周期 | 有证据的优化方案 |
| [15 测试与导出](./15-testing-export.md) | headless、场景回归、Web、桌面、Android / iOS | 平台限制与交付验收清单 |
| [16 毕业项目](./16-capstone.md) | 源码装配、玩法、恢复、回归、发布边界 | 完整可运行的 2D 收集关卡 |

## 项目与范围

完整源文件位于仓库 **`examples/godot/`**。先阅读该目录的 `README.md`，用项目管理器导入 `project.godot`，按 F5 运行。仓库根目录也可以执行：

```bash
godot --path examples/godot
```

玩法为 WASD / 方向键移动，收集五枚晶体，避开两名守卫，再进入出口。提供暂停、重开、存档、读档和静音；角色生命归零失败，完成收集并抵达出口获胜。AI 实现巡逻、视线追逐和返回，并没有假装实现复杂导航寻路。3D 图元场景是单独实验，不是第二个完整游戏。

主项目只依赖 Godot。教程中的导航、动画编辑器、触控和跨平台导出属于可操作的扩展实验，需按章节步骤创建节点、配置资源或安装匹配工具链，不能把孤立片段直接当成整个项目。代码块会说明挂载节点和前置条件。

## 运行验收边界

Godot **4.7.2** 已执行示例导入、headless 主场景、规则冒烟和独立 3D 场景启动；规则探针输出 `SMOKE: PASS (0 failures)`。桌面 OpenGL Compatibility 渲染探针输出 `PREVIEW: OK`，已生成并检查 960×640 的实际关卡画面。4.6.2 的同类验证也已通过。

尚未验证跨分辨率交互、触控和手柄、音效听感、3D 实机视觉、平台导出与真机性能。教程会提供验证方法，不将这些步骤的说明冒充已经执行的结果。
