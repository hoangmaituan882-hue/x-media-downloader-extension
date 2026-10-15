import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { zipSync } from "fflate";

function childPath(parent, path) {
  const full = resolve(parent, path);
  const rel = relative(parent, full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Invalid package path: ${path}`);
  return full;
}

async function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink cannot be packaged: ${entry.name}`);
    const name = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(join(directory, entry.name), name + "/"));
    else files.push(name);
  }
  return files;
}

/** Build a release containing the runtime folder and an offline installation guide. */
export async function packageExtension({ root = process.cwd() } = {}) {
  root = await realpath(root);
  const dist = join(root, "dist");
  const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(dist, "manifest.json"), "utf8"));
  const version = metadata.version;
  if (!/^\d+\.\d+\.\d+$/.test(version) || manifest.version !== version) {
    throw new Error("Build version does not match package.json; rebuild before packaging");
  }
  const required = new Set(["manifest.json", manifest.background?.service_worker,
    ...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {}),
    ...(manifest.content_scripts ?? []).flatMap(script => [...(script.js ?? []), ...(script.css ?? [])]),
  ].filter(Boolean));
  const allFiles = await listFiles(dist);
  for (const entry of manifest.web_accessible_resources ?? []) {
    for (const resource of entry.resources) {
      if (!resource.includes("*")) required.add(resource);
      else {
        const matcher = new RegExp("^" + resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*") + "$");
        for (const path of allFiles) {
          if (matcher.test(path) && /\.(?:js|css|png|svg|jpe?g|webp|woff2?|wasm)$/.test(path)) required.add(path);
        }
      }
    }
  }
  const bytes = new Map();
  for (const path of required) {
    const full = childPath(dist, path);
    try {
      if (!(await lstat(full)).isFile()) throw new Error("Not a regular file");
      const data = await readFile(full);
      bytes.set(path, data);
      if (path.endsWith(".html")) {
        for (const [, ref] of data.toString("utf8").matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
          const url = new URL(ref, `https://extension.invalid/${path}`);
          if (url.origin === "https://extension.invalid") required.add(decodeURIComponent(url.pathname.slice(1)));
        }
      }
    } catch (error) { throw new Error(`Missing or invalid runtime file: ${path}`, { cause: error }); }
  }

  const guide = await readFile(join(root, "docs", "INSTALL.html"));
  const attribution = await readFile(join(root, "src", "components", "motion", "ATTRIBUTION.md"));
  const releaseRoot = childPath(root, "release");
  await mkdir(releaseRoot, { recursive: true });
  const resolvedRelease = await realpath(releaseRoot);
  childPath(root, relative(root, resolvedRelease));
  const output = childPath(resolvedRelease, `v${version}`);
  // Confirm the existing target is a real directory within release before recursive cleanup.
  const existing = await lstat(output).catch(error => { if (error.code !== "ENOENT") throw error; });
  if (existing?.isSymbolicLink()) throw new Error("Release output cannot be a symlink");
  if (existing) childPath(resolvedRelease, relative(resolvedRelease, await realpath(output)));
  await rm(output, { recursive: true, force: true });
  const loadFolder = join(output, "X-Media-Downloader");
  await mkdir(loadFolder, { recursive: true });
  const archive = Object.create(null);
  for (const [path, data] of [...bytes].sort(([a], [b]) => a.localeCompare(b))) {
    const destination = childPath(loadFolder, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
    archive[`X-Media-Downloader/${path.split(sep).join("/")}`] = data;
  }
  await writeFile(join(loadFolder, "ATTRIBUTION.md"), attribution);
  archive["X-Media-Downloader/ATTRIBUTION.md"] = attribution;
  archive["安装说明.html"] = guide;
  await copyFile(join(root, "docs", "INSTALL.html"), join(output, "安装说明.html"));
  const archivePath = join(output, `x-media-downloader-v${version}.zip`);
  const zipped = zipSync(archive, { level: 9, mtime: new Date("2020-01-01T00:00:00Z") });
  await writeFile(archivePath, zipped);
  const checksumPath = join(output, "SHA256SUMS.txt");
  await writeFile(checksumPath, `${createHash("sha256").update(zipped).digest("hex")}  x-media-downloader-v${version}.zip\n`);
  return { version, archivePath, loadFolder, checksumPath, files: Object.keys(archive).length };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await packageExtension(), null, 2));
}
