#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import path from 'node:path';
import { listRecipeFiles, ROOT } from './lib/utils.ts';

const recipes = await listRecipeFiles('recipes');
if (!recipes.length) {
  console.log('No recipe JSON files found. Expected recipes/<recipe-id>/recipe.json or recipes/*.recipe.json.');
  process.exit(0);
}

for (const recipe of recipes) {
  console.log(`\n=== ${recipe} ===`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(import.meta.dir, 'build.ts'), recipe], { cwd: ROOT, stdio: 'inherit' });
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${recipe} failed`)));
  });
}
