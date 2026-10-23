# Geometry Relay：Godot 4 游戏开发教学项目

教程目标版本：**Godot 4.7.2 stable**，官方版本核验日期 **2026-10-23**。项目使用 GDScript，不需要 .NET SDK、插件、第三方库、外部图片或网络服务。几何图形由 `Polygon2D` 和原生绘图生成；音效由短 PCM 波形构建为 `AudioStreamWAV`。

已使用官方 macOS 标准版 **4.7.2.stable.official.ed1daf0bf** 实际运行，下载压缩包通过官方 SHA-512 校验，应用通过代码签名校验；4.6.2 基线也已运行通过。`project.godot` 的 `config/features` 保留共同 API 的 4.6 标记，代码依据 Godot 4.7 文档编写，不依赖 4.7 专属功能。

## 打开与游玩

用 Godot 项目管理器导入本目录中的 `project.godot`，打开后按 F5。或者在仓库根目录执行：

```bash
godot --path examples/godot
```

没有命令行快捷方式时，用引擎可执行文件的完整路径替代 `godot`，不要把应用目录本身当成可执行文件。

| 操作 | 输入 |
| --- | --- |
| 移动 | WASD 或方向键 |
| 暂停 / 继续 | Escape 或 Pause / Resume |
| 重开 | R 或 Restart |
| 存档 | K 或 Save |
| 读档 | L 或 Load |
| 静音切换 | M 或 Sound |

目标：收集五枚金色晶体，避开红色守卫，进入右下角出口。出口未解锁时为暗绿色，收集完成后变为亮绿色。受伤后有 1.2 秒无敌时间；生命耗尽失败；终局后可以重开或加载有效的游玩中存档。敌人的伤害由进入接触区触发，持续站在区内不会周期性扣血。退出再进入可产生下一次伤害。

## 目录与实现边界

```text
project.godot
scenes/
  main.tscn          主场景和稳定节点边界
  player.tscn        玩家、碰撞与相机
  coin.tscn          晶体检测区域
  enemy.tscn         守卫、碰撞和接触区域
  primitive_3d.tscn  独立 3D 图元展示，可用 F6 运行
scripts/
  main.gd           关卡组装、游戏状态、存读档接入
  player.gd         静态类型移动、生命与无敌时间
  coin.gd           幂等收集信号
  enemy.gd          巡逻、视线追逐、返回状态机
  hud.gd            容器布局、主题、按钮与提示
  save_store.gd     JSON 校验、v1 到 v2 迁移、临时文件替换
  audio.gd          静态短音效生成与播放
tools/
  smoke.gd          独立规则验证入口
  render_preview.gd 桌面渲染截图探针
  check_course_snippets.gd 教程完整 GDScript 代码块解析
```

关卡和 HUD 的子节点由脚本生成，运行后可在编辑器 **Remote** 场景树观察。示例不是导航寻路、触屏摇杆、网络多人、云存档或完整 3D 游戏；教程会给出这些相关领域的原理或扩展步骤，不将它们写成已经实现的功能。

窗口采用 `canvas_items` 和 `expand`，世界为 960×640。HUD 可以换行，视口可扩展，但并不等于已完成竖屏游戏设计。当前角色仅有键盘输入；移动端要补充触控方向输入、重排 HUD、处理安全区域，并进行真机验证。

## 存档契约

普通游戏只在用户主动点击或按键时写入 `user://geometry-relay-v2.json`；本仓库不附带个人存档。保存生命、玩家位置、稳定收集 ID，不保存正在播放的声音、敌人轨迹、计时器和终局。读档会重建守卫并重置计时器。

版本 2 示例：

```json
{
  "version": 2,
  "health": 2,
  "position": [80, 200],
  "collected": ["west", "east"]
}
```

