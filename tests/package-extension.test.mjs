import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { packageExtension } from "../scripts/package-extension.mjs";

async function fixture(work) {
  const files = {
    "package.json": JSON.stringify({ version: "7.7.0" }),
    "dist/manifest.json": JSON.stringify({ manifest_version: 3, version: "7.7.0", name: "Fixture", background: { service_worker: "background.js" }, content_scripts: [{ js: ["content.js"] }], icons: { 16: "icons/icon.png" }, web_accessible_resources: [{ resources: ["injected.js", "styles.css", "gallery.html", "assets/*"] }] }),
    "dist/background.js": "// worker", "dist/content.js": "// content", "dist/injected.js": "// hook", "dist/styles.css": "body{}",
    "dist/gallery.html": '<script src="./assets/gallery.js"></script><link href="./assets/gallery.css" rel="stylesheet">',
    "dist/assets/gallery.js": "// gallery", "dist/assets/gallery.css": "body{}", "dist/icons/icon.png": "icon",
    "dist/test.html": "development fixture must stay out", "dist/assets/debug.js.map": "source map must stay out",
    "docs/INSTALL.html": "<!doctype html><title>安装说明</title><h1>X-Media-Downloader</h1>",
    "src/components/motion/ATTRIBUTION.md": "beUI — MIT",
  };
  for (const [path, body] of Object.entries(files)) {
    const file = join(work, path);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, body);
  }
}

async function inTemp(work) {
  const tempRoot = await realpath(tmpdir());
  const root = await mkdtemp(join(tempRoot, "xmd-package-test-"));
  try { await fixture(root); await work(root); }
  finally {
    const resolved = await realpath(root);
    const rel = relative(tempRoot, resolved);
    assert.ok(rel && !rel.startsWith("..") && !isAbsolute(rel));
    await rm(resolved, { recursive: true, force: true });
  }
}

test("release ZIP contains a directly loadable folder, offline guide and matching checksum", async () => {
  await inTemp(async root => {
    const result = await packageExtension({ root });
    const zipped = await readFile(result.archivePath);
    const files = unzipSync(zipped);
    const prefix = "X-Media-Downloader/";
    const manifest = JSON.parse(strFromU8(files[`${prefix}manifest.json`]));
    assert.equal(manifest.version, "7.7.0");
    for (const path of ["background.js", "content.js", "injected.js", "styles.css", "gallery.html", "assets/gallery.js", "assets/gallery.css", "icons/icon.png"]) {
      assert.deepEqual(Buffer.from(files[prefix + path]), await readFile(join(root, "dist", path)));
    }
    assert.ok(files["安装说明.html"]);
    assert.ok(files[prefix + "ATTRIBUTION.md"]);
    assert.ok(!Object.keys(files).some(path => path.includes("test.html") || path.endsWith(".map") || path.includes("node_modules") || path.includes("src/")));
    assert.equal(await readFile(join(result.loadFolder, "content.js"), "utf8"), "// content");
    const checksum = createHash("sha256").update(zipped).digest("hex");
    assert.ok((await readFile(result.checksumPath, "utf8")).startsWith(checksum));
  });
});

test("packaging rejects a build with a missing referenced file", async () => {
  await inTemp(async root => {
    await rm(join(root, "dist", "assets", "gallery.js"));
    await assert.rejects(packageExtension({ root }), /gallery\.js/);
  });
});

test("packaging rejects a stale build version", async () => {
  await inTemp(async root => {
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "7.8.0" }));
    await assert.rejects(packageExtension({ root }), /version|版本/);
  });
});
