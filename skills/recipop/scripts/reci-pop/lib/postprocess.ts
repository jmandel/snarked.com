import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export function isPostprocessableImage(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function postprocessEnabled(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return !['0', 'false', 'no', 'n', 'off'].includes(String(value).toLowerCase());
}

export async function postprocessImage(filePath, options = {}) {
  const enabled = options.enabled ?? true;
  if (!enabled) return { status: 'disabled' };
  if (!isPostprocessableImage(filePath)) return { status: 'skipped', reason: 'unsupported extension' };
  if (!fs.existsSync(filePath)) throw new Error(`Image not found for postprocess: ${filePath}`);

  const magickBin = options.magickBin || process.env.MAGICK_BIN || 'magick';
  const fuzz = options.fuzz || process.env.RECIPOP_TRIM_FUZZ || '3%';
  const ext = path.extname(filePath);
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath, ext)}.postprocess-${process.pid}-${Date.now()}${ext}`
  );

  const before = await fsp.stat(filePath);
  const result = spawnSync(magickBin, [filePath, '-fuzz', fuzz, '-trim', '+repage', tempPath], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    await fsp.rm(tempPath, { force: true });
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`ImageMagick postprocess failed for ${filePath}${detail ? `:\n${detail}` : ''}`);
  }

  const after = await fsp.stat(tempPath);
  if (after.size < 1024) {
    await fsp.rm(tempPath, { force: true });
    throw new Error(`ImageMagick postprocess produced an unexpectedly small file for ${filePath}`);
  }

  await fsp.rename(tempPath, filePath);
  return {
    status: 'trimmed',
    method: 'imagemagick-trim',
    fuzz,
    beforeBytes: before.size,
    afterBytes: after.size
  };
}
