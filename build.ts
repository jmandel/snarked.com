import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync, statSync, cpSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { marked } from "marked";

const ROOT = resolve(import.meta.dir);
const RECIPES_DIR = join(ROOT, "recipes");
const STATIC_DIR = join(ROOT, "static");
const STYLES_DIR = join(ROOT, "styles");
const ASSETS_DIR = join(ROOT, "assets");
const TEMPLATES_DIR = join(ROOT, "templates");
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
- (one ingredient per line)

## Instructions

Step the first. Step the second. Be elaborate; be brief; be neither.
`,
);

type FrontMatter = {
  title: string;
  shortname: string;
  blurb: string;
  submitter: string;
  date: string;
  photos: string[];
};

type Recipe = FrontMatter & {
  bodyHtml: string;
  bodyMd: string;
};

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

function loadRecipe(file: string): Recipe {
  const raw = readFileSync(join(RECIPES_DIR, file), "utf8");
  const { data, body } = parseFrontMatter(raw);
  const photos = Array.isArray(data.photos) ? (data.photos as string[]) : [];
  const html = marked.parse(body, { async: false }) as string;
  return {
    title: String(data.title ?? "Untitled"),
    shortname: String(data.shortname ?? file.replace(/\.md$/, "")),
    blurb: String(data.blurb ?? ""),
    submitter: String(data.submitter ?? ""),
    date: String(data.date ?? ""),
    photos,
    bodyHtml: html,
    bodyMd: body,
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

function pageShell(opts: { title: string; bodyClass?: string; content: string; assetPrefix?: string }): string {
  const a = opts.assetPrefix ?? "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<link rel="stylesheet" href="${a}styles.css">
<link rel="icon" href="${a}favicon2.ico" type="image/x-icon">
</head>
<body${opts.bodyClass ? ` class="${opts.bodyClass}"` : ""}>
${opts.content}
</body>
</html>
`;
}

function renderHeader(recipes: Recipe[], current?: string, assetPrefix = ""): string {
  const opts = recipes
    .map((r) => `<option value="${escapeHtml(r.shortname)}"${r.shortname === current ? " selected" : ""}>${escapeHtml(r.title)}</option>`)
    .join("\n");
  return `<div class="snarkedtable">
<div class="headerline">
<form id="picker">
<a href="${assetPrefix}index.html">snarked.com</a>:
just like <em>your</em> recipe box, only <b>online.</b>
<span class="droplist">
<select name="shortname" onchange="if(this.value){location.href='${assetPrefix}recipe/'+this.value+'.html'}">
<option value="">pick a recipe</option>
${opts}
</select>
</span>
</form>
</div>`;
}

function renderFooter(): string {
  return `<div class="closingline">snarked.com 2003, <a href="mailto:jmandel@alum.mit.edu">Josh Mandel</a></div>
</div>`;
}

function renderIndex(recipes: Recipe[]): string {
  const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title));
  const rows = sorted
    .map(
      (r) => `<div class="spacebelow">
<a href="recipe/${escapeHtml(r.shortname)}.html"><b>${escapeHtml(r.title)}</b></a><br>
<div class="smalltxt">${escapeHtml(r.blurb)}</div>
</div>`,
    )
    .join("\n");
  const content = `${renderHeader(sorted)}
<div class="basictext">
<div>
<div style='float: left; width: 30%;'>
<img src="images/snarked.jpg" alt="snarked"></div>
<div id="padded" style='float: right; width: 60%;'>
${rows}
<br>
Have a favorite food? Why not <a href="add-recipe.html"><b>add a recipe</b></a>?
<br><br><br>
<div class="hr"></div>
Then the bowsprit got mixed with the rudder sometimes,<br>
&nbsp;&nbsp;&nbsp;&nbsp;A thing, as the Bellman remarked,<br>
&nbsp;&nbsp;That frequently happens in tropical climes,<br>
&nbsp;&nbsp;&nbsp;&nbsp;When a vessel is, so to speak, 'snarked.'<br>
<em>(Lewis Carroll, <a href="https://www.gutenberg.org/ebooks/13">The Hunting of the Snark</a>)</em>
</div>
</div>
${renderFooter()}`;
  return pageShell({ title: "snarked dot com", content });
}

function renderRecipePhotos(r: Recipe): string {
  if (r.photos.length === 0) return "";
  const cells = r.photos
    .map(
      (p) => `<td><a href="../recipe_files/${escapeHtml(p)}"><img src="../recipe_files/${escapeHtml(p)}" alt="${escapeHtml(r.title)}"></a></td>`,
    )
    .join("");
  return `<table class="recipetable">
<caption class="smalltext">Click photo to enlarge</caption>
<tr>${cells}</tr>
</table>`;
}

