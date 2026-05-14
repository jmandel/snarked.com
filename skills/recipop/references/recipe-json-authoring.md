# Recipe JSON Authoring Prompt

Use this prompt with a text model when you want to convert an ordinary recipe into a Reci-pop `recipe.json` file.

```text
Convert the recipe below into a Reci-pop `recipe.json` object.

The JSON will drive deterministic HTML renderers and a separate image-generation pipeline. Do not create HTML. Do not create images.

Requirements:
- Preserve actual recipe quantities and instructions.
- Put ingredient quantities inside the step where they are used.
- Use concise verb-first step titles.
- Write concrete cook-facing copy. Avoid narrative filler and AI-sounding phrases such as "come together", "meet at", "feed into", "magic", "journey", or ingredients acting like characters.
- Include quick facts only when they help a cook orient: yield, prep time, cook time, bake time, temperature, chill/rest time.
- Create `unitSystems` with `original` and `metric` when any defensible metric quantities are present.
- Keep `qty` as the source-facing quantity. Add `amounts.metric` for reasonable gram conversions. Use sensible precision: whole grams for ordinary quantities, one decimal below 10 g, two decimals only for tiny amounts where precision matters.
- Keep `qty` compact: amount and unit, not prose. Put alternatives and prep instructions in `item` or `note`, and set `scalable: false` when an either/or quantity would not scale coherently.
- Add `group` on source ingredient rows when it improves the derived ingredient/shopping overview. Use practical cook-facing groups such as `Spices + seasoning`, `Produce`, `Protein`, `Dry goods`, `Liquids + fats`, `Dairy`, or `Garnish`. Do not group intermediate components or relational portions as shopping items.
- Use `quantityKind` where plain quantities are ambiguous: `portion` for relational splits such as `half spice mixture` or `remaining half dough`, `as-needed` for oiling/greasing as needed, and `to-taste` for salt, pepper, pinches, or judgment quantities.
- Do not add `amounts.metric` to relational portions of a previously made component unless the recipe explicitly gives that component yield. A later `half spice mixture` scales through the spices that made the mixture, not through an invented standalone gram amount.
- Create a `steps` array with stable ids, numbers, time labels, phases, ingredients, makes, notes, durations, resources, and one image asset filename per illustrated step.
- Create an `assets` array with one entry per required illustration.
- Each asset must include filename, placement, alt text, aspect ratio, dependency list, and a precise image-content prompt.
- Asset prompts describe only concrete food/tool/state/action for that one image. Do not restate the reusable visual style there.
- Create a `storyboard` object with recipe-wide inventory, cookware, camera angle, state continuity, and a prompt for one continuity board. The board should show reusable elements on one white-background image, not a contact sheet, panel grid, or all final step images.
- Use `layout.sections` for rendering order. Default to mise en place: setup steps first, then prep, then cooking.
- Use `parallel` only for true covered-time simultaneity, where a wait or mostly unattended step such as simmering, baking, resting, chilling, draining, or cooling plausibly covers another task. Do not use `parallel` merely because tasks are independent.
- Do not put invented parent durations on parallel groups. Let each child step carry its own timing, active/passive duration, and notes.
- Keep parallel groups structural. Do not add generic parent labels, summaries, or convergence captions such as "Covered time", "prep lane", or "Return to the main sequence"; the next real step should express how the work comes back together.
- Keep source ingredients represented in the step rows so renderers can derive a compact shopping/prep overview. Exclude intermediate components and relational portions from that overview.
- Include `style` as the only style field, either a style id string such as "french-hen-folk-wave" or an inline style object.
- Use `assetBasePath: "assets"` when assets are stored beside the recipe JSON in a recipe-local `assets/` directory.
- Include `assets[].dependsOnAssets` when repeated ingredients, tools, cooked states, or plating should remain visually consistent with earlier assets.
- Include `imageGeneration` with model, imageSize, defaultAspectRatio, and referenceMode, but keep provider mechanics out of asset prompts.

Return only valid JSON.

Recipe:
[PASTE RECIPE]
```
