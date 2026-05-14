---
name: recipop
description: Create Reci-pop structured recipe pages: decompose recipes into mise en place, step-local quantities, metric/unit-toggle data, scaling-friendly ingredient rows, covered-time process layout, storyboard prompts, generated image assets, and static recipe HTML. Use whenever the user asks to convert a recipe into a structured cooking page, model recipe process flow, generate recipe illustrations, prepare recipe JSON/assets for a static site, or reason about prep ordering and covered cooking time.
---

# Reci-pop

Use this skill to turn a normal recipe into a portable Reci-pop artifact set: `recipe.md`, `recipe.json`, generated prompt files, storyboard/image assets, and optional rendered HTML. The skill defines the representation and workflow; the host repo decides where those files live. The bundled scripts accept explicit paths and only provide convenient defaults.

## Core Workflow

1. Read the whole recipe before writing JSON.
2. Decompose the cooking process into setup, mise en place, changed food states, true covered-time opportunities, waits, joins, and serving.
3. Author `recipe.json` with:
   - metadata, source, quick facts, and unit systems;
   - `style`, either a style id resolved through a style root or an inline style object;
   - `assetBasePath`, normally the renderer-visible local image directory such as `assets`;
   - `steps[]` with cook-facing instructions, step-local quantities, output states, timings, and assets;
   - `layout.sections` for top-to-bottom process order and rare covered-time groups;
   - `storyboard` and `assets[]` for image continuity and per-asset prompts.
4. Validate and plan assets:
   ```bash
   bun <skill-path>/scripts/reci-pop/validate.ts recipes/my-recipe/recipe.json --style-root=styles
   bun <skill-path>/scripts/reci-pop/plan-assets.ts recipes/my-recipe/recipe.json --style-root=styles
   ```
5. Generate or import image assets, postprocess them, then render:
   ```bash
   bun <skill-path>/scripts/reci-pop/run-native-agent.ts recipes/my-recipe/recipe.json --style-root=styles --clear
   bun <skill-path>/scripts/reci-pop/render.ts recipes/my-recipe/recipe.json --out=dist-review --style-root=styles
   ```

When `--out` is omitted for asset planning, generation, import, or postprocessing, outputs go beside the recipe JSON. This is the preferred static-site contract: one recipe folder contains the source, JSON, prompts, storyboard, and assets. Use `--out` only for temporary review builds.

## Fresh Task: Add a Recipe From a URL

When the user says "add recipe at <url>" in a repo that contains this skill, run the whole pipeline instead of stopping at JSON.

1. Inspect the host repo first:
   - Find the recipe convention. In this repo, use `recipes/<recipe-id>/recipe.md`, `recipes/<recipe-id>/recipe.json`, `recipes/<recipe-id>/assets/`, and `recipes/<recipe-id>/prompts/`.
   - Find the style root. In this repo, use `styles/` and the existing `styles/french-hen-folk-wave/style.json` plus `hen.png`; do not copy or inline that style into every recipe.
   - Find the static build command. In this repo, `bun run build` renders the site and creates responsive display images in `dist/` while preserving high-resolution PNG masters.
2. Retrieve the recipe source from the URL using the best available tool. Preserve the source URL and enough original text in `recipe.md` that a maintainer can audit the conversion later. If the page has commentary, keep the recipe-relevant headnote only when it affects cooking.
3. Choose a stable slug from the recipe title, then create:
   ```text
   recipes/<slug>/recipe.md
   recipes/<slug>/recipe.json
   recipes/<slug>/assets/
   ```
4. Write `recipe.md` with the host site's frontmatter fields (`title`, `shortname`, `blurb`, `submitter`, `date`, `photos`) and the original ingredients/instructions in clean Markdown.
5. Write `recipe.json` using this skill's representation:
   - `source.file` should usually be `"recipe.md"` and `source.url` should be the URL.
   - `assetBasePath` should usually be `"assets"`.
   - `style` should usually be `"french-hen-folk-wave"` unless the user asked for another style.
   - Prefer `defaultUnitSystem: "metric"` when good metric quantities are available.
   - Add `amounts.metric` for defensible gram conversions and leave unconvertible quantities alone.
   - Add scaling-friendly leading quantities, e.g. `240 g`, `1 1/2 c`, `remaining 2 T`.
   - Use `quantityKind` for quantity semantics. Relational component portions such as `half spice mixture`, `remaining half dough`, or `one third sauce` should be `quantityKind: "portion"` with no metric conversion; they scale through the component's source ingredients, not as an independent weight.
   - Add `group` on source ingredient rows when it helps the overview stay scannable: `Spices + seasoning`, `Produce`, `Protein`, `Dry goods`, `Liquids + fats`, `Dairy`, `Garnish`, or a similarly cook-facing group. Do not group intermediate components or relational portions for shopping.
   - Model setup and mise en place before active cooking; use `parallel` only for true covered-time simultaneity.
   - Include storyboard inventory/cookware/state continuity and one asset entry per hero or step image.
