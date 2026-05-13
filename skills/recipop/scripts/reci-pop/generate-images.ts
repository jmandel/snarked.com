#!/usr/bin/env bun
import path from 'node:path';
import fsp from 'node:fs/promises';
import { configureRunFromArgs, parseArgs, requireRecipePath, readJson, loadEnv, outDirFor, ensureDir, assetOutPath, promptOutPath, storyboardOutPath, storyboardPromptOutPath, exists, numberFrom, normalizeBool, relFromRoot } from './lib/utils.ts';
import { assetsForRecipe, buildAssetPrompt, buildMessageContent, buildStoryboardMessageContent, buildStoryboardPrompt, storyboardForRecipe } from './lib/prompt.ts';
import { generateImageViaOpenRouter, saveImageUrl } from './lib/openrouter.ts';
import { postprocessEnabled, postprocessImage } from './lib/postprocess.ts';

loadEnv();

const args = parseArgs();
configureRunFromArgs(args);
const recipePath = requireRecipePath(args);
const recipe = await readJson(recipePath);
const outBase = args.out || '__recipe__';
const outDir = outDirFor(recipe, outBase);
await ensureDir(path.join(outDir, 'assets'));
await ensureDir(path.join(outDir, 'prompts'));

const force = normalizeBool(args.force, false);
const dryRun = normalizeBool(args['dry-run'], false);
const only = args.only ? String(args.only) : null;
const hasDependencies = (recipe.assets || []).some(asset => Array.isArray(asset.dependsOnAssets) && asset.dependsOnAssets.length);
const defaultConcurrency = hasDependencies ? 1 : 2;
const concurrency = Math.max(1, numberFrom(args.concurrency || process.env.IMAGE_CONCURRENCY, defaultConcurrency));
const referenceMode = args['reference-mode'] || process.env.REFERENCE_MODE || recipe.imageGeneration?.referenceMode || 'text';
const maxReferenceImages = numberFrom(args['max-reference-images'] || process.env.MAX_REFERENCE_IMAGES, 1);
const maxDependencyImages = numberFrom(args['max-dependency-images'] || process.env.MAX_DEPENDENCY_IMAGES, 3);
const postprocess = postprocessEnabled(args.postprocess ?? process.env.RECIPOP_POSTPROCESS_IMAGES, true);
const trimFuzz = args['trim-fuzz'] || process.env.RECIPOP_TRIM_FUZZ || '3%';

let assets = assetsForRecipe(recipe);
const storyboard = storyboardForRecipe(recipe);
const runStoryboard = Boolean(storyboard && (!only || only === storyboard.filename || only === storyboard.id || only === 'storyboard'));
if (only) assets = assets.filter(asset => asset.filename === only || asset.id === only);
if (!assets.length && !runStoryboard) {
  console.log(only ? `No asset or storyboard matched --only=${only}` : 'No assets found.');
  process.exit(0);
}

async function preparePrompt(asset) {
  const prompt = buildAssetPrompt(recipe, asset);
  const promptPath = promptOutPath(recipe, asset.filename, outBase);
  await ensureDir(path.dirname(promptPath));
  await fsp.writeFile(promptPath, prompt, 'utf8');
  return promptPath;
}

async function runAsset(asset) {
  const outPath = assetOutPath(recipe, asset.filename, outBase);
  const promptPath = await preparePrompt(asset);

  if (exists(outPath) && !force) {
    return { filename: asset.filename, status: 'skipped', path: outPath, promptPath };
  }

  if (dryRun) {
    return { filename: asset.filename, status: 'dry-run', path: outPath, promptPath };
  }

  const content = await buildMessageContent(recipe, asset, {
    referenceMode,
    style: recipe.style || null,
    maxReferenceImages,
    maxDependencyImages,
    outDir
  });
  const result = await generateImageViaOpenRouter({ content, asset, recipe });
  await saveImageUrl(result.imageUrl, outPath);
  const postprocessResult = await postprocessImage(outPath, { enabled: postprocess, fuzz: trimFuzz });

  const metaPath = outPath.replace(/\.[^.]+$/, '.metadata.json');
  await fsp.writeFile(metaPath, JSON.stringify({
    filename: asset.filename,
    model: result.model,
    aspectRatio: result.aspectRatio,
    imageSize: result.imageSize,
    generatedAt: new Date().toISOString(),
    promptFile: relFromRoot(promptPath),
    referenceMode,
    style: recipe.style || null,
    postprocess: postprocessResult,
    dependencyImages: asset.dependsOnAssets || []
  }, null, 2) + '\n', 'utf8');

  return { filename: asset.filename, status: 'generated', path: outPath, promptPath, metaPath };
}

