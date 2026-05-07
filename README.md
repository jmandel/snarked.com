# snarked.com

Just like *your* recipe box, only **online**.

## Stack

- Recipes live in `recipes/` as Markdown files with YAML frontmatter.
- `build.ts` (Bun) reads the recipes, renders them through inline templates, copies static assets, and writes everything to `dist/`.
- `.github/workflows/deploy.yml` builds on every push to `master` and publishes `dist/` to GitHub Pages.

## Local development

```bash
bun install
bun run build      # writes dist/
```

Open `dist/index.html` in a browser, or serve `dist/` with any static file server.

## Adding a recipe

1. Copy an existing file in `recipes/` and edit the frontmatter + body.
2. Drop any photos in `recipe_files/` and list them under `photos:`.
3. Open a pull request. CI rebuilds and deploys on merge.

If you'd rather not touch git, [open an issue](https://github.com/jmandel/snarked.com/issues/new?template=recipe.yml) and a maintainer will commit it for you.