6. Validate and plan:
   ```bash
   bun skills/recipop/scripts/reci-pop/validate.ts recipes/<slug>/recipe.json --style-root=styles
   bun skills/recipop/scripts/reci-pop/plan-assets.ts recipes/<slug>/recipe.json --style-root=styles
   ```
7. Generate art with the native runner when native image generation is available:
   ```bash
   bun skills/recipop/scripts/reci-pop/run-native-agent.ts recipes/<slug>/recipe.json --style-root=styles --clear
   ```
   The runner uses a private `CODEX_HOME` and attaches style references. For manual correction work, call `view_image` on `styles/french-hen-folk-wave/hen.png`, the storyboard, and dependency images before generating.
8. Build and inspect:
   ```bash
   bun run build
   ```
   Open `dist/recipe/<slug>/index.html` or the local dev server page in Chromium. Check mobile width as well as desktop. Verify that step quantities, metric toggle, scaling control, parallel groups, full-resolution image links, and generated art all work.
9. Final audit before reporting done:
   - recipe JSON validates;
   - every listed storyboard/asset has a PNG and metadata file;
   - generated prompt files exist;
   - `bun run build` succeeds;
   - no obvious horizontal mobile overflow or missing images;
   - note any source ambiguities, conversion assumptions, or deliberate unconverted quantities.

## Artifact Contract

Recommended repo layout:

```text
recipes/
  my-recipe/
    recipe.md
    recipe.json
    image-plan.json
    prompts/
      storyboard-my-recipe.txt
      step-01-...
    assets/
      storyboard-my-recipe.png
      hero-my-recipe.png
      step-01-...
styles/
  french-hen-folk-wave/
    style.json
    hen.png
```

The recipe JSON should usually say:

```json
{
  "$schema": "https://snarked.com/schemas/recipop-recipe.schema.json",
  "id": "my-recipe",
  "title": "My Recipe",
  "source": {"file": "recipe.md"},
  "assetBasePath": "assets",
  "style": "french-hen-folk-wave"
}
```

`style: "french-hen-folk-wave"` is resolved as `<style-root>/french-hen-folk-wave/style.json`; pass `--style-root` if the host repo does not use `styles/`. If no host style is present, scripts can fall back to bundled examples in this skill's `styles/` folder. A recipe can also use `style` as an inline object for one-off experiments, but reusable styles should live in a style folder with reference images beside `style.json`.

Do not make renderers infer filenames from prose. Keep `assets[]` as the manifest of every expected image, with stable filenames such as `hero-kubideh.png`, `step-03-form-logs.png`, and `storyboard-kubideh.png`.

## Reading Recipes

The representation is only useful if the decomposition matches how a person cooks.

- Identify every meaningful changed state: drained onion, spice mixture, dough, wilted greens, browned chicken, rested batter, cooled cake.
- Put quantities where they are used. Each step should stand alone so a cook does not scroll back to a master ingredient list to complete the action.
- Preserve the logic of splits and divided components. If a step makes a component and later steps use `half`, `remaining half`, `a third`, or another relational portion, keep that portion relational with `quantityKind: "portion"` instead of inventing a gram amount. Only use a gram amount for the portion if the recipe explicitly gives the component yield or the split amount.
- Keep source ambiguity visible: `2-3 bananas`, `until golden`, `to taste`, `about 10 minutes`, source typos, and judgment calls should remain in step text or notes.
- Default to mise en place cooking. Do setup first, then prep, then cooking. If a tiny spice bowl, sauce, garnish, pan setup, oven preheat, or tool setup can be completed before active cooking starts, model it as a normal earlier step.
- Use parallel layout only for simultaneity, not mere nondependency. A second task belongs in a covered-time group only when the first task creates a real window: simmering mostly unattended, baking, chilling, resting, draining, cooling, reducing, or marinating.
- Do not invent a parent duration for a parallel group. The child steps already carry timing; a parent label like "5 min" is usually misleading when the covered step and the covered prep have their own start times and active/passive durations.
- Treat parallel layout as structure, not prose. Do not write generic parent labels, summaries, or convergence captions such as "Covered time", "prep lane", or "Return to the main sequence"; the adjacent step cards should make the relationship clear.
- Do not claim simultaneity while the cook is actively stirring, searing, whisking, forming, frying, or otherwise tied to the station. It is usually unrealistic to chop vegetables while also browning meat or forming kebabs.
- Create explicit convergence through the next real step. If a covered-time prep task feeds a later action, make that later full-width step concrete, e.g. "Pour sauce around salmon" rather than adding a vague convergence caption.
- Include enough source ingredient quantities in steps for renderers to derive a compact ingredient/shopping overview. Add `group` to source ingredient rows when grouping is not obvious. Intermediate components and relational portions stay in the step flow, not the overview.
- Write cook-facing labels. Avoid filler like "magic", "journey", "harmony", "meet at", "feed into", or ingredients acting like characters.
- Keep quick facts operational: yield, prep time, cook time, oven temperature, rest/chill time. Avoid decorative noun tiles such as "Key cue: cooked through"; put cues in the relevant step.

