---
title: "第 06 章：动画、Tween 与可读反馈"
description: "区分帧动画、属性动画和程序插值，建立不会覆盖物理状态的角色与收集反馈。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, AnimationPlayer, Tween]
series:
  order: 6
---

# 第 06 章：动画、Tween 与可读反馈

动画的任务不是让画面一直运动，而是让玩家理解动作、状态与结果。角色正在朝哪走、受伤是否暂时安全、收集是否成功、出口是否解锁，都需要清晰反馈。本章分别使用程序插值、帧动画、属性轨道与 Tween，并确立一条重要规则：玩法状态驱动表现，表现不要反过来偷偷改变玩法。

## 6.1 先确定反馈契约

移动反馈表达方向与运动状态，伤害反馈表达一次扣血及无敌窗口，收集反馈表达物品已被确认，终局反馈表达游戏已经停止推进。每类反馈应明确触发条件、持续时间和取消条件。没有取消规则的闪烁动画可能在重开后继续影响新角色；没有状态边界的收集动画可能在播放期间重复计分。

毕业项目使用原生多边形，不依赖纹理素材。玩家三角形朝向运动方向，无敌时降低透明度；出口收齐晶体后变亮；HUD 提示状态变化并配合短音效。这些是实际实现的反馈。帧动画、AnimationPlayer 与 Tween 是本章独立扩展，不能仅因为教程介绍了它们就认为项目已包含动画资源。

## 6.2 帧率无关的方向插值

玩家代码在物理更新后对视觉子节点旋转：

```gdscript
if velocity.length_squared() > 1.0:
	visual.rotation = lerp_angle(
		visual.rotation,
		velocity.angle(),
		1.0 - exp(-12.0 * delta)
	)
```

`visual` 是角色下的 `Polygon2D`，`velocity` 是移动处理后的速度。长度平方判断避免静止时对无意义方向旋转；`lerp_angle()` 处理角度跨越边界时的最短变化；指数形式让响应更接近帧率无关，不使用每帧固定比例导致高帧率时转得更快。

只旋转视觉子节点，不旋转整个角色，是因为圆形碰撞与输入方向不需要跟着美术改变。未来改成非圆形角色时，还需要判断形状是否应旋转。动画处理的属性不能与物理处理争夺控制权，否则一段视觉旋转可能改变碰撞与运动假设。

透明度反馈也从规则状态派生：无敌剩余时间大于零时视觉半透明，归零恢复。不要通过“当前透明度小于一”判断是否允许扣血；主题、美术或其他动画都可能修改颜色。状态字段应保持唯一来源，表现可以替换而不影响伤害契约。

## 6.3 AnimatedSprite2D 帧动画实验

1. 在独立玩家场景里添加 `AnimatedSprite2D`，把原图元隐藏，创建 `SpriteFrames` 资源。
2. 准备自己绘制或许可明确的角色帧，建立 `idle` 与 `walk` 动画。统一画布大小和脚底锚点，避免不同帧造成角色视觉跳动。
3. 为循环行走设置合理速度，为静止配置一帧或轻微循环。碰撞形状保持稳定，不按每帧轮廓变化。
4. 在角色物理更新之后调用动画选择函数，只在动画名称改变时切换。
5. 验证反向移动时是否翻转，以及上下移动是否需要独立方向资源。

以下片段放在独立角色脚本中，前提是存在对应节点和动画：

```gdscript
@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

func update_animation() -> void:
	var moving: bool = velocity.length_squared() > 1.0
	var next: StringName = &"walk" if moving else &"idle"
	if sprite.animation != next:
		sprite.play(next)
	if absf(velocity.x) > 1.0:
		sprite.flip_h = velocity.x < 0.0
```

不要在每帧无条件重置帧号，否则动画可能永远停在第一帧。翻转纹理不一定应该翻转武器、文字或碰撞节点；如果这些子对象有独立用途，就分别处理。帧动画只表达图像序列，不负责决定角色什么时候可以攻击或死亡。

## 6.4 AnimationPlayer 属性轨道

AnimationPlayer 适合在时间轴上组织多个属性，例如视觉缩放、颜色、UI 面板透明度和声音触发。先建立一个动画资源，再为选中节点属性插入关键帧。轨道路径是场景结构契约，节点重命名或移动后要重新验证，不要认为编辑器没有报错就一定播放到了正确对象。

