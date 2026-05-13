# Reci-pop Prompt Templates

Use these wrappers for both native Codex image generation and scripted OpenRouter generation. The recipe JSON supplies recipe-specific content; the style pack supplies look and feel; the generator supplies the mechanical wrapper.

## Storyboard Prompt

Generate the storyboard before hero and step assets. It is the visual continuity source of truth for cookware, camera angle, ingredient states, serving vessels, palette, and lighting. It should be one coherent white-background continuity board of reusable elements, not a contact sheet of finished step images.

```text
Generate one visual continuity storyboard for a recipe image set.

Recipe context: [recipe.title] — [recipe.subtitle]
Target image: [storyboard.alt]
Used as: [storyboard.placement]
Aspect ratio: [storyboard.aspectRatio]

STYLE PACK
[active style: description, medium, palette, composition, lighting, rendering, texture, constraints]

STYLE REFERENCES
[active style oneShotExamples descriptions; attach/view reference images when possible]

FULL RECIPE CONTEXT
<recipe_context_markdown>
[clean Markdown rendering of recipe title, quick facts, layout groups, steps, ingredients, quantities, outputs, waits, notes]
</recipe_context_markdown>

STORYBOARD PURPOSE
[storyboard.intent]

CAMERA AND ANGLE
[storyboard.camera]

COOKWARE AND TOOLS
- [storyboard.cookware[].name]: [storyboard.cookware[].description]

VISUAL INVENTORY
- [storyboard.inventory[].name]: [storyboard.inventory[].description]

STATE CONTINUITY
- [storyboard.stateMap[].name]: [storyboard.stateMap[].description]

PROCESS SEQUENCE NOTES
- [storyboard.sequenceNotes[]]

CONTINUITY RULES
- [storyboard.continuityRules[]]

IMAGE CONTENT
[storyboard.prompt]

NEGATIVE PROMPT
[storyboard.negative or active style negative]
```

The storyboard image is not a diagram, comic strip, thumbnail grid, or set of all assets. It should be an unlabeled still-life/inventory board that establishes a coherent recipe world: ingredients, cookware, intermediate states, and final serving can all appear, but as one shared visual reference on white paper. Do not ask the model to draw labels, arrows, captions, step numbers, panels, UI, or ingredient text.

## Step Asset Prompt

Generate each individual image after the storyboard. Include the storyboard as a continuity reference when possible, and include only genuinely overlapping previous assets.

```text
Generate one standalone recipe illustration.

Recipe context: [recipe.title] — [recipe.subtitle]
Target image: [asset.alt]
Used as: [asset.placement]
Aspect ratio: [asset.aspectRatio or recipe.imageGeneration.defaultAspectRatio]

STYLE PACK
[active style: description, medium, palette, composition, lighting, rendering, texture, constraints]

STYLE REFERENCES
[active style oneShotExamples descriptions; attach/view reference images when possible]

FULL RECIPE CONTEXT
<recipe_context_markdown>
[clean Markdown rendering of recipe title, quick facts, layout groups, steps, ingredients, quantities, outputs, waits, notes]
</recipe_context_markdown>

RECIPE STORYBOARD
Use the storyboard asset and rules as the primary continuity reference when available.
[storyboard filename, intent, camera, cookware, inventory, repeated states, continuity rules]

VISUAL CONTINUITY
This asset should stay visually consistent with earlier generated assets: [asset.dependsOnAssets].

IMAGE CONTENT
[asset.prompt]

NEGATIVE PROMPT
[asset.negative or active style negative]
```

`asset.prompt` is the only section that should be highly specific to one hero or step. It should name the visible food state, tool or vessel, action, crop, and angle constraints. Keep reusable style language in the style pack and recipe-wide continuity in `storyboard`.

## Native Codex Image Generation

For full recipe generation, especially more than one recipe, prefer the parallel-safe runner:

```bash
bun <skill-path>/scripts/reci-pop/run-native-agent.ts recipes/my-recipe/recipe.json --style-root=styles --clear
bun <skill-path>/scripts/reci-pop/run-native-agent.ts recipes --style-root=styles --clear --concurrency=3
```

The runner creates a private `CODEX_HOME` per recipe and attaches style references via `-i`. This avoids cross-import bugs from the global `$HOME/.codex/generated_images` folder. A native agent may use newest-file discovery only inside its private `$CODEX_HOME/generated_images`, never the global user folder.

Manual one-off workflow:

1. Run `plan-assets.ts` so the storyboard prompt and all asset prompts are written beside the recipe, or pass `--out` for a review folder:
   ```bash
   bun <skill-path>/scripts/reci-pop/plan-assets.ts recipes/my-recipe/recipe.json --style-root=styles
   ```
2. Resolve and view every active style `oneShotExamples[].path` with `view_image` before generating the storyboard. If the recipe has `style: "french-hen-folk-wave"` and the style root is `styles`, view `styles/french-hen-folk-wave/hen.png` with original detail. If no host style folder is present, view the bundled `styles/french-hen-folk-wave/hen.png` in the skill. This is required even when the prompt contains the full style description.
3. Generate `storyboard.filename` from the storyboard prompt, explicitly telling the native image tool to match the visible style reference image for brushwork, pigment behavior, looseness, and material handling.
4. Import the storyboard:
   ```bash
   bun <skill-path>/scripts/reci-pop/import-image.ts recipes/my-recipe/recipe.json \
     --asset=storyboard \
     --file=/path/to/generated-storyboard.png \
     --provider=agent-guided \
     --style-root=styles
   ```
5. View the generated storyboard before generating hero/step assets.
6. For each hero/step asset, pass the full prompt file content to native image generation. Include the visible style reference, generated storyboard, and dependency images that overlap with the current image.
7. Import each image with `import-image.ts`; importing trims excess generated paper margin by default.
8. Render and inspect in Chromium before calling it done.

If a native generation was started before viewing the style references, treat it as an unanchored draft. Load the references and regenerate. Do not replace raster recipe art with hand-authored SVG stand-ins unless the user explicitly asks for placeholders.

## Scripted OpenRouter Generation

Use this path for repeatable unattended generation:

```bash
OPENROUTER_API_KEY=... bun <skill-path>/scripts/reci-pop/generate-images.ts recipes/my-recipe/recipe.json \
  --style-root=styles \
  --reference-mode=image \
  --concurrency=1
```

The script generates the storyboard first, then attaches it to later image requests when available. Keep `--concurrency=1` when assets depend on prior assets or storyboard continuity.

OpenRouter outputs are postprocessed automatically with ImageMagick trim so generated paper margins do not create gaps in full-bleed card layouts. Use `--postprocess=false` only while debugging raw provider output, or tune the tolerance with `--trim-fuzz=2%`.

## JSON Responsibilities

The recipe JSON owns:

- `style`: a style id resolved through `--style-root`, a relative style JSON path, or an inline style object.
- `storyboard`: recipe-specific inventory, camera/cookware rules, repeated states, and storyboard prompt.
- `assets[]`: every rendered hero/step image filename, alt text, dependency list, and per-image content prompt.
- `assetBasePath`: renderer-visible image directory, commonly `assets` for recipe-local assets.
- `steps[]`: cook-facing quantities, instructions, timings, waits, outputs, and notes.
- `layout.sections`: vertical process order and true covered-time groups.

The scripts own:

- Prompt wrapper mechanics.
- Resolving external or bundled references.
- Writing prompt files and image-plan manifests.
- Importing generated images into the target asset directory.
- Trimming removable image margins after import or scripted generation.
- Rendering HTML from JSON plus assets.
