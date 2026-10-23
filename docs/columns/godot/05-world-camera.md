---
title: "第 05 章：2D 关卡、坐标与相机"
description: "从几何关卡建立空间规则，理解局部坐标、TileMapLayer、相机边界和不同视口的影响。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, Camera2D, TileMapLayer]
series:
  order: 5
---

# 第 05 章：2D 关卡、坐标与相机

关卡不是把障碍随机放进画面。它需要给玩家提供可读路径、可预测的碰撞边界和能逐步学习的挑战。相机也不是简单“跟着角色走”：它决定哪些信息进入视野，哪些位置暂时不可见，以及界面是否保持稳定。本章从已有几何关卡出发，建立空间模型，再进行瓦片地图与大地图相机的独立实验。

## 5.1 三种坐标必须分开

局部坐标相对父节点，世界坐标经过祖先变换，屏幕坐标还受到相机和视口变换。父节点平移后，子节点局部 position 可以不变，但 global_position 已经改变。玩家与晶体若位于不同变换容器中，不能直接比较两个局部 position 判断距离，应使用世界坐标。

鼠标点击也需要坐标转换。在普通二维世界中，`get_global_mouse_position()` 返回对应世界位置；对于不同 CanvasLayer、嵌套视口或 UI 控件，应确认使用的是哪一个画布与视口。不要把系统屏幕像素直接赋给角色 position，否则在缩放、相机移动或窗口尺寸变化后会出现明显偏移。

独立实验可把以下脚本挂在移动后的 `Node2D` 容器上：

```gdscript
extends Node2D

func _ready() -> void:
	var local_point: Vector2 = Vector2(40, 20)
	var world_point: Vector2 = to_global(local_point)
	assert(to_local(world_point).is_equal_approx(local_point))
	print("Local: ", local_point, " World: ", world_point)
```

它验证变换来回转换，而不是假定坐标一致。缩放父节点也会影响子形状，因此物理对象最好保持简单变换；需要改变碰撞大小时优先调整形状资源，而不是对复杂物理树做非均匀缩放。视觉子节点可以独立缩放，不必同时改变移动模型。

## 5.2 用 Rect2 建立可解释几何

毕业项目 `main.gd` 的 `WALLS` 保存六个矩形，包含外边界和内部障碍。每个矩形生成 `StaticBody2D`、`RectangleShape2D` 和 `Polygon2D`。碰撞与视觉来自同一份尺寸数据，可以减少“看起来有墙，实际形状偏移”的错误。生成节点的中心是矩形中心，形状以自身原点居中。

核心装配片段如下，位于关卡生成函数内：

```gdscript
var wall: StaticBody2D = StaticBody2D.new()
wall.position = rectangle.get_center()
wall.collision_layer = 1
wall.collision_mask = 0
var collision: CollisionShape2D = CollisionShape2D.new()
var shape: RectangleShape2D = RectangleShape2D.new()
shape.size = rectangle.size
collision.shape = shape
wall.add_child(collision)
level.add_child(wall)
```

`rectangle` 是已有 `Rect2`，`level` 是主场景的 `Node2D` 容器；代码不包含视觉绘制，完整实现见 `examples/godot/scripts/main.gd`。这里只生成实体，还需要给玩家配置墙体遮罩。两个系统只有在层与形状契约匹配时才会产生阻挡。

关卡宽高为 960×640，顶部留出界面区域，玩家活动范围从下方开始。五个晶体分别放在不同路径位置，出口位于右下角。先用这些固定数据建立可重复回归，再考虑程序化生成。随机关卡必须解决可达性、种子重放和存档映射，不能只随机坐标就称为完整关卡系统。

## 5.3 从玩法目标推导关卡布局

玩家首先需要理解移动与收集，再理解守卫和出口。出生点附近不应立即受到不可避免伤害，第一枚晶体应容易看见，后续晶体可以要求绕过障碍。出口的锁定状态应明显，收齐后提供状态提示，避免玩家不知道下一步做什么。所有这些都属于关卡反馈，不只是美术装饰。

通道宽度至少要允许角色形状通过，还要考虑操作误差。几何上刚好可以通过的窄缝，未必有良好手感。守卫检测范围也会影响通道风险，不能独立调节地图和 AI 后凭感觉认为难度合理。记录一次完整通关路径、受伤位置和重试原因，才能区分规则不清与挑战合理。

读档点还需要满足空间合法性。示例先验证位置在允许矩形中，再用扩大后的墙体矩形排除角色中心与墙过近的位置。这是一种适用于当前圆形角色与轴对齐墙体的保守检查，不是任意形状碰撞查询的替代品。复杂关卡需要使用实际物理形状查询，并为恢复位置提供明确兜底策略。

