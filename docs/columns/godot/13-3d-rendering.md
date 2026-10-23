---
title: "第 13 章：3D 坐标、材质、灯光与渲染器选择"
description: "运行原生图元 3D 场景，理解相机、网格与物理的职责，再按桌面、移动和 Web 约束选择渲染器。"
date: '2026-10-23'
category: 游戏开发
tags: [Godot, 3D, 渲染]
series:
  order: 13
---

# 第 13 章：3D 坐标、材质、灯光与渲染器选择

从二维进入三维，增加的不只是一个坐标轴，还包括透视、光照、深度、材质、空间听觉与更复杂的性能预算。本章先运行一个只含原生图元的展示场景，再建立可移动角色实验。`examples/godot/scenes/primitive_3d.tscn` 已通过 4.7.2 headless 启动验证，但不把无界面运行等同于三维实机画质验收。

## 13.1 坐标和变换

Godot 三维使用右手坐标系，通常 X 向右、Y 向上，相机朝向局部负 Z。节点的 position、rotation 和 scale 相对于父节点；global_position 与 global_transform 表达世界空间。二维习惯中的“屏幕向下为正”不能直接套在三维高度上。

Transform3D 由基与原点组成，Basis 承载旋转、缩放等线性变换。向量表示方向时不要把位置偏移加进去；局部移动与世界移动应明确选择。父节点缩放会影响孩子的网格与碰撞，一旦使用不均匀缩放，物理与法线还可能出现复杂问题，优先在资源尺寸上建立一致尺度。

三维设计可以把一单位视为一米，但项目团队仍需明确并坚持这一约定。十米高的人物与十厘米宽的门，不会因开启导航自动协调。模型、角色速度、重力、相机裁剪和声音衰减必须共用合理尺度，错误尺度常被误诊为碰撞或灯光故障。

## 13.2 运行原生展示场景

在 FileSystem 打开 primitive_3d.tscn，按 F6 运行当前场景，F5 仍启动二维主场景。场景根为 Node3D，包含 WorldEnvironment、两个 MeshInstance3D、一台 Camera3D 和 DirectionalLight3D。地面是十米见方的 BoxMesh，立方体边长一米，无外部模型、贴图或下载步骤。

相机位于斜上方并设为 current，太阳光带有阴影，环境提供暗背景和基础环境照明。运行时应看到地面与蓝色立方体；若黑屏先确认运行场景与 current 相机，再检查相机朝向和网格是否位于裁剪范围，不要立即切换渲染器或增加十盏灯。

该场景是静态展示：地面与立方体没有物理碰撞，也没有角色控制。可见网格不等于可站立地面。下一节的物理实验需自行添加 StaticBody3D 与 CollisionShape3D，不能期待 BoxMesh 自动成为碰撞体。

## 13.3 网格、材质与灯光的责任

MeshInstance3D 负责显示网格，StandardMaterial3D 决定表面如何响应光照。Albedo 是基础颜色，roughness 控制粗糙程度，metallic 表达金属响应；降低 roughness 不会凭空创造环境倒影，反射仍需要相应环境与渲染功能。真实材质实验先用单一灯光和明确背景比较。

DirectionalLight3D 适合太阳一类平行光，OmniLight3D 发散到各个方向，SpotLight3D 形成锥形照明。灯光范围、阴影与数量影响成本，室内场景不能随意把几十盏带阴影的实时灯重叠在一起。阴影分辨率、偏移与距离也会影响锯齿、漏光和表面条纹。

WorldEnvironment 统一管理背景、环境光、色调映射等设置。不能在一个实验里同时大幅改变曝光、材质、灯光和后处理，否则难以知道画面变化来自哪里。先建立无后处理的清晰基线，再逐项加功能，同时检查该渲染器是否支持。

## 13.4 建立第三人称移动实验

复制展示场景为独立实验，给地面添加 StaticBody3D 和 BoxShape3D，尺寸与可见地面一致。添加 CharacterBody3D，子节点 CapsuleShape3D 碰撞与 CapsuleMesh 视觉，出生点高于地面。保持角色根缩放为一，用资源尺寸调整身高，避免通过缩放物理根节点凑比例。

将 Camera3D 放在角色后上方，或用独立相机支架跟随。下面脚本挂在实验角色，Inspector 指定 camera 引用；InputMap 需要 move_left、move_right、move_up、move_down 和 jump。二维项目已有移动动作，jump 则需要新增并绑定空格。相机须带有水平朝向分量，不使用垂直俯视相机运行这个简单投影算法。

