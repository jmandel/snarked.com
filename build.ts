import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { marked } from "marked";

const ROOT = resolve(import.meta.dir);
const RECIPES_DIR = join(ROOT, "recipes");
const STYLES_DIR = join(ROOT, "styles");
const ASSETS_DIR = join(ROOT, "assets");
const DIST = join(ROOT, "dist");

const GH_REPO = "jmandel/snarked.com";
const GH_RECIPE_TEMPLATE = encodeURIComponent(
  `---
title: Your Recipe Title
shortname: your_recipe_shortname
blurb: A short, snarky one-liner.
submitter: Your Name <you@example.com>
date: 2026-01-01
photos: []
---

## Ingredients

- 1 cup flour
- 1 tsp baking soda

## Instructions

Step the first. Step the second.
`,
);
const GH_NEW_FILE_URL = `https://github.com/${GH_REPO}/new/master/recipes?filename=your_recipe.md&value=${GH_RECIPE_TEMPLATE}`;
const GH_ISSUE_URL = `https://github.com/${GH_REPO}/issues/new?template=recipe.yml`;

type FrontMatter = {
  title: string;
  shortname: string;
  blurb: string;
  submitter: string;
  date: string;
  photos: string[];
};

type Recipe = FrontMatter & {
  bodyMd: string;
  sections: Section[];
};

type Section = { name: string; md: string };

function parseFrontMatter(src: string): { data: Record<string, unknown>; body: string } {
  if (!src.startsWith("---")) return { data: {}, body: src };
  const end = src.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: src };
  const block = src.slice(4, end).trim();
  const body = src.slice(end + 4).replace(/^\r?\n/, "");
  const data: Record<string, unknown> = {};
  const lines = block.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    let val = m[2];
    if (val === "" || val === undefined) {
      const list: string[] = [];
      i++;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        list.push(lines[i].replace(/^\s+-\s+/, "").trim());
        i++;
      }
      data[key] = list;
      continue;
    }
    if (val === "[]") { data[key] = []; i++; continue; }
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
    }
    data[key] = val;
    i++;
  }
  return { data, body };
}

function splitSections(body: string): Section[] {
  // Split by ## headings; keep an "intro" section for any text before the first heading.
  const sections: Section[] = [];
  const lines = body.split(/\r?\n/);
  let current: Section = { name: "_intro", md: "" };
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      if (current.md.trim().length > 0 || current.name !== "_intro") sections.push(current);
      current = { name: h[1], md: "" };
    } else {
      current.md += line + "\n";
    }
  }
  if (current.md.trim().length > 0 || current.name !== "_intro") sections.push(current);
  return sections;
}

function renderMd(md: string): string {
  // Normalize "1)" / "2)" style ordered-list markers to "1." so marked parses them.
  const normalized = md.replace(/^(\s*)(\d+)\)\s/gm, "$1$2. ");
  return marked.parse(normalized, { async: false }) as string;
}