function renderRecipe(r: Recipe, all: Recipe[]): string {
  const content = `${renderHeader(all, r.shortname, "../")}
<div class="basictext">

<div class="headtext">
<a href="${escapeHtml(r.shortname)}.html">${escapeHtml(r.title)}</a>
</div>

<div class="basictext">
Submitted by: ${escapeHtml(r.submitter)}<br>
Date: ${escapeHtml(r.date)}<br>
<br>
</div>
${renderRecipePhotos(r)}
<div class="recipetable" id="limitwidth">
<div class="recipebody">
${r.bodyHtml}
</div>
</div>
${renderFooter()}`;
  return pageShell({ title: `${r.title} — snarked dot com`, content, assetPrefix: "../" });
}

function renderAddRecipe(recipes: Recipe[]): string {
  const newFileUrl = `https://github.com/${GH_REPO}/new/master/recipes?filename=your_recipe.md&value=${GH_RECIPE_TEMPLATE}`;
  const issueUrl = `https://github.com/${GH_REPO}/issues/new?title=New+recipe%3A+%3Cyour+title%3E&body=${encodeURIComponent("Drop your recipe in here and a maintainer will commit it on your behalf.\n\n```\n(paste recipe markdown — see template at https://github.com/" + GH_REPO + "/blob/master/recipes/banana_bread.md)\n```\n")}`;
  const content = `${renderHeader(recipes)}
<div class="basictext">
<div class="headtext">Add a recipe</div>
<br>
<p>Recipes now live as little markdown files in the <a href="https://github.com/${GH_REPO}/tree/master/recipes"><b>recipes/</b></a> folder on GitHub. To add one, you have two options &mdash; pick whichever is less of a faff.</p>

<p><b>1. Open a pull request (preferred).</b><br>
Click below to start a new file in the <code>recipes/</code> folder, pre-filled with the right frontmatter. Edit it, commit, open a PR, and the site will rebuild on merge.<br><br>
<a href="${newFileUrl}"><b>&rarr; Open a recipe PR on GitHub</b></a></p>

<p><b>2. Open an issue.</b><br>
If git makes you twitch, paste the recipe into an issue and a maintainer will commit it for you.<br><br>
<a href="${issueUrl}"><b>&rarr; Open a recipe issue</b></a></p>

<p><b>What goes in the file</b></p>
<pre style="background:#eee;padding:8px;font-size:11px;overflow:auto;">---
title: Your Recipe Title
shortname: your_recipe_shortname
blurb: A short, snarky one-liner.
submitter: Your Name &lt;you@example.com&gt;
date: 2026-01-01
photos: []
---

## Ingredients

- 1 cup flour
- 1 tsp baking soda

## Instructions

Step the first. Step the second.</pre>

<p>If you have photos, drop them in <code>recipe_files/</code> as part of the same PR and list their filenames under <code>photos:</code>.</p>

</div>
${renderFooter()}`;
  return pageShell({ title: "Add a recipe — snarked dot com", content });
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
  mkdirSync(join(DIST, "recipe"), { recursive: true });

  const files = readdirSync(RECIPES_DIR).filter((f) => f.endsWith(".md"));
  const recipes = files.map(loadRecipe);
  const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title));

  writeFileSync(join(DIST, "index.html"), renderIndex(sorted));
  writeFileSync(join(DIST, "add-recipe.html"), renderAddRecipe(sorted));
  for (const r of sorted) {
    writeFileSync(join(DIST, "recipe", `${r.shortname}.html`), renderRecipe(r, sorted));
  }

  // Static asset passthrough
  copyDirIfExists(join(ROOT, "images"), join(DIST, "images"));
  copyDirIfExists(join(ROOT, "recipe_files"), join(DIST, "recipe_files"));
  copyDirIfExists(ASSETS_DIR, join(DIST, "assets"));
  copyFileIfExists(join(ROOT, "favicon2.ico"), join(DIST, "favicon2.ico"));
  copyFileIfExists(join(ROOT, "CNAME"), join(DIST, "CNAME"));
  copyFileIfExists(join(ROOT, "robots.txt"), join(DIST, "robots.txt"));

  // Combine CSS files in styles/ (alphabetical) into one styles.css
  if (existsSync(STYLES_DIR)) {
    const cssFiles = readdirSync(STYLES_DIR).filter((f) => f.endsWith(".css")).sort();
    const css = cssFiles.map((f) => readFileSync(join(STYLES_DIR, f), "utf8")).join("\n\n");
    writeFileSync(join(DIST, "styles.css"), css);
  }

  console.log(`Built ${recipes.length} recipes -> ${DIST}`);
}

build();
