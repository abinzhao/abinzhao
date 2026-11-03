import { expect, test, type Page } from '@playwright/test';
// macOS 的 headless SwiftShader 即使只清屏也会 device-lost；使用已验证的原生 Metal。
test.use({ launchOptions: { args: ['--enable-unsafe-webgpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])] } });

/**
 * 真实图形管线用例依赖宿主 GPU。CI 的 Linux runner 能返回适配器，但设备创建后
 * 立即丢失，因此必须实际申请设备并观察短暂的 lost 信号；只有可用设备才执行严格
 * 断言，避免把环境缺失误判为实现回归。WebGPU 缺失时的降级行为仍由不依赖 GPU
 * 的 Canvas2D / 静态预览用例覆盖。
 */
async function gpuSupport(page: Page): Promise<{ webgpu: boolean; webgl2: boolean }> {
  return page.evaluate(async () => {
    type ProbeAdapter = {
      requestDevice?: () => Promise<{ lost: Promise<unknown>; destroy?: () => void }>;
    };
    let webgpu = false;
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<ProbeAdapter | null> } }).gpu;
      const adapter = await gpu?.requestAdapter?.();
      if (adapter?.requestDevice) {
        const device = await adapter.requestDevice();
        const lost = await Promise.race([
          device.lost.then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1000)),
        ]);
        device.destroy?.();
        webgpu = !lost;
      }
    } catch { webgpu = false; }
    return { webgpu, webgl2: Boolean(document.createElement('canvas').getContext('webgl2')) };
  });
}

test('homepage defers both renderers and switching disposes the previous canvas', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('');
  const support = await gpuSupport(page);
  test.skip(!support.webgpu || !support.webgl2, '当前环境没有可用的 WebGPU/WebGL2 设备，跳过真实渲染断言');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await expect(page.getByRole('button', { name: '光谱材质', exact: true })).toBeVisible();
  expect(requests.filter((url) => /particle-(gpu|model)|spectral-(renderer|fragment)|GpuExperiment/.test(url))).toEqual([]);
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.gpu-experiment canvas')).toHaveCount(1);
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'running');
  await page.getByRole('button', { name: '代码粒子', exact: true }).click();
  await expect(page.locator('.gpu-experiment canvas')).toHaveCount(0);
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'running');
  await page.getByRole('button', { name: '关闭实验', exact: true }).click();
  await expect(page.locator('.gpu-experiment canvas')).toHaveCount(0);
});

test('particle fallback changes actual canvas pixels, pauses and resets deterministically', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  await page.goto('labs/particles.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-backend', 'Canvas2D');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  const pixels = () => page.locator('.gpu-experiment canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const initial = await pixels();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect.poll(pixels).not.toBe(initial);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '重置', exact: true }).click();
  expect(await pixels()).toBe(initial);
  await page.getByRole('combobox', { name: '粒子数量' }).selectOption('1024');
  await expect(page.getByRole('status').filter({ hasText: '1024 粒子' })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'static');
  await expect(page.locator('.gpu-experiment canvas')).toHaveCount(0);
});

test('spectral controls change rendered pixels and context loss offers explicit recovery', async ({ page }) => {
  await page.goto('labs/spectral.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-backend', 'WebGL2');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const pixels = () => page.locator('canvas').screenshot();
  const glass = await pixels();
  await page.getByRole('combobox', { name: '材质' }).selectOption('2');
  await expect.poll(pixels).not.toEqual(glass);
  await page.getByRole('slider', { name: '光源横向位置' }).fill('-1');
  const metal = await pixels();
  await page.getByRole('slider', { name: '粗糙度' }).fill('0.8');
  await expect.poll(pixels).not.toEqual(metal);
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'error');
  await expect(page.getByRole('button', { name: '重新初始化' })).toBeVisible();
  await page.getByRole('button', { name: '重新初始化' }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'running');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('offscreen and hidden experiments pause until explicitly resumed', async ({ page }) => {
  await page.goto('labs/particles.html');
  const support = await gpuSupport(page);
  test.skip(!support.webgpu, '当前环境没有可用的 WebGPU 设备，跳过真实渲染断言');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'running');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'paused');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'paused');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'running');
  await page.evaluate(() => document.querySelector('.gpu-experiment')!.setAttribute('style', 'transform:translateY(-3000px)'));
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'paused');
});