## Recipe JSON Shape

Use this minimal shape, then fill in the richer fields as needed:

```json
{
  "$schema": "https://snarked.com/schemas/recipop-recipe.schema.json",
  "id": "recipe-slug",
  "title": "Recipe Title",
  "subtitle": "Short optional subtitle",
  "source": {"file": "recipe.md", "url": "https://..."},
  "assetBasePath": "assets",
  "style": "french-hen-folk-wave",
  "unitSystems": [
    {"id": "original", "label": "Original"},
    {"id": "metric", "label": "Metric"}
  ],
  "defaultUnitSystem": "metric",
  "quickFacts": [{"label": "Prep", "value": "~20 min"}],
  "imageGeneration": {
    "model": "openai/gpt-5.4-image-2",
    "imageSize": "1K",
    "defaultAspectRatio": "4:3",
    "referenceMode": "image"
  },
  "storyboard": {
    "id": "recipe-continuity-storyboard",
    "filename": "storyboard-recipe-slug.png",
    "placement": "Continuity storyboard",
    "alt": "Recipe visual continuity storyboard",
    "aspectRatio": "16:9",
    "intent": "Generate this first as one coherent white-background continuity board for reusable ingredients, cookware, intermediate states, and final serving. It is not a thumbnail sheet of final step images.",
    "camera": "Use one consistent three-quarter overhead recipe-card perspective.",
    "cookware": [{"name": "skillet", "description": "Same pan shape and handle orientation whenever repeated."}],
    "inventory": [{"name": "spice mixture", "description": "Ochre-brown spice blend in a small ceramic bowl."}],
    "stateMap": [{"name": "browned chicken", "description": "Same browned chicken state wherever it appears later."}],
    "sequenceNotes": ["Step 1 makes the spice mixture; later steps use split portions."],
    "continuityRules": ["No labels, numbers, arrows, UI, captions, panels, thumbnail frames, or visible text."],
    "prompt": "Create one unlabeled continuity board showing the recipe inventory, cookware, intermediate states, and final serving as a single coherent still life on white paper."
  },
  "layout": {
    "type": "vertical-process",
    "sections": [
      {"type": "step", "step": "mix-spices"},
      {
        "type": "parallel",
        "lanes": [
          {"label": "Bake", "steps": ["bake"]},
          {"label": "Prep garnish", "steps": ["slice-garnish"]}
        ],
        "converge": {"targetStep": "serve"}
      },
      {"type": "step", "step": "serve"}
    ]
  },
  "steps": [
    {
      "id": "mix-spices",
      "number": 1,
      "timeLabel": "0 min",
      "phase": "prep",
      "title": "Mix spices",
      "instruction": "Combine the spices in a small bowl.",
      "duration": {"activeMinutes": 2, "activeLabel": "2 min"},
      "ingredients": [
        {"qty": "1 tsp", "amounts": {"metric": "2.10 g"}, "item": "ground cumin"},
        {"qty": "1/2 tsp", "amounts": {"metric": "3.00 g"}, "item": "salt"}
      ],
      "makes": [{"item": "spice mixture"}],
      "notes": ["Use half now and half later."],
      "asset": "step-01-spice-mix.png"
    }
  ],
  "assets": [
    {
      "filename": "step-01-spice-mix.png",
      "placement": "Step 1 card",
      "alt": "Spice mix in a small bowl",
      "aspectRatio": "4:3",
      "dependsOnAssets": [],
      "prompt": "A small ceramic bowl filled with an ochre-brown spice mixture, viewed from a consistent three-quarter overhead recipe-card angle."
    }
  ]
}
```

