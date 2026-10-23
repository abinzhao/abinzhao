extends CanvasLayer

signal pause_requested
signal restart_requested
signal save_requested
signal load_requested
signal mute_requested

var score_label: Label
var status_label: Label
var pause_button: Button

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root: Control = Control.new()
	add_child(root)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = _make_theme()
	var margin: MarginContainer = MarginContainer.new()
	root.add_child(margin)
	margin.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	var column: VBoxContainer = VBoxContainer.new()
	margin.add_child(column)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	score_label = Label.new()
	column.add_child(score_label)
	var help: Label = Label.new()
	help.text = "WASD / Arrows: Move   Esc: Pause   R: Restart   K: Save   L: Load   M: Sound"
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(help)
	status_label = Label.new()
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(status_label)
	var row: HFlowContainer = HFlowContainer.new()
	column.add_child(row)
	pause_button = _button(row, "Pause", func(): pause_requested.emit())
	_button(row, "Restart", func(): restart_requested.emit())
	_button(row, "Save", func(): save_requested.emit())
	_button(row, "Load", func(): load_requested.emit())
	_button(row, "Sound", func(): mute_requested.emit())
	pause_button.grab_focus()

func update_state(count: int, total: int, health: int, elapsed: float, is_paused: bool) -> void:
	score_label.text = "GEOMETRY RELAY   Crystals: %d / %d   Health: %d   Time: %.1fs" % [count, total, health, elapsed]
	score_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	pause_button.text = "Resume" if is_paused else "Pause"

func show_status(message: String) -> void:
	status_label.text = message

func _button(parent: Control, text: String, action: Callable) -> Button:
	var button: Button = Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(100, 44)
	parent.add_child(button)
	button.pressed.connect(action)
	return button

func _make_theme() -> Theme:
	var theme: Theme = Theme.new()
	theme.default_font_size = 18
	theme.set_color("font_color", "Label", Color(0.86, 0.94, 1.0))
	for state in ["normal", "hover", "pressed", "focus"]:
		var box: StyleBoxFlat = StyleBoxFlat.new()
		box.bg_color = Color(0.12, 0.2, 0.3) if state == "normal" else Color(0.2, 0.35, 0.48)
		box.set_corner_radius_all(6)
		box.set_content_margin_all(8)
		if state == "focus":
			box.bg_color.a = 0.0
			box.set_border_width_all(2)
			box.border_color = Color(0.4, 0.9, 1.0)
		theme.set_stylebox(state, "Button", box)
	return theme