## 5.4 TileMapLayer 扩展实验

现行 Godot 4 推荐使用 `TileMapLayer` 组织单层瓦片，多个节点组合成背景、地面与装饰层。不要把旧 `TileMap` 当作新项目默认方案。瓦片资源由 `TileSet` 描述，可以包含纹理、碰撞、多地形与导航数据；绘制瓦片和烘焙导航是不同能力，不能自动互相证明。

1. 新建独立关卡场景，添加 `TileMapLayer`，创建 `TileSet`，设置统一单元尺寸。
2. 导入一张自行制作或有明确许可的瓦片图，创建 atlas source，在 TileSet 编辑器切分区域。本项目不需要外部素材，实验素材应由读者明确准备。
3. 为墙体瓦片添加物理层与碰撞多边形，将地板与装饰放在不同层中。检查装饰不会误产生阻挡。
4. 绘制一个带转角的房间，放入现有玩家场景，打开碰撞显示并运行。
5. 修改一个瓦片碰撞后重新验证所有使用该瓦片的位置，认识资源共享会怎样影响地图。

挂在该层的实验脚本可以读取玩家所在单元：

```gdscript
extends TileMapLayer

@export var player: Node2D

func _process(_delta: float) -> void:
	if not is_instance_valid(player):
		return
	var cell: Vector2i = local_to_map(to_local(player.global_position))
	var center_in_world: Vector2 = to_global(map_to_local(cell))
	if Input.is_action_just_pressed("ui_accept"):
		print("Cell: ", cell, " Center: ", center_in_world)
```

`local_to_map()` 需要瓦片层自己的局部坐标，`map_to_local()` 返回单元中心局部位置。把 global_position 直接传进去，在地图节点有变换时就会错误。地图数据更新可能涉及批处理，不要每帧重建整张地图来表达一个角色移动。

## 5.5 Camera2D 的边界与平滑

Godot 4 的 Camera2D 使用 `enabled` 等属性，不沿用旧教程中的二维 current 配置习惯。毕业项目把相机作为玩家子节点，启用位置平滑并设置 960×640 边界。当前视口接近完整关卡尺寸，因此不会出现大幅卷屏，这与大地图实验不同。

相机边界约束显示区域，不会限制玩家移动。玩家能否离开地图仍由碰撞或规则决定。相机缩放改变可见世界范围，位置平滑改变跟随响应，两者也不会自动提高帧率。快速角色、低帧率和瞬移读档都可能让平滑产生短暂偏差，必要时用 `reset_smoothing()` 消除旧位置历史。

大地图实验应把世界扩展到至少两倍视口，设置相机左右上下限，分别检查四角、窄走廊和瞬移。UI 放在 CanvasLayer 下，保持屏幕稳定；如果直接作为玩家的 Node2D 子节点，UI 会随着世界移动或旋转。视差背景则需要单独控制，不应让 HUD 混入背景变换。

## 5.6 验证与排错

正常验证：玩家能绕过所有障碍并收齐晶体；晶体没有位于墙内；出口条件可达；相机到四边时没有展示不应出现的空区域；HUD 不跟随玩家移动。异常验证：移动 Level 容器后确认世界距离计算仍正确，放置一枚墙内晶体证明关卡数据检查的必要性，再恢复。

地图视觉与碰撞错位时，检查坐标原点和形状中心。相机“没跟随”时，先核对活动相机、enabled 和当前地图是否本来就只有一屏。窗口变窄导致内容看不到时，检查拉伸与宽高比，而不是立刻把世界坐标压缩。瓦片层转换错误时，核对局部与全局坐标。

## 5.7 作业与验收

制作第二个固定几何关卡，保留出生点、五个稳定 ID 与出口规则，但改变路径。验收需要提交可达路线、最窄通道尺寸、四角相机检查与一次完整通关记录。不要修改 ID 的含义来迁就布局；如果旧存档无法对应新关卡，应在第九章通过明确版本或关卡标识处理。

## 官方参考

- [二维变换](https://docs.godotengine.org/en/4.7/tutorials/2d/2d_transforms.html)
- [使用 TileMap](https://docs.godotengine.org/en/4.7/tutorials/2d/using_tilemaps.html)
- [TileMapLayer 类参考](https://docs.godotengine.org/en/4.7/classes/class_tilemaplayer.html)
- [Camera2D 类参考](https://docs.godotengine.org/en/4.7/classes/class_camera2d.html)

下一章：[动画与反馈](./06-animation-feedback.md)。
