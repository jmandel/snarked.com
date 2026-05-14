#!/usr/bin/env bun
import path from 'node:path';
import { ROOT, configureRunFromArgs, exists, parseArgs, requireRecipePath, readJson, recipeSourceDir, styleRootDirs } from './lib/utils.ts';

const args = parseArgs();
configureRunFromArgs(args);
const recipePath = requireRecipePath(args);
const recipe = await readJson(recipePath);

const errors = [];
for (const field of ['id', 'title', 'style', 'layout', 'steps', 'assets']) {
  if (!(field in recipe)) errors.push(`Missing required field: ${field}`);
}
if (recipe.layout && recipe.layout.type !== 'vertical-process') errors.push('layout.type must be vertical-process');
if (recipe.layout && !Array.isArray(recipe.layout.sections)) errors.push('layout.sections must be an array');
if (!Array.isArray(recipe.steps)) errors.push('steps must be an array');
if (!Array.isArray(recipe.assets)) errors.push('assets must be an array');

if (typeof recipe.style === 'string') {
  const sourceDir = recipeSourceDir(recipe) || ROOT;
  const styleLooksLikePath = recipe.style.includes('/') || recipe.style.includes('\\') || recipe.style.endsWith('.json');
  const styleCandidates = styleLooksLikePath
    ? [path.resolve(sourceDir, recipe.style)]
    : styleRootDirs().map((root) => path.join(root, recipe.style));
  const stylePaths = styleCandidates.map((candidate) => candidate.endsWith('.json') ? candidate : path.join(candidate, 'style.json'));
  if (!stylePaths.some(exists)) {
    errors.push(`style references missing file. Checked: ${stylePaths.map((candidate) => path.relative(ROOT, candidate)).join(', ')}`);
  }
} else if (recipe.style && typeof recipe.style === 'object') {
  if (!recipe.style.id) errors.push('inline style object should include an id');
} else if ('style' in recipe) {
  errors.push('style must be a style id string or an inline style object');
}

const stepIds = new Set();
const quantityKinds = new Set(['absolute', 'count', 'portion', 'ratio', 'as-needed', 'to-taste', 'component']);
const noMetricQuantityKinds = new Set(['portion', 'ratio', 'as-needed', 'to-taste', 'component']);
for (const step of recipe.steps || []) {
  if (!step.id) errors.push('Every step needs an id');
  if (step.id && stepIds.has(step.id)) errors.push(`Duplicate step id: ${step.id}`);
  if (step.id) stepIds.add(step.id);
  if (!step.title) errors.push(`Step ${step.id || '?'} is missing title`);
  if (step.asset && !(recipe.assets || []).some(a => a.filename === step.asset)) errors.push(`Step ${step.id} references missing asset: ${step.asset}`);
  for (const row of step.ingredients || []) {
    if (row.quantityKind && !quantityKinds.has(row.quantityKind)) {
      errors.push(`Step ${step.id} has invalid ingredient quantityKind: ${row.quantityKind}`);
    }
    if (row.scalable != null && typeof row.scalable !== 'boolean') {
      errors.push(`Step ${step.id} ingredient scalable must be boolean`);
    }
    if (row.amounts && typeof row.amounts !== 'object') errors.push(`Step ${step.id} has ingredient amounts that are not an object`);
    for (const [unitId, value] of Object.entries(row.amounts || {})) {
      if (typeof value !== 'string') errors.push(`Step ${step.id} ingredient amount ${unitId} must be a string`);
    }
    if (noMetricQuantityKinds.has(row.quantityKind) && row.amounts?.metric) {
      errors.push(`Step ${step.id} ingredient ${row.item || row.ingredient || '?'} uses quantityKind ${row.quantityKind} but also defines amounts.metric`);
    }
  }
}

const assetNames = new Set();
for (const asset of recipe.assets || []) {
  if (!asset.filename) errors.push('Every asset needs a filename');
  if (asset.filename && assetNames.has(asset.filename)) errors.push(`Duplicate asset filename: ${asset.filename}`);
  if (asset.filename) assetNames.add(asset.filename);
  if (!asset.prompt) errors.push(`Asset ${asset.filename || '?'} is missing prompt`);
  if (!asset.alt) errors.push(`Asset ${asset.filename || '?'} is missing alt text`);
}

if (recipe.storyboard) {
  if (!recipe.storyboard.filename) errors.push('storyboard.filename is required when storyboard is present');
  if (!recipe.storyboard.prompt) errors.push('storyboard.prompt is required when storyboard is present');
  if (recipe.storyboard.filename && assetNames.has(recipe.storyboard.filename)) {
    errors.push(`storyboard filename must not duplicate assets[] filename: ${recipe.storyboard.filename}`);
  }
}

for (const asset of recipe.assets || []) {
  for (const dependency of asset.dependsOnAssets || []) {
    if (!assetNames.has(dependency)) errors.push(`Asset ${asset.filename || '?'} depends on missing asset: ${dependency}`);
  }
}

if (recipe.layout?.sections) {
  for (const item of recipe.layout.sections) {
    if (item.type === 'step') {
      const id = item.step;
      if (!id) errors.push('layout step section is missing step');
      if (!stepIds.has(id)) errors.push(`layout references missing step: ${id}`);
    }
    if (item.type === 'parallel') {
      if (item.label && /covered\s+time/i.test(item.label)) errors.push('parallel sections should not use generic labels like "Covered time"');
      if (item.summary) errors.push('parallel sections should not include summary prose; keep the relationship clear through the step cards');
      if (item.converge?.label) errors.push('parallel converge should use targetStep only, not a user-facing label');
      if (!Array.isArray(item.lanes) || !item.lanes.length) errors.push(`parallel section ${item.label || '?'} needs lanes`);
      for (const lane of item.lanes || []) {
        if (!lane.label) errors.push(`parallel section ${item.label || '?'} has a lane without label`);
        for (const id of lane.steps || []) {
          if (!stepIds.has(id)) errors.push(`parallel layout references missing step: ${id}`);
        }
      }
      const target = item.converge?.targetStep;
      if (target && !stepIds.has(target)) errors.push(`parallel converge references missing step: ${target}`);
    }
  }
}

if (errors.length) {
  console.error(`Validation failed for ${recipePath}:`);
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}
console.log(`OK: ${recipe.title} (${recipe.id})`);
