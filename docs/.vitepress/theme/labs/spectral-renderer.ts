import fragment from '../../../../examples/site-labs/spectral.frag?raw';
import { sizeCanvas, type LabRenderer } from './renderer-types';

export function createSpectralRenderer(mount: HTMLElement, lost: (message: string) => void): LabRenderer {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) throw new Error('WebGL2 不可用，保留静态材质预览。');
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let disposed = false;
  const onLost = (event: Event) => { event.preventDefault(); if (!disposed) lost('WebGL2 上下文已丢失。可重新初始化。'); };
  const destroy = () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', onLost);
    shaders.forEach((shader) => gl.deleteShader(shader)); gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.remove();
  };
  try {
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('无法创建着色器');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || '着色器编译失败');
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `#version 300 es
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      gl_Position = vec4(p * 2. - 1., 0, 1);
    }`);
    const pixel = compile(gl.FRAGMENT_SHADER, fragment);
    program = gl.createProgram();
    if (!program) throw new Error('无法创建图形程序');
    gl.attachShader(program, vertex); gl.attachShader(program, pixel); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || '图形程序链接失败');
    const uniforms = Object.fromEntries(['resolution', 'lightPosition', 'roughness', 'material', 'time', 'darkTheme', 'accent'].map((name) => [name, gl.getUniformLocation(program!, name)]));
    let time = 0;
    canvas.addEventListener('webglcontextlost', onLost);
    mount.append(canvas);
    return {
      backend: 'WebGL2', canvas, maxCount: 0, destroy,
      resize(width, height, dpr) { sizeCanvas(canvas, width, height, dpr); gl.viewport(0, 0, canvas.width, canvas.height); },
      reset() { time = 0; },
      draw(delta, input) {
        if (disposed || gl.isContextLost()) return;
        time += Math.min(delta, .05) * input.speed;
        gl.useProgram(program);
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform2f(uniforms.lightPosition, input.x, input.y);
        gl.uniform1f(uniforms.roughness, input.roughness);
        gl.uniform1f(uniforms.material, input.material);
        gl.uniform1f(uniforms.time, time);
        gl.uniform1f(uniforms.darkTheme, Number(input.dark));
        gl.uniform3f(uniforms.accent, ...input.accent);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  } catch (error) { destroy(); throw error; }
}
