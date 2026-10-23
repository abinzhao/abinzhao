---
title: "第 08 章：信号、组合与游戏状态机"
description: "用明确事件契约组合玩家、晶体、HUD 和关卡，处理幂等、终局、重开与事件生命周期。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, 信号, 状态机]
series:
  order: 8
---

# 第 08 章：信号、组合与游戏状态机

一个晶体知道自己被玩家触碰，却不应该知道整局有多少晶体、出口在哪里或 HUD 用什么颜色。信号让对象报告事实，由合适的协调者解释结果。本章把前面建立的场景连成收集、解锁、胜负与重开的闭环，重点不是制造抽象，而是让每一次状态变化都有明确入口和责任。

## 8.1 事件与命令

命令要求某个对象执行操作，例如玩家 `reset_at()`；事件报告已经发生的事实，例如 `health_changed(value)`。事件名最好表达完成事实，而不是模糊的“更新”。订阅者收到事实后可以刷新 UI 或播放音效，但不应擅自重复提交原规则。

毕业项目的玩家发出生命变化和死亡信号，晶体发出带稳定 ID 的 collected，HUD 发出暂停、重开、存档、读档和静音请求。主场景连接这些入口并维护 Outcome 与收集列表。UI 负责提出请求，主场景负责判断当前状态是否允许，这样结束后点击 Pause 不会重新启动已结束关卡。

信号不是消息队列或后台任务。普通连接通常同步调用回调，发出信号后订阅者可能立即改变状态。设计时要考虑重入：先写入幂等标志，再发送事件；不要先发事件，再假定当前对象的字段还没被其他逻辑修改。延迟连接也不能自动替代完整状态检查。

## 8.2 建立连接的时机

固定子节点通常在父节点 `_ready()` 中连接一次。动态晶体则在实例化后、加入树之前连接。重开只重建 Level 子节点，不重新连接固定 HUD 信号，因此不会每局多增加一份按钮回调。事件连接数量应该与当前实例数量相匹配，不应随重试次数持续增长。

```gdscript
func _ready() -> void:
	player.health_changed.connect(_on_health_changed)
	player.died.connect(func(): _finish(Outcome.LOST))
	hud.pause_requested.connect(func(): set_paused(not get_tree().paused))
	hud.restart_requested.connect(new_game)
	new_game()
```

这是 `examples/godot/scripts/main.gd` 的连接片段，要求主场景已存在 player 和 hud 引用。匿名函数适合很短的适配；如果需要之后精确断开、复杂取消或独立测试，保留明确 Callable 更容易管理。不要让长匿名函数隐藏一整套规则。

对象释放会清理相关对象连接，但外部服务、静态集合或长生命周期订阅仍需要自行管理。节点离开树而未释放时，连接也未必自动失效。重开中移除旧关卡应同时停止其运行参与；保存旧节点引用的系统则要明确清空，不期待信号机制解决所有生命周期问题。

## 8.3 幂等是双层边界

晶体层的 claimed 防止同一个区域重复触发，关卡层还检查 ID 是否已收集。两层并不重复：前者保护当前节点生命周期，后者保护整局状态，能够拒绝异常重发、错误配置和重复 ID。即使晶体视觉已经隐藏，关卡也不能仅凭“看不见”判断它一定成功计数。

```gdscript
func _on_coin_collected(id: String) -> void:
	if outcome != Outcome.PLAYING or id not in IDS or id in collected_ids:
		return
	collected_ids.append(id)
	audio.cue("coin")
	_update_exit()
```

代码来源于主场景，合法 ID 来自固定 IDS。计分提交后再播放声音和改变出口颜色。如果音频设备不可用，收集仍然成功；表现失败不能回滚已经成立的规则。未来网络多人还需要服务端权威和消息去重，本地幂等并不自动成为网络安全协议。

## 8.4 状态机先描述不变量

本项目只有 Playing、Won、Lost 三种局面；Paused 是游玩中的树处理状态，不是新增胜负。Playing 允许收集、伤害与出口检查；Won 和 Lost 停止玩家物理与关卡处理，保留重开与有效读档。写状态机前先列允许的行为，再编码状态枚举，比只画箭头更容易发现遗漏。

出口触发需要三个条件：进入者是当前玩家，所有合法晶体已收集，局面仍在游玩。若玩家与最后一枚晶体在同一物理时刻接触，事件顺序可能影响当帧判断，因此测试需要覆盖真实区域触发与明确目标顺序，不只直接把计数设为五。

