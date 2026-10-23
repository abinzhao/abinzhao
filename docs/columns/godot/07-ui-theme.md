---
title: "第 07 章：Control、主题、焦点与界面适配"
description: "用锚点与容器构建 HUD，处理暂停输入、主题状态、键盘焦点、窗口拉伸与移动安全区。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, UI, Theme]
series:
  order: 7
---

# 第 07 章：Control、主题、焦点与界面适配

游戏界面是操作系统的一部分：它展示状态，也允许玩家暂停、重试和恢复。能看到按钮不代表能用键盘选择，能缩放窗口也不代表触屏可玩。本章用 Control 与容器搭建 HUD，解释主题资源和输入传播，再建立不同尺寸的验收方法。视觉、布局和交互必须分别检查。

## 7.1 世界层与界面层

`CanvasLayer` 提供独立画布层，适合让 HUD 不随世界相机平移。它本身不是带锚点的面板，因此要在其下创建 `Control` 根。Control 的矩形位置由锚点、偏移、最小尺寸和父容器共同决定；Node2D 的 position 与 scale 不具备同样布局语义。

毕业项目的结构是 CanvasLayer → Control → MarginContainer → VBoxContainer，按钮采用 HFlowContainer。分数、说明和状态纵向排列，按钮横向空间不足时换行。这个结构能表达布局关系，不需要为每个按钮写固定 x 坐标。关卡顶部预留区域，但竖屏仍需要重新设计，自动换行并不能保证世界可读。

## 7.2 锚点与容器的分工

锚点取值相对父控件矩形，偏移是从锚点计算出的距离。全矩形锚点让根控件随视口变化；顶部宽布局让 HUD 横向铺开但不占据整个屏幕高度。最小尺寸约束控件不能缩到不可用，size flags 则告诉容器怎样分配剩余空间。

容器会接管子控件布局，因此不要同时依赖手工 position。运行时看到设置的尺寸被恢复，往往不是引擎“忽略代码”，而是容器正在正常排版。需要固定留白用 MarginContainer，需要垂直排列用 VBoxContainer，需要溢出滚动用 ScrollContainer，而不是反复调整锚点试图模拟所有布局。

独立 HUD 实验可挂在 CanvasLayer 根上：

```gdscript
extends CanvasLayer

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root: Control = Control.new()
	add_child(root)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var margin: MarginContainer = MarginContainer.new()
	root.add_child(margin)
	margin.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	var column: VBoxContainer = VBoxContainer.new()
	margin.add_child(column)
	var label: Label = Label.new()
	label.text = "Crystals: 0 / 5"
	column.add_child(label)
	var button: Button = Button.new()
	button.text = "Pause"
	button.custom_minimum_size = Vector2(100, 44)
	column.add_child(button)
	button.grab_focus()
```

这是最小布局，不含完整暂停逻辑。按钮最小高度为四十四个设计单位，最终触控尺寸还受窗口缩放与设备像素密度影响。Label 自动换行要有可用宽度约束，否则文本可能把容器最小宽度撑得过大。检查长提示与本地化后的文本，而不只检查短英文。

## 7.3 主题不是一组硬编码颜色

Theme 保存字体、字号、颜色、常量、图标与 StyleBox。将主题放在根 Control 上可以向后代提供一致样式，单个控件再覆盖必要项。每种控件按类型和项目名查询主题，例如 Button 的 normal、hover、pressed、focus。写错类型或项目名通常不会自动生成你期待的效果。

毕业项目 `_make_theme()` 使用 StyleBoxFlat，正常背景较深，悬停与按下更亮，焦点使用透明背景与亮边框。焦点必须可见，否则键盘用户无法判断当前按钮。禁用状态同样需要区分，不能只阻止点击却保持完全相同外观。若新增按钮类型，应补充它的状态而不是依赖偶然继承。

```gdscript
var theme: Theme = Theme.new()
theme.default_font_size = 18
var normal: StyleBoxFlat = StyleBoxFlat.new()
normal.bg_color = Color(0.12, 0.2, 0.3)
normal.set_corner_radius_all(6)
normal.set_content_margin_all(8)
theme.set_stylebox("normal", "Button", normal)
root.theme = theme
```

这个函数内部片段要求已经存在 root。生产项目可以把主题保存为 `.tres`，让编辑器预览与多个场景复用。共享主题运行中改变会影响所有引用者，因此个人偏好设置应明确修改全局主题，局部反馈则使用控件覆盖或独立资源。不要为一次按钮高亮复制整个主题体系。

