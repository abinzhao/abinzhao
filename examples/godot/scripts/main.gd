extends Node2D

const CoinScene: PackedScene = preload("res://scenes/coin.tscn")
const EnemyScene: PackedScene = preload("res://scenes/enemy.tscn")
const SaveStore = preload("res://scripts/save_store.gd")
const SAVE_PATH: String = "user://geometry-relay-v2.json"
const SPAWN: Vector2 = Vector2(80, 200)
const IDS: Array[String] = ["west", "north", "east", "south", "corner"]
const COIN_POSITIONS: Array[Vector2] = [
	Vector2(150, 270), Vector2(450, 230), Vector2(820, 240),
	Vector2(480, 540), Vector2(850, 540)
]
const WALLS: Array[Rect2] = [
	Rect2(0, 144, 960, 20), Rect2(0, 620, 960, 20),
	Rect2(0, 144, 24, 496), Rect2(936, 144, 24, 496),
	Rect2(280, 190, 24, 300), Rect2(590, 330, 210, 24)
]
enum Outcome { PLAYING, WON, LOST }

var outcome: Outcome = Outcome.PLAYING
var collected_ids: Array[String] = []
var total_coins: int = IDS.size()
var elapsed: float = 0.0
var exit_visual: Polygon2D
@onready var player: CharacterBody2D = $Player
@onready var level: Node2D = $Level
@onready var hud: CanvasLayer = $HUD
@onready var audio: AudioStreamPlayer = $Audio

func _ready() -> void:
	player.health_changed.connect(_on_health_changed)
	player.died.connect(func(): _finish(Outcome.LOST))
	hud.pause_requested.connect(func(): set_paused(not get_tree().paused))
	hud.restart_requested.connect(new_game)
	hud.save_requested.connect(func(): save_game())
	hud.load_requested.connect(func(): load_game())
	hud.mute_requested.connect(_toggle_mute)
	new_game()

func _process(delta: float) -> void:
	if outcome == Outcome.PLAYING and not get_tree().paused:
		elapsed += delta
	hud.update_state(collected_ids.size(), total_coins, player.health, elapsed, get_tree().paused)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_echo():
		return
	if event.is_action_pressed("ui_cancel"):
		set_paused(not get_tree().paused)
	elif event.is_action_pressed("restart"):
		new_game()
	elif event.is_action_pressed("save_game"):
		save_game()
	elif event.is_action_pressed("load_game"):
		load_game()
	elif event.is_action_pressed("mute"):
		_toggle_mute()

func new_game() -> void:
	get_tree().paused = false
	outcome = Outcome.PLAYING
	elapsed = 0.0
	collected_ids.clear()
	level.process_mode = Node.PROCESS_MODE_PAUSABLE
	_build_level()
	player.reset_at(SPAWN)
	hud.show_status("Collect five gold crystals, avoid red guards, then enter the green exit.")

func set_paused(value: bool) -> void:
	if outcome != Outcome.PLAYING:
		return
	get_tree().paused = value
	hud.show_status("PAUSED. Use Resume or Esc." if value else "Collect all crystals, then enter the exit.")

func _build_level() -> void:
	for child in level.get_children():
		level.remove_child(child)
		child.queue_free()
	for rectangle in WALLS:
		var wall: StaticBody2D = StaticBody2D.new()
		wall.position = rectangle.get_center()
		wall.collision_layer = 1
		wall.collision_mask = 0
		var collision: CollisionShape2D = CollisionShape2D.new()
		var shape: RectangleShape2D = RectangleShape2D.new()
		shape.size = rectangle.size
		collision.shape = shape
		wall.add_child(collision)
		wall.add_child(_rectangle_visual(rectangle.size, Color(0.2, 0.3, 0.4)))
		level.add_child(wall)
	var coins: Node2D = Node2D.new()
	coins.name = "Coins"
	level.add_child(coins)
	for index in range(IDS.size()):
		if IDS[index] in collected_ids:
			continue
		var coin: Area2D = CoinScene.instantiate()
		coin.coin_id = IDS[index]
		coin.position = COIN_POSITIONS[index]
		coin.collected.connect(_on_coin_collected)
		coins.add_child(coin)
	for point in [Vector2(440, 430), Vector2(790, 450)]:
		var enemy: CharacterBody2D = EnemyScene.instantiate()
		enemy.position = point
		enemy.target = player
		level.add_child(enemy)
	var exit: Area2D = Area2D.new()
	exit.name = "Exit"
	exit.position = Vector2(900, 580)
	exit.collision_layer = 0
	exit.collision_mask = 2
	var exit_shape: CollisionShape2D = CollisionShape2D.new()
	var rectangle_shape: RectangleShape2D = RectangleShape2D.new()
	rectangle_shape.size = Vector2(48, 48)
	exit_shape.shape = rectangle_shape
	exit.add_child(exit_shape)
	exit_visual = _rectangle_visual(Vector2(48, 48), Color(0.25, 0.35, 0.3))
	exit.add_child(exit_visual)
	exit.body_entered.connect(_on_exit_entered)
	level.add_child(exit)
	_update_exit()

