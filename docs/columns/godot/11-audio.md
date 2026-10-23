---
title: "第 11 章：音频总线、空间音效与浏览器限制"
description: "从 PCM 波形和分贝建立音频基础，理解总线、静音、并发、空间衰减与 Web 音频的真实边界。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, 音频, Web游戏]
series:
  order: 11
---

# 第 11 章：音频总线、空间音效与浏览器限制

音效让玩家在不盯着数字的情况下理解收集、受伤和胜利。但反馈系统不能决定规则是否成立，也不能把“调用了 play”当成用户听到了声音。本章以毕业项目真实生成的短音效为起点，再完成总线和空间音频实验，并说明浏览器、静音设备与无界面运行的限制。

## 11.1 从波形到声音

数字音频记录每个采样时刻的振幅。采样率表示每秒采样次数，位深决定振幅量化精度，声道数决定独立输出数量；它们与播放音量、音调不是同一个概念。项目生成每秒二万二千零五十个采样、十六位单声道 PCM，约零点一五秒长，用不同频率表达不同事件。

采样率必须足以表示目标频率，高于采样率一半的内容无法正确还原。增大采样率不会自动让低质量素材变好，增加位深也不会消除已有噪声。短提示音适合简单波形，复杂环境声和音乐则需要真实录制或合成资源，并考虑许可与循环接缝。

项目收集频率为八百八十赫兹、受伤为一百八十赫兹、胜利为一千三百二十赫兹。声音前后需要包络，否则突然从非零振幅开始或结束可能产生爆音。现有正弦从零开始，尾部使用衰减包络；这是最小反馈设计，不是完整混音或音效素材库。

## 11.2 可定位的波形生成

`examples/godot/scripts/audio.gd` 挂在主场景的 AudioStreamPlayer。以下是完整生成函数，可在继承 AudioStreamPlayer 的脚本中使用：

```gdscript
func _make_tone(frequency: float) -> AudioStreamWAV:
	var rate: int = 22050
	var frames: int = 3307
	var bytes: PackedByteArray = PackedByteArray()
	bytes.resize(frames * 2)
	for frame in range(frames):
		var envelope: float = pow(1.0 - float(frame) / frames, 2.0)
		var sample: float = sin(TAU * frequency * frame / rate) \
			* envelope * 0.5
		bytes.encode_s16(frame * 2, int(sample * 32767.0))
	var wave: AudioStreamWAV = AudioStreamWAV.new()
	wave.format = AudioStreamWAV.FORMAT_16_BITS
	wave.mix_rate = rate
	wave.stereo = false
	wave.data = bytes
	return wave
```

十六位采样占两个字节，因此数组长度为 frames 乘二，写入偏移也乘二。格式、采样率和声道必须与原始数据一致，不能仅把任意字节赋给 AudioStreamWAV。幅度预留一半空间，避免单音过响；多个声音叠加仍可能超出输出范围，所以还需要总线与并发预算。

生成发生在准备阶段，三段资源缓存到 tones 字典。收集时只选取已有资源播放，不每次重新计算所有采样。短静态音频没有必要使用实时 AudioStreamGenerator；后者需要不断填充播放缓冲区，处理欠载与时间预算，复杂度和平台行为都不同。

## 11.3 播放节点的选择

AudioStreamPlayer 不随世界位置衰减，适合 UI 提示与背景音乐；AudioStreamPlayer2D 随二维听者距离衰减，适合靠近守卫听到脚步；AudioStreamPlayer3D 表达三维位置、距离和方向。空间声音应挂在声源附近，UI 声音则不应因为相机移动而突然听不见。

现有音频节点是非空间播放器，音量设为负十六分贝。cue 先停止旧声音，再切换资源播放，因此连续收集会打断上一段，也不会同时叠加无限声音。这个限制适合小关卡，但不适合密集战斗。增加多声部时要明确最大并发和抢占规则，而不是每次事件都创建永久新节点。

设置播放器的 max_polyphony 可以允许一定数量的并发播放，但同一播放器切换 stream 的行为需要按目标用例验证。复杂事件可以用固定数量播放器形成池，或采用 AudioStreamPolyphonic；不能仅把一个数调大，就声称所有不同资源都能正确混合与回收。

## 11.4 总线与分贝

在底部 Audio 面板保留 Master，添加 Music、Effects 和 UI 三条总线，发送到 Master。把独立实验的音乐播放器分配给 Music，世界音效给 Effects，按钮反馈给 UI。先不加效果器，确认每条总线电平只在对应声音播放时变化，再添加滤波或限制器。

