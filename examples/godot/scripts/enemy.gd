extends CharacterBody2D

enum State { PATROL, CHASE, RETURN }
var state: State = State.PATROL
var target: Node2D
var home: Vector2
var patrol_offset: float = 100.0
var patrol_direction: float = 1.0
@export var speed: float = 110.0

func _ready() -> void:
	home = global_position
	$Hitbox.body_entered.connect(_on_body_entered)

func _physics_process(_delta: float) -> void:
	if not is_instance_valid(target):
		return
	var distance: float = global_position.distance_to(target.global_position)
	var query: PhysicsRayQueryParameters2D = PhysicsRayQueryParameters2D.create(global_position, target.global_position, 1)
	var visible_target: bool = get_world_2d().direct_space_state.intersect_ray(query).is_empty()
	if state != State.CHASE and distance < 180.0 and visible_target:
		state = State.CHASE
	elif state == State.CHASE and (distance > 260.0 or not visible_target):
		state = State.RETURN
	var destination: Vector2 = home
	match state:
		State.CHASE:
			destination = target.global_position
		State.RETURN:
			if global_position.distance_to(home) < 8.0:
				state = State.PATROL
		State.PATROL:
			destination = home + Vector2(patrol_offset * patrol_direction, 0.0)
			if global_position.distance_to(destination) < 8.0:
				patrol_direction *= -1.0
	velocity = global_position.direction_to(destination) * speed
	move_and_slide()
	if is_on_wall() and state == State.PATROL:
		patrol_direction *= -1.0

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player"):
		body.take_damage()
