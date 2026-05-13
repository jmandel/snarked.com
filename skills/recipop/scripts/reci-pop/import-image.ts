#!/usr/bin/env bun
import fsp from 'node:fs/promises';
import path from 'node:path';
import { assetOutPath, configureRunFromArgs, ensureDir, exists, extensionToMime, parseArgs, readJson, relFromRoot, requireRecipePath, storyboardOutPath, writeJson } from './lib/utils.ts';
import { activeStyle, storyboardForRecipe } from './lib/prompt.ts';
import { postprocessEnabled, postprocessImage } from './lib/postprocess.ts';

const args = parseArgs();
configureRunFromArgs(args);
const recipePath = requireRecipePath(args);
const recipe = await readJson(recipePath);
const outBase = args.out || '__recipe__';

const assetName = args.asset ? String(args.asset) : '';
const sourceFile = args.file ? path.resolve(String(args.file)) : '';
const provider = args.provider ? String(args.provider) : 'agent-guided';
const postprocess = postprocessEnabled(args.postprocess ?? process.env.RECIPOP_POSTPROCESS_IMAGES, true);
const trimFuzz = args['trim-fuzz'] || process.env.RECIPOP_TRIM_FUZZ || '3%';

if (!assetName) throw new Error('Missing --asset=<asset filename from recipe assets[]>');
if (!sourceFile) throw new Error('Missing --file=<generated image path>');
if (!exists(sourceFile)) throw new Error(`Generated image file not found: ${sourceFile}`);

const storyboard = storyboardForRecipe(recipe);
const isStoryboard = Boolean(storyboard && (assetName === storyboard.filename || assetName === storyboard.id || assetName === 'storyboard'));
const asset = isStoryboard
  ? storyboard
  : (recipe.assets || []).find((candidate) => candidate.filename === assetName || candidate.id === assetName);
if (!asset) {
  throw new Error(`Asset not found in recipe assets[] or recipe.storyboard: ${assetName}`);
}

const outPath = isStoryboard
  ? storyboardOutPath(recipe, outBase)
  : assetOutPath(recipe, asset.filename, outBase);
await ensureDir(path.dirname(outPath));
await fsp.copyFile(sourceFile, outPath);
const postprocessResult = await postprocessImage(outPath, { enabled: postprocess, fuzz: trimFuzz });

const metadataPath = outPath.replace(/\.[^.]+$/, '.metadata.json');
await writeJson(metadataPath, {
  filename: asset.filename,
  provider,
  generatedAt: new Date().toISOString(),
  sourceFile,
  promptFile: relFromRoot(path.join(path.dirname(path.dirname(outPath)), 'prompts', asset.filename.replace(/\.[^.]+$/, '.txt'))),
  referenceMode: 'agent-guided',
  style: activeStyle(recipe).id,
  referenceImages: (activeStyle(recipe).oneShotExamples || []).map((ref) => ref.path).filter(Boolean),
  dependencyImages: asset.dependsOnAssets || [],
  sourceMimeType: extensionToMime(sourceFile),
  targetMimeType: extensionToMime(outPath),
  postprocess: postprocessResult,
});

console.log(`Imported ${relFromRoot(sourceFile)} -> ${relFromRoot(outPath)}`);
console.log(`Postprocess ${postprocessResult.status}${postprocessResult.fuzz ? ` (${postprocessResult.fuzz})` : ''}`);
console.log(`Wrote ${relFromRoot(metadataPath)}`);