版本 1 使用关卡固定顺序的整数索引，例如 `"collected": [0, 2]`，加载时迁移为稳定字符串 ID。拒绝未来版本、非整数生命值、重复或未知 ID、非法坐标、超过 16 KiB 的文件以及墙内位置。拒绝读档不改变当前游戏状态，只更新错误提示。

保存先写同目录 `.tmp` 文件、检查错误、关闭文件，再由 `DirAccess.rename_absolute()` 替换目标。重命名失败会返回错误，并可能留下临时文件；不是云同步协议，也不保证跨文件系统或断电场景下的数据持久性。

## 定向验证

从仓库根目录执行以下命令。日志与运行时探针文件位于 `validation/`，导入缓存由引擎生成在 `.godot/`。

```bash
godot --version
godot --headless --path examples/godot --editor --import --quit \
  --log-file "$PWD/examples/godot/validation/import.log"
godot --headless --path examples/godot --script tools/smoke.gd \
  --log-file "$PWD/examples/godot/validation/smoke.log"
godot --headless --path examples/godot --script tools/check_course_snippets.gd \
  --log-file "$PWD/examples/godot/validation/snippets.log"
godot --headless --path examples/godot --quit-after 180 \
  --log-file "$PWD/examples/godot/validation/run.log"
godot --headless --path examples/godot res://scenes/primitive_3d.tscn \
  --quit-after 60 --log-file "$PWD/examples/godot/validation/3d.log"
godot --path examples/godot --script tools/render_preview.gd \
  --log-file "$PWD/examples/godot/validation/render.log"
```

2026-10-23 实际结果：**4.7.2** 引擎导入通过；`SMOKE: PASS (0 failures)`；主场景与 3D 图元场景 headless 启动通过；桌面 OpenGL Compatibility 渲染探针返回 `PREVIEW: OK`，生成并检查了 960×640 画面。4.6.2 的同类验证也已通过。检查覆盖输入移动、墙体阻挡、真实 `Area2D` 收集、重复收集、出口条件、伤害无敌、失败重开、暂停、存读档、迁移、重复 ID、非法字段及失败读档不变更世界。

教程解析入口从本仓库读取章节代码，对以 `extends` 开始的 18 个独立 GDScript 代码块执行实际引擎解析，结果为零失败。函数片段依赖章节说明的挂载脚本，不作为独立脚本测试；解析成功也不表示导航、3D 控制等扩展实验已经完成运行验收。`validation/` 是本地运行输出，不纳入源码；克隆后通过上述命令生成验证日志。

headless 模式没有真实音频播放生命周期，`audio.gd` 在此模式跳过播放；它不是声音质量验证。未验证：手柄或触屏、不同分辨率交互、音效听感、3D 实机画面、性能目标以及 Web / Android / iOS / 桌面导出包。需要同版导出模板和目标平台工具链后另行验收。

## 官方版本证据

- [官方下载：4.7.2 stable，2026-08-18](https://godotengine.org/download/macos/)。
- [发布归档：4.7.2 stable 与 4.8 beta1 分开列出](https://godotengine.org/download/archive/)。
- [4.7.2 维护版发布说明](https://godotengine.org/article/maintenance-release-godot-4-7-2/)：原文标题 “Maintenance release: Godot 4.7.2”，日期 “18 August 2026”，正文 “We encourage all users to upgrade to 4.7.2.”；构建提交 `ed1daf0bf001b61586d9930840f2f1394092c079`。
- [固定 4.7 文档](https://docs.godotengine.org/en/4.7/)；`stable` 会随发布更新，`latest` 是开发文档，不作为本教程版本依据。
- [Web 导出限制](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html)：Compatibility / WebGL 2.0，Godot 4 C# 当前不能导出 Web，默认单线程不要求跨源隔离，多线程需要相应响应头；音频还受浏览器用户手势限制。

教程位于仓库 `docs/columns/godot/`。发布游戏时还需按 [Godot 许可说明](https://docs.godotengine.org/en/4.7/about/complying_with_licenses.html) 提供引擎及其第三方许可告知。
