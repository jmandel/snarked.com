#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseArgs, requireRecipePath, ROOT } from './lib/utils.ts';

const args = parseArgs();
const recipePath = requireRecipePath(args);
const extra = process.argv.slice(3).filter(a => a !== recipePath && !a.startsWith('--recipe='));

function run(script, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(import.meta.dir, script), recipePath, ...scriptArgs], { cwd: ROOT, stdio: 'inherit' });
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)));
  });
}

await run('validate.ts');
await run('plan-assets.ts');
await run('generate-images.ts', extra);
await run('render.ts');
