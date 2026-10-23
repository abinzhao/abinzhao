---
title: "第 03 章：节点、场景、资源与生命周期"
description: "理解节点实例、PackedScene、共享资源和入树顺序，构建可复用且能正确释放的游戏对象。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, 场景树, Resource]
series:
  order: 3
---

# 第 03 章：节点、场景、资源与生命周期

Godot 的核心组织单位是节点，场景是一组可保存、可实例化的节点结构，资源则保存可被节点引用的数据。三者承担不同职责：节点参与运行生命周期，场景描述组合，资源表达配置与素材。本章的目标是制作一个可以出现多次的晶体场景，并解释为什么修改某个共享资源可能同时影响多个实例。

## 3.1 场景树不是文件目录

文件系统中的 `player.tscn` 是定义；运行时加入树中的 `Player` 是实例。一个定义可以产生多个实例，每个实例有自己的位置和运行状态。父子关系用于组织生命周期、坐标与部分属性传播，不代表“父节点必须知道每个子节点的所有业务”。一个关卡容器可以拥有晶体，却不应直接操纵晶体内部颜色和碰撞细节。

毕业项目的主场景提供稳定边界：根 `Main` 下有 `Level`、`Player`、`HUD` 与 `Audio`。`Level` 存放可重建的墙体、晶体、守卫和出口；玩家与 HUD 保持稳定引用，重开时只重建关卡内容。这种结构让恢复存档无需重新寻找所有 UI 节点，也避免把短命对象误当作整个项目的全局服务。

节点类型需要与用途匹配。`Node2D` 提供二维变换但不会自动碰撞；`Area2D` 检测重叠但不负责实体移动阻挡；`CharacterBody2D` 提供受控运动接口；`Control` 提供 UI 布局。选择节点时先问需要什么运行能力，而不是选择“名字最通用”的根节点再手工重写引擎功能。

## 3.2 创建可复用晶体

1. 新建 `Area2D` 根节点，命名 `Coin`，保存为 `scenes/coin.tscn`。
2. 添加 `Polygon2D`，画一枚菱形；添加 `CollisionShape2D`，配置圆形检测区域。检测形状不要求与视觉逐像素一致，但范围应符合玩家预期。
3. 在根节点检查器将碰撞层设为零，遮罩只选择玩家层。它需要观察玩家进入，不需要被墙体观察。
4. 附加脚本，定义稳定 ID 与收集信号。连接 `body_entered` 时采用脚本或编辑器一种方式，避免重复连接。
5. 在关卡中实例化两份晶体，设置不同 ID 和位置，验证彼此消失不会影响另一个实例。

独立实验的完整根脚本如下，视觉和形状需按以上步骤创建：

```gdscript
extends Area2D

signal collected(id: String)
@export var coin_id: String = ""
var claimed: bool = false

func _ready() -> void:
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node2D) -> void:
	if claimed or not body.is_in_group("player"):
		return
	claimed = true
	collected.emit(coin_id)
	hide()
	set_deferred("monitoring", false)
	queue_free()
```

这个实现先设置 `claimed`，再发出信号。因为信号回调可能立即触发其他逻辑，幂等标志必须在回调之前生效。`queue_free()` 延迟到安全时机释放节点，并不表示下一行中所有引用都已消失。关闭监测用延迟属性设置，避免在物理查询尚在处理时修改监测结构。毕业项目 `coin.gd` 使用相同的事件边界，具体视觉生成可查看源码。

## 3.3 加载、实例化与加入树

`preload()` 在脚本加载阶段解析常量资源路径；`load()` 在运行时按路径加载资源。固定核心场景适合预加载，用户选择的关卡可以按需加载。预加载不是“永不占内存”，动态加载也不是“自动后台异步”。大型资源的后台加载需要另外的 API 与完成检查，后续资源章节会讨论。

```gdscript
extends Node2D

const CoinScene: PackedScene = preload("res://scenes/coin.tscn")

func spawn_coin(id: String, point: Vector2) -> Area2D:
	var coin: Area2D = CoinScene.instantiate()
	coin.coin_id = id
	coin.position = point
	coin.collected.connect(_on_collected)
	add_child(coin)
	return coin

func _on_collected(id: String) -> void:
	print("Collected: ", id)
```

挂在实验关卡根节点上即可使用，前提是晶体脚本包含上述字段与信号。这里在 `add_child()` 之前设置 ID、位置与连接。原因是加入正在运行的树会触发生命周期，子节点 `_ready()` 应看到完整初始配置。若需要设置全局位置，必须考虑父节点变换；不能把局部 `position` 与世界坐标互换使用。

