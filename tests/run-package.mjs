import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { unzipSync } from "fflate";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const output = resolve("release", `v${version}`);
const archive = await readFile(join(output, `x-media-downloader-v${version}.zip`));
const hash = createHash("sha256").update(archive).digest("hex");
assert.equal((await readFile(join(output, "SHA256SUMS.txt"), "utf8")).split(/\s+/)[0], hash);
const files = unzipSync(archive);
assert.ok(files["安装说明.html"]);
assert.ok(files["X-Media-Downloader/manifest.json"]);
const tempRoot = await realpath(tmpdir());
const work = await mkdtemp(join(tempRoot, "xmd-release-check-"));
try {
  for (const [path, bytes] of Object.entries(files)) {
    const target = resolve(work, path);
    const rel = relative(work, target);
    assert.ok(rel && !rel.startsWith("..") && !isAbsolute(rel), `Unsafe ZIP entry: ${path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    if (path.startsWith("X-Media-Downloader/") && !path.endsWith("/ATTRIBUTION.md")) {
      const built = await readFile(join("dist", path.slice("X-Media-Downloader/".length)));
      assert.deepEqual(Buffer.from(bytes), built, `Stale packaged file: ${path}`);
    }
  }
  const code = await new Promise((accept, reject) => {
    const child = spawn(process.execPath, ["tests/run-extension.mjs"], {
      stdio: "inherit",
      env: { ...process.env, XMD_EXTENSION_DIR: join(work, "X-Media-Downloader") },
    });
    child.once("error", reject);
    child.once("exit", accept);
  });
  assert.equal(code, 0, "The extracted release must pass native extension checks");
  console.log(JSON.stringify({ version, files: Object.keys(files).length, sha256: hash, extractedExtensionLoaded: true }, null, 2));
} finally {
  const resolved = await realpath(work);
  const rel = relative(tempRoot, resolved);
  assert.ok(rel && !rel.startsWith("..") && !isAbsolute(rel));
  await rm(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
