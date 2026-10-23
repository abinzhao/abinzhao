---
title: "第 16 章：毕业项目 Geometry Relay 的完整交付"
description: "装配并验收一个真实可运行的 2D 收集关卡，串联移动、敌人、UI、胜负、音频、存档和回归证据，明确发布边界。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, 毕业项目, 2D游戏]
series:
  order: 16
---

# 第 16 章：毕业项目 Geometry Relay 的完整交付

毕业项目的目标是交付一个闭环，而不是再收集一批孤立代码。`examples/godot/` 已包含可运行的 project.godot、场景、脚本和验证入口，玩家收集五枚晶体，避开两名守卫，进入出口获胜。项目无需插件、外部图片、网络服务或付费素材，图形使用原生几何，短音效由 PCM 波形生成。

## 16.1 先读玩法契约

移动使用 WASD 或方向键，Escape 暂停与继续，R 重开，K 存档，L 读档，M 静音。HUD 提供同类按钮，触控尺寸至少四十四像素。玩家生命为三，受伤后一秒二的无敌时间防止短间隔重复扣血；生命归零失败，集齐晶体后进入出口获胜。

守卫通过接触区进入事件造成伤害，不是持续站在区内按固定频率扣血。守卫有巡逻、视线追逐与返回，没有绕墙寻路。存档恢复生命、位置和稳定收集 ID，但重置守卫与计时。终局不能保存，仍可重开或读取有效游玩存档。这些规则应该在验收前明确，不能测试到一半才解释。

项目是键盘控制的二维桌面基线，不是已经完成的移动游戏。窗口支持扩展与 UI 换行，但竖屏需要重新安排 HUD 与世界视野，触屏需要移动控件。三维图元场景是独立实验，不属于本关卡的第二种玩法。

## 16.2 导入与首次运行

使用官方 Godot 4.7.2 标准版，在项目管理器选择导入并定位 examples/godot/project.godot。等待首次扫描完成，打开主场景按 F5。初始画面应显示蓝色玩家、五枚金色晶体、两名红色守卫、灰色墙体与右下出口；HUD 显示零枚收集、三点生命和运行计时。

```bash
godot --path examples/godot
```

命令从仓库根目录执行。应用包并不等于命令行可执行文件，在 macOS 上可使用应用内部 Contents/MacOS/Godot 的完整路径。不要为了导入该项目替换系统中的其他引擎，独立标准版即可；首次扫描生成的缓存不构成外部依赖。

按 F6 只运行当前场景，因此打开 player.tscn 后用 F6 不会出现完整关卡。主场景中的 Level 子节点和 HUD 控件由脚本动态组装，编辑器本地场景树较简洁，运行后应在 Remote 树观察真实节点。不能因为编辑器里没有五个晶体子节点就判断资源遗漏。

## 16.3 源码职责与稳定边界

```text
project.godot
scenes/main.tscn
scenes/player.tscn
scenes/coin.tscn
scenes/enemy.tscn
scenes/primitive_3d.tscn
scripts/main.gd
scripts/player.gd
scripts/coin.gd
scripts/enemy.gd
scripts/hud.gd
scripts/save_store.gd
scripts/audio.gd
tools/smoke.gd
tools/render_preview.gd
```

Main 协调规则和关卡生成，Player 处理输入、生命与无敌，Coin 报告带 ID 的收集事件，Enemy 管理巡逻与追逐，HUD 提出用户请求，SaveStore 处理文件格式，Audio 提供表现。固定节点路径为 Player、Level、HUD、Audio，动态对象只挂在 Level 内，使重建关卡不影响固定 UI 连接。

先按这个责任图阅读函数，不从文件头一路死记到结尾。一次收集由区域触发、晶体幂等、主场景提交、出口更新和音效构成；一次读取由文件解码、世界校验、候选数据提交和 HUD 提示构成。能画出两条链，才算理解了系统而不是只运行成功。

## 16.4 装配关卡与碰撞

主场景以固定 Rect2 清单创建 StaticBody2D 墙体，给每面墙独立 RectangleShape2D 和 Polygon2D。晶体使用 PackedScene 实例化，赋予固定 ID 与坐标，连接事件后加入树。守卫在两个固定点生成，target 指向当前 Player；出口使用 Area2D，只检测玩家碰撞层。

墙、玩家和敌人分别使用独立层，实体碰撞与检测区域分工。复制场景时必须保留碰撞 mask、玩家 group 和节点名字，不能只复制视觉。如果晶体看得见但无法收集，检查区域监测和 mask；如果玩家穿墙，检查实体形状与墙层，而不是收集信号。

地图宽九百六十、高六百四十，顶部为 HUD 预留区域，玩家从左上可活动区出生。两面内部墙提供绕行选择，晶体与出口位置不在墙内。更改坐标后同时核对存档边界与墙体验证，视觉上的空间调整可能影响可恢复位置，不能只改一组图形数字。

## 16.5 移动、受伤与表现

玩家把两套输入向量相加并限制最大长度，再乘每秒二百四十像素速度，交给 move_and_slide。这样同时按 WASD 与方向键不增加速度，斜向也不会更快。视觉朝向使用指数形式平滑到速度方向，碰撞体不随视觉旋转，避免旋转影响墙边行为。

