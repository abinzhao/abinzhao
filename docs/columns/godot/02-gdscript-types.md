---
title: "第 02 章：静态类型 GDScript 与规则边界"
description: "掌握类型、引用、集合、流程控制和 await，避免把动态输入直接当成可信游戏状态。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, GDScript, 静态类型]
series:
  order: 2
---

# 第 02 章：静态类型 GDScript 与规则边界

GDScript 与 Python 外观相似，但有自己的类型系统、对象生命周期和引擎接口。它不是把 Python 安装进游戏里。本章要建立两个能力：在编辑器运行之前发现尽可能多的类型错误；面对 JSON、节点查询等动态值时，仍然能明确拒绝不符合规则的数据。类型让契约可见，运行校验让外部数据可信，两者不能相互替代。

## 2.1 值、类型与推断

常用值包括 `bool`、`int`、`float`、`String`、`Vector2`、`Color`、`Array`、`Dictionary` 和对象引用。`int` 适合计数与离散状态；`float` 适合时间、速度与位置。把一秒分成若干帧时要使用浮点计算，不要依赖整数除法恰好得到预期结果。向量不是两个随意拼接的数字，它包含长度、方向和几何运算。

```gdscript
extends Node

const MAX_HEALTH: int = 3
@export_range(0.0, 600.0, 1.0) var speed: float = 240.0
var health: int = MAX_HEALTH
var direction := Vector2.ZERO
var collected: Array[String] = []

func can_finish(count: int, total: int) -> bool:
	return total > 0 and count == total
```

把这个独立实验脚本挂在空 `Node` 上即可解析。`:=` 从表达式推断类型；`:` 显式写类型；没有声明也没有静态推断的值可能保留 `Variant`。函数参数和返回值最好明确，特别是输入与状态变化边界。无需为了“静态化”给每一行增加重复标注，但关键字段不应靠读者猜测。

`@export` 把变量暴露给检查器，它提供编辑器配置入口，不是安全验证。检查器中的范围提示也不能证明存档、代码赋值或远程数据一定满足范围。角色的速度可以在资源中调节，生命上限则由规则决定。把可调参数与不变量分开，才能避免关卡策划无意间修改核心约束。

## 2.2 静态类型解决什么

假设函数返回一个节点，调用方立即访问 `velocity`。如果返回类型只有 `Node`，编辑器并不知道它一定是角色；若写成 `CharacterBody2D`，契约就更清楚。另一方面，`CharacterBody2D` 并没有项目自定义的生命字段，跨脚本调用自定义方法仍需要具体脚本类型或明确的动态边界。

毕业项目为保持最小结构，没有给每个脚本注册全局 `class_name`。因此 `main.gd` 通过节点引用调用玩家自定义方法的部分仍是动态协作边界。本章不能把它包装成“全项目零动态调用”。扩展时可给玩家脚本增加 `class_name RelayPlayer`，并把对应引用声明为 `RelayPlayer`，但要同步更新引用处，避免只改一半。

类型错误通常在解析时就能发现，例如把字符串赋给 `Vector2`，或返回类型与声明不一致。动态节点路径缺失、文件读取失败、对象已经释放，则仍然可能发生在运行时。正确的目标不是“加类型后不再需要测试”，而是把容易检查的错误提前，让运行验证集中在真实生命周期与行为上。

## 2.3 集合与引用不能混为值

数组和字典存在共享引用。把 `collected` 直接赋给另一个变量，再修改新变量，可能修改原集合。存档快照希望捕获某一刻的数据，因此示例在构造快照时使用 `collected_ids.duplicate()`。其元素是字符串，浅复制已足够；如果元素包含嵌套集合，是否需要深复制必须重新判断。

```gdscript
var original: Array[String] = ["west"]
var alias: Array[String] = original
alias.append("north")
assert(original.size() == 2)

var snapshot: Array[String] = original.duplicate()
snapshot.append("east")
assert(original.size() == 2)
```

上面是函数内部实验片段，不应直接作为顶层脚本语句粘贴。数组下标越界不是一种有效的“空结果”；访问前要检查范围。字典的 `get()` 可以提供缺省值，但如果缺少字段应当导致拒绝，就不能给一个看似合法的默认值把问题隐藏掉。存档版本缺失与版本为一不是同一件事。

字符串 ID 适合标识收集物，因为节点名称和数组顺序都可能在编辑关卡时改变。集合的数据契约也要规定是否允许重复。本项目要求每个晶体最多计数一次，所以列表不仅需要“都是字符串”，还需要“来自已知集合且互不重复”。这属于业务校验，静态 `Array[String]` 本身不会完成。

## 2.4 流程控制与状态表达

