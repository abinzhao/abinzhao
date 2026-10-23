---
title: "第 09 章：存档校验、版本迁移与恢复事务"
description: "从状态快照到 JSON 边界，建立稳定 ID、旧版迁移、临时写入和失败不变更世界的本地存档。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, 存档, 数据迁移]
series:
  order: 9
---

# 第 09 章：存档校验、版本迁移与恢复事务

存档并不是把场景树直接写到磁盘。运行中的节点包含物理对象、信号连接、音频播放和临时动画，这些对象既不适合长期保存，也可能在下一版本失去意义。本章从“哪些事实需要延续”出发，完成一个可以拒绝坏文件、迁移旧数据、恢复游玩状态的系统。毕业项目的实现位于 `examples/godot/scripts/save_store.gd`，接入入口位于 `scripts/main.gd`。

## 9.1 定义快照，而不是保存所有字段

本关卡保存版本、生命、玩家位置和已收集晶体的稳定 ID。敌人当前坐标、巡逻方向、无敌倒计时、声音和计时不保存，加载后守卫与计时重新开始。终局不允许保存，生命必须在一到三之间。这是明确的产品规则，不是序列化技术的限制；需要续存终局或计时，应先修改契约与验证。

晶体不能使用“场景树第几个子节点”作为永久身份。重排节点、插入新装饰或改变生成顺序，都会让旧索引指向别的对象。项目采用 west、north、east、south、corner 五个 ID，位置可以变化，身份不能随意复用。删除晶体时如何处理已有进度，也应作为版本迁移的一部分。

```json
{
  "version": 2,
  "health": 2,
  "position": [80, 200],
  "collected": ["west", "east"]
}
```

这是数据格式示例，不是项目附带的个人存档。位置写成两个数字，而不直接写 Vector2；JSON 没有引擎对象类型。读取后必须显式转换回 Vector2。数组顺序在这里不表示收集时间，不能在下一版本未经迁移就把它解释为事件日志。

## 9.2 文件位置与编辑器步骤

第一步，导入项目并运行，收集一枚晶体后按 K。第二步，使用编辑器的打开用户数据目录入口定位存档；不同系统与项目设置会改变实际目录，不应硬编码某台电脑的路径。第三步，按 R 重开，再按 L，检查已收集晶体没有重新出现，生命与位置恢复，计时回到起点。

`res://` 表示项目资源，发布包中通常不是可写目录；`user://` 才是用户数据入口。普通玩法写入 `user://geometry-relay-v2.json`。规则探针为了隔离实验，使用示例目录中的验证文件，这不意味着正式游戏应向资源目录存档。Web 上用户数据由浏览器存储机制承载，也不是用户硬盘上可随意查看的同名文件。

准备异常实验前，先复制自己的测试存档，并停止游戏，避免运行中的操作覆盖手工数据。之后分别制造截断 JSON、未知版本、重复 ID 和墙内坐标。一次只改变一个条件，保留原始合法文件，才能确定失败来自哪条校验，而不是几个错误互相掩盖。

## 9.3 四阶段读取

安全的读取流程是读取字节、解析结构、迁移并校验、提交世界。前三阶段只产生候选数据，不移动玩家，不清空收集列表，不调用 new_game。最后阶段才取消暂停、重建关卡和重置玩家。这样损坏文件不会让用户丢失当前正在玩的局面。

文件存在不等于可读；打开失败必须返回具体 Error。读取前限制为十六 KiB，防止错误文件造成不受控内存分配。JSON 使用实例的 parse 方法，能够区分解析错误与合法的 null。顶层必须是字典，字段必须符合类型与范围，不能把缺少字段默认为零后继续恢复。

以下是现有解码器中的整数检查，挂在 RefCounted 存档脚本中，不依赖节点：

```gdscript
static func _whole(value: Variant, minimum: int, maximum: int) -> bool:
	if typeof(value) not in [TYPE_INT, TYPE_FLOAT]:
		return false
	var number: float = float(value)
	return is_finite(number) and number == floor(number) \
		and number >= minimum and number <= maximum
```

JSON 数字解析后可能表现为浮点值，所以检查的是“有限、无小数且位于范围内”，而不只判断 TYPE_INT。字符串 `"2"`、布尔值和小数生命都不合法。不能用 int(value) 直接截断，否则 2.9 会悄悄变成两点生命，把坏数据伪装成成功。

## 9.4 结构合法仍不代表世界合法

坐标必须恰好有两个有限数字，并位于可活动矩形内；收集数组不能超过合法 ID 数量，不能重复，也不能出现未知身份。这些检查属于格式与规则边界。还需检查玩家是否会恢复到墙里面，这是当前关卡几何才能回答的问题，所以放在主场景而不是通用文件读取器中。