分贝是对数尺度，负六分贝的振幅约为原来的一半，不是“百分之六”。用户滑块通常用零到一的线性值，提交时转换为分贝；零值用静音表达，避免把零的对数结果当成普通有限数字存入设置。不要把所有音量直接加到同一个字段上。

下面是独立设置节点可使用的方法，要求 Audio 面板已经建立 Effects：

```gdscript
extends Node

func set_effects_volume(value: float) -> void:
	var index: int = AudioServer.get_bus_index("Effects")
	if index < 0:
		push_error("The Effects bus must exist.")
		return
	var linear: float = clampf(value, 0.0, 1.0)
	AudioServer.set_bus_mute(index, linear == 0.0)
	if linear > 0.0:
		AudioServer.set_bus_volume_db(index, linear_to_db(linear))
```

总线索引可能因编辑排序改变，按名字查询比长期保存数字更稳妥。若重命名，必须同步更新使用者。音量设置应保存线性值并单独记录静音偏好；不要每次静音就丢失此前用户选的音量。毕业项目的 M 只切换当前播放器的 muted 状态，没有实现这套持久设置。

## 11.5 空间音效实验

新建 Node2D 场景，添加可移动的 Camera2D 与 AudioStreamPlayer2D。为播放器设置短循环资源，或把本章生成的 wave 赋给 stream 后周期触发；用图元标出声源位置。启动后移动相机，分别改变 max_distance 和 attenuation，记录在哪个距离开始明显变小。

注意二维听者与视口、相机的关系，多视口或独立听者设置会改变结果。声音“不见了”先检查播放器是否正在播放、总线是否静音、听者位置与衰减范围，再检查资源。不要为了听到声音就把所有节点换成非空间播放器，那会破坏世界方位反馈。

背景音乐循环最好使用素材本身的循环信息或经过检查的循环段，不能依赖 finished 信号重播来保证无缝。压缩格式的边界和解码行为可能产生间隙。独立音乐系统还要考虑暂停是否停止、场景切换是否延续、恢复时是否重新开始，这些是产品规则而非默认答案。

## 11.6 Web 音频不能照搬桌面结论

Godot 4.7 的 Web 导出支持不同音频播放路径。Sample 路径面向低延迟样本播放，但不提供所有引擎音频能力，例如 AudioStreamGenerator 和音频效果器不在其完整支持范围；Stream 路径更接近引擎混音，但延迟、线程和浏览器支持需要实测。依据版本化 Web 文档选择，不把桌面功能默认视为浏览器可用。

浏览器可能要求用户手势才能启动或恢复音频。首页出现画面而没有声音，并不必然是资源丢失；设计明确的开始按钮，在用户点击后启动玩法与音频，并处理页面失焦或系统挂起后的恢复。系统静音、蓝牙设备与浏览器自动播放策略也可能影响结果。

本项目的 headless 模式采用无真实播放生命周期的音频驱动，因此 cue 明确跳过播放。规则冒烟可以验证收集与胜负，不验证声音听感、设备输出或浏览器解锁。该跳过只针对无界面测试路径，不用于隐藏桌面或 Web 的实际音频错误。

## 11.7 验证、排错与作业

正常验证应实际听取收集、受伤、胜利三种提示，确认静音立即停止当前声音、取消静音后下一事件恢复、快速连续事件没有过响或长期残留。异常验证包括不存在的总线、空资源、系统静音、播放器被释放、暂停恢复与页面后台再返回。观察电平有助于区分引擎无输出与设备无声音。

音调异常先检查数据格式和 mix_rate；尾部爆音检查包络；过响检查多个声源叠加与总线；延迟明显检查 Web 播放路径和设备缓冲；停不下来检查循环与节点生命周期。不要用降低所有音量来掩盖错误的数据编码或无限重复触发。

作业是建立三条总线与音量面板，增加空间守卫提示，并保存设置。验收要求 UI 声不受距离影响、世界声有距离衰减、零音量无无效数字、静音不改游戏规则、重复重开不增加播放器数量。Web 上还需列出所选播放路径及不支持的效果，未真机听取的结果标为未验证。

## 官方参考

- [音频总线](https://docs.godotengine.org/en/4.7/tutorials/audio/audio_buses.html)
- [音频流](https://docs.godotengine.org/en/4.7/tutorials/audio/audio_streams.html)
- [AudioStreamWAV](https://docs.godotengine.org/en/4.7/classes/class_audiostreamwav.html)
- [AudioStreamPlayer2D](https://docs.godotengine.org/en/4.7/classes/class_audiostreamplayer2d.html)
- [Web 导出与音频限制](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html)

下一章：[资源导入](./12-assets-import.md)。
