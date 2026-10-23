---
title: "第 04 章：输入、delta 与 CharacterBody2D"
description: "建立动作输入、速度单位、碰撞层和受控运动，验证斜向速度、阻挡、暂停与平台跳跃。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, InputMap, 2D物理]
series:
  order: 4
---

# 第 04 章：输入、delta 与 CharacterBody2D

角色移动的正确性不只由“按键后位置改变”决定。它还需要满足不同帧率速度一致、斜向不会无意加速、墙体能阻挡、暂停能停止状态推进等约束。本章先完成俯视角移动，再说明平台角色与它的区别。不要把跳跃代码直接塞进俯视收集关卡，两种运动模型的假设并不相同。

## 4.1 动作层与设备层

InputMap 把设备事件映射为动作，例如 `move_left` 对应 A 键，`ui_left` 对应默认方向键。代码消费动作名称，不需要到处判断具体键码。后续加入手柄时可以修改映射，而不重写基本移动逻辑。物理键适合保持键盘位置；按字符识别则适合文本或语言相关快捷操作，二者不能混为同一个产品决定。

在项目设置的 Input Map 中建立 `move_left`、`move_right`、`move_up`、`move_down`，分别绑定 WASD。毕业项目还读取默认方向动作，因此支持方向键。把两组向量相加后要限制长度，否则同时按 A 与左方向键会产生两倍强度。`Input.get_vector()` 自带组合与死区处理，但两次独立读取的和仍需再次约束。

连续移动读取当前动作状态；暂停、重开等离散操作消费输入事件。把离散操作写成每帧 `is_action_pressed()` 会让按住一个键时重复切换。事件的自动重复还需要通过 `event.is_echo()` 排除，或者使用适合场景的一次性按下查询。输入处理的位置也影响 UI 是否有机会先消费事件。

## 4.2 时间和速度单位

`velocity` 表达每秒位移，二维通常以像素每秒计。`delta` 表达秒。直接改变位置时，位移等于速度乘以时间；`CharacterBody2D.move_and_slide()` 则按自身速度与物理步长处理移动，不要先把 velocity 乘 delta，再调用它。重复乘时间会造成速度偏低并随物理频率变化。

```gdscript
extends CharacterBody2D

@export var speed: float = 240.0

func _physics_process(_delta: float) -> void:
	var direction: Vector2 = Input.get_vector(
		"move_left", "move_right", "move_up", "move_down"
	)
	direction += Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	velocity = direction.limit_length() * speed
	move_and_slide()
```

挂载前需要 `CharacterBody2D` 根、`CollisionShape2D` 子节点、有效形状与上述动作。俯视角色把 `motion_mode` 设置为 Floating，不按地面和斜坡规则解释接触。毕业项目 `player.gd` 在这段运动上增加生命、无敌与视觉朝向，但运动单位不变。

物理回调按配置的固定步长推进，并不等于现实时间绝对匀速，也不保证每个渲染帧只执行一次。低帧率时可能有多个物理步骤，渲染则呈现中间状态。计时使用传入的 delta，避免根据帧数推导现实秒数。视效与物理也不应争抢同一个角色位置。

## 4.3 碰撞层与遮罩

层表示“我属于哪些类别”，遮罩表示“我检查哪些类别”。界面中的第一层对应位掩码值一，第二层对应二，第三层对应四，不是第三层写数字三。用整数时必须理解位运算；编辑器按名称选择通常更不容易出错。

| 对象 | 自身层 | 检查遮罩 | 目的 |
| --- | --- | --- | --- |
| 墙体 | Walls：1 | 0 | 被角色检测并阻挡 |
| 玩家 | Player：2 | Walls：1 | 与墙碰撞 |
| 守卫实体 | Enemies：4 | Walls：1 | 避免穿墙 |
| 晶体与出口区域 | 0 | Player：2 | 只检测玩家进入 |
| 守卫伤害区域 | 0 | Player：2 | 接触事件而非硬碰撞 |

检测区域的形状必须是 `Area2D` 的有效子形状；实体形状则属于对应物理体。只有画出一个矩形不会生成碰撞。形状禁用、遮罩错误与没有加入运行树，都可能让区域“看得见却无法触发”。先打开调试菜单中的可见碰撞形状，再观察 Remote 属性，比反复改速度更有针对性。

## 4.4 move_and_slide 的结果

运动可能遇到墙体并沿表面滑动，因此请求速度与最终位置变化不一定一致。`move_and_slide()` 也可能更新 velocity。要知道本次遇到了什么，可检查滑动碰撞数量与碰撞对象；需要真实位移速度时，可查对应接口，而不是把输入方向当成物理结果。