```gdscript
extends CharacterBody3D

@export var camera: Camera3D
@export var speed: float = 5.0
@export var jump_speed: float = 6.0
var gravity: float = float(
	ProjectSettings.get_setting("physics/3d/default_gravity")
)

func _physics_process(delta: float) -> void:
	if not is_instance_valid(camera):
		return
	if not is_on_floor():
		velocity.y -= gravity * delta
	if Input.is_action_just_pressed("jump") and is_on_floor():
		velocity.y = jump_speed
	var axis: Vector2 = Input.get_vector(
		"move_left", "move_right", "move_up", "move_down"
	)
	var direction: Vector3 = camera.global_basis.x * axis.x \
		+ camera.global_basis.z * axis.y
	direction.y = 0.0
	direction = direction.normalized()
	velocity.x = direction.x * speed
	velocity.z = direction.z * speed
	move_and_slide()
```

重力是加速度，改变速度时乘 delta；move_and_slide 消费速度并处理运动，不再把整个 velocity 乘 delta。水平移动按相机基向量映射，并投影到地面。此代码把非零输入归一化，适合键盘；要保留摇杆力度，应另行保留输入长度，不能直接声称具备完整模拟摇杆控制。

脚本没有鼠标环绕、相机防穿墙、斜坡手感、空中控制或动画。需要相机碰撞可研究 SpringArm3D，并排除角色自身；需要角色朝向可转视觉子节点，不让碰撞胶囊随镜头俯仰。把这些能力逐个加入并验证，比一次加入大段未知控制器更可靠。

## 13.5 选择渲染器

Godot 4.7 提供 Forward+、Mobile、Compatibility 三种渲染方法。Forward+ 面向现代桌面较丰富效果，Mobile 面向较轻的现代渲染路径，Compatibility 面向兼容性与较广设备覆盖。它们不是简单的画质高、中、低预设，所用图形接口和功能集合不同。

Forward+ 与 Mobile 基于 RenderingDevice 路径，实际图形驱动取决于系统、导出设置和设备支持；Compatibility 使用 OpenGL 系列路径。不要把 Mobile 名称理解为“所有手机必选”，也不要认为 Compatibility 不能发布桌面。先确定最低设备和所需效果，再按官方功能表选择。

Web 在本教程版本要求 Compatibility 与 WebGL 2.0，不支持把 Forward+ 或 Mobile 项目直接导出后保留全部效果，也不以 WebGPU 作为这套稳定教学基线。二维毕业项目因此采用 Compatibility；它已有桌面二维渲染截图，仍需单独导出并验证浏览器。

渲染器切换可能使材质、环境与特效表现不同，并触发重新导入或 shader 编译。应保存实验场景，列出所依赖功能，逐项比较，而不是看到帧率下降就随意切换整个项目。计划发布多平台时，可以选择共同能力子集，或明确维护不同平台的表现配置。

## 13.6 深度、透明与画面稳定性

相机 near 过小且 far 过大，会让深度精度分配不理想；两个几乎共面的表面可能发生深度闪烁。先按世界尺度收紧裁剪范围，避免共面重叠，不用把每个物体随机平移来消除表面症状。透明物体还涉及排序与过绘，不能照搬不透明物体的预算。

相机抖动要区分角色物理更新与画面更新。物理插值能缓解固定物理频率与显示刷新率不同造成的跳动，但需要正确设置和瞬移重置；它不修复错误速度单位。先证明运动规则正确，再处理表现平滑，也不要把提高物理频率当成唯一解决方法。

复杂模型可用简化碰撞体、LOD 与可见性范围降低成本。网格碰撞是否适合动态角色，取决于形状和物理限制；静态地形与动态刚体的策略不同。先为简单几何建立可靠物理，再引入美术模型，能把导入问题与运动问题分开。

## 13.7 验证与作业

正常验证包括 F6 展示场景可见、角色落地、不穿过地板、斜向速度一致、跳跃需要落地条件、镜头方向改变后移动仍合理。异常验证包括没有 current 相机、空 camera 引用、碰撞层不匹配、出生在地板内、极端裁剪范围和低帧率。headless 只能覆盖其中部分启动与规则检查。

作业是做一个原生图元三维小院，提供角色、相机和两种表面材质。验收需说明世界尺度、碰撞结构、所选渲染器、最低目标设备和实际测试分辨率；不同渲染器比较至少一项功能差异。它是独立练习，不把现有二维关卡标记成完整三维游戏。

## 官方参考

- [3D 入门](https://docs.godotengine.org/en/4.7/tutorials/3d/introduction_to_3d.html)
- [三种渲染器](https://docs.godotengine.org/en/4.7/tutorials/rendering/renderers.html)
- [StandardMaterial3D](https://docs.godotengine.org/en/4.7/tutorials/3d/standard_material_3d.html)
- [CharacterBody3D](https://docs.godotengine.org/en/4.7/classes/class_characterbody3d.html)
- [SpringArm3D](https://docs.godotengine.org/en/4.7/classes/class_springarm3d.html)

下一章：[性能与分析](./14-performance-profiler.md)。
