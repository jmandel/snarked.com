import path from 'node:path';
import { escapeHtml, exists, getStepMap, outDirFor } from './utils.ts';
import { activeStyle } from './prompt.ts';

function phaseClass(phase = '') {
  const p = String(phase).toLowerCase();
  if (['spice', 'dry', 'mix'].includes(p)) return 'phase-blue';
  if (['prep', 'fresh', 'wet'].includes(p)) return 'phase-green';
  if (['combine', 'assemble'].includes(p)) return 'phase-purple';
  if (['cook', 'saute', 'sauté'].includes(p)) return 'phase-green';
  if (['bake', 'roast', 'heat'].includes(p)) return 'phase-orange';
  if (['finish', 'serve', 'cool', 'rest'].includes(p)) return 'phase-gold';
  return 'phase-neutral';
}

function assetByFilename(recipe, filename) {
  return (recipe.assets || []).find(a => a.filename === filename) || null;
}

function renderFigure(recipe, filename, caption = '', extraClass = '', ctx = {}) {
  if (!filename) return '';
  const outDir = outDirFor(recipe, ctx.outBase || 'dist');
  const asset = assetByFilename(recipe, filename) || {};
  const alt = asset.alt || caption || filename.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '');
  const assetPath = path.join(outDir, 'assets', filename);
  if (exists(assetPath)) {
    return `<figure class="art-slot ${extraClass}" data-asset="${escapeHtml(filename)}"><img src="assets/${escapeHtml(filename)}" alt="${escapeHtml(alt)}"></figure>`;
  }
  return `<figure class="art-slot ${extraClass}" data-asset="${escapeHtml(filename)}"><div class="art-placeholder"><strong>${escapeHtml(filename)}</strong><span>${escapeHtml(caption || alt)}</span></div></figure>`;
}

function renderIngredients(rows = []) {
  if (!rows.length) return '';
  const trs = rows.map(row => {
    const qty = typeof row === 'string' ? '' : (row.qty ?? row.quantity ?? '');
    const metric = typeof row === 'string' ? '' : (row.amounts?.metric ?? '');
    const item = typeof row === 'string' ? row : (row.item ?? row.ingredient ?? '');
    const note = typeof row === 'string' ? '' : (row.note ? ` <span class="ingredient-note">${escapeHtml(row.note)}</span>` : '');
    const qtyHtml = metric
      ? `<span data-unit-value="original">${escapeHtml(qty)}</span><span data-unit-value="metric">${escapeHtml(metric)}</span>`
      : `<span>${escapeHtml(qty)}</span>`;
    return `<tr><td>${qtyHtml}</td><td>${escapeHtml(item)}${note}</td></tr>`;
  }).join('');
  return `<table class="ingredients"><tbody>${trs}</tbody></table>`;
}

function hasMetricUnits(recipe) {
  return (recipe.steps || []).some(step => (step.ingredients || []).some(row => row?.amounts?.metric));
}

function renderUnitToggle(recipe) {
  if (!hasMetricUnits(recipe)) return '';
  const systems = recipe.unitSystems?.length ? recipe.unitSystems : [
    { id: 'original', label: 'Original' },
    { id: 'metric', label: 'Metric' }
  ];
  const buttons = systems.map(system => {
    const id = escapeHtml(system.id);
    return `<button type="button" data-unit-choice="${id}">${escapeHtml(system.label || system.id)}</button>`;
  }).join('');
  return `<div class="unit-toggle" aria-label="Ingredient units">${buttons}</div>`;
}

function renderNotes(notes = []) {
  if (!notes.length) return '';
  return notes.map(note => `<p class="note">${escapeHtml(note)}</p>`).join('');
}

function renderStepCard(recipe, step, compact = false, ctx = {}) {
  const cls = `step-card ${phaseClass(step.phase)}${compact ? ' compact' : ''}`;
  return `<article class="${cls}" data-step="${escapeHtml(step.id)}">
    <div class="step-inner">
      <div class="step-copy">
        <header class="step-header">
          <span class="step-number">${escapeHtml(step.number ?? '')}</span>
          <h2 class="step-title">${escapeHtml(step.title || '')}</h2>
        </header>
        ${step.instruction ? `<p class="instruction">${escapeHtml(step.instruction)}</p>` : ''}
        ${renderIngredients(step.ingredients || [])}
        ${step.method ? `<p class="method">${escapeHtml(step.method)}</p>` : ''}
        ${renderNotes(step.notes || [])}
      </div>
      ${renderFigure(recipe, step.asset, step.assetCaption || step.title || '', '', ctx)}
    </div>
  </article>`;
}

