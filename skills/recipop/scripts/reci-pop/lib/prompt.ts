import path from 'node:path';
import fs from 'node:fs';
import { ROOT, exists, fileToDataUrl, recipeSourceDir, resolveReferencePath, storyboardOutPath, styleRootDirs } from './utils.ts';

const DEFAULT_STYLE_PACK = {
  id: 'default',
  description: 'Clear food/process illustration.',
  constraints: [],
  negative: ''
};

export function activeStyle(recipe) {
  let active = null;
  let stylePack = null;

  if (typeof recipe.style === 'string') {
    active = recipe.style;
    const sourceDir = recipeSourceDir(recipe) || ROOT;
    const styleLooksLikePath = active.includes('/') || active.includes('\\') || active.endsWith('.json');
    const styleCandidates = styleLooksLikePath
      ? [path.resolve(sourceDir, active)]
      : styleRootDirs().map((root) => path.join(root, active));
    const styleFile = styleCandidates
      .map((candidate) => candidate.endsWith('.json') ? candidate : path.join(candidate, 'style.json'))
      .find((candidate) => fs.existsSync(candidate));
    if (styleFile) {
      const styleDir = path.dirname(styleFile);
      stylePack = JSON.parse(fs.readFileSync(styleFile, 'utf8'));
      stylePack.oneShotExamples = (stylePack.oneShotExamples || []).map((ref) => ({
        ...ref,
        path: ref.path && !path.isAbsolute(ref.path)
          ? path.relative(ROOT, path.resolve(styleDir, ref.path)).replaceAll(path.sep, '/')
          : ref.path
      }));
    }
  } else if (recipe.style && typeof recipe.style === 'object') {
    stylePack = recipe.style;
    active = stylePack.id || 'inline';
  }

  return {
    ...DEFAULT_STYLE_PACK,
    ...(stylePack || {}),
    id: stylePack?.id || active || DEFAULT_STYLE_PACK.id
  };
}

export function styleReferenceSummary(recipe) {
  const style = activeStyle(recipe);
  const refs = style.oneShotExamples || [];
  if (!refs.length) {
    return style.referenceSummary || 'No reference image is required for this style pack.';
  }
  return refs.map((ref, i) => {
    const description = String(ref.description || ref.path || 'Reci-pop reference image').replace(/[.。]+$/g, '');
    return `One-shot style example ${i + 1}: ${description}`;
  }).join('\n');
}

function stylePackText(recipe) {
  const style = activeStyle(recipe);
  const lines = [
    `Style pack: ${style.id}`,
    style.description,
    style.medium ? `Medium: ${style.medium}` : '',
    style.palette ? `Palette: ${style.palette}` : '',
    style.composition ? `Composition: ${style.composition}` : '',
    style.lighting ? `Lighting: ${style.lighting}` : '',
    style.rendering ? `Rendering: ${style.rendering}` : '',
    style.texture ? `Texture: ${style.texture}` : '',
    ...(style.constraints || []).map((item) => `- ${item}`)
  ].filter(Boolean);
  return lines.join('\n');
}

function bulletList(items = []) {
  return items.filter(Boolean).map((item) => `- ${item}`).join('\n');
}

function namedList(items = []) {
  return items
    .filter(Boolean)
    .map((item) => {
      if (typeof item === 'string') return `- ${item}`;
      const name = item.name || item.label || item.id || item.item || 'item';
      const description = item.description || item.detail || item.state || item.notes || '';
      return `- ${name}${description ? `: ${description}` : ''}`;
    })
    .join('\n');
}