不要同时调用 `position += velocity * delta` 与 `move_and_slide()`，否则角色被移动两次，第一段还可能绕过碰撞。也不要每帧把碰撞形状拉大或缩小来修复卡墙。角色形状、墙体间距和运动模型要先稳定下来，再根据碰撞记录定位问题。

无敌时间是持续量，因此毕业项目每个物理步骤执行 `maxf(0.0, invulnerable_left - delta)`。生命减少则由伤害入口触发，并且在无敌时拒绝。视觉透明度只能表示受伤状态，不能成为伤害规则的来源；颜色与物理规则应保持单向关系。

## 4.5 独立平台跳跃实验

新建另一份角色场景，运动模式使用 Grounded，建立 `jump` 动作，提供地板 `StaticBody2D`。以下脚本是独立平台实验，不替换毕业项目的俯视移动：

```gdscript
extends CharacterBody2D

@export var speed: float = 220.0
@export var jump_speed: float = 420.0

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = -jump_speed
	velocity.x = Input.get_axis("move_left", "move_right") * speed
	move_and_slide()
```

二维坐标向下为正，所以跳跃初始速度为负。重力是加速度，改变速度时需要乘 delta；位移则交给移动方法。`is_on_floor()` 依据最近的物理移动结果与地面方向判定，并不是“角色 y 坐标很大”。斜坡、单向平台和高速坠落都需要另外验证。

跳跃缓冲和土狼时间属于手感设计：前者允许稍早按下跳跃，后者允许离地后短暂跳跃。实现前先明确时间窗口和一次性消耗规则，避免同时满足条件时重复起跳。本教程基础项目不包含这些扩展，因此不能声称已经做了完整平台游戏控制器。

## 4.6 输入传播与暂停

UI 按钮可以先消费输入，游戏快捷操作通常放在 `_unhandled_input()`。如果把所有事件都在 `_input()` 阶段处理，输入文字或点击菜单时可能同时触发游戏动作。另一方面，`Input` 的全局状态查询不会因为 GUI 消费某个事件就自动变为未按下，连续移动仍需游戏状态控制。

暂停时，`SceneTree.paused` 与节点 `process_mode` 一起决定处理行为。玩家设为 Pausable，HUD 与协调入口保持 Always，才能在暂停中点击继续。终局不等于暂停：示例停止玩家物理处理并禁用关卡，但保留重开和读档入口。把两种状态合成一个布尔值容易产生结束后仍能移动的漏洞。

## 4.7 正常与异常验证

在无障碍区域按住右键一秒，再按右上方向一秒，比较位移长度，斜向应不超过直向。让角色面对墙持续移动，位置不能跨越墙体；切换暂停后，位置和计时停止，继续后恢复。示例冒烟使用真实输入动作与物理帧验证，不只直接调用函数模拟“移动成功”。

异常验证包括缺失动作、禁用碰撞形状、错误遮罩、同时按反方向、连续按重开和长按暂停键。每次只改变一项配置，记录预期错误后恢复。帧率比较需要用一致起点和持续时间，不能凭肉眼认为“好像一样快”。

| 现象 | 常见原因 | 定位方法 |
| --- | --- | --- |
| 移动很慢 | velocity 被乘 delta | 检查单位与调用位置 |
| 斜向更快 | 向量未限长 | 比较实际位移长度 |
| 穿墙 | 直接改位置或遮罩错误 | 看碰撞形状和层 |
| 暂停无法恢复 | HUD 也被暂停 | 检查 process_mode |
| 跳跃永远不可用 | 浮动模式或地板配置错误 | 看最近接触结果 |

## 4.8 作业与验收

为独立实验加入手柄方向输入，保持键盘速度上限不变。验收需要覆盖摇杆半推、全推、死区和键盘同时输入，解释是否保留模拟强度。再制作一个墙角，用碰撞记录证明角色没有直接穿越。提交实际引擎版本与测试观察，不把未使用设备写成已经验收。

## 官方参考

- [输入示例](https://docs.godotengine.org/en/4.7/tutorials/inputs/input_examples.html)
- [使用 CharacterBody2D](https://docs.godotengine.org/en/4.7/tutorials/physics/using_character_body_2d.html)
- [CharacterBody2D 类参考](https://docs.godotengine.org/en/4.7/classes/class_characterbody2d.html)
- [暂停游戏](https://docs.godotengine.org/en/4.7/tutorials/scripting/pausing_games.html)

下一章：[2D 关卡与相机](./05-world-camera.md)。