独立练习可以给晶体添加 `Visual` 子节点和 AnimationPlayer，创建 `pulse` 动画，让 Visual 的 scale 从一变化到一点一，再返回一。仅缩放 Visual，不缩放 Area2D 或碰撞形状。开启循环后检查检测边界没有改变，玩家距离判断仍符合之前的规则。

RESET 动画用于记录属性复位基准，但不能替代游戏重置函数。若动画正在播放，重开时要停止旧动画并恢复必要属性。调用方法轨道可以触发函数，但伤害时序进入动画系统后，需要明确中断、重播和跳转时是否会重复触发。初学者先让代码拥有规则，动画只表现结果更容易验证。

AnimationTree 用于更复杂的混合、状态转换和方向动画。它能组合 AnimationPlayer 的动画，不是另一个物理状态机。对于只有静止和行走的练习，不必立即增加树和复杂混合参数；只有动画组合真正需要时再使用，避免把玩法状态、动画状态和 UI 状态全部塞进同一个图。

## 6.5 Tween 的生命周期

Godot 4 的 Tween 通过 `create_tween()` 等方式创建，不沿用旧版本把 Tween 当作常驻节点的教程。它适合一次性属性过渡，例如按钮强调或收集缩放。创建后会由场景树处理，默认并行还是顺序、暂停如何处理、对象释放后如何结束，都需要根据绑定与配置确认。

独立 `Node2D` 实验要求子节点 `Visual`：

```gdscript
extends Node2D

var pulse: Tween
@onready var visual: Node2D = $Visual

func emphasize() -> void:
	if pulse != null and pulse.is_valid():
		pulse.kill()
	visual.scale = Vector2.ONE
	pulse = create_tween()
	pulse.tween_property(visual, "scale", Vector2.ONE * 1.2, 0.08)
	pulse.tween_property(visual, "scale", Vector2.ONE, 0.12)

func reset_visual() -> void:
	if pulse != null and pulse.is_valid():
		pulse.kill()
	visual.scale = Vector2.ONE
```

重复触发时先终止旧 Tween，避免多个插值同时写同一属性。终止并不会自动把属性恢复到初值，因此显式复位。顺序两段构成一次强调，若使用并行就会出现两个目标争夺缩放。绑定节点释放时的处理也应通过真实场景验证，不能保留一个旧 Tween 引用就认为它仍可复用。

## 6.6 动画与事件幂等

收集动画若要播放后才移除晶体，应在接触瞬间先设置已领取标志，关闭检测，再播放视觉，最终释放节点。积分应在规则确认时提交，不依赖动画完成信号。否则低帧率、暂停、跳过动画或节点提前移除都可能改变收集结果。

死亡与胜利同理：先改变 Outcome，停止必要运动，再播放终局表现。表现结束可以打开结算面板，但不能让角色在此期间继续拾取或扣血。若重开中断表现，要取消旧回调，并复位透明度、缩放与焦点。状态机不是为了复杂，而是为了让这些取消路径可解释。

## 6.7 正常与异常验证

正常验证：静止动画稳定，运动不重置到第一帧；转向跨越正负角边界时无整圈旋转；无敌结束后恢复；多次收集只计一次；重开后角色视觉完全复位。分别在较低与较高帧率观察转向速度，不以某一张截图证明时间行为。

异常验证：动画缺失时查看错误并恢复资源；播放中重开；快速连续触发 emphasize；暂停期间观察 Tween 的预期处理；隐藏再显示节点。出现抖动时先找哪些系统同时写同一属性，而不是任意增加平滑系数。动画不播放时先核对名称、轨道路径和 active 状态。

## 6.8 作业与验收

为晶体实现只改变视觉的两段收集动画，持续约零点二秒。验收要求积分在触发瞬间只提交一次，动画期间不能重复收集，暂停和重开不会留下缩放或透明度残留；碰撞形状始终不变。提交触发顺序说明与异常操作记录，不能用“看起来流畅”作为唯一验收标准。

## 官方参考

- [二维精灵动画](https://docs.godotengine.org/en/4.7/tutorials/2d/2d_sprite_animation.html)
- [动画介绍](https://docs.godotengine.org/en/4.7/tutorials/animation/introduction.html)
- [AnimationTree](https://docs.godotengine.org/en/4.7/tutorials/animation/animation_tree.html)
- [Tween 类参考](https://docs.godotengine.org/en/4.7/classes/class_tween.html)

下一章：[UI、主题与适配](./07-ui-theme.md)。
