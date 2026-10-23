---
title: "第 10 章：敌人状态机、视线检测与导航寻路"
description: "分析现有守卫的巡逻和追逐，再独立搭建 NavigationRegion2D 与 NavigationAgent2D，区分路径、避障和物理碰撞。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, 敌人AI, 导航]
series:
  order: 10
---

# 第 10 章：敌人状态机、视线检测与导航寻路

游戏 AI 的目标不是让敌人拥有无限智能，而是产生玩家能够理解、预判并应对的行为。本章先解释毕业项目守卫为什么追逐、为什么返回，再建立独立的导航实验。现有 `examples/godot/scripts/enemy.gd` 使用直线移动与墙体碰撞，**没有实现绕墙寻路**；导航代码需要新场景，不直接替换原脚本。

## 10.1 把感知、决策和移动分开

感知回答玩家是否接近、是否在视线内；决策决定巡逻、追逐或返回；移动把目的地转换为速度并交给 CharacterBody2D。三个步骤混在一起时，敌人走不动可能被误判为“没有发现玩家”，实际却是目的地在墙后。排错应分别观察距离、可见性、状态、目的地和碰撞结果。

当前守卫保存出生位置 home，在左右一百像素范围巡逻。玩家距离小于一百八十像素且视线无遮挡时进入 CHASE；追逐中距离大于二百六十像素或失去视线时进入 RETURN；返回到出生点附近后恢复巡逻。进入与退出使用不同距离形成迟滞，避免玩家在单一阈值边缘让状态每帧跳动。

状态改变不等于动作一定完成。返回途中也可能再次发现玩家；巡逻遇墙会反转方向；追逐遇墙不会自动绕过。关卡设计应让这种能力与玩法匹配，不把墙后长时间停住解释为高阶策略。需要绕行时才引入导航，先保留简单可观察的行为基线。

## 10.2 在编辑器观察真实守卫

运行主场景，切到 Remote 场景树，选择 Level 下的守卫，查看 state、home 和 target。打开可见碰撞形状，先远离守卫观察左右巡逻，再靠近观察追逐，最后绕到墙后观察返回。把每次转移时的距离写下来，而不只凭颜色判断 AI。

检查 enemy.tscn 的实体碰撞与 Hitbox。前者阻止穿墙，后者报告玩家进入接触区，两者用途不同。当前伤害是进入事件，持续站在接触区不会周期性掉血；退出再进入才可能触发下一次伤害，且受玩家无敌时间保护。要增加持续伤害，需要单独定义频次与退出清理。

调试时可临时显示状态文本或绘制 home 到目的地的线，确认后移除无关日志。不要给每个守卫每帧打印大量信息；输出压力本身会改变运行节奏。最好只记录状态转移与路径失败，形成能追踪的一小段事件序列。

## 10.3 视线查询的层与时机

毕业项目在物理回调中执行射线查询，使用墙体所在的第一碰撞层：

```gdscript
var query: PhysicsRayQueryParameters2D = \
	PhysicsRayQueryParameters2D.create(
		global_position, target.global_position, 1
	)
var visible_target: bool = get_world_2d().direct_space_state \
	.intersect_ray(query).is_empty()
```

片段前置条件是 target 为有效 Node2D，脚本挂在现有 CharacterBody2D。这里空结果表示“墙体层没有遮挡”，不是射线直接确认命中了玩家。玩家与守卫不在墙体层，因此无需把它们的碰撞当成遮挡。改变层配置后必须同步修改查询，不能继续照抄数字一。

复杂项目可从眼睛位置发射，限制视野角，查询前排除自己的 RID。门、透明玻璃与草丛是否遮挡应由玩法决定，而不是所有碰撞体都一律挡住视线。视线检测也不是全局可达性查询：看不见不代表走不到，看得见也可能因狭窄通道而无法通过。

## 10.4 导航地图是什么

NavigationRegion2D 提供可行走多边形，NavigationServer2D 合并并同步地图，NavigationAgent2D 查询路径与可选局部避障。Agent 不会自动驱动 CharacterBody2D，仍需代码设置 velocity 并调用 move_and_slide。导航路径也不会自动生成物理墙，二者需要一致但独立配置。

物理层过滤碰撞，导航层过滤参与路径查询的区域，避障层过滤参与局部速度计算的代理。三个数字位掩码不共享语义。把导航层设为一，并不表示角色会碰撞第一物理层；给障碍开启避障，也不表示它已经从静态路径多边形中扣除。

NavigationObstacle2D 的局部避障与烘焙影响取决于具体属性与烘焙配置，不能用动态障碍代替已正确生成的静态可走区。先让路径能够避开墙体，再测试代理之间的局部让行。否则避障只能在错误路径附近修正速度，不能可靠解决根本不可达问题。

## 10.5 独立导航场景的编辑步骤

新建 Node2D 场景 NavLab，添加 NavigationRegion2D，为 navigation_polygon 新建 NavigationPolygon。绘制一块矩形可行走区域，在中央墙位置添加内轮廓作为洞，设置合适代理半径并烘焙。打开导航可视化，确认洞没有被填满，墙两侧通过上方或下方通道相连。

