extends SceneTree

func _initialize() -> void:
	call_deferred("_capture")

func _capture() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("Preview requires a rendering display; use smoke.gd for headless checks.")
		quit(1)
		return
	var packed: PackedScene = load("res://scenes/main.tscn")
	var game: Node = packed.instantiate()
	root.add_child(game)
	for frame in range(10):
		await process_frame
	await RenderingServer.frame_post_draw
	var image: Image = root.get_texture().get_image()
	var error: Error = image.save_png("res://validation/preview.png")
	print("PREVIEW: ", error_string(error))
	game.queue_free()
	await process_frame
	call_deferred("quit", 0 if error == OK else 1)
