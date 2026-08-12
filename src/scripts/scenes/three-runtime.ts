export type ThreeRuntime =
  & typeof import("./three-renderer-runtime")
  & typeof import("./three-scene-runtime");

export async function loadThreeRuntime(): Promise<ThreeRuntime> {
  const [renderer, scene] = await Promise.all([
    import("./three-renderer-runtime"),
    import("./three-scene-runtime"),
  ]);

  return { ...renderer, ...scene };
}