`if` 处理条件分支，`for` 遍历有限集合，`while` 适合条件循环，但必须能说明终止条件。每帧用无上限循环搜索位置容易卡死整个游戏。写规则时先描述最大尝试次数或有限输入，再选择循环形式，不能假定随机过程总会及时找到答案。

枚举把状态从魔法数字变成命名集合。毕业项目用 `Outcome.PLAYING`、`Outcome.WON` 和 `Outcome.LOST` 表达局面，敌人用 `PATROL`、`CHASE`、`RETURN` 表达行为。`match` 分派状态时应考虑未知输入如何处理；来自存档的数字不能未经验证就强制当成合法枚举。

```gdscript
enum Outcome { PLAYING, WON, LOST }
var outcome: Outcome = Outcome.PLAYING

func describe_outcome() -> String:
	match outcome:
		Outcome.PLAYING:
			return "Collect crystals"
		Outcome.WON:
			return "Delivered"
		Outcome.LOST:
			return "Try again"
	return "Invalid outcome"
```

这个片段可放进独立 `Node` 脚本。函数结尾给出明确返回值，避免未来新增状态后出现隐式空值。不要把所有异常都映射成“游戏失败”：规则失败、文件失败和程序错误的处理方式不同，错误必须保留足够的信息让调用方决定下一步。

## 2.5 await 是等待信号，不是后台线程

Godot 4 使用 `await` 等待信号或协程结果，不推荐旧版本的 `yield` 写法。等待不会自动让 CPU 密集工作转移到另一个线程，也不会阻塞其他正常节点更新。暂停是否影响等待，取决于信号来源与计时器的处理配置，不能仅从 `await` 这个词推断。

```gdscript
extends Node

var generation: int = 0

func show_delayed_hint() -> void:
	var ticket: int = generation
	await get_tree().create_timer(1.0, false).timeout
	if ticket != generation:
		return
	print("Hint for this run")

func restart_run() -> void:
	generation += 1
```

这个独立示例用代次拒绝旧回调。第二个参数为 `false`，让树暂停时该计时器不继续正常计时。重开后旧等待仍可能完成，但不应给新局写入旧提示。延迟越多，生命周期越重要；已经释放的对象引用还应按具体场景检查，不要把代次校验当作所有对象安全问题的通用解法。

## 2.6 动态数据的入口校验

`JSON` 解析出来的是 `Variant`，不是已经可信的角色状态。示例 `save_store.gd` 先确认顶层是字典，再检查字段类型与取值。数值必须有限，整数语义要求没有小数，位置必须落在边界中。`true` 不能因为语言允许某种转换就被当成生命一。

```gdscript
static func whole_number(value: Variant, low: int, high: int) -> bool:
	if typeof(value) not in [TYPE_INT, TYPE_FLOAT]:
		return false
	var number: float = float(value)
	return is_finite(number) and number == floor(number) \
		and number >= low and number <= high
```

该函数可放在 `RefCounted` 脚本中，供规则验证调用。它只检查整数语义，不负责解析整个存档。先检查类型再转换，可以避免把字符串、空值与布尔值当成合法输入。第九章会将它与版本迁移、空间校验和事务恢复组合起来。

## 2.7 正常验证、排错与作业

正常验证包括：脚本无解析错误，函数对边界值返回预期结果，复制快照后修改不污染原集合，重开后旧提示不出现。异常输入至少覆盖空值、字符串、小数、负数和超上限数值。`assert` 适合开发期暴露不变量，不应代替发布版本中对不可信文件的显式错误返回。

“不能推断类型”时，先看表达式是否来自动态字典或动态函数；为边界添加明确检查，不要一律关闭警告。节点为空时核对入树时机和路径。方法不存在时核对声明类型与真正实例的脚本。将 `Variant` 强制转换为目标类型并不会创造缺失对象，也不会修复错误数据。

作业是实现一个纯规则函数，输入已收集 ID 与合法 ID，返回是否满足出口条件。验收要求拒绝重复与未知 ID，并分别证明空列表、部分收集、完整收集的结果；不能只比较数组长度。另写一份解释，说明静态类型、断言和运行校验各自负责哪一类错误。

## 官方参考

- [GDScript 基础](https://docs.godotengine.org/en/4.7/tutorials/scripting/gdscript/gdscript_basics.html)
- [静态类型](https://docs.godotengine.org/en/4.7/tutorials/scripting/gdscript/static_typing.html)
- [GDScript 风格指南](https://docs.godotengine.org/en/4.7/tutorials/scripting/gdscript/gdscript_styleguide.html)
- [JSON 类参考](https://docs.godotengine.org/en/4.7/classes/class_json.html)

下一章：[节点、场景与资源](./03-scenes-resources.md)。
