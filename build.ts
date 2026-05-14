import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { marked } from "marked";

const ROOT = resolve(import.meta.dir);
const RECIPES_DIR = join(ROOT, "recipes");
const STYLES_DIR = join(ROOT, "styles");
const ASSETS_DIR = join(ROOT, "assets");
const DIST = join(ROOT, "dist");
const RESPONSIVE_IMAGE_WIDTHS = [480, 768, 1200];
const RESPONSIVE_IMAGE_QUALITY = "86";
let imageMagickBin: string | null = null;

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
const GH_NEW_FILE_URL = `https://github.com/${GH_REPO}/new/master/recipes?filename=your_recipe/recipe.md&value=${GH_RECIPE_TEMPLATE}`;
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
  dirName: string;
  localDir: string;
  bodyMd: string;
  sections: Section[];
};

type Section = { name: string; md: string };
type ReciPopIngredientBase = {
  qty?: string;
  quantity?: string;
  quantityKind?: string;
  scalable?: boolean;
  group?: string;
  category?: string;
  item?: string;
  ingredient?: string;
  note?: string;
  amounts?: Record<string, string>;
};
type ReciPopIngredientAlternative = {
  label?: string;
  note?: string;
  items?: ReciPopIngredientBase[];
};
type ReciPopIngredient = ReciPopIngredientBase & {
  alternatives?: ReciPopIngredientAlternative[];
};
type ReciPopStep = {
  id: string;
  number?: number;
  timeLabel?: string;
  phase?: string;
  title?: string;
  instruction?: string;
  duration?: { activeLabel?: string; passiveLabel?: string; activeMinutes?: number; passiveMinutes?: number };
  resources?: string[];
  ingredients?: ReciPopIngredient[];
  makes?: Array<{ item?: string }>;
  notes?: string[];
  asset?: string;
};
type ReciPopRecipe = {
  id: string;
  title: string;
  subtitle?: string;
  assetBasePath?: string;
  _recipeDir?: string;
  _recipeShortname?: string;
  unitSystems?: Array<{ id: string; label?: string }>;
  defaultUnitSystem?: string;
  quickFacts?: Array<{ label: string; value: string }>;
  storyboard?: { filename?: string; alt?: string };
  heroAssets?: string[];
  layout?: { sections?: Array<any> };
  steps?: ReciPopStep[];
  assets?: Array<{ filename: string; alt?: string }>;
};
type ScalingOption = {
  item: string;
  context: string;
  original: string;
  metric: string;
};
type IngredientOverviewItem = {
  item: string;
  group: string;
  notes: Set<string>;
  divided: boolean;
  quantities: Array<{ original: string; metric: string; scalable: boolean }>;
  alternativeChoices?: Array<{
    label?: string;
    note?: string;
    items: Array<{ item: string; quantity: { original: string; metric: string; scalable: boolean } }>;
  }>;
};

const LEGACY_RECIPE_REDIRECTS = new Map<string, string>([
  ["Smothered_Chicken", "smothered_chicken"],
  ["banana_bread_refined", "refined_banana_bread"],
]);

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

function loadRecipe(dirName: string): Recipe {
  const localDir = join(RECIPES_DIR, dirName);
  const raw = readFileSync(join(localDir, "recipe.md"), "utf8");
  const { data, body } = parseFrontMatter(raw);
  const photos = Array.isArray(data.photos) ? (data.photos as string[]) : [];
  return {
    title: String(data.title ?? "Untitled"),
    shortname: String(data.shortname ?? dirName),
    blurb: String(data.blurb ?? ""),
    submitter: String(data.submitter ?? ""),
    date: String(data.date ?? ""),
    photos,
    dirName,
    localDir,
    bodyMd: body,
    sections: splitSections(body),
  };
}

