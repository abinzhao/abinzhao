extends RefCounted

const VERSION: int = 2

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

static func read_save(path: String, valid_ids: Array[String], bounds: Rect2) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"error": ERR_FILE_NOT_FOUND}
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {"error": FileAccess.get_open_error()}
	if file.get_length() > 16384:
		return {"error": ERR_FILE_CORRUPT}
	var text: String = file.get_as_text()
	file.close()
	var parser: JSON = JSON.new()
	if parser.parse(text) != OK:
		return {"error": ERR_PARSE_ERROR}
	return decode(parser.data, valid_ids, bounds)

static func decode(raw: Variant, valid_ids: Array[String], bounds: Rect2) -> Dictionary:
	if not raw is Dictionary:
		return {"error": ERR_FILE_CORRUPT}
	var version: Variant = raw.get("version")
	if not _whole(version, 1, VERSION):
		return {"error": ERR_FILE_UNRECOGNIZED}
	var health: Variant = raw.get("health")
	var position_data: Variant = raw.get("position")
	var ids: Variant = raw.get("collected")
	if not _whole(health, 1, 3) or not position_data is Array or position_data.size() != 2 or not ids is Array:
		return {"error": ERR_FILE_CORRUPT}
	for coordinate in position_data:
		if typeof(coordinate) not in [TYPE_INT, TYPE_FLOAT] or not is_finite(float(coordinate)):
			return {"error": ERR_FILE_CORRUPT}
	var point: Vector2 = Vector2(float(position_data[0]), float(position_data[1]))
	if not bounds.has_point(point) or ids.size() > valid_ids.size():
		return {"error": ERR_FILE_CORRUPT}
	var restored: Array[String] = []
	for entry in ids:
		var id: String = ""
		if int(version) == 1:
			if not _whole(entry, 0, valid_ids.size() - 1):
				return {"error": ERR_FILE_CORRUPT}
			id = valid_ids[int(entry)]
		else:
			if not entry is String or entry not in valid_ids:
				return {"error": ERR_FILE_CORRUPT}
			id = entry
		if id in restored:
			return {"error": ERR_FILE_CORRUPT}
		restored.append(id)
	return {"error": OK, "health": int(health), "position": point, "collected": restored}

static func _whole(value: Variant, minimum: int, maximum: int) -> bool:
	if typeof(value) not in [TYPE_INT, TYPE_FLOAT]:
		return false
	var number: float = float(value)
	return is_finite(number) and number == floor(number) and number >= minimum and number <= maximum
