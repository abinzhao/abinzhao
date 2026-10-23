extends AudioStreamPlayer

var muted: bool = false
var tones: Dictionary = {}

func _ready() -> void:
	volume_db = -16.0
	tones["coin"] = _make_tone(880.0)
	tones["damage"] = _make_tone(180.0)
	tones["win"] = _make_tone(1320.0)

func cue(kind: String) -> void:
	# Headless uses a dummy audio driver without a real playback lifecycle.
	if DisplayServer.get_name() == "headless" or muted or not tones.has(kind):
		return
	stop()
	stream = tones[kind]
	play()

func toggle_mute() -> void:
	muted = not muted
	if muted:
		stop()

func _make_tone(frequency: float) -> AudioStreamWAV:
	var rate: int = 22050
	var frames: int = 3307
	var bytes: PackedByteArray = PackedByteArray()
	bytes.resize(frames * 2)
	for frame in range(frames):
		var envelope: float = pow(1.0 - float(frame) / frames, 2.0)
		var sample: float = sin(TAU * frequency * frame / rate) * envelope * 0.5
		bytes.encode_s16(frame * 2, int(sample * 32767.0))
	var wave: AudioStreamWAV = AudioStreamWAV.new()
	wave.format = AudioStreamWAV.FORMAT_16_BITS
	wave.mix_rate = rate
	wave.stereo = false
	wave.data = bytes
	return wave
