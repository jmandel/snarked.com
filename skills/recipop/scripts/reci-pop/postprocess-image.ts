#!/usr/bin/env bun
import path from 'node:path';
import { assetOutPath, configureRunFromArgs, ensureDir, parseArgs, readJson, relFromRoot, requireRecipePath, storyboardOutPath } from './lib/utils.ts';
import { postprocessEnabled, postprocessImage } from './lib/postprocess.ts';
import { storyboardForRecipe } from './lib/prompt.ts';

const args = parseArgs();
configureRunFromArgs(args);
const fuzz = args.fuzz ? String(args.fuzz) : process.env.RECIPOP_TRIM_FUZZ || '3%';
const enabled = postprocessEnabled(args.postprocess ?? process.env.RECIPOP_POSTPROCESS_IMAGES, true);

async function runOne(filePath) {
  const result = await postprocessImage(filePath, { enabled, fuzz });
  console.log(`${String(result.status).padEnd(9)} ${relFromRoot(filePath)}${result.fuzz ? ` fuzz=${result.fuzz}` : ''}`);
  return result;
}

if (args.file) {
  await runOne(path.resolve(String(args.file)));
  process.exit(0);
}

const recipePath = requireRecipePath(args);
const recipe = await readJson(recipePath);
const outBase = args.out || '__recipe__';
const storyboard = storyboardForRecipe(recipe);
const files = [];

if (storyboard) files.push(storyboardOutPath(recipe, outBase));
for (const asset of recipe.assets || []) files.push(assetOutPath(recipe, asset.filename, outBase));

await ensureDir(path.dirname(files[0] || path.resolve('.')));
for (const file of files) {
  await runOne(file);
}