function renderStepRow(recipe, step, ctx = {}) {
  return `<div class="step-row">
    ${renderTimeMark(step.timeLabel)}
    ${renderStepCard(recipe, step, false, ctx)}
  </div>`;
}

function renderTimeMark(label = '') {
  return label ? `<div class="time-mark">${escapeHtml(label)}</div>` : '';
}

function renderParallelModule(recipe, section, stepMap, ctx = {}) {
  const lanes = section.lanes || [];
  const renderedLanes = lanes.map(lane => {
    const cards = (lane.steps || []).map(stepId => {
      const step = stepMap.get(stepId);
      return step ? renderStepCard(recipe, step, true, ctx) : '';
    }).join('\n');
    return `<div class="parallel-lane">${cards}</div>`;
  }).join('\n');

  return `<div class="step-row parallel-row">
    ${renderTimeMark(section.timeLabel)}
    <section class="parallel-module" aria-label="Parallel cooking tasks">
      <div class="parallel-lanes" style="--lane-count: ${Math.max(1, lanes.length)}">${renderedLanes}</div>
    </section>
  </div>`;
}

function renderProcess(recipe, ctx = {}) {
  const stepMap = getStepMap(recipe);
  const sections = recipe.layout?.sections;
  if (!Array.isArray(sections)) {
    throw new Error('Recipe is missing layout.sections. The layout model is the source of truth for rendered process order.');
  }
  return sections.map(item => {
    if (item.type === 'parallel') return renderParallelModule(recipe, item, stepMap, ctx);
    const step = stepMap.get(item.step);
    return step ? renderStepRow(recipe, step, ctx) : '';
  }).join('\n');
}

function renderFacts(facts = []) {
  if (!facts.length) return '';
  const items = facts
    .filter(fact => fact?.label && fact?.value)
    .map(fact => `<li class="fact"><span class="fact-label">${escapeHtml(fact.label)}</span><span class="fact-value">${escapeHtml(fact.value)}</span></li>`)
    .join('\n');
  return items ? `<ul class="facts" aria-label="Quick facts">${items}</ul>` : '';
}

function renderHeader(recipe, ctx = {}) {
  const source = recipe.source || {};
  const metaParts = [];
  if (source.submittedBy || source.author) metaParts.push(`Submitted by: ${source.submittedBy || source.author}`);
  if (source.date) metaParts.push(`Date: ${source.date}`);
  if (source.credit) metaParts.push(source.credit);
  const heroes = recipe.heroAssets || [];
  return `<header class="recipe-header">
    <div class="title-block">
      <h1>${escapeHtml(recipe.title || 'Recipe')}</h1>
      ${recipe.subtitle ? `<p class="subtitle">${escapeHtml(recipe.subtitle)}</p>` : ''}
      ${metaParts.length ? `<p class="meta">${metaParts.map(escapeHtml).join(' <span aria-hidden="true">|</span> ')}</p>` : ''}
    </div>
    ${heroes.length ? `<div class="hero-grid">${heroes.map(filename => renderFigure(recipe, filename, 'header illustration', 'hero-art', ctx)).join('\n')}</div>` : ''}
  </header>`;
}

function sanitizeCssValue(value) {
  return String(value ?? '').replace(/[;{}]/g, '').trim();
}

function themeCssVars(recipe) {
  const theme = activeStyle(recipe).htmlTheme || {};
  const vars = theme.cssVars || {};
  return Object.entries(vars)
    .filter(([key, value]) => /^--[a-z0-9-]+$/i.test(key) && value !== undefined && value !== null)
    .map(([key, value]) => `      ${key}: ${sanitizeCssValue(value)};`)
    .join('\n');
}