test('twenty startups per renderer release GPU resources and stop submissions after close', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    (window as any).renderAudit = { buffers: 0, devices: 0, programs: 0, shaders: 0, draws: 0 };
    const audit = (window as any).renderAudit;
    const wrap = (object: any, key: string, before: (...args: any[]) => void) => {
      const native = object[key];
      object[key] = function (this: unknown, ...args: any[]) { before(...args); return native.apply(this, args); };
    };
    wrap(WebGL2RenderingContext.prototype, 'drawArrays', () => audit.draws++);
    wrap(WebGL2RenderingContext.prototype, 'createProgram', () => audit.programs++);
    wrap(WebGL2RenderingContext.prototype, 'deleteProgram', (program) => { if (program) audit.programs--; });
    wrap(WebGL2RenderingContext.prototype, 'createShader', () => audit.shaders++);
    wrap(WebGL2RenderingContext.prototype, 'deleteShader', () => audit.shaders--);
    const gpu = (navigator as any).gpu;
    const nativeAdapter = gpu.requestAdapter.bind(gpu);
    gpu.requestAdapter = async (...options: any[]) => {
      const adapter = await nativeAdapter(...options);
      const nativeDevice = adapter.requestDevice.bind(adapter);
      adapter.requestDevice = async () => {
        const device = await nativeDevice();
        audit.devices++;
        wrap(device, 'destroy', () => audit.devices--);
        wrap(device.queue, 'submit', () => audit.draws++);
        const nativeBuffer = device.createBuffer.bind(device);
        device.createBuffer = (...args: any[]) => {
          const buffer = nativeBuffer(...args); audit.buffers++;
          wrap(buffer, 'destroy', () => audit.buffers--);
          return buffer;
        };
        return device;
      };
      return adapter;
    };
  });
  await page.goto('');
  const support = await gpuSupport(page);
  test.skip(!support.webgpu || !support.webgl2, '当前环境没有可用的 WebGPU/WebGL2 设备，跳过资源回收断言');
  for (let index = 0; index < 40; index++) {
    await page.getByRole('button', { name: index % 2 ? '光谱材质' : '代码粒子', exact: true }).click();
    await page.getByRole('button', { name: '运行实验', exact: true }).click();
    await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'running');
    await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-backend', index % 2 ? 'WebGL2' : 'WebGPU');
    await page.getByRole('button', { name: '关闭实验', exact: true }).click();
    const before = await page.evaluate(() => (window as any).renderAudit);
    expect(before).toMatchObject({ buffers: 0, devices: 0, programs: 0, shaders: 0 });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(() => (window as any).renderAudit.draws)).toBe(before.draws);
  }
});

test('reduced motion makes no GPU context and missing WebGL keeps a readable fallback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('labs/spectral.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'static');
  await expect(page.locator('.gpu-experiment canvas')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const native = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: any, ...args: any[]) { return type === 'webgl2' ? null : (native as any).call(this, type, ...args); } as any;
  });
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('WebGL2 不可用');
  await expect(page.locator('.gpu-surface .lab-preview')).toBeVisible();
  await page.getByRole('button', { name: '关闭实验', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: '光谱材质台' })).toBeVisible();
});

