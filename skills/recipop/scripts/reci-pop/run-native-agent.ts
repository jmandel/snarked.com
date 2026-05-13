#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT,
  assetOutPath,
  configureRunFromArgs,
  ensureDir,
  exists,
  listRecipeFiles,
  normalizeBool,
  numberFrom,
  parseArgs,
  readJson,
  recipeId,
  relFromRoot,
  resolveReferencePath,
  storyboardOutPath
} from './lib/utils.ts';
import { activeStyle } from './lib/prompt.ts';

const args = parseArgs();
configureRunFromArgs(args);

const runRoot = path.resolve(ROOT, String(args['run-root'] || '.recipop-runs'));
const concurrency = Math.max(1, numberFrom(args.concurrency || process.env.RECIPOP_NATIVE_CONCURRENCY, 1));
const clear = normalizeBool(args.clear, false);
const dryRun = normalizeBool(args['dry-run'], false);
const model = String(args.model || process.env.RECIPOP_NATIVE_MODEL || 'gpt-5.5');
const styleRoot = args['style-root'] ? String(args['style-root']) : null;
const recipeInputs = args._.length ? args._ : (args.recipe ? [String(args.recipe)] : ['recipes']);

async function pathIsDir(filePath) {
  try {
    return (await fsp.stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function recipePathsFromInput(input) {
  const full = path.resolve(ROOT, input);
  if ((await pathIsDir(full)) && exists(path.join(full, 'recipe.json'))) return [path.join(full, 'recipe.json')];
  if ((await pathIsDir(full))) {
    const rel = path.relative(ROOT, full) || input;
    return listRecipeFiles(rel);
  }
  return [full];
}

async function uniqueRecipePaths(inputs) {
  const all = [];
  for (const input of inputs) all.push(...await recipePathsFromInput(input));
  return [...new Set(all.map((file) => path.resolve(ROOT, file)))].sort();
}

async function linkOrCopy(src, dest) {
  if (!exists(src) || exists(dest)) return;
  await ensureDir(path.dirname(dest));
  try {
    await fsp.symlink(src, dest);
  } catch {
    const stat = await fsp.stat(src);
    if (stat.isDirectory()) {
      await fsp.cp(src, dest, { recursive: true, dereference: true });
    } else {
      await fsp.copyFile(src, dest);
    }
  }
}

async function prepareCodexHome(runDir) {
  const sourceHome = process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex');
  const codexHome = path.join(runDir, 'codex-home');
  await ensureDir(codexHome);
  await ensureDir(path.join(codexHome, 'generated_images'));
  await ensureDir(path.join(codexHome, 'sessions'));
  await ensureDir(path.join(codexHome, 'shell_snapshots'));
  await ensureDir(path.join(codexHome, 'log'));

  for (const entry of ['auth.json', 'config.toml', 'config.json', 'instructions.md', 'rules', 'skills', 'plugins', 'memories']) {
    await linkOrCopy(path.join(sourceHome, entry), path.join(codexHome, entry));
  }
  return codexHome;
}

function shellArgsForStyleRoot() {
  return styleRoot ? ` --style-root=${styleRoot}` : '';
}

function importCommand(recipePath, assetName, fileExpr = '<generated_png>') {
  return [
    'bun skills/recipop/scripts/reci-pop/import-image.ts',
    relFromRoot(recipePath),
    `--asset=${assetName}`,
    `--file=${fileExpr}`,
    '--provider=agent-guided',
    shellArgsForStyleRoot().trim()
  ].filter(Boolean).join(' ');
}

function buildAgentPrompt(recipePath, recipe, expectedCount) {
  const recipeRel = relFromRoot(recipePath);
  const styleRel = styleRoot ? styleRoot : 'styles';
  const storyboardName = recipe.storyboard?.filename || `storyboard-${recipeId(recipe)}.png`;
  const assetNames = (recipe.assets || []).map((asset) => asset.filename).filter(Boolean);
  const imports = [
    `storyboard: ${importCommand(recipePath, 'storyboard')}`,
    ...assetNames.map((filename) => `${filename}: ${importCommand(recipePath, filename)}`)
  ].join('\n');

  return `Use native image generation only; do not use OpenRouter or external APIs.

Work only on ${recipeRel}. The assets folder has been cleared when --clear is used. Do not edit recipe JSON.

Before generating the storyboard and before generating each later asset, re-inspect every attached style reference image. Match the hen reference's loose watercolor/gouache brushwork, coarse pigment blooms, dappled stippling, expressive dark contours, warm folk-cookbook palette, and white-paper material language. Keep all images art-only: no visible labels, numbers, UI, captions, watermarks, ingredient text, or arrows.

Read:
- ${recipeRel}
- ${styleRel}/french-hen-folk-wave/style.json when present, otherwise the active style resolved from the recipe
- prompts under ${path.posix.dirname(recipeRel)}/prompts/

Generated image discovery rule:
- This process has a private CODEX_HOME. Search only under "$CODEX_HOME/generated_images" for generated PNG files.
- Never scan the user's global ~/.codex/generated_images.
- Before each native image-generation call, record a marker time. After the call, choose the newest PNG under "$CODEX_HOME/generated_images" newer than that marker. If none exists, stop and report the failure.
- Import that exact PNG immediately before moving to the next asset.

Generate in this order:
1. storyboard asset ${storyboardName}
${assetNames.map((filename, i) => `${i + 2}. ${filename}`).join('\n')}

Import commands:
${imports}

Expected final count: ${expectedCount} PNG files in ${path.posix.dirname(recipeRel)}/assets.
At the end, print the actual PNG count, metadata count, and any failures.`;
}

async function runCommand(command, commandArgs, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      env: { ...process.env, ...(options.env || {}) },
      stdio: options.stdio || 'inherit'
    });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} ${commandArgs.join(' ')} exited with ${code}`)));
  });
}

async function countAssets(recipe) {
  const files = recipe.storyboard ? [storyboardOutPath(recipe, '__recipe__')] : [];
  for (const asset of recipe.assets || []) files.push(assetOutPath(recipe, asset.filename, '__recipe__'));
  let png = 0;
  let metadata = 0;
  for (const file of files) {
    if (exists(file)) png += 1;
    if (exists(file.replace(/\.[^.]+$/, '.metadata.json'))) metadata += 1;
  }
  return { png, metadata, expected: files.length };
}

async function clearAssets(recipe) {
  const dir = path.dirname(assetOutPath(recipe, '_placeholder.png', '__recipe__'));
  await ensureDir(dir);
  const entries = await fsp.readdir(dir).catch(() => []);
  await Promise.all(entries
    .filter((name) => name.endsWith('.png') || name.endsWith('.metadata.json'))
    .map((name) => fsp.rm(path.join(dir, name), { force: true })));
}

async function runRecipe(recipePath) {
  const recipe = await readJson(recipePath);
  const id = recipeId(recipe);
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
  const runDir = path.join(runRoot, `${timestamp}-${id}`);
  await ensureDir(runDir);

  await runCommand(process.execPath, [path.join(import.meta.dir, 'validate.ts'), recipePath, ...(styleRoot ? [`--style-root=${styleRoot}`] : [])]);
  await runCommand(process.execPath, [path.join(import.meta.dir, 'plan-assets.ts'), recipePath, ...(styleRoot ? [`--style-root=${styleRoot}`] : [])]);
  if (clear && !dryRun) await clearAssets(recipe);

  const refreshedRecipe = await readJson(recipePath);
  const expectedCount = (refreshedRecipe.assets || []).length + (refreshedRecipe.storyboard ? 1 : 0);
  const style = activeStyle(refreshedRecipe);
  const referenceArgs = [];
  for (const ref of style.oneShotExamples || []) {
    if (!ref.path) continue;
    const refPath = resolveReferencePath(ref.path);
    if (exists(refPath)) referenceArgs.push('-i', refPath);
  }
  const codexHome = await prepareCodexHome(runDir);
  const prompt = buildAgentPrompt(recipePath, refreshedRecipe, expectedCount);
  const promptPath = path.join(runDir, 'native-agent-prompt.txt');
  const logPath = path.join(runDir, 'native-agent.log');
  await fsp.writeFile(promptPath, prompt, 'utf8');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  console.log(`\n=== ${relFromRoot(recipePath)} ===`);
  console.log(`run dir: ${relFromRoot(runDir)}`);
  console.log(`private CODEX_HOME: ${relFromRoot(codexHome)}`);
  console.log(`style refs: ${referenceArgs.filter((_, i) => i % 2 === 1).map(relFromRoot).join(', ') || 'none'}`);
  if (dryRun) {
    console.log(`dry-run: wrote ${relFromRoot(promptPath)}`);
    return { recipePath, runDir, png: 0, metadata: 0, expected: expectedCount, dryRun: true };
  }

  await new Promise((resolve, reject) => {
    const child = spawn('codex', [
      'exec',
      '--enable', 'image_generation',
      '-C', ROOT,
      '-s', 'danger-full-access',
      '-m', model,
      ...referenceArgs,
      '--',
      prompt
    ], {
      cwd: ROOT,
      env: {
        ...process.env,
        CODEX_HOME: codexHome,
        RECIPOP_STYLE_ROOT: styleRoot || process.env.RECIPOP_STYLE_ROOT || 'styles'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
    child.on('exit', (code) => {
      logStream.end();
      code === 0 ? resolve() : reject(new Error(`native codex agent exited with ${code}; see ${relFromRoot(logPath)}`));
    });
  });

  const counts = await countAssets(await readJson(recipePath));
  if (counts.png !== counts.expected || counts.metadata !== counts.expected) {
    throw new Error(`${relFromRoot(recipePath)} incomplete: ${counts.png}/${counts.expected} PNG, ${counts.metadata}/${counts.expected} metadata`);
  }
  console.log(`complete: ${counts.png}/${counts.expected} PNG, ${counts.metadata}/${counts.expected} metadata`);
  return { recipePath, runDir, ...counts };
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      try {
        results.push(await worker(item));
      } catch (err) {
        results.push({ recipePath: item, error: String(err?.message || err) });
        console.error(`error: ${relFromRoot(item)}: ${err?.message || err}`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

const recipes = await uniqueRecipePaths(recipeInputs);
if (!recipes.length) {
  console.log('No recipe JSON files found.');
  process.exit(0);
}

console.log(`Native agent recipe runs: ${recipes.length}`);
console.log(`Concurrency: ${concurrency}`);
console.log(`Clear assets first: ${clear ? 'yes' : 'no'}`);
console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`);
console.log(`Run root: ${relFromRoot(runRoot)}`);

const results = await runWithConcurrency(recipes, concurrency, runRecipe);
const failures = results.filter((result) => result.error);
if (failures.length) {
  console.error(`\n${failures.length} recipe(s) failed.`);
  process.exit(1);
}
console.log('\nAll native agent recipe runs completed.');
