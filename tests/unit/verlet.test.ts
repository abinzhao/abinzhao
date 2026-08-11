import { describe, expect, it } from "vitest";

import {
  constrainDistance,
  constrainPoint,
  integratePoint,
} from "@/scripts/scenes/verlet";

describe("Verlet 物理逻辑", () => {
  it("根据上一帧位置和加速度积分点位", () => {
    expect(
      integratePoint(
        { x: 10, y: 10, previousX: 8, previousY: 9 },
        { x: 0, y: 1 },
      ),
    ).toEqual({
      x: 12,
      y: 12,
      previousX: 10,
      previousY: 10,
    });
  });

  it("将点约束在包含半径的边界内", () => {
    expect(constrainPoint({ x: -2, y: 120 }, 100, 100, 5)).toEqual({
      x: 5,
      y: 95,
    });
  });

  it("将两个点拉回目标距离并保持中点", () => {
    const [first, second] = constrainDistance(
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      10,
    );

    expect(first).toEqual({ x: 5, y: 0 });
    expect(second).toEqual({ x: 15, y: 0 });
    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBe(10);
  });

  it("将完全重合的两个点沿确定轴对称分离", () => {
    const [first, second] = constrainDistance(
      { x: 3, y: 4 },
      { x: 3, y: 4 },
      10,
    );

    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBe(10);
    expect((first.x + second.x) / 2).toBe(3);
    expect((first.y + second.y) / 2).toBe(4);
  });
});