function xmlSafe(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function ingredientLine(row = {}) {
  const qty = row.qty || row.quantity || '';
  const item = row.item || row.ingredient || '';
  const metric = row.amounts?.metric ? ` (${row.amounts.metric})` : '';
  const note = row.note ? ` — ${row.note}` : '';
  return `  - ${[qty, item].filter(Boolean).join(' ')}${metric}${note}`.trimEnd();
}

export function recipeContextMarkdown(recipe) {
  const lines = [
    `# ${recipe.title || 'Recipe'}`,
    recipe.subtitle ? recipe.subtitle : '',
    ''
  ];
  const facts = recipe.quickFacts || [];
  if (facts.length) {
    lines.push('## Quick facts');
    for (const fact of facts) {
      if (fact.label && fact.value) lines.push(`- ${fact.label}: ${fact.value}`);
    }
    lines.push('');
  }
  if (recipe.layout?.sections?.length) {
    lines.push('## Process layout');
    for (const section of recipe.layout.sections) {
      if (section.type === 'step') {
        lines.push(`- Step: ${section.step}`);
      } else if (section.type === 'parallel') {
        lines.push('- Covered-time group');
        for (const lane of section.lanes || []) {
          lines.push(`  - Steps: ${(lane.steps || []).join(', ')}`);
        }
      }
    }
    lines.push('');
  }
  lines.push('## Steps');
  for (const step of recipe.steps || []) {
    const timing = [
      step.timeLabel,
      step.duration?.activeLabel,
      step.duration?.passiveLabel ? `wait ${step.duration.passiveLabel}` : ''
    ].filter(Boolean).join(' · ');
    lines.push(`### ${step.number ? `${step.number}. ` : ''}${step.title || step.id}`);
    if (timing) lines.push(`Timing: ${timing}`);
    if (step.resources?.length) lines.push(`Station/tools: ${step.resources.join(', ')}`);
    if (step.instruction) lines.push(step.instruction);
    if (step.ingredients?.length) {
      lines.push('Uses:');
      for (const row of step.ingredients) lines.push(ingredientLine(row));
    }
    if (step.makes?.length) lines.push(`Makes: ${step.makes.map((item) => item.item).filter(Boolean).join(', ')}`);
    if (step.notes?.length) {
      lines.push('Notes:');
      for (const note of step.notes) lines.push(`- ${note}`);
    }
    lines.push('');
  }
  return lines.filter((line, index, arr) => line !== '' || arr[index - 1] !== '').join('\n').trim();
}

function recipeContextBlock(recipe) {
  return `<recipe_context_markdown>\n${xmlSafe(recipeContextMarkdown(recipe))}\n</recipe_context_markdown>`;
}

export function storyboardForRecipe(recipe) {
  if (!recipe.storyboard) return null;
  const filename = recipe.storyboard.filename || `storyboard-${recipe.id || 'recipe'}.png`;
  return {
    ...recipe.storyboard,
    filename,
    alt: recipe.storyboard.alt || `${recipe.title} visual continuity storyboard`,
    aspectRatio: recipe.storyboard.aspectRatio || '16:9',
    placement: recipe.storyboard.placement || 'Continuity storyboard'
  };
}

export function storyboardSummary(recipe) {
  const storyboard = storyboardForRecipe(recipe);
  if (!storyboard) return '';
  const lines = [
    `Continuity storyboard asset: ${storyboard.filename}`,
    storyboard.intent ? `Intent: ${storyboard.intent}` : '',
    storyboard.camera ? `Camera and angle: ${storyboard.camera}` : '',
    storyboard.cookware?.length ? `Cookware/tools to preserve:\n${namedList(storyboard.cookware)}` : '',
    storyboard.inventory?.length ? `Recipe visual inventory:\n${namedList(storyboard.inventory)}` : '',
    storyboard.stateMap?.length ? `Repeated food states:\n${namedList(storyboard.stateMap)}` : '',
    storyboard.continuityRules?.length ? `Continuity rules:\n${bulletList(storyboard.continuityRules)}` : ''
  ].filter(Boolean);
  return lines.join('\n');
}

export function buildStoryboardPrompt(recipe) {
  const storyboard = storyboardForRecipe(recipe);
  if (!storyboard) return '';
  const style = activeStyle(recipe);
  const negative = storyboard.negative || style.negative || DEFAULT_STYLE_PACK.negative;
  const defaultPrompt = [
    'Create one coherent unlabeled visual continuity board on a clean white paper background.',
    'Show the recipe elements that need to stay consistent across later images: main ingredients, cookware, tools, intermediate food states, and final serving.',
    'Arrange those elements as a natural hand-painted still life or inventory board with a shared camera angle and lighting, not as separate finished step illustrations.',
    'This is not a contact sheet, thumbnail grid, storyboard comic, timeline, flowchart, UI layout, or collection of all final assets.',
    'Do not draw labels, text, arrows, numbers, captions, frames, panels, or card borders.'
  ].join(' ');
  const lines = [
    'Generate one visual continuity board for a recipe image set.',
    '',
    `Recipe context: ${recipe.title}${recipe.subtitle ? ` — ${recipe.subtitle}` : ''}`,
    `Target image: ${storyboard.alt}`,
    `Used as: ${storyboard.placement}`,
    `Aspect ratio: ${storyboard.aspectRatio}`,
    '',
    'STYLE PACK',
    stylePackText(recipe),
    '',
    'STYLE REFERENCES',
    styleReferenceSummary(recipe),
    '',
    'FULL RECIPE CONTEXT',
    recipeContextBlock(recipe),
    '',
    'STORYBOARD PURPOSE',
    storyboard.intent || 'Create a single white-background reference board that establishes repeated ingredients, cooked states, cookware, camera angle, palette, and lighting for all later recipe assets.',
    '',
    storyboard.camera ? `CAMERA AND ANGLE\n${storyboard.camera}` : '',
    storyboard.cookware?.length ? `COOKWARE AND TOOLS\n${namedList(storyboard.cookware)}` : '',
    storyboard.inventory?.length ? `VISUAL INVENTORY\n${namedList(storyboard.inventory)}` : '',
    storyboard.stateMap?.length ? `STATE CONTINUITY\n${namedList(storyboard.stateMap)}` : '',
    storyboard.sequenceNotes?.length ? `PROCESS SEQUENCE NOTES\n${bulletList(storyboard.sequenceNotes)}` : '',
    storyboard.continuityRules?.length ? `CONTINUITY RULES\n${bulletList(storyboard.continuityRules)}` : '',
    '',
    'IMAGE CONTENT',
    [defaultPrompt, storyboard.prompt].filter(Boolean).join('\n\nRecipe-specific content:\n'),
    negative ? `\nNEGATIVE PROMPT\n${negative}` : ''
  ].filter(Boolean);
  return `${lines.join('\n')}\n`;
}

export function buildAssetPrompt(recipe, asset) {
  const style = activeStyle(recipe);
  const negative = asset.negative || style.negative || DEFAULT_STYLE_PACK.negative;
  const assetPrompt = asset.prompt || asset.description || asset.alt || asset.filename;
  const storyboard = storyboardSummary(recipe);
  const dependencies = (asset.dependsOnAssets || []).length
    ? `\nVISUAL CONTINUITY\nThis asset should stay visually consistent with earlier generated assets: ${asset.dependsOnAssets.join(', ')}. Repeated ingredients, tools, food states, colors, and plating should feel like the same recipe world unless the prompt explicitly changes them.\n`
    : '';

  return `Generate one standalone recipe illustration.\n\nRecipe context: ${recipe.title}${recipe.subtitle ? ` — ${recipe.subtitle}` : ''}\nTarget image: ${asset.alt || asset.filename}\nUsed as: ${asset.placement || 'recipe step image'}\nAspect ratio: ${asset.aspectRatio || recipe.imageGeneration?.defaultAspectRatio || '4:3'}\n\nSTYLE PACK\n${stylePackText(recipe)}\n\nSTYLE REFERENCES\n${styleReferenceSummary(recipe)}\n\nFULL RECIPE CONTEXT\n${recipeContextBlock(recipe)}${storyboard ? `\n\nRECIPE STORYBOARD\nUse the storyboard asset and rules as the primary continuity reference when available.\n${storyboard}` : ''}${dependencies}\n\nIMAGE CONTENT\n${assetPrompt}${negative ? `\n\nNEGATIVE PROMPT\n${negative}` : ''}\n`;
}

async function attachStyleReferences(content, recipe, opts = {}) {
  const maxRefs = Number(opts.maxReferenceImages || process.env.MAX_REFERENCE_IMAGES || 1);
  const style = activeStyle(recipe);
  const refs = style.oneShotExamples || [];
  let attached = 0;
  for (const ref of refs) {
    if (attached >= maxRefs) break;
    if (!ref.path) continue;
    const refPath = resolveReferencePath(ref.path);
    if (!exists(refPath)) continue;
    const dataUrl = await fileToDataUrl(refPath);
    // OpenAI-compatible raw API field. Some SDK docs use imageUrl; raw endpoint uses image_url.
    content.push({ type: 'image_url', image_url: { url: dataUrl } });
    attached += 1;
  }
}

export async function buildStoryboardMessageContent(recipe, opts = {}) {
  const prompt = buildStoryboardPrompt(recipe);
  const content = [{ type: 'text', text: prompt }];
  const referenceMode = opts.referenceMode || recipe.imageGeneration?.referenceMode || process.env.REFERENCE_MODE || 'text';
  if (referenceMode !== 'image') return content;
  await attachStyleReferences(content, recipe, opts);
  return content;
}

export async function buildMessageContent(recipe, asset, opts = {}) {
  const prompt = buildAssetPrompt(recipe, asset);
  const content = [{ type: 'text', text: prompt }];
  const referenceMode = opts.referenceMode || recipe.imageGeneration?.referenceMode || process.env.REFERENCE_MODE || 'text';
  if (referenceMode !== 'image') return content;

  await attachStyleReferences(content, recipe, opts);
  const storyboard = storyboardForRecipe(recipe);
  if (storyboard && opts.outDir) {
    const candidate = storyboardOutPath(recipe, opts.base || opts.outBase || 'dist');
    const outDirCandidate = path.join(opts.outDir, 'assets', storyboard.filename);
    const storyboardPath = exists(outDirCandidate) ? outDirCandidate : candidate;
    if (exists(storyboardPath)) {
      content.push({ type: 'text', text: `Recipe continuity storyboard: ${storyboard.filename}. Match its cookware, camera angle, lighting, palette, and repeated food states unless the asset prompt explicitly changes them.` });
      content.push({ type: 'image_url', image_url: { url: await fileToDataUrl(storyboardPath) } });
    }
  }
  const dependencyLimit = Number(opts.maxDependencyImages || process.env.MAX_DEPENDENCY_IMAGES || 3);
  for (const filename of (asset.dependsOnAssets || []).slice(0, dependencyLimit)) {
    if (!opts.outDir) continue;
    const candidate = path.join(opts.outDir, 'assets', filename);
    if (!exists(candidate)) continue;
    content.push({ type: 'text', text: `Previously generated related asset: ${filename}. Preserve visual continuity for shared ingredients and tools.` });
    content.push({ type: 'image_url', image_url: { url: await fileToDataUrl(candidate) } });
  }
  return content;
}

export function assetsForRecipe(recipe) {
  const seen = new Set();
  const output = [];
  for (const asset of recipe.assets || []) {
    if (!asset.filename || seen.has(asset.filename)) continue;
    seen.add(asset.filename);
    output.push(asset);
  }
  return output;
}