## Units and Scaling

Preserve source wording and add alternatives. Do not overwrite the original recipe.

- `ingredients[].qty` is the source-facing quantity.
- Keep `qty` to the amount/unit only when possible. Put alternatives, prep state, and explanatory prose in `item` or `note`; for example use `qty: "2-3"` with `item: "bananas or 1 banana plus 2 carrots"` instead of putting the whole alternative sentence in the quantity column.
- `ingredients[].quantityKind` clarifies quantity semantics. Use `absolute` or omit it for normal quantities, `count` for explicit counts when helpful, `portion` for relational splits of a previously made component, `as-needed` for greasing/oiling as needed, and `to-taste` for salt/pepper/pinch adjustments.
- `ingredients[].amounts.metric` is the metric display when a defensible conversion exists.
- `ingredients[].group` is an optional cook-facing grouping for the derived ingredient/shopping overview. Prefer practical shopping/prep groups over taxonomy: `Spices + seasoning`, `Produce`, `Protein`, `Dry goods`, `Liquids + fats`, `Dairy`, `Garnish`. Use it for source ingredients; omit it on intermediate components and `portion` rows.
- Prefer grams for weights and for volume-to-weight conversions with reasonable ingredient-specific densities.
- Format grams sensibly: whole grams for ordinary quantities, one decimal below 10 g, two decimals only for tiny amounts where precision matters. Avoid fake precision such as `240.00 g` for flour.
- Leave metric absent for `to taste`, `as needed`, ranges where density is unknowable, counts, garnish handfuls, or quantities where conversion would mislead.
- Leave metric absent for `quantityKind: "portion"` rows such as `half spice mixture`. The whole component scales by scaling the source ingredients, so converting the later half into a standalone gram value breaks the logic unless the source states the component yield.
- Use parseable leading quantities so renderers can scale: `240 g`, `1 1/2 c`, `remaining 2 T`, `2 eggs`.
- Scaling can be by factor or by a key ingredient target. The renderer should multiply parseable leading absolute/count quantities, keep `remaining 2 T` style known split amounts scalable, and leave `portion`, `as-needed`, `to-taste`, and component rows unchanged.
- Mark rows `scalable: false` when the quantity is an either/or choice, a judgment quantity, or otherwise cannot be multiplied without changing the meaning.

## Layout Guidance

`layout.sections` is the deterministic intermediate model for renderers.

- Use `{"type": "step", "step": "id"}` for normal top-to-bottom cooking.
- Use `{"type": "parallel"}` only for covered-time simultaneity.
- Do not expose internal layout terms in user-facing HTML or JSON copy. The JSON keys can say `parallel`, `lanes`, and `converge`, but avoid human-visible text fields that explain the renderer's mechanics.
- Keep process pages vertical and mobile-first. Prefer scrollable cards with full step context over dense CFE-style matrices except for analysis/debug views.
- Each step card should include its own instruction, quantities/components, notes/cues, and image. The cook should not need a global ingredient table to perform a step.

## Image Prompting

Separate reusable style from recipe-specific content.

- A style pack owns art medium, palette, brushwork, paper, constraints, negative prompt, one-shot references, and optional HTML theme tokens.
- `storyboard` owns recipe-specific continuity: inventory, cookware, camera angle, repeated states, sequence notes, and full-recipe context. It should generate one coherent white-background board of reusable elements, not a contact sheet, grid, comic strip, or set of all final step images.
- `assets[].prompt` owns only one image: visible food/tool/state/action/angle for that hero or step.
- `assets[].dependsOnAssets` lists the few prior images that overlap with this asset. Use it for repeated pans, ingredients, mixtures, plating, or cooked states.

Every storyboard and asset prompt should include a full recipe context block generated from `recipe.json`:

```text
<recipe_context_markdown>
# Recipe title
## Quick facts
## Process layout
## Steps
...
</recipe_context_markdown>
```

This context is for model reasoning only. The negative prompt must still forbid visible text, labels, numbers, UI, captions, watermarks, diagram arrows, and fake ingredient labels.

## Generation Modes

Use the same JSON and prompt plan for both modes.

### Agent-Guided Mode

Prefer this when the environment has native image generation.

