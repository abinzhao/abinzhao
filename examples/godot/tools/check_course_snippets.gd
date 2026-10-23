extends SceneTree

func _initialize() -> void:
	var project: String = ProjectSettings.globalize_path("res://").trim_suffix("/")
	var directory: String = project.get_base_dir().get_base_dir().path_join("docs/columns/godot")
	var checked: int = 0
	var failures: int = 0
	for filename in DirAccess.get_files_at(directory):
		if not filename.ends_with(".md"):
			continue
		var markdown: String = FileAccess.get_file_as_string(directory.path_join(filename))
		var blocks: PackedStringArray = markdown.split("```gdscript\n")
		for index in range(1, blocks.size()):
			var code: String = blocks[index].get_slice("```", 0).strip_edges()
			if not code.begins_with("extends "):
				continue
			var script: GDScript = GDScript.new()
			script.source_code = code + "\n"
			var error: Error = script.reload()
			checked += 1
			if error != OK:
				failures += 1
				push_error("Course snippet parse failed: %s block %d" % [filename, index])
			else:
				print("SNIPPET: OK ", filename, " block ", index)
	print("SNIPPETS: ", checked, " standalone blocks, ", failures, " failures")
	quit(0 if failures == 0 and checked >= 4 else 1)