```gdscript
func _on_exit_entered(body: Node2D) -> void:
	if body == player and collected_ids.size() == total_coins \
			and outcome == Outcome.PLAYING:
		_finish(Outcome.WON)
```

这是现有出口规则。终局函数将状态设为结果，取消树暂停，停止玩家物理，禁用 Level 处理，然后显示结算提示。关卡事件入口也检查 Outcome，防止同帧已排队事件继续改变结果。终局表现需要建立在这些不变量之后。

## 8.5 组合而不是无止境继承

玩家与敌人都需要生命或伤害，不代表必须建立一条复杂父类继承树。Godot 场景允许把一个负责生命的 Node 子组件组合进角色，发出健康变化事件；移动与视觉各自消费所需状态。只有存在真实共享规则时才提取组件，不为两个相似变量创建一个通用框架。

独立实验可建立 `Health` 子节点，脚本如下：

```gdscript
extends Node

signal changed(value: int)
signal depleted
@export var maximum: int = 3
var current: int = 3

func reset_health() -> void:
	current = maxi(1, maximum)
	changed.emit(current)

func damage(amount: int) -> void:
	if amount <= 0 or current <= 0:
		return
	current = maxi(0, current - amount)
	changed.emit(current)
	if current == 0:
		depleted.emit()
```

使用前在角色准备时调用 reset_health，并连接事件。这个组件只负责生命数字，不含无敌时间、阵营判断、受击来源或击退。因此不能直接替代毕业项目玩家的全部伤害实现。把无敌留在角色还是加入组件，应由真正复用边界决定，而不是为了“组件化”拆出更多文件。

## 8.6 Group 与 Autoload 的边界

Group 适合给对象标记角色类别，例如 player。它不保证每个组成员都有同一方法，动态调用前仍需具体契约。项目的敌人使用玩家组判断接触对象，规则规模很小；扩展多个玩家或召唤物时，应该明确受伤接口与阵营，而不依赖宽泛组名。

Autoload 适合跨场景存在的设置或会话服务，但并非所有数据都应全局化。当前一屏关卡由主场景协调已经足够，存档规则使用无节点的 RefCounted 脚本。提前创建全局事件总线，会让任何对象都能广播任何事件，反而难以追踪来源、订阅者和测试清理。

信号、直接方法调用、组和 Autoload 没有绝对优劣。确定目标对象的命令用直接调用，多个表现订阅事实用信号，类别查询用组，真正跨场景服务用 Autoload。选择越具体，依赖越容易解释；不要用一种机制覆盖所有通信需求。

## 8.7 重开是一项恢复事务

new_game 清除暂停与终局、计时和收集列表，重建关卡，再重置玩家生命与位置。重置函数必须恢复 set_physics_process、速度、透明度和无敌计时，不能只把坐标移回出生点。旧敌人与旧晶体不应继续留在树中；UI 的连接也不能重复添加。

读档虽然与重开相似，但不能在校验前调用 new_game。失败读档必须保留当前局面，否则用户会因坏文件丢失正在玩的进度。第九章将这一点扩展成解析、迁移、验证、提交四阶段。状态机的价值正在于让错误路径与正常路径具有同样清楚的边界。

## 8.8 正常验证、排错与作业

正常验证：同一 ID 重发不增加计数，部分收集不能胜利，完成后进入出口只结算一次，失败后重开恢复全部状态。异常验证：未知 ID、终局后收集、连续重开、暂停中读档、同帧多个伤害事件。记录规则字段变化，而不是仅观察颜色或提示文字。

按钮一次点击触发多次时检查连接是否每次重开都增加；事件收到后状态不一致时检查同步重入与入口守卫；新局仍半透明时检查重置项；找不到订阅者时检查动态实例连接顺序。不要把问题解决为“再广播一次所有状态”，那会掩盖缺失责任。

作业是增加一个“获得钥匙后才能开启”的独立门场景。验收要求门只报告交互请求，协调器检查条件，重复请求不消耗两次钥匙，重开后状态恢复，UI 与声音失败不影响规则结果。提交事件与命令清单，说明为什么没有使用全局事件总线。

## 官方参考

- [使用信号](https://docs.godotengine.org/en/4.7/getting_started/step_by_step/signals.html)
- [场景组织](https://docs.godotengine.org/en/4.7/tutorials/best_practices/scene_organization.html)
- [组](https://docs.godotengine.org/en/4.7/tutorials/scripting/groups.html)
- [Autoload](https://docs.godotengine.org/en/4.7/tutorials/scripting/singletons_autoload.html)

下一章：[存档与版本](./09-save-versioning.md)。
