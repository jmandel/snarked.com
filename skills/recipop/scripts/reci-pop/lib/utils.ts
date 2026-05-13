import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const ROOT = process.cwd();
export const KIT_ROOT = path.resolve(import.meta.dir, '..');
export const SKILL_ROOT = path.resolve(KIT_ROOT, '..', '..');

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (const raw of argv) {
    if (!raw.startsWith('--')) {
      args._.push(raw);
      continue;
    }
    const body = raw.slice(2);
    const eq = body.indexOf('=');
    if (eq === -1) {
      args[body] = true;
    } else {
      const key = body.slice(0, eq);
      const value = body.slice(eq + 1);
      args[key] = value;
    }
  }
  return args;
}

export function configureRunFromArgs(args = {}) {
  if (args['style-root']) process.env.RECIPOP_STYLE_ROOT = String(args['style-root']);
}

export function loadEnv(envPath = '.env') {
  const full = path.resolve(ROOT, envPath);
  if (!fs.existsSync(full)) return {};
  const text = fs.readFileSync(full, 'utf8');
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
    if (!(key in process.env)) process.env[key] = value;
  }
  return parsed;
}

export async function readJson(filePath) {
  const text = await fsp.readFile(filePath, 'utf8');
  const value = JSON.parse(text);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.defineProperty(value, '__sourcePath', {
      value: path.resolve(ROOT, filePath),
      enumerable: false,
      configurable: true
    });
  }
  return value;
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

export function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'recipe';
}

export function recipeId(recipe) {
  return recipe.id || slugify(recipe.title || 'recipe');
}

export function recipeSourceDir(recipe) {
  return recipe.__sourcePath ? path.dirname(recipe.__sourcePath) : null;
}

export function styleRootDirs() {
  const dirs = [];
  if (process.env.RECIPOP_STYLE_ROOT) dirs.push(path.resolve(ROOT, process.env.RECIPOP_STYLE_ROOT));
  dirs.push(path.resolve(ROOT, 'styles'));
  dirs.push(path.resolve(SKILL_ROOT, 'styles'));
  return [...new Set(dirs)];
}

export function outDirFor(recipe, base = 'dist') {
  if (base === '__recipe__') {
    return recipeSourceDir(recipe) || path.resolve(ROOT, recipeId(recipe));
  }
  return path.resolve(ROOT, base, recipeId(recipe));
}

export function assetOutPath(recipe, filename, base = 'dist') {
  return path.join(outDirFor(recipe, base), 'assets', filename);
}

export function promptOutPath(recipe, filename, base = 'dist') {
  const safe = filename.replace(/\.[^.]+$/, '.txt');
  return path.join(outDirFor(recipe, base), 'prompts', safe);
}

export function storyboardOutPath(recipe, base = 'dist') {
  const filename = recipe.storyboard?.filename || `storyboard-${recipeId(recipe)}.png`;
  return assetOutPath(recipe, filename, base);
}

export function storyboardPromptOutPath(recipe, base = 'dist') {
  const filename = recipe.storyboard?.filename || `storyboard-${recipeId(recipe)}.png`;
  return promptOutPath(recipe, filename, base);
}

export function exists(filePath) {
  return fs.existsSync(filePath);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).toLowerCase());
}

export function numberFrom(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function relFromRoot(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, '/');
}

export function resolveReferencePath(referencePath) {
  if (path.isAbsolute(referencePath) && exists(referencePath)) return referencePath;
  const rootPath = path.resolve(ROOT, referencePath);
  if (exists(rootPath)) return rootPath;
  const bundledPath = path.resolve(KIT_ROOT, referencePath);
  if (exists(bundledPath)) return bundledPath;
  const skillPath = path.resolve(SKILL_ROOT, referencePath);
  if (exists(skillPath)) return skillPath;
  return rootPath;
}

export function extensionToMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/png';
}

export async function fileToDataUrl(filePath) {
  const bytes = await fsp.readFile(filePath);
  const mime = extensionToMime(filePath);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function firstPositional(args, fallback = undefined) {
  return args._?.[0] || args.recipe || fallback;
}

export function requireRecipePath(args) {
  const recipePath = firstPositional(args);
  if (!recipePath) {
    throw new Error('Missing recipe path. Example: bun skills/recipop/scripts/reci-pop/render.ts recipes/smothered-chicken/recipe.json');
  }
  return path.resolve(ROOT, recipePath);
}

export function getStepMap(recipe) {
  const map = new Map();
  for (const step of recipe.steps || []) map.set(step.id, step);
  return map;
}

export function getAssetMap(recipe) {
  const map = new Map();
  for (const asset of recipe.assets || []) map.set(asset.filename, asset);
  return map;
}

export async function listRecipeFiles(dir = 'recipes') {
  const full = path.resolve(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  const names = await fsp.readdir(full);
  const files = [];
  for (const name of names) {
    const direct = path.join(full, name);
    const nested = path.join(direct, 'recipe.json');
    if (name.endsWith('.recipe.json')) files.push(direct);
    else if (fs.existsSync(nested)) files.push(nested);
  }
  return files;
}