## 3.4 入树与准备的顺序

父节点先进入树，子节点随后进入；准备阶段通常子节点先 `_ready()`，父节点后 `_ready()`。因此父节点在自己的准备回调中可以引用已准备好的固定子节点，`@onready` 也在相关时机初始化。构造脚本时立即使用 `$Visual` 则可能过早，因为场景的子节点还没有完成挂载。

一个节点离开树再重新进入，不代表 `_ready()` 每次都会自动执行。需要重新准备时应理解 `request_ready()` 的范围，而不是期待每次 `add_child()` 都重复初始化。更简单的教学策略是明确区分“构造一次”和“每局重置”：玩家 `reset_at()` 清理速度、生命和无敌计时，不依赖重新执行准备回调。

`is_instance_valid()` 用于确认对象引用仍有效，但不能证明节点还在树中、处于当前关卡或符合业务状态。敌人读取玩家前检查引用有效性；关卡结束还要停止敌人物理处理。对象存在与对象应该继续行动，是不同判断。

## 3.5 资源共享与独立配置

`CircleShape2D`、`Theme`、`Material` 与自定义 `Resource` 都可能被多个节点共享。场景实例化会创建节点，但资源引用可能仍指向同一份资源。若两个角色共享形状，运行中改变半径可能同时改变两者的碰撞范围。这往往比节点状态共享更隐蔽，因为场景树看上去确实存在两个独立角色。

不需要修改资源时，共享能节省内存并保持一致。需要每个实例独立变化时，可在编辑器使用资源本地化选项，或者在合适的初始化处 `duplicate()` 后重新赋值。深层资源是否复制还应检查子资源关系，不能把浅复制当成完整资产克隆。视觉材质、主题和碰撞形状也不必一律复制，应该按真正可变的边界决定。

自定义资源适合配置，而不是保存整个活动节点树。独立实验可创建：

```gdscript
extends Resource
class_name EnemySettings

@export var move_speed: float = 110.0
@export var detection_radius: float = 180.0
@export var disengage_radius: float = 260.0
```

保存为脚本后，在检查器创建对应资源并保存为 `.tres`，再让敌人通过导出字段引用它。运行时的当前状态、目标引用和巡逻方向仍属于敌人节点。把不变配置与可变状态分开，可以让多个守卫共享同一套设计参数，而不共享“正在追谁”。

## 3.6 owner 与 parent 的区别

`add_child()` 建立父子关系并影响运行树；`owner` 影响节点在场景保存中的归属。运行时生成的墙体不需要为了参与碰撞而设置 owner。只有要把生成结构打包保存为场景时，才需要正确指定所有权，并保证 owner 符合祖先关系。把两者混淆，会导致游戏可见但编辑器保存后节点缺失。

重建关卡时，示例先将旧子节点从 `Level` 移除，再排队释放，然后创建新节点。这让旧关卡不再参与当前树，即使它们尚未实际释放。不要仅清空数组就认为节点被销毁，也不要释放玩家后继续保留旧引用。对象生命周期需要在容器、引用和事件连接三个位置同时理解。

## 3.7 验证、排错与作业

正常验证：两份晶体具有不同 ID，玩家进入其中一份只发出一次事件，另一份继续存在；连续重开后 Remote 树中晶体数量稳定；玩家引用仍指向当前玩家。异常验证：删除 `Visual` 或检测形状，确认错误来源；把两份 ID 设为相同，观察为什么关卡逻辑必须拒绝重复，随后恢复合法配置。

若出现“节点找不到”，先核对路径、大小写和入树时机；若出现“对象已释放”，检查旧回调与缓存引用；若多个实例同步改变形状，检查共享资源而不是复制更多节点。若动态节点无法保存为场景，检查 owner，不要把运行时正常误判成序列化正常。

作业是制作一个可复用危险区场景，让关卡只接收进入事件而不读取内部形状。验收要求两份危险区参数可独立配置、重开后没有数量增长、移除关卡后不再触发旧事件，并写清哪个字段属于配置、哪个字段属于运行状态。下一章用这些节点建立真正的输入与物理规则。

## 官方参考

- [节点与场景](https://docs.godotengine.org/en/4.7/getting_started/step_by_step/nodes_and_scenes.html)
- [资源](https://docs.godotengine.org/en/4.7/tutorials/scripting/resources.html)
- [Node 类参考](https://docs.godotengine.org/en/4.7/classes/class_node.html)
- [PackedScene 类参考](https://docs.godotengine.org/en/4.7/classes/class_packedscene.html)

下一章：[输入、时间与物理](./04-input-physics.md)。