async function runStoryboardAsset(storyboard) {
  const outPath = storyboardOutPath(recipe, outBase);
  const prompt = buildStoryboardPrompt(recipe);
  const promptPath = storyboardPromptOutPath(recipe, outBase);
  await ensureDir(path.dirname(promptPath));
  await fsp.writeFile(promptPath, prompt, 'utf8');

  if (exists(outPath) && !force) {
    return { filename: storyboard.filename, status: 'skipped', path: outPath, promptPath };
  }

  if (dryRun) {
    return { filename: storyboard.filename, status: 'dry-run', path: outPath, promptPath };
  }

  const content = await buildStoryboardMessageContent(recipe, {
    referenceMode,
    maxReferenceImages
  });
  const result = await generateImageViaOpenRouter({ content, asset: storyboard, recipe });
  await saveImageUrl(result.imageUrl, outPath);
  const postprocessResult = await postprocessImage(outPath, { enabled: postprocess, fuzz: trimFuzz });

  const metaPath = outPath.replace(/\.[^.]+$/, '.metadata.json');
  await fsp.writeFile(metaPath, JSON.stringify({
    filename: storyboard.filename,
    model: result.model,
    aspectRatio: result.aspectRatio,
    imageSize: result.imageSize,
    generatedAt: new Date().toISOString(),
    promptFile: relFromRoot(promptPath),
    referenceMode,
    postprocess: postprocessResult,
    role: 'storyboard'
  }, null, 2) + '\n', 'utf8');

  return { filename: storyboard.filename, status: 'generated', path: outPath, promptPath, metaPath };
}

async function runWithConcurrency(items, limit, worker) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      try {
        const result = await worker(item);
        results.push(result);
        console.log(`${result.status.padEnd(9)} ${item.filename}`);
      } catch (err) {
        results.push({ filename: item.filename, status: 'error', error: String(err?.message || err) });
        console.error(`error     ${item.filename}: ${err?.message || err}`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

console.log(`Recipe: ${recipe.title}`);
console.log(`Storyboard: ${runStoryboard ? storyboard.filename : 'none'}`);
console.log(`Assets: ${assets.length}`);
console.log(`Concurrency: ${concurrency}`);
console.log(`Reference mode: ${referenceMode}`);
console.log(`Postprocess: ${postprocess ? `trim ${trimFuzz}` : 'disabled'}`);
if (dryRun) console.log('Dry run: prompts only, no API calls.');

const storyboardResults = [];
if (runStoryboard) {
  try {
    const result = await runStoryboardAsset(storyboard);
    storyboardResults.push(result);
    console.log(`${result.status.padEnd(9)} ${storyboard.filename}`);
  } catch (err) {
    storyboardResults.push({ filename: storyboard.filename, status: 'error', error: String(err?.message || err) });
    console.error(`error     ${storyboard.filename}: ${err?.message || err}`);
  }
}
const results = await runWithConcurrency(assets, concurrency, runAsset);
const failures = [...storyboardResults, ...results].filter(r => r.status === 'error');
if (failures.length) {
  console.error(`\n${failures.length} asset(s) failed.`);
  process.exit(1);
}
console.log(`\nDone. Assets folder: ${relFromRoot(path.join(outDir, 'assets'))}`);
