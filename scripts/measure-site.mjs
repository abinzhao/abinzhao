import { chromium } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { tmpdir, cpus, release } from 'node:os';
import { join, resolve } from 'node:path';

/** 与升级前的线上采样使用同一浏览器配置；只测生产构建，不注入缓存或伪造传输值。 */
const base = process.argv[2] ?? 'http://127.0.0.1:5202/abinzhao/';
const output = process.argv[3] ? resolve(process.argv[3]) : join(await mkdtemp(join(tmpdir(), 'abin-site-metrics-')), 'metrics.json');
const samples = Number(process.argv[4] ?? 5);
if (!Number.isInteger(samples) || samples < 5) throw new Error('至少采样五次');
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const [name, path] of [['home', ''], ['article', 'columns/fullstack-development/09-scroll-view-transitions.html']]) {
    for (let sample = 1; sample <= samples; sample++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
        isMobile: true, hasTouch: true, serviceWorkers: 'block',
      });
      const page = await context.newPage();
      const files = [], errors = [], bodies = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (!/\.(?:js|css)(?:\?|$)/.test(response.url())) return;
        bodies.push((async () => {
          const body = await response.body();
          files.push({ url: response.url(), rawBytes: body.length, gzipBytes: gzipSync(body).length, encoding: response.headers()['content-encoding'] ?? 'identity' });
        })().catch((error) => errors.push(String(error))));
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false, latency: 150, downloadThroughput: 1_600_000 / 8,
        uploadThroughput: 750_000 / 8, connectionType: 'cellular4g',
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.addInitScript(() => {
        window.__measurement = { lcp: null, clsWindowMax: 0, longTasks: [], shifts: [] };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__measurement.lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__measurement.shifts.push({ t: entry.startTime, v: entry.value });
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__measurement.longTasks.push({ t: entry.startTime, duration: entry.duration });
        }).observe({ type: 'longtask', buffered: true });
      });
      const url = new URL(path, base).href;
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 5000)));
      const metrics = await page.evaluate(() => {
        const metrics = window.__measurement;
        let sum = 0, first, last = 0;
        for (const shift of metrics.shifts) {
          if (first === undefined || shift.t - last > 1000 || shift.t - first > 5000) { first = shift.t; sum = 0; }
          sum += shift.v; last = shift.t;
          metrics.clsWindowMax = Math.max(metrics.clsWindowMax, sum);
        }
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        return {
          ...metrics, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
          ttfb: nav.responseStart, observationEnd: performance.now(),
          totalTransferBytes: nav.transferSize + resources.reduce((sum, entry) => sum + entry.transferSize, 0),
          overflow: document.documentElement.scrollWidth - innerWidth,
          resources: resources.map((entry) => ({ url: entry.name, transferBytes: entry.transferSize, decodedBytes: entry.decodedBodySize, initiator: entry.initiatorType })),
        };
      });
      await Promise.all(bodies);
      results.push({ name, url, sample, metrics, files, errors });
      console.log(JSON.stringify({ name, sample, lcp: metrics.lcp, cls: metrics.clsWindowMax, transfer: metrics.totalTransferBytes, errors }));
      await context.close();
    }
  }
  const summary = ['home', 'article'].map((name) => {
    const rows = results.filter((row) => row.name === name);
    const lcp = rows.map((row) => row.metrics.lcp).sort((a, b) => a - b);
    const gzip = (row, extension) => row.files.filter((file) => new URL(file.url).pathname.endsWith(extension)).reduce((sum, file) => sum + file.gzipBytes, 0);
    const result = {
      name, lcpMedian: lcp[Math.floor(lcp.length / 2)], lcpRange: [lcp[0], lcp.at(-1)],
      maxTransferBytes: Math.max(...rows.map((row) => row.metrics.totalTransferBytes)),
      maxJsGzip: Math.max(...rows.map((row) => gzip(row, '.js'))),
      maxCssGzip: Math.max(...rows.map((row) => gzip(row, '.css'))),
      maxCls: Math.max(...rows.map((row) => row.metrics.clsWindowMax)),
      longTaskCount: rows.reduce((sum, row) => sum + row.metrics.longTasks.length, 0),
      errors: rows.flatMap((row) => row.errors),
    };
    const heavyRequests = rows.flatMap((row) => row.metrics.resources).filter((resource) => /(?:GpuExperiment|particle-renderer|spectral-renderer|lab-.+worker|webllm|\.wasm|knowledge-corpus)/i.test(resource.url));
    return { ...result, heavyRequests, passed: result.lcpMedian <= 2500 && result.maxCls <= .05 &&
      result.maxTransferBytes <= (name === 'home' ? 220 : 200) * 1024 &&
      result.maxJsGzip <= 110 * 1024 && result.maxCssGzip <= 25 * 1024 && !result.errors.length && !heavyRequests.length };
  });
  await writeFile(output, JSON.stringify({
    measuredAt: new Date().toISOString(), browser: browser.version(), host: { cpu: cpus()[0].model, os: release() },
    method: 'Production; Chromium headless; 390×844 DPR1 mobile/touch; fresh context; HTTP cache disabled; SW blocked; 150ms, 1.6Mbps/0.75Mbps, CPU4x; load + 5s; gzip calculated independently from actual transfer. Local hosting TTFB differs from GitHub Pages. Not field CWV or full-session INP.',
    summary, results,
  }, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2), `\nReport: ${output}`);
  if (summary.some((row) => !row.passed)) process.exitCode = 1;
} finally { await browser.close(); }
