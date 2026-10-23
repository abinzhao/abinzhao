extends CharacterBody2D

signal health_changed(value: int)
signal died

@export var speed: float = 240.0
var health: int = 3
var invulnerable_left: float = 0.0
@onready var visual: Polygon2D = $Visual

func _physics_process(delta: float) -> void:
	invulnerable_left = maxf(0.0, invulnerable_left - delta)
	var direction: Vector2 = Input.get_vector("move_left", "move_right", "move_up", "move_down")
	direction += Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	velocity = direction.limit_length() * speed
	move_and_slide()
	visual.modulate.a = 0.45 if invulnerable_left > 0.0 else 1.0
	if velocity.length_squared() > 1.0:
		visual.rotation = lerp_angle(visual.rotation, velocity.angle(), 1.0 - exp(-12.0 * delta))

func take_damage() -> void:
	if invulnerable_left > 0.0 or health <= 0:
		return
	health -= 1
	invulnerable_left = 1.2
	health_changed.emit(health)
	if health == 0:
		died.emit()

func reset_at(spawn: Vector2, restored_health: int = 3) -> void:
	position = spawn
	velocity = Vector2.ZERO
	health = restored_health
	invulnerable_left = 0.0
	visual.modulate = Color.WHITE
	set_physics_process(true)
	health_changed.emit(health)
