#!/usr/bin/env bun
import path from 'node:path';
import fsp from 'node:fs/promises';
import { configureRunFromArgs, parseArgs, requireRecipePath, readJson, outDirFor, ensureDir, promptOutPath, storyboardPromptOutPath, writeJson, relFromRoot } from './lib/utils.ts';
import { activeStyle, assetsForRecipe, buildAssetPrompt, buildStoryboardPrompt, storyboardForRecipe } from './lib/prompt.ts';

const args = parseArgs();
configureRunFromArgs(args);
const recipePath = requireRecipePath(args);
const recipe = await readJson(recipePath);
const outBase = args.out || '__recipe__';
const outDir = outDirFor(recipe, outBase);
await ensureDir(path.join(outDir, 'prompts'));

const plan = {
  recipeId: recipe.id,
  title: recipe.title,
  generatedAt: new Date().toISOString(),
  model: recipe.imageGeneration?.model || process.env.OPENROUTER_IMAGE_MODEL || 'openai/gpt-5.4-image-2',
  style: activeStyle(recipe).id,
  storyboard: null,
  assets: []
};

const storyboard = storyboardForRecipe(recipe);
if (storyboard) {
  const prompt = buildStoryboardPrompt(recipe);
  const promptPath = storyboardPromptOutPath(recipe, outBase);
  await ensureDir(path.dirname(promptPath));
  await fsp.writeFile(promptPath, prompt, 'utf8');
  plan.storyboard = {
    filename: storyboard.filename,
    placement: storyboard.placement,
    alt: storyboard.alt,
    aspectRatio: storyboard.aspectRatio,
    imageSize: storyboard.imageSize || recipe.imageGeneration?.imageSize || process.env.IMAGE_SIZE || '1K',
    promptFile: relFromRoot(promptPath)
  };
}

for (const asset of assetsForRecipe(recipe)) {
  const prompt = buildAssetPrompt(recipe, asset);
  const promptPath = promptOutPath(recipe, asset.filename, outBase);
  await ensureDir(path.dirname(promptPath));
  await fsp.writeFile(promptPath, prompt, 'utf8');
  plan.assets.push({
    filename: asset.filename,
    placement: asset.placement,
    alt: asset.alt,
    aspectRatio: asset.aspectRatio || recipe.imageGeneration?.defaultAspectRatio || '4:3',
    imageSize: asset.imageSize || recipe.imageGeneration?.imageSize || process.env.IMAGE_SIZE || '1K',
    dependsOnAssets: asset.dependsOnAssets || [],
    promptFile: relFromRoot(promptPath)
  });
}

const planPath = path.join(outDir, 'image-plan.json');
await writeJson(planPath, plan);
console.log(`Wrote ${relFromRoot(planPath)}`);
console.log(`Wrote ${plan.assets.length} prompt files in ${relFromRoot(path.join(outDir, 'prompts'))}`);