function loadRecipe(file: string): Recipe {
  const raw = readFileSync(join(RECIPES_DIR, file), "utf8");
  const { data, body } = parseFrontMatter(raw);
  const photos = Array.isArray(data.photos) ? (data.photos as string[]) : [];
  return {
    title: String(data.title ?? "Untitled"),
    shortname: String(data.shortname ?? file.replace(/\.md$/, "")),
    blurb: String(data.blurb ?? ""),
    submitter: String(data.submitter ?? ""),
    date: String(data.date ?? ""),
    photos,
    bodyMd: body,
    sections: splitSections(body),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function num(n: number): string {
  return "№ " + String(n).padStart(3, "0");
}

function pageShell(opts: { title: string; description?: string; content: string; assetPrefix?: string; bodyClass?: string }): string {
  const a = opts.assetPrefix ?? "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
${opts.description ? `<meta name="description" content="${escapeHtml(opts.description)}">` : ""}
<link rel="stylesheet" href="${a}styles.css">
<link rel="icon" href="${a}assets/favicon.svg" type="image/svg+xml">
<link rel="alternate icon" href="${a}favicon2.ico">
</head>
<body${opts.bodyClass ? ` class="${opts.bodyClass}"` : ""}>
<div class="app">
${opts.content}
</div>
</body>
</html>
`;
}

function header(active: "home" | "add", assetPrefix = ""): string {
  return `<header class="sn-header">
<div class="container row">
<a class="sn-mark" href="${assetPrefix || "./"}">snarked<span class="dot"></span></a>
<nav class="sn-nav">
<a href="${assetPrefix}add-recipe/" ${active === "add" ? 'class="active"' : ""}>Add a recipe</a>
</nav>
</div>
</header>`;
}

function footer(): string {
  return `<footer class="sn-footer">
<div class="container">
<div class="stanza">
Then the bowsprit got mixed with the rudder sometimes,<br>
&nbsp;&nbsp;&nbsp;&nbsp;A thing, as the Bellman remarked,<br>
&nbsp;&nbsp;That frequently happens in tropical climes,<br>
&nbsp;&nbsp;&nbsp;&nbsp;When a vessel is, so to speak, <em>'snarked.'</em>
</div>
<div class="attribution">(Lewis Carroll, <a href="https://www.gutenberg.org/ebooks/13">The Hunting of the Snark</a>)</div>
<div class="colophon">
<span>snarked.com 2003&ndash;2026, <a href="https://github.com/jmandel">Josh Mandel</a></span>
<span><a href="https://github.com/${GH_REPO}">source on github</a></span>
</div>
</div>
</footer>`;
}

function renderHero(): string {
  return `<section class="sn-hero">
<div class="container">
<h1>just like <em>your</em><br>recipe box, only <span class="online">online.</span></h1>
</div>
</section>`;
}

function renderRow(r: Recipe): string {
  return `<a class="sn-row" href="recipe/${escapeHtml(r.shortname)}/">
<div class="sn-row__body">
<h3 class="sn-row__title">${escapeHtml(r.title)}</h3>
<p class="sn-row__blurb">${escapeHtml(r.blurb)}</p>
</div>
</a>`;
}

function renderIndex(recipes: Recipe[]): string {
  const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title));
  const list = sorted.map((r) => renderRow(r)).join("\n");
  const content = `${header("home")}
<main>
${renderHero()}
<section class="sn-section">
<div class="container">
<div class="sn-list">
${list}
</div>
<p class="sn-add-line">Have a favorite food? Why not <a href="add-recipe/"><b>add a recipe</b></a>?</p>
</div>
</section>
</main>
${footer()}`;
  return pageShell({
    title: "snarked.com",
    description: "snarked.com: just like your recipe box, only online.",
    content,
  });
}

function findIngredients(r: Recipe): Section | undefined {
  return r.sections.find((s) => /^ingredients?$/i.test(s.name));
}
function findInstructions(r: Recipe): Section | undefined {
  return r.sections.find((s) => /^(instructions|method|directions)$/i.test(s.name));
}

function renderIngredientsPanel(r: Recipe): string {
  const s = findIngredients(r);
  if (!s) return "";
  const html = renderMd(s.md);
  return `<aside class="sn-ingredients">
<h3>Ingredients</h3>
${html}
</aside>`;
}

function renderMethodPanel(r: Recipe): string {
  const s = findInstructions(r);
  if (!s) return "";
  const html = renderMd(s.md).trim();
  const isOrdered = html.startsWith("<ol");
  if (isOrdered) {
    return `<section class="sn-method">
<h2>Instructions</h2>
${html}
</section>`;
  }
  return `<section class="sn-method__prose">
<h2>Instructions</h2>
${html}
</section>`;
}

function renderGallery(r: Recipe, prefix: string): string {
  if (r.photos.length === 0) return "";
  const cls = r.photos.length === 1 ? "sn-gallery sn-gallery--1" : "sn-gallery sn-gallery--n";
  const cells = r.photos
    .map((p) => `<a href="${prefix}recipe_files/${escapeHtml(p)}"><img src="${prefix}recipe_files/${escapeHtml(p)}" alt="${escapeHtml(r.title)}"></a>`)
    .join("\n");
  return `<div class="${cls}">${cells}</div>`;
}

function renderRecipe(r: Recipe, all: Recipe[]): string {
  const prefix = "../../";
  const content = `${header("home", prefix)}
<main>
<section class="sn-detail__top">
<div class="container">
<div class="sn-detail__breadcrumb"><a href="${prefix}">snarked.com</a></div>
<h1 class="sn-detail__title">${escapeHtml(r.title)}</h1>
<p class="sn-detail__lede">${escapeHtml(r.blurb)}</p>
<div class="sn-detail__byline">
<span>Submitted by: ${escapeHtml(r.submitter)}</span>
<span>Date: ${escapeHtml(r.date)}</span>
</div>
</div>
</section>

<div class="container">
<div class="sn-detail__body">
${renderGallery(r, prefix)}
${renderIngredientsPanel(r)}
${renderMethodPanel(r)}
</div>
</div>
</main>
${footer()}`;
  return pageShell({
    title: `${r.title} — snarked.com`,
    description: r.blurb,
    content,
    assetPrefix: prefix,
  });
}

function renderAddRecipe(): string {
  const content = `${header("add", "../")}
<main>
<section class="sn-prose">
<div class="narrow">
<h1>Add a recipe</h1>

<p>Recipes are small markdown files in the <code>recipes/</code> folder of <a href="https://github.com/${GH_REPO}">this site's repository</a>. To add one, open a pull request &mdash; or, if git is not your thing, open an issue and a maintainer will commit it for you.</p>

<div class="cta-row">
<a class="sn-btn sn-btn--primary" href="${GH_NEW_FILE_URL}">Open a recipe PR</a>
<a class="sn-btn sn-btn--hot" href="${GH_ISSUE_URL}">Open an issue</a>
</div>

<h2>File format</h2>
<pre><code>---
title: Your Recipe Title
shortname: your_recipe_shortname
blurb: short description
submitter: Your Name &lt;you@example.com&gt;
date: 2026-01-01
photos: []
---

## Ingredients

- 1 cup flour
- 1 tsp baking soda

## Instructions

Step the first. Step the second.</code></pre>

<p>Photos go in <code>recipe_files/</code> in the same PR; list their filenames under <code>photos:</code> in the frontmatter.</p>
</div>
</section>
</main>
${footer()}`;
  return pageShell({ title: "Add a recipe — snarked.com", content, assetPrefix: "../" });
}

function copyDirIfExists(src: string, dest: string) {
  if (!existsSync(src)) return;
  cpSync(src, dest, { recursive: true });
}
function copyFileIfExists(src: string, dest: string) {
  if (!existsSync(src)) return;
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

function build() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const files = readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".md"));
  const recipes = files.map(loadRecipe);
  const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title));

  writeFileSync(join(DIST, "index.html"), renderIndex(sorted));
  mkdirSync(join(DIST, "add-recipe"), { recursive: true });
  writeFileSync(join(DIST, "add-recipe", "index.html"), renderAddRecipe());
  for (const r of sorted) {
    const dir = join(DIST, "recipe", r.shortname);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), renderRecipe(r, sorted));
  }

  copyDirIfExists(join(ROOT, "images"), join(DIST, "images"));
  copyDirIfExists(join(ROOT, "recipe_files"), join(DIST, "recipe_files"));
  copyDirIfExists(ASSETS_DIR, join(DIST, "assets"));
  copyFileIfExists(join(ROOT, "favicon2.ico"), join(DIST, "favicon2.ico"));
  copyFileIfExists(join(ROOT, "CNAME"), join(DIST, "CNAME"));
  copyFileIfExists(join(ROOT, "robots.txt"), join(DIST, "robots.txt"));

  if (existsSync(STYLES_DIR)) {
    const cssFiles = readdirSync(STYLES_DIR).filter((f) => f.endsWith(".css")).sort();
    const css = cssFiles.map((f) => readFileSync(join(STYLES_DIR, f), "utf8")).join("\n\n");
    writeFileSync(join(DIST, "styles.css"), css);
  }

  console.log(`Built ${recipes.length} recipes -> ${DIST}`);
}

build();