function loadReciPop(shortname: string): ReciPopRecipe | null {
  const recipeDir = join(RECIPES_DIR, shortname);
  const recipePath = join(recipeDir, "recipe.json");
  if (!existsSync(recipePath)) return null;
  const recipe = JSON.parse(readFileSync(recipePath, "utf8")) as ReciPopRecipe;
  recipe._recipeDir = recipeDir;
  recipe._recipeShortname = shortname;
  return recipe;
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

function renderHero(assetPrefix = ""): string {
  return `<section class="sn-hero">
<div class="container">
<h1>just like <em>your</em> recipe box, only <b>online.</b></h1>
</div>
<div class="sn-hero__wave" aria-hidden="true"></div>
<script src="${assetPrefix}assets/wave.js" defer></script>
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

function hasMetricUnits(recipe: ReciPopRecipe): boolean {
  return (recipe.steps ?? []).some((step) => (step.ingredients ?? []).some((row) => {
    if (row.amounts?.metric) return true;
    return (row.alternatives ?? []).some((choice) => (choice.items ?? []).some((item) => item.amounts?.metric));
  }));
}

function renderUnitToggle(recipe: ReciPopRecipe): string {
  if (!hasMetricUnits(recipe)) return "";
  const systems = recipe.unitSystems?.length ? recipe.unitSystems : [
    { id: "original", label: "Original" },
    { id: "metric", label: "Metric" },
  ];
  return `<div class="sn-unit-toggle" aria-label="Ingredient units">
${systems.map((system) => `<button type="button" data-unit-choice="${escapeHtml(system.id)}">${escapeHtml(system.label ?? system.id)}</button>`).join("\n")}
</div>`;
}

function getIngredientQuantity(row: ReciPopIngredientBase): string {
  return row.qty ?? row.quantity ?? "";
}

function isScalableIngredient(row: ReciPopIngredientBase): boolean {
  if (row.scalable === false) return false;
  const quantityKind = String(row.quantityKind ?? "absolute").toLowerCase();
  if (["portion", "ratio", "as-needed", "to-taste", "component", "alternative"].includes(quantityKind)) return false;
  const hasLeadingNumber = (text: string) => /^\D*(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\.\d+)/.test(text.trim());
  return hasLeadingNumber(getIngredientQuantity(row)) || hasLeadingNumber(row.amounts?.metric ?? "");
}

function hasScalableQuantities(recipe: ReciPopRecipe): boolean {
  return (recipe.steps ?? []).some((step) => (step.ingredients ?? []).some((row) => {
    if (isScalableIngredient(row)) return true;
    return (row.alternatives ?? []).some((choice) => (choice.items ?? []).some(isScalableIngredient));
  }));
}

function scalingOptions(recipe: ReciPopRecipe): ScalingOption[] {
  const seen = new Set<string>();
  const options: ScalingOption[] = [];
  for (const step of recipe.steps ?? []) {
    for (const row of step.ingredients ?? []) {
      const item = row.item ?? row.ingredient ?? "";
      const original = getIngredientQuantity(row);
      const metric = row.amounts?.metric ?? "";
      if (!item || !isScalableIngredient(row)) continue;
      const key = `${item.toLowerCase()}|${original}|${metric}|${step.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        item,
        context: step.title ?? `Step ${step.number ?? ""}`.trim(),
        original,
        metric,
      });
    }
  }
  return options;
}

function renderScaleControls(recipe: ReciPopRecipe): string {
  if (!hasScalableQuantities(recipe)) return "";
  const options = scalingOptions(recipe);
  return `<div class="sn-scale-control" aria-label="Ingredient scaling">
<label>Scale <input type="number" min="0.1" max="20" step="0.25" value="1" data-scale-factor inputmode="decimal"><span>&times;</span></label>
${options.length ? `<label class="sn-scale-control__key">Set <select data-scale-key>
${options.map((option, index) => `<option value="${index}" data-base-original="${escapeHtml(option.original)}" data-base-metric="${escapeHtml(option.metric)}">${escapeHtml(option.item)}${option.context ? ` · ${escapeHtml(option.context)}` : ""}</option>`).join("\n")}
</select></label>
<input type="text" data-scale-target aria-label="Target ingredient quantity">` : ""}
<button type="button" data-scale-reset>Reset</button>
</div>`;
}

