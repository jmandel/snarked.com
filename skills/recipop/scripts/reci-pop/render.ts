#!/usr/bin/env bun
import path from 'node:path';
import fsp from 'node:fs/promises';
import { configureRunFromArgs, parseArgs, requireRecipePath, readJson, outDirFor, ensureDir, relFromRoot } from './lib/utils.ts';
import { renderRecipeHtml } from './lib/render-html.ts';

const args = parseArgs();
configureRunFromArgs(args);
const recipePath = requireRecipePath(args);
const recipe = await readJson(recipePath);
const outDir = outDirFor(recipe, args.out || 'dist');
await ensureDir(path.join(outDir, 'assets'));
const html = renderRecipeHtml(recipe, { outBase: args.out || 'dist' });
const htmlPath = path.join(outDir, 'index.html');
await fsp.writeFile(htmlPath, html, 'utf8');
console.log(`Wrote ${relFromRoot(htmlPath)}`);