生命变化先提交数字，再发送 health_changed；归零再发送 died。无敌期降低视觉透明度，并随物理时间递减。重置恢复速度、生命、透明度、无敌时间与物理处理，不只是把角色搬回出生点。恢复生命同样会发出生命信号，当前音频订阅也可能播放受伤提示；需要静默恢复时应区分事件语义。

晶体上下浮动只移动视觉子节点，检测区域保持稳定；声音失败不影响收集结果。当前播放器一次只播一段短音，连续事件会打断旧声。动画编辑器、多声部混音和导航实验不在项目已有实现中，可以作为后续独立扩展，但不能作为本次验收通过项。

## 16.6 状态与重开

Outcome 只有游玩、胜利和失败。终局后停止玩家物理并禁用 Level 处理，主节点与 HUD 继续接收重开或读档请求。暂停仅适用于游玩中，不能用 Pause 按钮把已结束关卡重新激活。收集和出口入口检查 Outcome，防止延迟事件继续改写终局。

```gdscript
func _on_coin_collected(id: String) -> void:
	if outcome != Outcome.PLAYING or id not in IDS \
			or id in collected_ids:
		return
	collected_ids.append(id)
	audio.cue("coin")
	_update_exit()
```

代码来自 main.gd，依赖该脚本中的 ID、局面与音频定义。晶体节点有 consumed 守卫，主场景又验证合法与重复 ID，两层分别保护实例与整局。未知事件不能直接增加数量；完整进度以合法身份集合为准，而不是看当前场景中还剩几个节点。

重开清除暂停、计时、收集与终局，移除旧 Level 孩子，再重建墙、晶体、守卫和出口，最后重置玩家。固定 HUD 信号只在 ready 连接一次，不随重开增加。连续重开验收要等待延迟释放完成后比较节点数，不把短暂新旧实例峰值误判为泄漏。

## 16.7 存读档的闭环

先收集 west 晶体，再让玩家受伤，按 K 保存；按 R 后应恢复全新局；按 L 后生命与位置恢复，west 不再出现，计时与守卫重新开始。读取完成后取消暂停，玩家恢复物理处理，因此也可以从终局恢复到有效游玩存档。

正常路径之外，复制存档并制造未来版本、重复 ID 或墙内位置。记录操作前的生命、坐标、进度和局面，读取失败后这些字段应不变，只显示错误。代码不会为了错误文件先调用 new_game，这才是“失败读取不丢当前局”的实际含义。

文件仅写入用户目录，不上传，也不作为防作弊权威。临时写入与重命名降低直接截断风险，但没有云同步、多槽备份、断电事务或任意历史版本迁移。项目提供版本一索引到版本二稳定 ID 的明确迁移，新增关卡时需要重新设计契约。

## 16.8 自动验证与画面复核

```bash
godot --headless --path examples/godot --editor --import --quit
godot --headless --path examples/godot --script tools/smoke.gd
godot --path examples/godot --script tools/render_preview.gd
```

官方 4.7.2 实际运行中，导入通过，冒烟返回 `SMOKE: PASS (0 failures)`，主场景与独立三维场景 headless 启动没有运行错误。桌面 Compatibility 渲染探针返回 `PREVIEW: OK`，生成并检查了九百六十乘六百四十的二维关卡截图。源代码也已在 4.6.2 共同 API 基线上运行。

project.godot 的 features 保留共同 API 的 4.6 标记，不表示教程以旧稳定版取代 4.7.2。版本由实际可执行文件与官方发布信息核对。截图用于确认 HUD、实体与关卡布局，不证明跨分辨率交互、音效听感、三维视觉、触控手柄、导出包或性能目标。

## 16.9 排错与交付作业

主场景空白先检查入口与运行方式；玩家不动检查 InputMap、物理处理和暂停；收集不计数检查 ID、group、mask 和连接；重开仍失败检查 Outcome 与 reset_at；有效存档拒绝检查世界边界与墙体安全空间；声音没有输出按音频章分层排查。

最终作业是在保持原始项目可运行的基础上，独立增加一项有明确规则的能力，例如钥匙门、第二关或音量设置。先写输入、状态、正常和异常验收，再修改对应责任模块。不能只加一颗没有事件处理的按钮，或用提示文本假装已经实现保存与切关。

交付要求包括完整源项目、玩法说明、数据契约、目标平台、规则验证输出与实际游玩记录。扩展后重新验证重复事件、暂停、终局、重开和坏存档，不让新增功能破坏已有闭环。发布包未执行就标为未验证；完成这份诚实可复核的交付，比声称掌握所有平台更有价值。

## 官方参考

- [第一个 2D 游戏](https://docs.godotengine.org/en/4.7/getting_started/first_2d_game/index.html)
- [场景组织](https://docs.godotengine.org/en/4.7/tutorials/best_practices/scene_organization.html)
- [输入处理](https://docs.godotengine.org/en/4.7/tutorials/inputs/inputevent.html)
- [保存游戏](https://docs.godotengine.org/en/4.7/tutorials/io/saving_games.html)
- [导出项目](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_projects.html)

返回：[课程目录](./index.md)。