function renderReciPopScript(enableUnits: boolean, enableScale: boolean, recipeId: string): string {
  return `<script>
(() => {
  const roots = [...document.querySelectorAll(".sn-recipop")];
  const unitKey = "snarked.recipeUnits";
  const scaleKey = "snarked.recipeScale.${escapeHtml(recipeId)}";
  const clampScale = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.min(20, Math.max(0.1, n)) : 1;
  };
  const parseToken = (token) => {
    token = String(token || "").trim();
    const mixed = token.match(/^(\\d+(?:\\.\\d+)?)\\s+(\\d+)\\/(\\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const frac = token.match(/^(\\d+)\\/(\\d+)$/);
    if (frac) return Number(frac[1]) / Number(frac[2]);
    const n = Number(token);
    return Number.isFinite(n) ? n : null;
  };
  const parseQuantity = (text) => {
    const source = String(text || "").trim();
    const amountPattern = "(\\\\d+\\\\s+\\\\d+\\\\/\\\\d+|\\\\d+\\\\/\\\\d+|\\\\d+(?:\\\\.\\\\d+)?|\\\\.\\\\d+)";
    const match = source.match(new RegExp("^([^\\\\d.+-]*?)" + amountPattern + "(?:\\\\s*(?:-|–|to)\\\\s*" + amountPattern + ")?(.*)$", "i"));
    if (!match) return null;
    const first = parseToken(match[2]);
    const second = match[3] ? parseToken(match[3]) : null;
    if (first == null || (match[3] && second == null)) return null;
    return { source, prefix: match[1] || "", first, second, suffix: match[4] || "" };
  };
  const trimNumber = (value, places = 2) => {
    const rounded = Number(value.toFixed(places));
    return String(rounded).replace(/\\.0+$/, "").replace(/(\\.\\d*?)0+$/, "$1");
  };
  const formatGrams = (value) => {
    if (!Number.isFinite(value)) return "";
    if (value >= 100) return String(Math.round(value / 5) * 5);
    if (value >= 10) return String(Math.round(value));
    if (value >= 1) return trimNumber(value, 1);
    return trimNumber(value, 2);
  };
  const formatDecimal = (value) => {
    if (!Number.isFinite(value)) return "";
    if (Math.abs(value - Math.round(value)) < 0.001) return String(Math.round(value));
    return trimNumber(value, value < 10 ? 1 : 0);
  };
  const formatQuantity = (parsed, scale) => {
    if (Math.abs(scale - 1) < 0.001) return parsed.source;
    const isGrams = /^\\s*(g|gram|grams)\\b/i.test(parsed.suffix);
    const format = (value) => isGrams ? formatGrams(value * scale) : formatDecimal(value * scale);
    const amount = parsed.second == null
      ? format(parsed.first)
      : format(parsed.first) + "-" + format(parsed.second);
    return parsed.prefix + amount + parsed.suffix;
  };
  const scaleQuantity = (text, scale) => {
    const parsed = parseQuantity(text);
    return parsed ? formatQuantity(parsed, scale) : text;
  };
  const activeUnits = (root) => root.dataset.units || "original";
  const currentOptionBase = (root, option) => {
    const units = activeUnits(root);
    return option?.dataset[units === "metric" ? "baseMetric" : "baseOriginal"] || option?.dataset.baseOriginal || option?.dataset.baseMetric || "";
  };
  const updateScaleTarget = (root, scale) => {
    const target = root.querySelector("[data-scale-target]");
    const select = root.querySelector("[data-scale-key]");
    if (!target || !select) return;
    const option = select.selectedOptions[0];
    const base = currentOptionBase(root, option);
    target.value = base ? scaleQuantity(base, scale) : "";
  };
  const applyScale = (root, scale, persist = true) => {
    root.dataset.scale = String(scale);
    root.querySelectorAll("[data-scale-qty]").forEach((node) => {
      const base = node.dataset.scaleQty || node.textContent || "";
      node.textContent = scaleQuantity(base, scale);
    });
    const input = root.querySelector("[data-scale-factor]");
    if (input) input.value = trimNumber(scale, 2);
    updateScaleTarget(root, scale);
    if (persist) localStorage.setItem(scaleKey, String(scale));
  };
  const setUnits = (value) => {
    roots.forEach((root) => {
      root.dataset.units = value;
      root.querySelectorAll("[data-unit-choice]").forEach((button) => {
        button.setAttribute("aria-pressed", button.dataset.unitChoice === value ? "true" : "false");
      });
      updateScaleTarget(root, clampScale(root.dataset.scale || 1));
    });
    localStorage.setItem(unitKey, value);
  };
  roots.forEach((root) => {
    root.querySelectorAll("[data-scale-factor]").forEach((input) => {
      input.addEventListener("input", () => applyScale(root, clampScale(input.value)));
    });
    root.querySelectorAll("[data-scale-key]").forEach((select) => {
      select.addEventListener("change", () => updateScaleTarget(root, clampScale(root.dataset.scale || 1)));
    });
    root.querySelectorAll("[data-scale-target]").forEach((input) => {
      input.addEventListener("change", () => {
        const select = root.querySelector("[data-scale-key]");
        const option = select?.selectedOptions[0];
        const baseParsed = parseQuantity(currentOptionBase(root, option));
        const targetParsed = parseQuantity(input.value);
        if (!baseParsed || !targetParsed || !baseParsed.first) return updateScaleTarget(root, clampScale(root.dataset.scale || 1));
        applyScale(root, clampScale(targetParsed.first / baseParsed.first));
      });
    });
    root.querySelectorAll("[data-scale-reset]").forEach((button) => {
      button.addEventListener("click", () => applyScale(root, 1));
    });
    root.querySelectorAll("[data-unit-choice]").forEach((button) => {
      button.addEventListener("click", () => setUnits(button.dataset.unitChoice || "original"));
    });
    if (${enableScale ? "true" : "false"}) applyScale(root, clampScale(localStorage.getItem(scaleKey) || 1), false);
  });
  if (${enableUnits ? "true" : "false"}) setUnits(localStorage.getItem(unitKey) || roots[0]?.dataset.units || "original");
})();
</script>`;
}

function stepMap(recipe: ReciPopRecipe): Map<string, ReciPopStep> {
  return new Map((recipe.steps ?? []).map((step) => [step.id, step]));
}

function assetUrl(recipe: ReciPopRecipe, filename: string, prefix: string): string {
  const base = recipe.assetBasePath ?? "assets";
  if (/^(?:https?:)?\/\//.test(base) || base.startsWith("/")) {
    return `${base.replace(/\/$/, "")}/${filename}`;
  }
  if (recipe._recipeShortname && (base === "assets" || !base.includes("/"))) {
    return `${base.replace(/\/$/, "")}/${filename}`;
  }
  return `${prefix}${base}/${filename}`.replace(/\/+/g, "/").replace(":/", "://");
}

function assetExists(recipe: ReciPopRecipe, filename: string): boolean {
  const base = recipe.assetBasePath ?? "assets";
  if (recipe._recipeDir && !base.startsWith("/") && !/^(?:https?:)?\/\//.test(base)) {
    return existsSync(join(recipe._recipeDir, base, filename));
  }
  return existsSync(join(ROOT, base, filename));
}

