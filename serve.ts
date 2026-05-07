import { existsSync, statSync, watch } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir);
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 8000);

function build() {
  const t0 = performance.now();
  const r = spawnSync("bun", ["run", "build.ts"], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) console.error("build failed");
  else console.log(`built in ${Math.round(performance.now() - t0)}ms`);
}

build();

// Rebuild on changes to source files
const sources = ["recipes", "styles", "assets", "build.ts"];
for (const s of sources) {
  const p = join(ROOT, s);
  if (!existsSync(p)) continue;
  watch(p, { recursive: true }, () => {
    clearTimeout((watch as any)._t);
    (watch as any)._t = setTimeout(build, 80);
  });
}

function resolveFile(pathname: string): string | null {
  const decoded = decodeURIComponent(pathname);
  // Strip leading slash, defend against traversal
  const safe = decoded.replace(/^\/+/, "").replace(/\.\.+/g, "");
  let candidate = join(DIST, safe);
  if (existsSync(candidate)) {
    const st = statSync(candidate);
    if (st.isDirectory()) {
      const idx = join(candidate, "index.html");
      return existsSync(idx) ? idx : null;
    }
    return candidate;
  }
  // Try .html fallback (e.g., GH Pages /foo -> /foo.html)
  const withHtml = candidate + ".html";
  if (existsSync(withHtml)) return withHtml;
  return null;
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const file = resolveFile(url.pathname === "/" ? "/index.html" : url.pathname);
    if (!file) return new Response("404 not found", { status: 404 });
    return new Response(Bun.file(file));
  },
});

console.log(`snarked.com dev server: http://127.0.0.1:${PORT}`);