## 7.4 鼠标传播与键盘焦点

mouse_filter 的 Stop、Pass、Ignore 决定 GUI 事件传播方式，不等于所有输入状态是否继续存在。装饰性根控件可以 Ignore，按钮仍处理自己的点击；覆盖全屏的透明控件如果设置不当，可能拦住下面的游戏或菜单。遇到点击无反应时，应检查最上层控件，而不只是按钮回调。

键盘与手柄导航依赖焦点。打开菜单时要把焦点给合理的首项，关闭后恢复到游戏预期位置。复杂布局可显式设置上下左右邻居，避免几何自动选择跨到不相关控件。按钮标签改变不应丢失焦点，重建整个 HUD 则需要重新建立焦点关系。

项目为 Pause 按钮初始调用 `grab_focus()`，用默认 UI 动作选择与确认。WASD 玩家动作和默认方向 UI 动作可能在键盘上同时发挥作用，测试时要检查玩家控制与菜单导航是否符合产品预期。正式菜单打开时可以通过状态关闭玩家移动，而不是希望 GUI 自动屏蔽全局 Input 查询。

## 7.5 暂停中的界面

HUD 设置 Always，玩家设置 Pausable，协调入口也需要在暂停中处理继续请求。按钮只发出 pause_requested 信号，真正的 SceneTree 状态由主节点改变。这样 UI 不需要直接知道关卡如何停止，也不会在不同场景中各自维护一份暂停真相。

```gdscript
signal pause_requested

func bind_pause(button: Button) -> void:
	button.pressed.connect(func(): pause_requested.emit())
```

该片段放在 HUD 脚本中，调用方提供 Button。暂停提示、按钮文字与实际树状态应同步。终局时不能让 Pause 按钮意外恢复已结束关卡；示例协调器在非游玩状态拒绝暂停切换，同时仍保留重开和读档。错误提示可以更新 UI，但不能擅自改变当前局面。

## 7.6 拉伸与安全区

`canvas_items` 会按项目设置调整二维画布呈现，`expand` 允许显示区域随宽高比扩展。它并不自动重新设计关卡，也不会凭空提供触控输入。相机限制、世界边界和 UI 锚点需要一起检查，窗口窄时要决定保留横屏、允许信箱留边，还是重新组织竖屏玩法。

移动端有刘海、圆角和系统手势区域。`DisplayServer.get_display_safe_area()` 提供显示安全区域信息，但其坐标不应直接当作 Control 的设计单位使用。要按实际窗口、视口和缩放关系转换，再更新 MarginContainer。先在无特殊安全区桌面上验证转换，再在真机检查横竖屏与旋转，不能只添加固定顶部像素就声称适配完成。

更大的字号、翻译后长文本和屏幕阅读需求也属于适配。Godot 的可访问性能力与目标平台支持需要按版本核对；至少保持文字信息、不依赖颜色表达胜负、明确焦点和足够触控范围。不要用图标取代所有按钮文案后又没有可读标签。

## 7.7 正常与异常验证

正常验证：鼠标按钮、Tab 或方向导航、确认键都能触发相同动作；暂停后 Resume 可用；标签长文本换行；焦点轮廓可见；世界相机移动不改变 HUD 位置。异常验证：连续暂停重开、读档失败后恢复操作、禁用按钮、窗口缩到最小、文本变长。

建议记录 960×640、1280×720 与窄窗口三组观察，再明确哪组受支持。出现横向溢出先检查子控件最小宽度与文本换行；按钮被遮挡先检查根矩形和鼠标过滤；暂停无响应检查处理模式。不要通过整体缩小到难以点击来消除布局错误。

## 7.8 作业与验收

为 HUD 增加设置面板，提供音量滑块和关闭按钮，不修改收集规则。验收要求键盘可打开关闭、焦点不会落到隐藏面板、暂停中仍能操作、长文本不溢出，关闭后恢复原有焦点。移动端若未连接真机，应明确只完成布局实验，不声称触屏游戏已交付。

## 官方参考

- [Control 类参考](https://docs.godotengine.org/en/4.7/classes/class_control.html)
- [使用容器](https://docs.godotengine.org/en/4.7/tutorials/ui/gui_containers.html)
- [主题介绍](https://docs.godotengine.org/en/4.7/tutorials/ui/gui_skinning.html)
- [多分辨率](https://docs.godotengine.org/en/4.7/tutorials/rendering/multiple_resolutions.html)

下一章：[信号与组件](./08-signals-components.md)。
