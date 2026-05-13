import fsp from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, sleep } from './utils.ts';

export function openRouterHeaders() {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
    'Content-Type': 'application/json'
  };
  if (process.env.OPENROUTER_HTTP_REFERER) headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
  if (process.env.OPENROUTER_APP_TITLE) headers['X-Title'] = process.env.OPENROUTER_APP_TITLE;
  return headers;
}

function findDataUrl(value) {
  if (!value) return null;
  if (typeof value === 'string' && value.startsWith('data:image/')) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDataUrl(item);
      if (found) return found;
    }
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const found = findDataUrl(value[key]);
      if (found) return found;
    }
  }
  return null;
}

function findHttpImageUrl(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^https?:\/\//.test(value) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHttpImageUrl(item);
      if (found) return found;
    }
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const found = findHttpImageUrl(value[key]);
      if (found) return found;
    }
  }
  return null;
}

export function extractImageUrl(result) {
  const message = result?.choices?.[0]?.message;
  const direct = message?.images?.[0]?.image_url?.url || message?.images?.[0]?.imageUrl?.url;
  if (direct) return direct;
  return findDataUrl(result) || findHttpImageUrl(result);
}

export async function saveImageUrl(imageUrl, outPath) {
  await ensureDir(path.dirname(outPath));

  if (imageUrl.startsWith('data:image/')) {
    const comma = imageUrl.indexOf(',');
    if (comma < 0) throw new Error('Malformed data URL returned by image model.');
    const b64 = imageUrl.slice(comma + 1);
    await fsp.writeFile(outPath, Buffer.from(b64, 'base64'));
    return;
  }

  if (/^https?:\/\//.test(imageUrl)) {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Could not download generated image URL: ${res.status} ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    await fsp.writeFile(outPath, Buffer.from(arrayBuffer));
    return;
  }

  throw new Error('Unsupported image URL returned by model.');
}

export async function generateImageViaOpenRouter({ content, asset, recipe }) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key.');
  }

  const model = asset.model || recipe.imageGeneration?.model || process.env.OPENROUTER_IMAGE_MODEL || 'openai/gpt-5.4-image-2';
  const aspectRatio = asset.aspectRatio || recipe.imageGeneration?.defaultAspectRatio || process.env.IMAGE_ASPECT_RATIO || '4:3';
  const imageSize = asset.imageSize || recipe.imageGeneration?.imageSize || process.env.IMAGE_SIZE || '1K';

  const payload = {
    model,
    messages: [{ role: 'user', content }],
    modalities: ['image', 'text'],
    stream: false,
    max_tokens: Number(process.env.OPENROUTER_MAX_TOKENS || 2048),
    image_config: {
      aspect_ratio: aspectRatio,
      image_size: imageSize
    }
  };

  const retries = Number(process.env.OPENROUTER_RETRIES || 2);
  const retryDelay = Number(process.env.OPENROUTER_RETRY_DELAY_MS || 1500);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: openRouterHeaders(),
        body: JSON.stringify(payload)
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`OpenRouter returned non-JSON response (${res.status}): ${text.slice(0, 500)}`);
      }

      if (!res.ok) {
        throw new Error(`OpenRouter error ${res.status}: ${JSON.stringify(json).slice(0, 1200)}`);
      }

      const imageUrl = extractImageUrl(json);
      if (!imageUrl) {
        throw new Error(`No generated image found in response. Response started: ${JSON.stringify(json).slice(0, 1200)}`);
      }
      return { imageUrl, response: json, model, aspectRatio, imageSize };
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(retryDelay * (attempt + 1));
    }
  }

  throw lastError;
}
