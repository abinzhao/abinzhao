extends SceneTree

var failures: int = 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error("SMOKE FAIL: " + message)

func _run() -> void:
	if not ResourceLoader.exists("res://scenes/main.tscn"):
		check(false, "the complete main scene must exist")
		quit(1)
		return
	var packed: PackedScene = load("res://scenes/main.tscn")
	var game: Node = packed.instantiate()
	root.add_child(game)
	await physics_frame
	await physics_frame
	check(game.get("total_coins") == 5, "level has five collectible IDs")
	var player: CharacterBody2D = game.get_node("Player")
	var start: Vector2 = player.position
	Input.action_press("move_right")
	for frame in range(12):
		await physics_frame
	Input.action_release("move_right")
	check(player.position.x > start.x + 10.0, "input moves the real player")
	player.position = Vector2(44, 200)
	Input.action_press("move_left")
	for frame in range(30):
		await physics_frame
	Input.action_release("move_left")
	check(player.position.x >= 37.0, "wall prevents movement outside the arena")
	game.call("_on_exit_entered", player)
	check(game.get("outcome") == 0, "exit stays locked before collection")
	game.call("set_paused", true)
	check(paused, "pause freezes the scene tree")
	game.call("set_paused", false)
	check(not paused, "resume unpauses the scene tree")
	game.call("new_game")
	player.call("take_damage")
	check(player.get("health") == 2, "damage reduces health")
	player.call("take_damage")
	check(player.get("health") == 2, "invulnerability prevents repeated damage")
	player.position = Vector2(150, 270)
	for frame in range(4):
		await physics_frame
	check(game.get("collected_ids").size() == 1, "real Area2D overlap collects a crystal")
	game.call("new_game")
	player.set("health", 2)
	var coins: Node = game.get_node("Level/Coins")
	var first: Node = coins.get_child(0)
	first.call("_on_body_entered", player)
	first.call("_on_body_entered", player)
	check(game.get("collected_ids").size() == 1, "one coin can be consumed only once")
	await process_frame
	var save_path: String = "res://validation/smoke-save.json"
	check(game.call("save_game", save_path) == OK, "save returns OK")
	game.call("new_game")
	check(game.get("collected_ids").is_empty(), "new game clears collected IDs")
	check(game.call("load_game", save_path) == OK, "load returns OK")
	check(game.get("collected_ids").size() == 1, "load restores collected IDs")
	check(player.get("health") == 2, "load restores health")
	var before: Vector2 = player.position
	var corrupt: FileAccess = FileAccess.open(save_path, FileAccess.WRITE)
	corrupt.store_string('{"version":999}')
	corrupt.close()
	check(game.call("load_game", save_path) != OK, "unknown schema is rejected")
	check(player.position == before, "rejected load leaves the player unchanged")
	var store: GDScript = load("res://scripts/save_store.gd")
	var ids: Array[String] = ["west", "north", "east", "south", "corner"]
	var bounds: Rect2 = Rect2(38, 178, 884, 428)
	var legacy: Dictionary = {"version": 1, "health": 2, "position": [80, 200], "collected": [0, 2]}
	var migrated: Dictionary = store.decode(legacy, ids, bounds)
	check(migrated["error"] == OK and migrated["collected"] == ["west", "east"], "v1 indices migrate to stable IDs")
	var invalid: Dictionary = {"version": 2, "health": 2, "position": [80, 200], "collected": ["west", "west"]}
	check(store.decode(invalid, ids, bounds)["error"] != OK, "duplicate IDs are rejected")
	invalid["collected"] = []
	invalid["health"] = "2"
	check(store.decode(invalid, ids, bounds)["error"] != OK, "string health is rejected")
	invalid["health"] = 2
	invalid["position"] = [280, 250]
	check(store.write_save(save_path, invalid) == OK, "wall-position fixture is written")
	check(game.call("load_game", save_path) != OK, "load rejects a wall position")
	check(player.position == before, "wall-position rejection is transactional")
	game.call("new_game")
	for coin in game.get_node("Level/Coins").get_children():
		coin.call("_on_body_entered", player)
	check(game.get("collected_ids").size() == 5, "all collectible signals reach the game")
	game.call("_on_exit_entered", player)
	check(game.get("outcome") == 1, "five coins plus exit wins")
	game.call("new_game")
	for hit in range(3):
		player.set("invulnerable_left", 0.0)
		player.call("take_damage")
	check(game.get("outcome") == 2, "three separated hits lose")
	game.call("new_game")
	check(game.get("outcome") == 0 and player.get("health") == 3, "restart resets terminal state")
	await process_frame
	print("SMOKE: ", "PASS" if failures == 0 else "FAIL", " (", failures, " failures)")
	game.queue_free()
	await process_frame
	call_deferred("quit", 0 if failures == 0 else 1)