```gdscript
var data: Dictionary = SaveStore.read_save(
	path, IDS, Rect2(38, 178, 884, 428)
)
var error: Error = data["error"]
if error == OK:
	for wall in WALLS:
		if wall.grow(14.0).has_point(data["position"]):
			error = ERR_FILE_CORRUPT
			break
if error != OK:
	hud.show_status("Load failed: " + error_string(error))
	return error
```

片段位于 main.gd 的 load_game 中，前置条件是现有常量、HUD 和存档脚本已定义。扩大墙体十四像素，为玩家碰撞体留出保守空间。复杂多边形关卡应改用形状查询或可靠出生点验证，不能把这套矩形检查宣称为所有地形的通用算法。检查之后才执行状态提交。

## 9.5 版本迁移必须可解释

版本一把收集记录保存为整数索引，版本二改为稳定字符串。迁移使用旧版固定顺序的 ID 表，将零和二转换为 west 和 east。该表一旦代表已发布版本，就不能因新关卡排序而重排；否则迁移虽然没有报错，语义却已经错误。多个历史版本应各自拥有明确的映射。

未来版本直接拒绝，不猜测新字段的含义。迁移成功后仍要执行范围、重复和世界检查，因为旧文件也可能被破坏。当前读取不自动覆写旧文件；用户下一次主动保存才写成版本二。这使读取成为无磁盘副作用的过程，也便于保留旧文件进行排错。

迁移不是简单地加一行 `"version": 2`。新版本新增钥匙时，要确定旧存档是否默认没有钥匙，是否需要补偿；删除区域时，要定义玩家恢复地点。每条规则都应有旧输入、预期新输出和拒绝条件。无法确定的数据宁可显示不能恢复，也不要悄悄创造进度。

## 9.6 临时写入与持久性边界

项目先把快照写入同目录临时文件，flush 后检查错误并关闭，再重命名为目标。直接覆盖正式文件时，中途失败可能留下截断内容；临时文件方案把完整目标替换推迟到写入结束。但它不是事务数据库，不能保证所有文件系统、断电和浏览器环境的持久性。

```gdscript
static func write_save(path: String, snapshot: Dictionary) -> Error:
	var temporary: String = path + ".tmp"
	var file: FileAccess = FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(snapshot))
	file.flush()
	var error: Error = file.get_error()
	file.close()
	if error != OK:
		return error
	return DirAccess.rename_absolute(temporary, path)
```

这是完整现有写入函数，由主场景提供可信快照。重命名失败必须返回错误，不能仍显示 Saved；可能留下临时文件，不能把它自动当成最新版。需要多槽位、备份或崩溃恢复时，应设计校验与恢复顺序，再添加相应实现。当前教程不声称具备这些扩展。

本地 JSON 可被用户修改，它用于恢复体验，不是防作弊。加密密钥若随客户端分发，也不能成为可靠权威。不要使用允许任意对象解码的文件读取方式来恢复不可信数据；只读取明确的基础字段。真正联网排行榜需要服务端规则，本地存档校验不能替代它。

## 9.7 验证、排错与作业

正常验证覆盖部分进度、满进度但尚未进出口、受伤后保存、暂停时读取和终局后读取有效游玩存档。异常验证覆盖文件缺失、超长文件、非字典顶层、未来版本、小数生命、重复 ID、越界坐标与墙内坐标。每次失败都记录读取前后位置、生命、收集列表与局面，除了错误提示之外应完全不变。

读取成功但晶体错误时检查 ID 与迁移映射；保存成功却找不到文件时核对用户目录和项目名；坏文件导致重开时查找校验之前的世界修改；加载到墙边卡住时核对碰撞半径与安全区域。不要用捕获所有错误然后 new_game 来处理这些问题。

作业是增加“最高已完成关卡”字段，并给版本二到新版本制定迁移。验收需要合法旧存档成功迁移、未来版本拒绝、写入错误有反馈、失败读取不改变世界，以及对已删除关卡的恢复规则。提交数据契约和验证表，不以截图中的成功提示替代字段断言。

## 官方参考

- [保存游戏](https://docs.godotengine.org/en/4.7/tutorials/io/saving_games.html)
- [文件路径](https://docs.godotengine.org/en/4.7/tutorials/io/data_paths.html)
- [JSON](https://docs.godotengine.org/en/4.7/classes/class_json.html)
- [FileAccess](https://docs.godotengine.org/en/4.7/classes/class_fileaccess.html)
- [DirAccess](https://docs.godotengine.org/en/4.7/classes/class_diraccess.html)

下一章：[敌人 AI 与导航](./10-ai-navigation.md)。