func _rectangle_visual(size: Vector2, color: Color) -> Polygon2D:
	var visual: Polygon2D = Polygon2D.new()
	var half: Vector2 = size * 0.5
	visual.polygon = PackedVector2Array([
		Vector2(-half.x, -half.y), Vector2(half.x, -half.y),
		Vector2(half.x, half.y), Vector2(-half.x, half.y)
	])
	visual.color = color
	return visual

func _draw() -> void:
	for x in range(24, 936, 32):
		draw_line(Vector2(x, 164), Vector2(x, 620), Color(0.08, 0.12, 0.18))
	for y in range(172, 620, 32):
		draw_line(Vector2(24, y), Vector2(936, y), Color(0.08, 0.12, 0.18))

func _on_coin_collected(id: String) -> void:
	if outcome != Outcome.PLAYING or id not in IDS or id in collected_ids:
		return
	collected_ids.append(id)
	audio.cue("coin")
	_update_exit()
	hud.show_status("Exit unlocked! Reach the green square." if collected_ids.size() == total_coins else "Crystal collected.")

func _update_exit() -> void:
	exit_visual.color = Color(0.25, 0.95, 0.6) if collected_ids.size() == total_coins else Color(0.25, 0.35, 0.3)

func _on_exit_entered(body: Node2D) -> void:
	if body == player and collected_ids.size() == total_coins and outcome == Outcome.PLAYING:
		_finish(Outcome.WON)

func _on_health_changed(_health: int) -> void:
	if is_instance_valid(audio) and player.health < 3:
		audio.cue("damage")

func _finish(result: Outcome) -> void:
	outcome = result
	get_tree().paused = false
	player.set_physics_process(false)
	level.process_mode = Node.PROCESS_MODE_DISABLED
	if result == Outcome.WON:
		audio.cue("win")
		hud.show_status("WIN! All crystals delivered. Press R or Restart for a new game.")
	else:
		hud.show_status("GAME OVER. Press R or Restart to try again.")

func save_game(path: String = SAVE_PATH) -> Error:
	if outcome != Outcome.PLAYING:
		hud.show_status("Only an active run can be saved. Restart first.")
		return ERR_UNAVAILABLE
	var snapshot: Dictionary = {
		"version": SaveStore.VERSION, "health": player.health,
		"position": [player.position.x, player.position.y],
		"collected": collected_ids.duplicate()
	}
	var error: Error = SaveStore.write_save(path, snapshot)
	hud.show_status("Saved." if error == OK else "Save failed: " + error_string(error))
	return error

func load_game(path: String = SAVE_PATH) -> Error:
	var data: Dictionary = SaveStore.read_save(path, IDS, Rect2(38, 178, 884, 428))
	var error: Error = data["error"]
	if error == OK:
		for wall in WALLS:
			if wall.grow(14.0).has_point(data["position"]):
				error = ERR_FILE_CORRUPT
				break
	if error != OK:
		hud.show_status("Load failed (current run unchanged): " + error_string(error))
		return error
	get_tree().paused = false
	outcome = Outcome.PLAYING
	elapsed = 0.0
	collected_ids.assign(data["collected"])
	level.process_mode = Node.PROCESS_MODE_PAUSABLE
	_build_level()
	player.reset_at(data["position"], data["health"])
	hud.show_status("Loaded. Guards and timer restart; collected crystals stay collected.")
	return OK

func _toggle_mute() -> void:
	audio.toggle_mute()
	hud.show_status("Sound muted." if audio.muted else "Sound enabled.")