For repeatable or multi-recipe work, use the runner instead of hand-managed imports:

```bash
bun <skill-path>/scripts/reci-pop/run-native-agent.ts recipes --style-root=styles --clear --concurrency=3
```

The runner validates and plans prompts, creates a private `CODEX_HOME` for each recipe, attaches resolved style reference images with `-i`, and stores logs under `.recipop-runs/`. Its generated prompt tells the native agent to re-inspect the style reference before the storyboard and before every later asset. The private home matters: native Codex image generation writes to `$CODEX_HOME/generated_images`, so global "newest generated PNG" discovery is unsafe when multiple recipe agents run in parallel. Never parallelize native runs that all scan the user's global `~/.codex/generated_images`.

Use manual agent-guided generation only for one-off correction work:

1. Run `plan-assets.ts`:
   ```bash
   bun <skill-path>/scripts/reci-pop/plan-assets.ts recipes/my-recipe/recipe.json --style-root=styles
   ```
2. Resolve every active style `oneShotExamples[].path` and call `view_image` on each reference before the first image-generation call. For `style: "french-hen-folk-wave"` with `--style-root=styles`, view `styles/french-hen-folk-wave/hen.png` with original detail; if the host repo has no style folder, use the bundled `styles/french-hen-folk-wave/hen.png` inside this skill.
3. Generate the storyboard first from `prompts/storyboard-*.txt`. Explicitly tell the image tool to match the visible style reference image for brushwork and material language, and to make one coherent continuity board of elements rather than a sheet of per-step thumbnails.
4. Save/import the storyboard, then view it before generating hero and step assets.
5. For each asset, pass the prompt file content plus the visible style reference, the generated storyboard, and selected dependency images.
6. Import generated files into the recipe contract:
   ```bash
   bun <skill-path>/scripts/reci-pop/import-image.ts recipes/my-recipe/recipe.json \
     --asset=step-01-spice-mix.png \
     --file=/path/to/generated.png \
     --provider=agent-guided \
     --style-root=styles
   ```
7. Render and inspect in Chromium.

Repeat the `view_image` step whenever work resumes after compaction/interruption, the active style changes, or a reference image is added. Text style descriptions alone are not enough to preserve loose brushwork.

Do not substitute hand-authored SVG placeholders for recipe art unless the user explicitly asks for vector placeholders.

### Scripted Provider Mode

Use this for unattended OpenRouter generation:

```bash
OPENROUTER_API_KEY=... bun <skill-path>/scripts/reci-pop/generate-images.ts recipes/my-recipe/recipe.json \
  --style-root=styles \
  --reference-mode=image \
  --concurrency=1
```

The script generates the storyboard first, attaches style references and available dependency images, skips existing files unless `--force` is used, and postprocesses generated images to trim removable outer paper margins.

## Bundled Files

- `schemas/recipe.schema.json`: JSON schema for authoring.
- `references/pipeline.md`: script runbook.
- `references/recipe-json-authoring.md`: reusable prompt for converting ordinary recipes into Reci-pop JSON.
- `scripts/reci-pop/validate.ts`: checks required fields, style resolution, layout references, assets, and dependencies.
- `scripts/reci-pop/plan-assets.ts`: writes `image-plan.json` and `prompts/*.txt`.
- `scripts/reci-pop/generate-images.ts`: scripted OpenRouter image generation fallback.
- `scripts/reci-pop/run-native-agent.ts`: parallel-safe native Codex image-generation runner with one private `CODEX_HOME` per recipe.
- `scripts/reci-pop/import-image.ts`: imports agent-generated images into the recipe asset folder and trims excess margins.
- `scripts/reci-pop/postprocess-image.ts`: trims one image or every storyboard/asset for a recipe.
- `scripts/reci-pop/render.ts`: renders static HTML from a recipe JSON.
- `references/prompt-templates.md`: exact storyboard/asset prompt wrappers and generation runbooks.
- `styles/french-hen-folk-wave/style.json` and `styles/french-hen-folk-wave/hen.png`: bundled starter style pack. Host repos may copy this folder into their own `styles/<style-id>/` directory and edit it there.

## Output Expectations

When the user asks for a recipe representation or visualization, create or update:

- `recipe.json` using this Reci-pop format;
- prompt files and `image-plan.json`;
- generated/imported image assets if requested;
- rendered static HTML if requested;
- a short note about modeling assumptions, especially covered-time groups, waits, implied prep, unit conversions, and any quantities left unconverted.
