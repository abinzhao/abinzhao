extends Area2D

signal collected(coin_id: String)
@export var coin_id: String = ""
var consumed: bool = false
var elapsed: float = 0.0
@onready var visual: Polygon2D = $Visual

func _ready() -> void:
	body_entered.connect(_on_body_entered)

func _process(delta: float) -> void:
	elapsed += delta
	visual.position.y = sin(elapsed * 4.0) * 3.0

func _on_body_entered(body: Node2D) -> void:
	if consumed or not body.is_in_group("player"):
		return
	consumed = true
	set_deferred("monitoring", false)
	collected.emit(coin_id)
	queue_free()
