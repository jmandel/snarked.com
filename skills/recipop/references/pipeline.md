# Pipeline

## 1. Author recipe files

`recipe.json` is the source of truth for process layout, step quantities, scaling/unit data, style reference, storyboard, and illustration assets. A host repo can store it anywhere; a common static-site layout is:

```text
recipes/my-recipe/
  recipe.md
  recipe.json
  assets/
  prompts/
```

External reusable styles live wherever the repo chooses. Pass that location with `--style-root`; if omitted, scripts check the host repo's `styles/` folder and then the bundled skill `styles/` folder.

## 2. Render placeholder HTML

```bash
bun <skill-path>/scripts/reci-pop/render.ts recipes/my-recipe/recipe.json --out=dist-review --style-root=styles
```

This produces usable static HTML before images exist.

## 3. Plan image prompts

```bash
bun <skill-path>/scripts/reci-pop/plan-assets.ts recipes/my-recipe/recipe.json --style-root=styles
```

With no `--out`, this writes beside the recipe:

```text
recipes/my-recipe/image-plan.json
recipes/my-recipe/prompts/*.txt
```

Use `--out=dist-review` only when you want throwaway prompt files outside the recipe folder.

## 4. Generate images

### Native Codex agent generation

Use this path when the environment has native image generation. It is the safe default for multi-recipe work because each recipe gets a private `CODEX_HOME`, and therefore a private `generated_images/` folder:

```bash
bun <skill-path>/scripts/reci-pop/run-native-agent.ts recipes/my-recipe/recipe.json \
  --style-root=styles \
  --clear
```

For the whole recipe folder:

```bash
bun <skill-path>/scripts/reci-pop/run-native-agent.ts recipes \
  --style-root=styles \
  --clear \
  --concurrency=3
```

The runner validates, refreshes prompt files, optionally clears old PNG/metadata assets, creates `.recipop-runs/<timestamp>-<recipe-id>/codex-home`, attaches style one-shot references with `-i`, instructs the native agent to re-inspect the style reference before every generated asset, and logs the native agent transcript under that run directory.

Do not hand-roll parallel native generation by scanning `~/.codex/generated_images` for the newest PNG. That directory is global; concurrent agents can import each other's images. If a manual one-off run is needed, either run it alone or give it a private `CODEX_HOME` like the runner does.

### Scripted OpenRouter

```bash
bun <skill-path>/scripts/reci-pop/generate-images.ts recipes/my-recipe/recipe.json \
  --style-root=styles \
  --reference-mode=image \
  --concurrency=1
```

Existing files are skipped unless `--force` is passed. Use `--concurrency=1` when assets use `dependsOnAssets` so earlier images are available as visual continuity references.

Generated OpenRouter images are trimmed automatically after download so accidental white or paper margins do not create gaps in full-bleed cards. Use `--postprocess=false` only to inspect raw provider output.

### Native agent image generation

For normal use, prefer `run-native-agent.ts` above. For one-off correction work, run `plan-assets.ts`, call `view_image` on every active style reference, generate the storyboard first, view it, then generate each hero/step asset with the style reference, storyboard, and selected dependency images in context.

Import each generated image:

```bash
bun <skill-path>/scripts/reci-pop/import-image.ts recipes/my-recipe/recipe.json \
  --asset=step-01-spice-mix.png \
  --file=/path/to/generated.png \
  --provider=agent-guided \
  --style-root=styles
```

Importing trims margins by default.

## 5. Postprocess copied images

If an image was copied by hand or cropped from a storyboard, run:

```bash
bun <skill-path>/scripts/reci-pop/postprocess-image.ts --file=recipes/my-recipe/assets/step-01-spice-mix.png
```

To trim every storyboard and listed asset for one recipe:

```bash
bun <skill-path>/scripts/reci-pop/postprocess-image.ts recipes/my-recipe/recipe.json --style-root=styles
```

## 6. Render final HTML

```bash
bun <skill-path>/scripts/reci-pop/render.ts recipes/my-recipe/recipe.json --out=dist-review --style-root=styles
```

The renderer uses assets found under the chosen output directory, or under the recipe folder for recipe-local assets when no `--out` is involved.