function supportsResponsiveAsset(recipe: ReciPopRecipe, filename: string): boolean {
  const base = recipe.assetBasePath ?? "assets";
  return /\.(?:png|jpe?g)$/i.test(filename)
    && Boolean(recipe._recipeShortname)
    && !base.startsWith("/")
    && !/^(?:https?:)?\/\//.test(base)
    && (base === "assets" || !base.includes("/"));
}

function responsiveAssetFilename(filename: string, width: number): string {
  return `generated/${filename.replace(/\.[^.]+$/, `-${width}.webp`)}`;
}

function responsiveImageSizes(className: string): string {
  if (className.includes("hero")) return "(max-width: 720px) calc(100vw - 40px), min(980px, calc(100vw - 64px))";
  return "(max-width: 720px) calc(100vw - 74px), 430px";
}

function renderReciPopImage(recipe: ReciPopRecipe, filename: string | undefined, prefix: string, className: string): string {
  if (!filename) return "";
  const asset = (recipe.assets ?? []).find((item) => item.filename === filename);
  const alt = asset?.alt ?? filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  if (assetExists(recipe, filename)) {
    const masterUrl = assetUrl(recipe, filename, prefix);
    const loading = className.includes("hero") ? "eager" : "lazy";
    const fetchPriority = className.includes("hero") ? ' fetchpriority="high"' : "";
    const img = supportsResponsiveAsset(recipe, filename)
      ? `<picture>
<source type="image/webp" srcset="${RESPONSIVE_IMAGE_WIDTHS.map((width) => `${assetUrl(recipe, responsiveAssetFilename(filename, width), prefix)} ${width}w`).join(", ")}" sizes="${escapeHtml(responsiveImageSizes(className))}">
<img src="${masterUrl}" alt="${escapeHtml(alt)}" loading="${loading}" decoding="async"${fetchPriority}>
</picture>`
      : `<img src="${masterUrl}" alt="${escapeHtml(alt)}" loading="${loading}" decoding="async"${fetchPriority}>`;
    return `<figure class="${className}"><a class="sn-art-link" href="${masterUrl}" target="_blank" rel="noreferrer">${img}</a></figure>`;
  }
  return `<figure class="${className} sn-art--missing"><div><strong>Illustration pending</strong><span>${escapeHtml(alt)}</span></div></figure>`;
}

function renderStoryboardLink(recipe: ReciPopRecipe, prefix: string): string {
  const filename = recipe.storyboard?.filename;
  if (!filename || !assetExists(recipe, filename)) return "";
  const alt = recipe.storyboard?.alt || "visual continuity storyboard";
  return `<p class="sn-recipop__storyboard"><a href="${assetUrl(recipe, filename, prefix)}" target="_blank" rel="noreferrer">Open storyboard reference</a><span>${escapeHtml(alt)}</span></p>`;
}

function renderReciPopFacts(recipe: ReciPopRecipe): string {
  const facts = (recipe.quickFacts ?? []).filter((fact) => fact.label && fact.value);
  if (!facts.length) return "";
  return `<dl class="sn-recipop__facts">
${facts.map((fact) => `<div><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`).join("\n")}
</dl>`;
}

function cleanOverviewQuantity(value: string): { value: string; divided: boolean } {
  const trimmed = String(value ?? "").trim();
  const cleaned = trimmed.replace(/^remaining\s+/i, "");
  return { value: cleaned, divided: cleaned !== trimmed };
}