test.describe('WebGPU device path', () => {
  test('runs the real compute pipeline and recovers from device loss', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      (window as any).gpuProbe = [];
      const gpu = (navigator as any).gpu;
      if (!gpu) { (window as any).gpuProbe.push('no GPU API'); return; }
      const requestAdapter = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async (...args: any[]) => {
        const adapter = await requestAdapter(...args);
        if (!adapter) { (window as any).gpuProbe.push('no adapter'); return adapter; }
        (window as any).gpuProbe.push(adapter.info);
        const requestDevice = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = async (...options: any[]) => {
          const device = await requestDevice(...options);
          (window as any).actualDevice = device;
          const createShader = device.createShaderModule.bind(device);
          device.createShaderModule = (...args: any[]) => {
            const shader = createShader(...args);
            void shader.getCompilationInfo().then((info: any) => (window as any).gpuProbe.push(...info.messages.map((m: any) => `${m.lineNum}:${m.linePos} ${m.message}`)));
            return shader;
          };
          for (const key of ['createComputePipelineAsync', 'createRenderPipelineAsync', 'popErrorScope']) {
            const native = device[key].bind(device);
            device[key] = async (...args: any[]) => {
              try {
                const result = await native(...args);
                if (result?.message) (window as any).gpuProbe.push(result.message);
                return result;
              } catch (error) { (window as any).gpuProbe.push(String(error)); throw error; }
            };
          }
          return device;
        };
        return adapter;
      };
    });
    await page.goto('labs/particles.html');
    const support = await gpuSupport(page);
    test.skip(!support.webgpu, '当前环境没有可用的 WebGPU 设备，跳过真实计算管线断言');
    await page.getByRole('button', { name: '运行实验', exact: true }).click();
    await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'running');
    expect(await page.locator('.gpu-experiment').getAttribute('data-backend'), JSON.stringify(await page.evaluate(() => (window as any).gpuProbe))).toBe('WebGPU');
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '重置', exact: true }).click();
    const initial = await page.locator('canvas').screenshot();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await expect.poll(() => page.locator('canvas').screenshot()).not.toEqual(initial);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('button', { name: '重置', exact: true }).click();
    expect(await page.locator('canvas').screenshot()).toEqual(initial);
    await page.evaluate(() => (window as any).actualDevice.destroy());
    await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'error');
    await page.getByRole('button', { name: '重新初始化' }).click();
    await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-backend', 'WebGPU');
    expect(errors).toEqual([]);
  });
});

test('sustained slow frames fall back to a static preview and release the canvas', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined });
    const native = requestAnimationFrame;
    let time = 0;
    // 注入 40fps 时间戳验证策略，不把该用例作为设备性能证据。
    window.requestAnimationFrame = (callback) => native(() => callback(time += 25));
  });
  await page.goto('labs/particles.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'static', { timeout: 15_000 });
  await expect(page.locator('.gpu-experiment canvas')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('画面持续低于流畅帧率');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'running');
});

test('closing during requestDevice releases the late device without reviving the experiment', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).lateDevicesDestroyed = 0;
    Object.defineProperty(navigator, 'gpu', { value: {
      requestAdapter: async () => ({
        requestDevice: () => new Promise((resolve) => {
          (window as any).finishDevice = () => resolve({ destroy: () => (window as any).lateDevicesDestroyed++ });
        }),
      }),
    } });
  });
  await page.goto('labs/particles.html');
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await page.waitForFunction(() => (window as any).finishDevice);
  await page.getByRole('button', { name: '关闭实验', exact: true }).click();
  await page.evaluate(() => (window as any).finishDevice());
  await expect.poll(() => page.evaluate(() => (window as any).lateDevicesDestroyed)).toBe(1);
  await expect(page.locator('.gpu-experiment')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('pending local model initialization blocks a newly opened GPU experiment', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor(url: URL | string, options?: WorkerOptions) {
        super();
        if (!String(url).includes('webllm')) return new NativeWorker(url, options);
      }
      postMessage(message: { channel?: string }) {
        if (message.channel === 'assistant-capability') queueMicrotask(() =>
          this.dispatchEvent(new MessageEvent('message', { data: { ...message, report: { supported: true } } })));
      }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto('chat/');
  await page.getByRole('button', { name: '配置本地模型' }).click();
  await page.getByRole('button', { name: '下载并加载模型' }).click();
  await expect(page.getByRole('button', { name: '取消加载' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.site-nav').getByRole('link', { name: '首页', exact: true }).click();
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.locator('.gpu-experiment')).toHaveAttribute('data-state', 'paused');
  await expect(page.getByRole('status')).toContainText('本地模型正在运行');
  await expect(page.locator('.gpu-experiment canvas')).toHaveCount(0);
});