再添加 StaticBody2D 与 RectangleShape2D，使物理墙和导航洞重合；添加带碰撞的 CharacterBody2D 命名 Guard，子节点 NavigationAgent2D 命名 Agent；最后添加 Node2D 命名 Target，放在墙另一侧。可以分别使用 Polygon2D 作为标记，不需要下载图片。把 Guard 的目标路径设为 `../Target`。

运行前确认相机或视口覆盖实验区域，区域与 Agent 使用同一导航地图和导航层，洞与外边界给角色留足宽度。导航烘焙的代理半径会侵蚀可走区域；若通道比角色需要的宽度还窄，正确结果就是不可通过，不能为了“有路径”把半径改为零。

## 10.6 完整的路径跟随脚本

以下脚本挂在实验 Guard 上，要求子节点 Agent 和目标节点已经创建。它等待地图产生有效同步结果，限制目标刷新频率，并保留可选避障：

```gdscript
extends CharacterBody2D

@export var target_path: NodePath
@export var speed: float = 100.0
@onready var agent: NavigationAgent2D = $Agent
var target: Node2D
var refresh_left: float = 0.0

func _ready() -> void:
	target = get_node_or_null(target_path) as Node2D
	agent.path_desired_distance = 6.0
	agent.target_desired_distance = 12.0
	agent.velocity_computed.connect(_on_velocity_computed)

func _physics_process(delta: float) -> void:
	if not is_instance_valid(target):
		velocity = Vector2.ZERO
		return
	if NavigationServer2D.map_get_iteration_id(
		agent.get_navigation_map()
	) == 0:
		return
	refresh_left -= delta
	if refresh_left <= 0.0:
		agent.target_position = target.global_position
		refresh_left = 0.2
	var desired: Vector2 = Vector2.ZERO
	if not agent.is_navigation_finished():
		var next: Vector2 = agent.get_next_path_position()
		desired = global_position.direction_to(next) * speed
	if agent.avoidance_enabled:
		agent.velocity = desired
	else:
		velocity = desired
		move_and_slide()

func _on_velocity_computed(safe_velocity: Vector2) -> void:
	if not is_instance_valid(target):
		return
	velocity = safe_velocity
	move_and_slide()
```

地图同步发生在服务器更新阶段。节点已经 ready 不代表地图已经可查询；刚启动就查询可能得到空路径。迭代号为零时先等待后续物理帧，不使用无限忙等。地图有效后，每个物理帧取得下一路径点，让 Agent 推进内部路径状态，速度仍由角色消费。

避障关闭时直接移动；开启时提交期望速度，收到 velocity_computed 后用安全速度移动，不能两个分支都 move_and_slide，否则同帧移动两次。局部安全速度不保证通过所有物理障碍或一定能到达目标，多代理拥堵还需要优先级、等待或重新规划等玩法策略。

## 10.7 不可达、抖动与预算

导航完成不总意味着目标真正到达。不可达目标的路径可能终止于最近可达点，应结合 is_target_reachable、最终路径位置与角色到目标距离决定是成功、等待还是返回。当前实验只演示跟随，不实现完整失败策略；扩展 AI 时必须把不可达结果交给决策层。

角色在路径点左右摆动时，检查速度乘物理步长是否远大于路径点容差，再检查碰撞体是否与导航半径匹配。目标每帧重新设置可能反复重建路径，目标剧烈移动也会让路径不稳定。刷新间隔是一种预算，不是所有游戏都必须使用固定二百毫秒。

大量敌人应错开目标刷新与感知查询，远处降低决策频率，仍保持实际移动的物理更新。先测量路径查询和射线成本，再选择调度方式。不要提前把所有敌人搬到线程；节点树和物理服务器访问具有线程边界，线程化不能直接复制主线程代码。

## 10.8 验证与作业验收

正常验证包括发现玩家、阈值迟滞、失去视线后返回、墙前停止，以及导航实验从墙的一侧绕到另一侧。异常验证包括目标被释放、导航地图尚未同步、通道过窄、目标在可走区外、两代理相向和暂停恢复。记录状态与路径结果，不能仅用“敌人动了”作为通过。

作业是在独立实验中加入一扇可开关的门，定义关门后目标不可达时的行为。验收要求物理与导航数据更新一致、不会无限忙等、不可达有明确状态、打开门后恢复追逐，并说明是否使用局部避障。毕业项目原有规则冒烟不能证明这个新实验已经正确。

## 官方参考

- [导航概述](https://docs.godotengine.org/en/4.7/tutorials/navigation/navigation_introduction_2d.html)
- [使用导航代理](https://docs.godotengine.org/en/4.7/tutorials/navigation/navigation_using_navigationagents.html)
- [NavigationAgent2D](https://docs.godotengine.org/en/4.7/classes/class_navigationagent2d.html)
- [NavigationServer2D](https://docs.godotengine.org/en/4.7/classes/class_navigationserver2d.html)
- [射线查询](https://docs.godotengine.org/en/4.7/tutorials/physics/ray-casting.html)

下一章：[音频系统](./11-audio.md)。