function inferIngredientGroup(row: ReciPopIngredient, item: string): string {
  const explicit = row.group ?? row.category;
  if (explicit) return explicit;
  const normalized = item.toLowerCase();
  if (/\b(onion|onions|red pepper|bell pepper|tomato|tomatoes|green onion|green onions|spinach|greens|lemon|banana|carrot|cilantro|parsley|mushroom|apple|berry)\b/.test(normalized)) {
    return "Produce";
  }
  if (/\b(cumin|chili powder|chile powder|pepper|kosher salt|table salt|salt|cinnamon|garlic powder|sumac|za'?atar|spice|vanilla|baking powder|baking soda)\b/.test(normalized)) {
    return "Spices + seasoning";
  }
  if (/\b(oil|soy sauce|broth|stock|tahini|milk|cream|butter|yogurt|juice|water)\b/.test(normalized)) return "Liquids + fats";
  if (/\b(chicken|salmon|beef|pork|lamb|egg|eggs|fish|meat)\b/.test(normalized)) return "Protein";
  if (/\b(flour|sugar|barley|rice|oats|cornmeal|bread|crumb|chocolate|cocoa)\b/.test(normalized)) return "Dry goods";
  return "Other";
}

function overviewIngredientItems(recipe: ReciPopRecipe): IngredientOverviewItem[] {
  const skipKinds = new Set(["portion", "component"]);
  const items = new Map<string, IngredientOverviewItem>();
  for (const step of recipe.steps ?? []) {
    for (const row of step.ingredients ?? []) {
      const item = row.item ?? row.ingredient ?? "";
      const originalSource = row.amounts?.original ?? getIngredientQuantity(row);
      const metricSource = row.amounts?.metric ?? "";
      const quantityKind = String(row.quantityKind ?? "absolute").toLowerCase();
      if (row.alternatives?.length) {
        const label = item || "choice";
        const key = `alternative:${label.toLowerCase()}|${step.id}`;
        const entry = items.get(key) ?? {
          item: label,
          group: inferIngredientGroup(row, label),
          notes: new Set<string>(),
          divided: false,
          quantities: [],
          alternativeChoices: [],
        };
        if (row.note) entry.notes.add(row.note);
        for (const choice of row.alternatives) {
          const choiceItems = (choice.items ?? []).map((choiceItem) => {
            const choiceLabel = choiceItem.item ?? choiceItem.ingredient ?? "";
            const original = cleanOverviewQuantity(choiceItem.amounts?.original ?? getIngredientQuantity(choiceItem));
            const metric = cleanOverviewQuantity(choiceItem.amounts?.metric ?? "");
            return {
              item: choiceLabel,
              quantity: { original: original.value, metric: metric.value, scalable: isScalableIngredient(choiceItem) },
            };
          }).filter((choiceItem) => choiceItem.item);
          if (choiceItems.length) {
            entry.alternativeChoices ??= [];
            entry.alternativeChoices.push({ label: choice.label, note: choice.note, items: choiceItems });
          }
        }
        items.set(key, entry);
        continue;
      }
      if (!item || !originalSource || skipKinds.has(quantityKind)) continue;
      const original = cleanOverviewQuantity(originalSource);
      const metric = cleanOverviewQuantity(metricSource);
      const key = item.toLowerCase();
      const entry = items.get(key) ?? {
        item,
        group: inferIngredientGroup(row, item),
        notes: new Set<string>(),
        divided: false,
        quantities: [],
      };
      entry.divided ||= original.divided || metric.divided;
      if (row.note) entry.notes.add(row.note);
      entry.quantities.push({
        original: original.value,
        metric: metric.value,
        scalable: isScalableIngredient(row),
      });
      items.set(key, entry);
    }
  }
  return [...items.values()];
}

function renderOverviewAmount(amount: { original: string; metric: string; scalable: boolean }): string {
  const originalAttrs = amount.scalable && amount.original ? ` data-scale-qty="${escapeHtml(amount.original)}"` : "";
  const metricAttrs = amount.scalable && amount.metric ? ` data-scale-qty="${escapeHtml(amount.metric)}"` : "";
  if (amount.metric) {
    return `<span class="sn-ingredient-overview__amount"><span data-unit-value="original"${originalAttrs}>${escapeHtml(amount.original)}</span><span data-unit-value="metric"${metricAttrs}>${escapeHtml(amount.metric)}</span></span>`;
  }
  return `<span class="sn-ingredient-overview__amount"><span${originalAttrs}>${escapeHtml(amount.original)}</span></span>`;
}

function renderIngredientOverview(recipe: ReciPopRecipe): string {
  const items = overviewIngredientItems(recipe);
  if (!items.length) return "";
  const groupOrder = ["Spices + seasoning", "Protein", "Produce", "Dry goods", "Liquids + fats", "Other"];
  const grouped = new Map<string, IngredientOverviewItem[]>();
  for (const item of items) {
    const group = item.group || "Other";
    grouped.set(group, [...(grouped.get(group) ?? []), item]);
  }
  const groups = [...grouped.entries()].sort(([a], [b]) => {
    const ai = groupOrder.indexOf(a);
    const bi = groupOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
  });
  return `<section class="sn-ingredient-overview" aria-labelledby="ingredients-overview">
<div class="sn-ingredient-overview__head">
<h2 id="ingredients-overview">Ingredients</h2>
</div>
<div class="sn-ingredient-overview__groups">
${groups.map(([group, groupItems]) => `<section class="sn-ingredient-overview__group">
<h3>${escapeHtml(group)}</h3>
<ul>
${groupItems.map((item) => {
    const notes = [...item.notes];
    const note = [item.divided ? "divided across steps" : "", ...notes].filter(Boolean).join("; ");
    if (item.alternativeChoices?.length) {
      const choices = item.alternativeChoices.map((choice, index) => {
        const lines = choice.items.map((choiceItem) => `<span class="sn-ingredient-overview__choice-line">${renderOverviewAmount(choiceItem.quantity)}<b>${escapeHtml(choiceItem.item)}</b></span>`).join("");
        return `<div class="sn-ingredient-overview__choice">${index > 0 ? `<span class="sn-ingredient-overview__or">or</span>` : ""}${choice.label ? `<strong>${escapeHtml(choice.label)}</strong>` : ""}${lines}${choice.note ? `<small>${escapeHtml(choice.note)}</small>` : ""}</div>`;
      }).join("");
      return `<li class="sn-ingredient-overview__alternative">
<b>${escapeHtml(item.item)}</b>
<div class="sn-ingredient-overview__choices">${choices}</div>
${note ? `<small>${escapeHtml(note)}</small>` : ""}
</li>`;
    }
    return `<li>
<span class="sn-ingredient-overview__qty">${item.quantities.map(renderOverviewAmount).join("<span class=\"sn-ingredient-overview__plus\">+</span>")}</span>
<b>${escapeHtml(item.item)}</b>
${note ? `<small>${escapeHtml(note)}</small>` : ""}
</li>`;
  }).join("\n")}
</ul>
</section>`).join("\n")}
</div>
</section>`;
}

function reciPopIngredientParts(row: ReciPopIngredientBase, forceStatic = false) {
  const qty = row.qty ?? row.quantity ?? "";
  const metric = row.amounts?.metric ?? "";
  const item = row.item ?? row.ingredient ?? "";
  const scalable = !forceStatic && isScalableIngredient(row);
  const originalAttrs = scalable && qty ? ` data-scale-qty="${escapeHtml(qty)}"` : "";
  const metricAttrs = scalable && metric ? ` data-scale-qty="${escapeHtml(metric)}"` : "";
  const qtyHtml = metric
    ? `<span data-unit-value="original"${originalAttrs}>${escapeHtml(qty)}</span><span data-unit-value="metric"${metricAttrs}>${escapeHtml(metric)}</span>`
    : `<span${originalAttrs}>${escapeHtml(qty)}</span>`;
  return { qty, metric, item, note: row.note ?? "", qtyHtml };
}

function renderReciPopIngredientRow(row: ReciPopIngredientBase, forceStatic = false): string {
  const { qty, metric, item, note, qtyHtml } = reciPopIngredientParts(row, forceStatic);
  if (!qty && !metric) {
    return `<tr class="sn-flow-ingredients__component"><td colspan="2"><b>${escapeHtml(item)}</b>${note ? `<small>${escapeHtml(note)}</small>` : ""}</td></tr>`;
  }
  return `<tr><td class="sn-flow-ingredients__qty">${qtyHtml}</td><td><b>${escapeHtml(item)}</b>${note ? `<small>${escapeHtml(note)}</small>` : ""}</td></tr>`;
}

function renderReciPopAlternativeItem(row: ReciPopIngredientBase): string {
  const { item, note, qtyHtml } = reciPopIngredientParts(row);
  return `<div class="sn-flow-alternative__item"><span class="sn-flow-alternative__qty">${qtyHtml}</span><b>${escapeHtml(item)}</b>${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>`;
}

function renderReciPopAlternativeRows(row: ReciPopIngredient): string {
  const item = row.item ?? row.ingredient ?? "choice";
  const choices = row.alternatives ?? [];
  const choiceHtml = choices.map((choice, index) => {
    const rows = choice.items ?? [];
    return `${index > 0 ? `<div class="sn-flow-alternative__or">or</div>` : ""}
<div class="sn-flow-alternative__choice">
${choice.label ? `<div class="sn-flow-alternative__choice-label">${escapeHtml(choice.label)}${choice.note ? `<small>${escapeHtml(choice.note)}</small>` : ""}</div>` : ""}
${rows.map(renderReciPopAlternativeItem).join("")}
</div>`;
  }).join("");
  return `<tr class="sn-flow-ingredients__alternative"><td colspan="2">
<div class="sn-flow-alternative">
<div class="sn-flow-alternative__head"><b>${escapeHtml(item)}</b>${row.note ? `<small>${escapeHtml(row.note)}</small>` : ""}</div>
${choiceHtml}
</div>
</td></tr>`;
}

function renderReciPopIngredientRows(rows: ReciPopIngredient[] = []): string {
  if (!rows.length) return "";
  return `<table class="sn-flow-ingredients"><tbody>
${rows.map((row) => {
    if (row.alternatives?.length) return renderReciPopAlternativeRows(row);
    return renderReciPopIngredientRow(row);
  }).join("\n")}
</tbody></table>`;
}

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function noteValue(notes: string[] = [], prefix: string): string {
  const note = notes.find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
  return note ? note.slice(prefix.length).trim() : "";
}

function stepDurationLabel(step: ReciPopStep): string {
  const active = step.duration?.activeLabel || formatMinutes(step.duration?.activeMinutes ?? 0);
  const passive = step.duration?.passiveLabel ? `wait ${step.duration.passiveLabel}` : "";
  return [active, passive].filter(Boolean).join(" + ");
}

function renderStepMeta(step: ReciPopStep): string {
  const start = step.timeLabel && !/^0\s*min$/i.test(step.timeLabel) ? step.timeLabel : "";
  const heat = noteValue(step.notes, "Heat:");
  const pieces = [
    start,
    stepDurationLabel(step),
    heat,
    ...(step.resources ?? []).slice(0, 3),
  ].filter(Boolean);
  return pieces.length ? `<p class="sn-flow-step__meta">${pieces.map(escapeHtml).join(" · ")}</p>` : "";
}

function renderStepFooter(step: ReciPopStep): string {
  const notes = (step.notes ?? []).filter((note) => !/^(?:Source timing|Heat):/i.test(note));
  if (!notes.length) return "";
  return `<div class="sn-flow-step__footer">
${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("\n")}
</div>`;
}

function phaseClass(phase?: string): string {
  const p = String(phase ?? "").toLowerCase();
  if (["prep", "setup"].includes(p)) return "sn-flow-step--prep";
  if (["cook", "bake"].includes(p)) return "sn-flow-step--cook";
  if (["wait", "finish"].includes(p)) return "sn-flow-step--finish";
  return "sn-flow-step--mix";
}

function phaseBucket(phase?: string): "prep" | "mix" | "cook" | "finish" {
  const p = String(phase ?? "").toLowerCase();
  if (["prep", "setup"].includes(p)) return "prep";
  if (["cook", "bake"].includes(p)) return "cook";
  if (["wait", "finish"].includes(p)) return "finish";
  return "mix";
}

function renderPhaseKey(recipe: ReciPopRecipe): string {
  const present = new Set((recipe.steps ?? []).map((step) => phaseBucket(step.phase)));
  const items = [
    { id: "prep", label: "Prep/setup", className: "sn-flow-step--prep" },
    { id: "mix", label: "Mix/assemble", className: "sn-flow-step--mix" },
    { id: "cook", label: "Cook/bake", className: "sn-flow-step--cook" },
    { id: "finish", label: "Wait/finish", className: "sn-flow-step--finish" },
  ].filter((item) => present.has(item.id as any));
  if (items.length < 2) return "";
  return `<div class="sn-flow-key" aria-label="Step color key">
${items.map((item) => `<span class="${item.className}"><i aria-hidden="true"></i>${escapeHtml(item.label)}</span>`).join("\n")}
</div>`;
}

function renderReciPopStep(recipe: ReciPopRecipe, step: ReciPopStep, prefix: string, compact = false): string {
  return `<article class="sn-flow-step ${phaseClass(step.phase)}${compact ? " sn-flow-step--compact" : ""}">
<div class="sn-flow-step__rail"><span>${escapeHtml(String(step.number ?? ""))}</span></div>
<div class="sn-flow-step__copy">
${renderReciPopImage(recipe, step.asset, prefix, "sn-flow-step__art")}
<div class="sn-flow-step__main">
<header>
<h2>${escapeHtml(step.title ?? "Step")}</h2>
${renderStepMeta(step)}
</header>
${step.instruction ? `<p class="sn-flow-step__instruction">${escapeHtml(step.instruction)}</p>` : ""}
${renderReciPopIngredientRows(step.ingredients ?? [])}
${renderStepFooter(step)}
</div>
</div>
</article>`;
}

function renderParallelSection(recipe: ReciPopRecipe, section: any, steps: Map<string, ReciPopStep>, prefix: string): string {
  const lanes = Array.isArray(section.lanes) ? section.lanes : [];
  return `<section class="sn-flow-parallel">
<div class="sn-flow-parallel__lanes">
${lanes.map((lane: any) => `<div class="sn-flow-parallel__lane">
${(lane.steps ?? []).map((id: string) => {
    const step = steps.get(id);
    return step ? renderReciPopStep(recipe, step, prefix, true) : "";
  }).join("\n")}
</div>`).join("\n")}
</div>
</section>`;
}

function renderReciPopProcess(recipe: ReciPopRecipe, prefix: string): string {
  const steps = stepMap(recipe);
  const sections = recipe.layout?.sections ?? (recipe.steps ?? []).map((step) => ({ type: "step", step: step.id }));
  return `<div class="sn-flow">
${sections.map((section: any) => {
    if (section.type === "parallel") return renderParallelSection(recipe, section, steps, prefix);
    const step = steps.get(section.step);
    return step ? renderReciPopStep(recipe, step, prefix) : "";
  }).join("\n")}
</div>`;
}

function renderReciPopRecipe(flow: ReciPopRecipe, sourceRecipe: Recipe, prefix: string): string {
  const units = flow.defaultUnitSystem ?? "original";
  const heroes = flow.heroAssets ?? [];
  const hasUnits = hasMetricUnits(flow);
  const hasScale = hasScalableQuantities(flow);
  return `<section class="sn-recipop" data-units="${escapeHtml(units)}">
${heroes.length ? `<div class="sn-recipop__hero-art">${heroes.map((filename) => renderReciPopImage(flow, filename, prefix, "sn-recipop__hero-image")).join("\n")}</div>` : ""}
<div class="sn-recipop__toolbar">
${renderUnitToggle(flow)}
${renderScaleControls(flow)}
<a href="recipe.json">JSON</a>
</div>
${renderReciPopFacts(flow)}
${renderIngredientOverview(flow)}
${renderPhaseKey(flow)}
${renderReciPopProcess(flow, prefix)}
${renderStoryboardLink(flow, prefix)}
<details class="sn-source-recipe">
<summary>Original recipe text</summary>
${renderMd(sourceRecipe.bodyMd)}
</details>
</section>
${hasUnits || hasScale ? renderReciPopScript(hasUnits, hasScale, flow.id) : ""}`;
}

function renderRecipe(r: Recipe, all: Recipe[]): string {
  const prefix = "../../";
  const reciPop = loadReciPop(r.shortname);
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
<div class="sn-hero__wave sn-hero__wave--compact" aria-hidden="true"></div>
<script src="${prefix}assets/wave.js" defer></script>
</section>

<div class="container">
<div class="sn-detail__body${reciPop ? " sn-detail__body--flow" : ""}">
${reciPop ? renderReciPopRecipe(reciPop, r, prefix) : `${renderGallery(r, prefix)}
${renderIngredientsPanel(r)}
${renderMethodPanel(r)}`}
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

<p>Put each recipe in <code>recipes/your_recipe/recipe.md</code>. Reci-pop recipes can also include <code>recipe.json</code>, generated <code>assets/</code>, and prompt/debug files in the same folder.</p>
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

function imageMagickCommand(): string {
  if (imageMagickBin) return imageMagickBin;
  for (const command of ["magick", "convert"]) {
    try {
      execFileSync(command, ["-version"], { stdio: "ignore" });
      imageMagickBin = command;
      return command;
    } catch {
      // Keep looking; CI installs ImageMagick 6, which exposes `convert`.
    }
  }
  throw new Error("ImageMagick is required to generate responsive recipe images. Install ImageMagick 7 (`magick`) or ImageMagick 6 (`convert`).");
}

function generateResponsiveRecipeImages(recipe: Recipe, flow: ReciPopRecipe | null, destRecipeDir: string) {
  if (!flow) return;
  const base = flow.assetBasePath ?? "assets";
  if (base !== "assets") return;
  const srcAssetsDir = join(recipe.localDir, base);
  if (!existsSync(srcAssetsDir)) return;
  const destGeneratedDir = join(destRecipeDir, base, "generated");
  mkdirSync(destGeneratedDir, { recursive: true });

  const imageNames = readdirSync(srcAssetsDir).filter((name) => /\.(?:png|jpe?g)$/i.test(name));
  const command = imageMagickCommand();
  for (const imageName of imageNames) {
    const src = join(srcAssetsDir, imageName);
    for (const width of RESPONSIVE_IMAGE_WIDTHS) {
      const dest = join(destGeneratedDir, imageName.replace(/\.[^.]+$/, `-${width}.webp`));
      execFileSync(command, [
        src,
        "-auto-orient",
        "-strip",
        "-resize",
        `${width}x>`,
        "-quality",
        RESPONSIVE_IMAGE_QUALITY,
        "-define",
        "webp:method=5",
        dest,
      ], { stdio: "ignore" });
    }
  }
}

function redirectHtml(target: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Redirecting...</title>
<link rel="canonical" href="${escapeHtml(target)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
<p>Redirecting to <a href="${escapeHtml(target)}">${escapeHtml(target)}</a>.</p>
`;
}

function writeRedirectFile(filePath: string, target: string) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, redirectHtml(target));
}

function addRecipeRedirects(recipes: Recipe[]) {
  const byShortname = new Map(recipes.map((recipe) => [recipe.shortname, recipe]));
  const recipeDir = join(DIST, "recipe");
  mkdirSync(recipeDir, { recursive: true });

  for (const recipe of recipes) {
    writeRedirectFile(join(recipeDir, `${recipe.shortname}.html`), `/recipe/${recipe.shortname}/`);
  }

  for (const [legacy, targetShortname] of LEGACY_RECIPE_REDIRECTS) {
    if (!byShortname.has(targetShortname)) continue;
    const target = `/recipe/${targetShortname}/`;
    writeRedirectFile(join(recipeDir, legacy, "index.html"), target);
    writeRedirectFile(join(recipeDir, `${legacy}.html`), target);
  }
}

function build() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  const files = readdirSync(RECIPES_DIR).filter((f) => existsSync(join(RECIPES_DIR, f, "recipe.md")));
  const recipes = files.map(loadRecipe);
  const sorted = [...recipes].sort((a, b) => a.title.localeCompare(b.title));

  writeFileSync(join(DIST, "index.html"), renderIndex(sorted));
  mkdirSync(join(DIST, "add-recipe"), { recursive: true });
  writeFileSync(join(DIST, "add-recipe", "index.html"), renderAddRecipe());
  for (const r of sorted) {
    const dir = join(DIST, "recipe", r.shortname);
    const flow = loadReciPop(r.shortname);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), renderRecipe(r, sorted));
    copyFileIfExists(join(r.localDir, "recipe.md"), join(dir, "recipe.md"));
    copyFileIfExists(join(r.localDir, "recipe.json"), join(dir, "recipe.json"));
    copyFileIfExists(join(r.localDir, "image-plan.json"), join(dir, "image-plan.json"));
    copyDirIfExists(join(r.localDir, "assets"), join(dir, "assets"));
    generateResponsiveRecipeImages(r, flow, dir);
    copyDirIfExists(join(r.localDir, "prompts"), join(dir, "prompts"));
  }
  addRecipeRedirects(sorted);

  copyDirIfExists(join(ROOT, "images"), join(DIST, "images"));
  copyDirIfExists(join(ROOT, "recipe_files"), join(DIST, "recipe_files"));
  copyDirIfExists(ASSETS_DIR, join(DIST, "assets"));
  copyDirIfExists(STYLES_DIR, join(DIST, "styles"));
  copyDirIfExists(join(ROOT, "schemas"), join(DIST, "schemas"));
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