export function renderRecipeHtml(recipe, opts = {}) {
  const extraCssVars = themeCssVars(recipe);
  const css = `
    :root {
      --ink: #10213a;
      --muted: #5f6b7a;
      --line: #c7d2df;
      --page: #fbfaf7;
      --surface: #ffffff;
      --blue: #1e8bd0;
      --green: #4f9f45;
      --purple: #7c63bf;
      --orange: #f47b20;
      --gold: #f3a51d;
      --rail: #16365c;
      --radius: 16px;
      --border: 1.5px solid var(--line);
      --shadow: 0 1px 2px rgba(16, 33, 58, 0.06);
      --gap: clamp(12px, 2.5vw, 20px);
      --pad: clamp(14px, 3vw, 24px);
      --measure: 920px;
${extraCssVars}
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--page); color: var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.42; }
    .recipe { width: min(100%, var(--measure)); margin: 0 auto; padding: clamp(14px, 3vw, 30px); }
    .recipe-header { display: grid; grid-template-columns: 1fr; gap: var(--gap); align-items: center; margin-bottom: var(--gap); min-width: 0; }
    .title-block { min-width: 0; }
    h1 { margin: 0; font-size: clamp(2rem, 9vw, 4.4rem); line-height: 0.96; letter-spacing: 0; color: var(--ink); text-wrap: balance; }
    .subtitle { margin: 8px 0 0; color: var(--muted); font-weight: 650; overflow-wrap: anywhere; }
    .meta { margin: 10px 0 0; color: var(--muted); font-size: clamp(0.85rem, 2.5vw, 1rem); overflow-wrap: anywhere; }
    .hero-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    .hero-art img { max-height: none; background: #fff; }
    .facts { display: flex; flex-wrap: wrap; gap: 8px 18px; list-style: none; margin: 0 0 clamp(18px, 4vw, 30px); padding: 12px 0 0; border-top: 1px solid color-mix(in srgb, var(--line), transparent 20%); }
    .fact { display: inline-flex; align-items: baseline; gap: 6px; color: var(--muted); font-weight: 700; }
    .fact-label { color: var(--muted); font-size: 0.75rem; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; }
    .fact-label::after { content: ":"; }
    .fact-value { color: var(--ink); font-size: 0.95rem; font-weight: 800; }
    .timeline { position: relative; }
    .step-row { display: block; margin-bottom: var(--gap); }
    .time-mark { margin: 0 0 6px; color: var(--rail); font-weight: 900; font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .step-card { border: var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow); padding: var(--pad); }
    .phase-blue { border-color: color-mix(in srgb, var(--blue), white 45%); }
    .phase-green { border-color: color-mix(in srgb, var(--green), white 45%); }
    .phase-purple { border-color: color-mix(in srgb, var(--purple), white 45%); }
    .phase-orange { border-color: color-mix(in srgb, var(--orange), white 35%); }
    .phase-gold { border-color: color-mix(in srgb, var(--gold), white 35%); }
    .step-inner { display: grid; gap: var(--gap); }
    .step-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
    .step-number { display: inline-grid; place-items: center; flex: 0 0 auto; width: 2rem; height: 2rem; border-radius: 50%; color: #fff; background: var(--green); font-weight: 900; }
    .phase-blue .step-number { background: var(--blue); }
    .phase-purple .step-number { background: var(--purple); }
    .phase-orange .step-number { background: var(--orange); }
    .phase-gold .step-number { background: var(--gold); color: var(--ink); }
    .step-title { margin: 0; font-size: clamp(1rem, 4vw, 1.38rem); line-height: 1.08; letter-spacing: 0; text-transform: uppercase; }
    .instruction, .method { margin: 0 0 10px; color: var(--ink); font-weight: 560; }
    .ingredients { width: 100%; table-layout: auto; border-collapse: separate; border-spacing: 0; margin: 8px 0 10px; overflow: hidden; border: 1px solid #dfe7ef; border-radius: 10px; font-size: clamp(0.84rem, 2.7vw, 0.98rem); background: #fff; }
    .ingredients td { padding: 6px 9px; border-bottom: 1px solid #edf1f5; vertical-align: top; }
    .ingredients tr:last-child td { border-bottom: 0; }
    .ingredients td:first-child { width: 1%; min-width: 0; padding-right: 8px; color: var(--ink); font-weight: 850; white-space: nowrap; }
    [data-units="original"] [data-unit-value="metric"], [data-units="metric"] [data-unit-value="original"] { display: none; }
    .unit-toggle { display: inline-flex; gap: 4px; margin: 0 0 var(--gap); padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); }
    .unit-toggle button { appearance: none; border: 0; border-radius: 999px; background: transparent; color: var(--muted); padding: 6px 10px; font: 750 0.78rem/1 system-ui, sans-serif; cursor: pointer; }
    [data-units="original"] .unit-toggle [data-unit-choice="original"], [data-units="metric"] .unit-toggle [data-unit-choice="metric"] { background: var(--ink); color: #fff; }
    .ingredient-note { color: var(--muted); }
    .note { margin: 10px 0 0; padding: 10px 12px; border: 1px solid #dce9d7; border-radius: 12px; background: #f7fcf5; color: #254823; font-size: 0.92rem; font-weight: 650; }
    .phase-orange .note, .phase-gold .note { border-color: #f2d39a; background: #fff9eb; color: #56340c; }
    .art-slot { margin: 0; min-width: 0; }
    .art-slot img { display: block; width: 100%; height: auto; max-height: 240px; object-fit: contain; filter: drop-shadow(0 6px 10px rgba(16, 33, 58, 0.10)); }
    .art-placeholder { display: grid; place-items: center; min-height: 118px; padding: 12px; border: 1px dashed #b8c5d4; border-radius: 12px; background: #fff; color: var(--muted); text-align: center; font-size: 0.78rem; overflow-wrap: anywhere; }
    .art-placeholder strong { display: block; color: var(--ink); font-size: 0.83rem; margin-bottom: 4px; }
    .parallel-module { min-width: 0; overflow: hidden; }
    .parallel-lanes { display: grid; grid-template-columns: 1fr; gap: var(--gap); align-items: stretch; }
    .parallel-lane { min-width: 0; display: grid; grid-auto-rows: 1fr; gap: 10px; }
    .step-card.compact { padding: 12px; box-shadow: none; }
    .step-card.compact .step-inner { grid-template-columns: 1fr; }
    .step-card.compact .art-slot img, .step-card.compact .art-placeholder { max-height: 140px; min-height: 90px; }
    .tip { margin-top: var(--gap); padding: 14px 16px; border: var(--border); border-color: #f2d39a; border-radius: var(--radius); background: #fffaf0; font-weight: 650; }
    @media (min-width: 620px) { .hero-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(14px, 2vw, 22px); } .step-inner { grid-template-columns: minmax(0, 1.15fr) minmax(150px, 0.85fr); align-items: center; } .art-placeholder { min-height: 150px; } }
    @media (min-width: 860px) { .recipe-header { gap: clamp(16px, 3vw, 28px); } .step-inner { grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr); } .parallel-lanes { grid-template-columns: repeat(var(--lane-count, 2), minmax(0, 1fr)); } }
    @media (max-width: 640px) { .recipe { padding: 10px; } .facts { margin-bottom: 14px; padding-top: 10px; } .parallel-lanes { display: block; } .parallel-lane + .parallel-lane { margin-top: 12px; } .step-card, .step-card.compact { padding: 10px; border-radius: 12px; } .step-inner, .step-card.compact .step-inner { grid-template-columns: 1fr; gap: 10px; } .art-slot img, .step-card.compact .art-slot img { max-height: 180px; } .hero-art img { max-height: none; } }
  `;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(recipe.title || 'Recipe')} — Reci-pop</title>
  <style>${css}</style>
</head>
<body data-units="${escapeHtml(recipe.defaultUnitSystem || 'original')}">
  <main class="recipe">
    ${renderHeader(recipe, opts)}
    ${renderFacts(recipe.quickFacts || [])}
    ${renderUnitToggle(recipe)}
    <section class="timeline" aria-label="Recipe timeline">
      ${renderProcess(recipe, opts)}
    </section>
    ${recipe.footerTip ? `<p class="tip">${escapeHtml(recipe.footerTip)}</p>` : ''}
  </main>
  <script>
  (() => {
    const key = 'recipop.units';
    const fallback = document.body.dataset.units || 'original';
    const saved = localStorage.getItem(key);
    const set = (mode) => {
      document.body.dataset.units = mode || fallback;
      localStorage.setItem(key, document.body.dataset.units);
    };
    set(saved || fallback);
    for (const button of document.querySelectorAll('[data-unit-choice]')) {
      button.addEventListener('click', () => set(button.dataset.unitChoice));
    }
  })();
  </script>
</body>
</html>`;
}
