import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";

it("the published compression example closes streams, preserves outputs and cleans cancelled writes", () => {
  const markdown = readFileSync("docs/tutorials/nodejs/runtime.md", "utf8");
  const block = [...markdown.matchAll(/```js\n([\s\S]*?)\n```/g)]
    .map((match) => match[1]).find((source) => source.includes("async function main()"));
  expect(block).toBeDefined();
  const directory = mkdtempSync(join(tmpdir(), "abinzhao-runtime-test-"));
  try {
    writeFileSync(join(directory, "compress.mjs"), block!);
    const input = Buffer.from("中文输入与文件流\n".repeat(1000));
    writeFileSync(join(directory, "input.txt"), input);
    const run = (...args: string[]) => spawnSync(process.execPath,
      ["compress.mjs", ...args], { cwd: directory, timeout: 10000, encoding: "utf8" });
    const result = run("input.txt", "output.gz");
    expect(result.status, result.stderr).toBe(0);
    const output = readFileSync(join(directory, "output.gz"));
    expect(gunzipSync(output)).toEqual(input);
    expect(run("input.txt", "output.gz").status).toBe(1);
    expect(readFileSync(join(directory, "output.gz"))).toEqual(output);
    expect(run("input.txt", "cancel.gz", "cancel").status).toBe(130);
    expect(existsSync(join(directory, "cancel.gz"))).toBe(false);
    expect(run("missing.txt", "missing.gz").status).toBe(1);
    expect(existsSync(join(directory, "missing.gz"))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
