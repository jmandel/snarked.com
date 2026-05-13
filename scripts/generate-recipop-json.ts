import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const SOURCE_DIR = process.argv[2]
  ? resolve(ROOT, process.argv[2])
  : join(ROOT, "cooking-for-engineers", "recipop-workspace", "recipes");
const OUT_DIR = process.argv[3] ? resolve(ROOT, process.argv[3]) : join(ROOT, "recipes");

type FlowComponent = {
  id: string;
  label: string;
  type?: string;
  group?: string;
  state?: string;
  note?: string;
  optional?: boolean;
  quantity?: { text?: string };
  description?: string;
};

type FlowAction = {
  id: string;
  verb?: string;
  text?: string;
  inputs?: Array<{ ref: string; amount?: string }>;
  outputs?: Array<{ ref: string }>;
  method?: string;
  station?: string;
  duration?: { text?: string };
  temperature?: { text?: string };
  execution?: {
    active?: { text?: string };
    passive?: { text?: string };
    attention?: string;
    resources?: string[];
    placement?: string;
    rationale?: string;
    cue?: string;
  };
};

type FlowRecipe = {
  title: string;
  subtitle?: string;
  source?: { name?: string; file?: string; date?: string };
  components?: FlowComponent[];
  actions?: FlowAction[];
  final?: string[];
  notes?: string[];
};

type ReciIngredient = {
  qty: string;
  item: string;
  note?: string;
  amounts?: Record<string, string>;
};

const STYLE_PACK_ID = "french-hen-folk-wave";

const DENSITY_G_PER_CUP: Array<[RegExp, number]> = [
  [/cake flour/i, 115],
  [/whole wheat flour|wheat flour|flour/i, 120],
  [/cornmeal/i, 160],
  [/cornstarch|corn flour/i, 128],
  [/confectioners|powdered sugar/i, 120],
  [/brown sugar/i, 220],
  [/granulated sugar|sugar/i, 200],
  [/cocoa/i, 85],
  [/chocolate chips?/i, 170],
  [/butter|shortening/i, 227],
  [/oil/i, 216],
  [/milk|cream|buttermilk|water|broth|stock/i, 240],
  [/sour cream|yogurt|mascarpone/i, 245],
  [/maple syrup|honey|molasses/i, 322],
  [/bread crumbs?/i, 108],
  [/muesli|oats?/i, 90],
  [/barley/i, 200],
  [/onions?/i, 160],
  [/red peppers?|bell peppers?|peppers?/i, 150],
  [/tomatoes?/i, 240],
  [/soy sauce/i, 255],
  [/lemon juice|lime juice/i, 240],
  [/espresso|coffee/i, 240]
];

const G_PER_TSP: Array<[RegExp, number]> = [
  [/salt/i, 6.0],
  [/baking soda/i, 4.6],
  [/baking powder/i, 4.0],
  [/cinnamon/i, 2.6],
  [/cumin/i, 2.1],
  [/chili powder/i, 2.7],
  [/garlic powder/i, 3.1],
  [/pepper/i, 2.3],
  [/turmeric/i, 3.0],
  [/paprika/i, 2.3],
  [/vanilla/i, 4.2],
  [/soy sauce/i, 5.3],
  [/lemon juice|lime juice/i, 5.0],
  [/oil|butter/i, 4.7],
  [/sugar/i, 4.2],
  [/cocoa/i, 2.1]
];

const PHASE_BY_VERB: Array<[RegExp, string]> = [
  [/preheat|heat/i, "setup"],
  [/squeeze|drain|chop|slice|grate|prep|pit|peel/i, "prep"],
  [/combine|mix|whisk|beat|stir|fold|process|blend|rub|form|shape|roll|fill|crumble/i, "mix"],
  [/brown|saute|sauté|fry|boil|simmer|cook|grill/i, "cook"],
  [/bake|roast/i, "bake"],
  [/cool|chill|refrigerate|rest|stand|set/i, "wait"],
  [/serve|top|garnish|dust|cut/i, "finish"]
];

const FRONTLOAD_VERBS = /preheat|combine|mix|whisk|beat|process|blend|chop|slice|grate|drain|squeeze|prep|crumble/i;
const ACTIVE_COOK_VERBS = /brown|saute|sauté|fry|grill|whisk|beat|stir|fold|form|shape|rub|roll|fill/i;
const COVERED_VERBS = /bake|roast|simmer|rest|chill|refrigerate|cool|drain|soak|marinate|stand/i;
const COMMON_VISUAL_TOOLS = [
  "baking pan",
  "baking dish",
  "jellyroll pan",
  "jelly roll pan",
  "rimmed sheet pan",
  "loaf pan",
  "cake pan",
  "sheet pan",
  "skillet",
  "saucepan",
  "pot",
  "griddle",
  "grill",
  "small bowl",
  "mixing bowl",
  "bowl",
  "dish",
  "plate",
  "platter",
  "cutting board",
  "knife",
  "whisk",
  "spoon",
  "spatula",
  "food processor",
  "blender",
  "mixer",
  "oven",
  "stovetop",
  "sink",
  "refrigerator",
  "freezer"
];

function slugify(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "recipe";
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function displayTitle(action: FlowAction): string {
  return titleCase(action.id || action.verb || "step");
}

function parseDurationMinutes(text?: string): number {
  if (!text) return 0;
  const value = String(text).toLowerCase();
  let minutes = 0;
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/g)) {
    minutes += Number(match[1]) * 60;
  }
  for (const match of value.matchAll(/(\d+(?:\.\d+)?)\s*(minutes?|mins?|m)\b/g)) {
    minutes += Number(match[1]);
  }
  if (!minutes) {
    const bare = value.match(/\b(\d+(?:\.\d+)?)\b/);
    if (bare) minutes = Number(bare[1]);
  }
  if (/few/.test(value) && !minutes) minutes = 4;
  if (/overnight/.test(value)) minutes = Math.max(minutes, 8 * 60);
  return Number.isFinite(minutes) ? Math.round(minutes) : 0;
}

function formatDuration(minutes: number): string {
  if (!minutes) return "0 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function phaseFor(action: FlowAction): string {
  const target = `${action.verb || ""} ${action.id || ""} ${action.station || ""}`;
  for (const [pattern, phase] of PHASE_BY_VERB) {
    if (pattern.test(target)) return phase;
  }
  return "step";
}

function sourceShortname(flow: FlowRecipe, file: string): string {
  const sourceFile = flow.source?.file;
  if (sourceFile) return basename(sourceFile).replace(/\.md$/i, "");
  return basename(file).replace(/\.recipe-flow\.json$/i, "");
}

function componentMap(flow: FlowRecipe): Map<string, FlowComponent> {
  return new Map((flow.components || []).map((component) => [component.id, component]));
}

function densityForCup(item: string): number | null {
  return DENSITY_G_PER_CUP.find(([pattern]) => pattern.test(item))?.[1] ?? null;
}

function gramsPerTsp(item: string): number | null {
  return G_PER_TSP.find(([pattern]) => pattern.test(item))?.[1] ?? null;
}

function parseNumberish(input: string): number | null {
  const normalized = input
    .replace(/½/g, " 1/2")
    .replace(/¼/g, " 1/4")
    .replace(/¾/g, " 3/4")
    .replace(/⅓/g, " 1/3")
    .replace(/⅔/g, " 2/3")
    .replace(/⅛/g, " 1/8")
    .trim();
  const parts = normalized.split(/\s+/);
  let total = 0;
  let found = false;
  for (const part of parts) {
    if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split("/").map(Number);
      if (b) {
        total += a / b;
        found = true;
      }
    } else if (/^\d+(?:\.\d+)?$/.test(part) || /^\.\d+$/.test(part)) {
      total += Number(part);
      found = true;
    }
  }
  return found ? total : null;
}

function splitQuantityParts(qty: string): string[] {
  return String(qty)
    .replace(/\bdivided\b/ig, "")
    .split(/\s*\+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatMetricGrams(grams: number, suffix = ""): string {
  let rounded: number;
  if (grams >= 100) rounded = Math.round(grams / 5) * 5;
  else if (grams >= 10) rounded = Math.round(grams);
  else rounded = Math.round(grams * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} g${suffix}`;
}

function metricGramsValue(metric?: string): number | null {
  if (!metric) return null;
  const match = metric.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  return match ? Number(match[1]) : null;
}

function metricAmount(qty: string, item: string): string | undefined {
  const original = String(qty || "").trim();
  if (!original || /to taste|as needed|pinch|bunch|large|medium|small|whole|all|optional|about|approximately|^[-–]/i.test(original)) {
    return undefined;
  }
  let prefix = "";
  let normalizedOriginal = original
    .replace(/\bdivided\b/ig, "")
    .replace(/\s*\([+-]\)/g, "")
    .trim();
  const remaining = normalizedOriginal.match(/^remaining\s+(.+)$/i);
  if (remaining) {
    prefix = "remaining ";
    normalizedOriginal = remaining[1].trim();
  }
  if (/^half\b/i.test(normalizedOriginal)) return undefined;
  let grams = 0;
  let convertedAny = false;
  let canSuffix = "";

  for (const part of splitQuantityParts(normalizedOriginal)) {
    const match = part.match(/^(.+?)\s*(cups?|c\.?|c|tablespoons?|tbsp\.?|tbs\.?|T|teaspoons?|tsp\.?|t|ounces?|oz|pounds?|lbs?|lb|grams?|g)\b(.*)$/i);
    if (!match) return undefined;
    const amount = parseNumberish(match[1]);
    if (amount == null) return undefined;
    const originalUnit = match[2].replace(/\./g, "");
    const unit = originalUnit.toLowerCase();
    if (/\bcan\b/i.test(match[3] || "")) canSuffix = " can";
    if (/^(g|gram|grams)$/.test(unit)) {
      grams += amount;
      convertedAny = true;
    } else if (/^(oz|ounce|ounces)$/.test(unit)) {
      grams += amount * 28.3495;
      convertedAny = true;
    } else if (/^(lb|lbs|pound|pounds)$/.test(unit)) {
      grams += amount * 453.592;
      convertedAny = true;
    } else if (/^(cup|cups|c)$/.test(unit)) {
      const density = densityForCup(item);
      if (!density) return undefined;
      grams += amount * density;
      convertedAny = true;
    } else if (originalUnit === "T") {
      const perTsp = gramsPerTsp(item) ?? (densityForCup(item) ? densityForCup(item)! / 48 : null);
      if (!perTsp) return undefined;
      grams += amount * perTsp * 3;
      convertedAny = true;
    } else if (/^(tablespoon|tablespoons|tbsp|tbs)$/.test(unit)) {
      const perTsp = gramsPerTsp(item) ?? (densityForCup(item) ? densityForCup(item)! / 48 : null);
      if (!perTsp) return undefined;
      grams += amount * perTsp * 3;
      convertedAny = true;
    } else if (/^(teaspoon|teaspoons|tsp|t)$/.test(unit)) {
      const perTsp = gramsPerTsp(item);
      if (!perTsp) return undefined;
      grams += amount * perTsp;
      convertedAny = true;
    }
  }

  if (!convertedAny || grams <= 0) return undefined;
  return `${prefix}${formatMetricGrams(grams, canSuffix)}`;
}

function metricFromComponentAmount(input: { ref: string; amount?: string }, componentMetrics: Map<string, string>): string | undefined {
  const base = metricGramsValue(componentMetrics.get(input.ref));
  if (!base) return undefined;
  const amount = String(input.amount || "").trim().toLowerCase();
  if (!amount) return undefined;
  if (amount === "half") return formatMetricGrams(base / 2);
  if (amount === "remaining half") return `remaining ${formatMetricGrams(base / 2)}`;
  return undefined;
}

function ingredientForInput(
  input: { ref: string; amount?: string },
  components: Map<string, FlowComponent>,
  componentMetrics: Map<string, string>,
): ReciIngredient {
  const component = components.get(input.ref);
  const qty = input.amount || component?.quantity?.text || "";
  const item = component?.label || titleCase(input.ref);
  const ingredient: ReciIngredient = { qty, item };
  const notes = [component?.state, component?.optional ? "optional" : "", component?.note].filter(Boolean);
  if (notes.length) ingredient.note = notes.join("; ");
  const metric = metricAmount(qty, item) || metricFromComponentAmount(input, componentMetrics);
  const amounts: Record<string, string> = {};
  if (qty) amounts.original = qty;
  if (metric) amounts.metric = metric;
  if (Object.keys(amounts).length) ingredient.amounts = amounts;
  return ingredient;
}

function initialComponentMetrics(flow: FlowRecipe): Map<string, string> {
  const metrics = new Map<string, string>();
  for (const component of flow.components || []) {
    const qty = component.quantity?.text || "";
    const metric = metricAmount(qty, component.label);
    if (metric) metrics.set(component.id, metric);
  }
  return metrics;
}

function updateOutputMetrics(action: FlowAction, ingredients: ReciIngredient[], metrics: Map<string, string>) {
  const outputs = action.outputs || [];
  if (!outputs.length) return;
  const grams = ingredients
    .map((ingredient) => metricGramsValue(ingredient.amounts?.metric))
    .filter((value): value is number => value != null);
  if (!grams.length || grams.length !== ingredients.length) return;
  const total = grams.reduce((sum, value) => sum + value, 0);
  for (const output of outputs) {
    if (output.ref) metrics.set(output.ref, formatMetricGrams(total));
  }
}

function stepOutputLabel(action: FlowAction, components: Map<string, FlowComponent>): string | null {
  const first = action.outputs?.[0]?.ref;
  if (!first) return null;
  return components.get(first)?.label || titleCase(first);
}

function notesForAction(action: FlowAction): string[] {
  return [
    action.temperature?.text ? `Heat: ${action.temperature.text}` : "",
    action.duration?.text ? `Source timing: ${action.duration.text}` : "",
    action.execution?.passive?.text ? `Wait: ${action.execution.passive.text}` : "",
    action.execution?.cue ? `Cue: ${action.execution.cue}` : "",
    action.method ? `Method: ${action.method}` : ""
  ].filter(Boolean);
}

function buildSteps(flow: FlowRecipe) {
  const components = componentMap(flow);
  const metrics = initialComponentMetrics(flow);
  let elapsed = 0;
  return (flow.actions || []).map((action, index) => {
    const active = parseDurationMinutes(action.execution?.active?.text || action.duration?.text);
    const passive = parseDurationMinutes(action.execution?.passive?.text);
    const output = stepOutputLabel(action, components);
    const resources = [...new Set([...(action.execution?.resources || []), action.station].filter(Boolean))];
    const step = {
      id: slugify(action.id),
      sourceActionId: action.id,
      number: index + 1,
      timeLabel: `${elapsed} min`,
      phase: phaseFor(action),
      title: displayTitle(action),
      instruction: action.text || displayTitle(action),
      duration: {
        activeMinutes: active || undefined,
        passiveMinutes: passive || undefined,
        activeLabel: action.execution?.active?.text || undefined,
        passiveLabel: action.execution?.passive?.text || undefined
      },
      attention: action.execution?.attention,
      resources,
      ingredients: (action.inputs || []).map((input) => ingredientForInput(input, components, metrics)),
      makes: output ? [{ item: output }] : [],
      notes: notesForAction(action),
      asset: `step-${String(index + 1).padStart(2, "0")}-${slugify(action.id)}.png`
    };
    updateOutputMetrics(action, step.ingredients, metrics);
    elapsed += active || 0;
    return step;
  });
}

function canCover(current: FlowAction, next: FlowAction): boolean {
  const currentPassive = parseDurationMinutes(current.execution?.passive?.text);
  if (!currentPassive && !COVERED_VERBS.test(`${current.verb || ""} ${current.id}`)) return false;
  if (next.execution?.placement !== "during_wait") return false;
  if (ACTIVE_COOK_VERBS.test(`${current.verb || ""} ${current.id}`) && !currentPassive) return false;
  return true;
}

function buildLayout(flow: FlowRecipe, steps: Array<{ id: string; sourceActionId: string }>) {
  const actions = flow.actions || [];
  const sections: any[] = [];
  const idBySource = new Map(steps.map((step) => [step.sourceActionId, step.id]));
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const next = actions[i + 1];
    if (next && canCover(action, next)) {
      const stepA = idBySource.get(action.id);
      const stepB = idBySource.get(next.id);
      if (stepA && stepB) {
        sections.push({
          type: "parallel",
          label: "Covered time",
          timeLabel: actions[i].execution?.passive?.text || actions[i].duration?.text || "",
          summary: "The first task is mostly hands-off here, so the prep lane can happen during that wait.",
          lanes: [
            { label: titleCase(action.verb || "Covered cooking"), accent: "cook", steps: [stepA] },
            { label: titleCase(next.verb || "Prep"), accent: "prep", steps: [stepB] }
          ],
          converge: { label: "Return to the main sequence.", targetStep: idBySource.get(actions[i + 2]?.id || "") || "" }
        });
        i++;
        continue;
      }
    }
    sections.push({ type: "step", step: idBySource.get(action.id) });
  }
  return { type: "vertical-process", sections };
}

function quickFacts(flow: FlowRecipe, steps: any[]) {
  const actions = flow.actions || [];
  const active = steps.reduce((sum, step) => sum + (step.duration?.activeMinutes || 0), 0);
  const passive = steps.reduce((sum, step) => sum + (step.duration?.passiveMinutes || 0), 0);
  const temperatures = [...new Set(actions.map((a) => a.temperature?.text).filter(Boolean))];
  const stations = [...new Set(actions.map((a) => a.station).filter(Boolean))];
  const facts: Array<{ label: string; value: string }> = [];
  const yieldText = flow.subtitle?.match(/\b(serves?|makes?)\s+([^.;]+)/i)?.[0];
  if (yieldText) facts.push({ label: "Yield", value: yieldText.replace(/^makes?\s+/i, "") });
  if (active) facts.push({ label: "Active", value: `~${formatDuration(active)}` });
  if (passive) facts.push({ label: "Wait", value: `~${formatDuration(passive)}` });
  if (temperatures.length) facts.push({ label: "Heat", value: temperatures.slice(0, 2).join(" / ") });
  if (stations.length) facts.push({ label: "Stations", value: stations.slice(0, 3).join(" + ") });
  return facts.slice(0, 4);
}

function actionAssetPrompt(flow: FlowRecipe, action: FlowAction, step: any, components: Map<string, FlowComponent>): string {
  const inputs = (action.inputs || []).map((input) => {
    const component = components.get(input.ref);
    const qty = input.amount || component?.quantity?.text || "";
    const label = component?.label || input.ref;
    const state = component?.state ? ` (${component.state})` : "";
    return `${qty ? `${qty} ` : ""}${label}${state}`.trim();
  });
  const output = stepOutputLabel(action, components);
  const resourceText = step.resources?.length ? ` Tools or station: ${step.resources.join(", ")}.` : "";
  const cue = action.execution?.cue ? ` End state cue: ${action.execution.cue}.` : "";
  return [
    `${step.title}: ${action.text || ""}`.trim(),
    inputs.length ? `Depict the ingredients or components used now: ${inputs.join("; ")}.` : "",
    output ? `Show the resulting food state: ${output}.` : "",
    resourceText,
    cue,
    "Use a clear single-scene food illustration focused on the actual food/tool state for this step; no text or labels."
  ].filter(Boolean).join(" ");
}

function heroPrompt(flow: FlowRecipe, id: string): string {
  const finalLabel = flow.final?.[0]
    ? componentMap(flow).get(flow.final[0])?.label || flow.title
    : flow.title;
  return `Finished ${finalLabel} for ${flow.title}, plated or served naturally in a clean recipe illustration. Show the final dish clearly and appetizingly with only relevant garnish or serving pieces. No text, labels, UI, or decorative border.`;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function buildStoryboard(flow: FlowRecipe, id: string, steps: any[]) {
  const components = componentMap(flow);
  const inventory = (flow.components || []).map((component) => {
    const qty = component.quantity?.text ? `${component.quantity.text} ` : "";
    const group = component.group ? `${component.group}; ` : "";
    const state = component.state ? `${component.state}; ` : "";
    const note = component.note ? `${component.note}; ` : "";
    const description = component.description || `${qty}${group}${state}${note}${component.type || "recipe component"}`.trim();
    return {
      name: component.label,
      description
    };
  });
  const proseTools = uniqueStrings((flow.actions || []).flatMap((action) => {
    const text = `${action.text || ""} ${action.station || ""} ${(action.execution?.resources || []).join(" ")}`.toLowerCase();
    return COMMON_VISUAL_TOOLS.filter((tool) => text.includes(tool));
  }));
  const stations = uniqueStrings((flow.actions || []).flatMap((action) => [
    action.station,
    ...(action.execution?.resources || []),
    /mix|combine|whisk|beat|fold/i.test(`${action.verb || ""} ${action.id || ""}`) ? "mixing bowl" : "",
  ]));
  const cookware = uniqueStrings([...stations, ...proseTools]).map((station) => ({
    name: station,
    description: `Use one consistent ${station} design whenever this tool or station appears; preserve orientation, scale, material, and lighting across assets.`
  }));
  const stateMap = (flow.actions || [])
    .map((action, index) => {
      const step = steps[index];
      const output = stepOutputLabel(action, components);
      if (!output) return null;
      const inputs = (action.inputs || [])
        .map((input) => components.get(input.ref)?.label || titleCase(input.ref))
        .join(" + ");
      return {
        name: output,
        description: `${action.verb || step?.title || "Step"} from ${inputs || "prior preparation"}; keep this state visually identical wherever it appears later.`
      };
    })
    .filter(Boolean);
  const sequenceNotes = (flow.actions || []).map((action, index) => {
    const step = steps[index];
    const output = stepOutputLabel(action, components);
    const resources = uniqueStrings([action.station, ...(action.execution?.resources || [])]);
    return `Step ${index + 1}, ${step?.title || titleCase(action.verb || action.id)}: ${action.text || ""}${output ? ` Result: ${output}.` : ""}${resources.length ? ` Tool/station: ${resources.join(", ")}.` : ""}`;
  });
  return {
    id: "recipe-continuity-storyboard",
    filename: `storyboard-${id}.png`,
    placement: "Continuity storyboard",
    alt: `${flow.title} visual continuity storyboard`,
    aspectRatio: "16:9",
    intent: "Generate this first as the recipe's visual inventory and continuity reference. Later hero and step images should match its cookware, camera angle, repeated ingredients, cooked states, palette, and lighting.",
    camera: "Use one consistent three-quarter overhead recipe-card perspective for every object: slightly above the food, looking down at a shallow angle, with cookware handles and ellipses oriented consistently left-to-right. Keep objects centered with comfortable padding and a clean white-paper background.",
    cookware,
    inventory,
    stateMap,
    sequenceNotes,
    continuityRules: [
      "This storyboard is art only; do not include labels, numbers, arrows, UI cards, ingredient text, or process annotations.",
      "Pick a single coherent cookware set and keep it fixed across the recipe: same pan shapes, dish shapes, bowls, cutting board, and serving vessel whenever repeated.",
      "Show repeated food states clearly enough that individual step images can reuse them without changing color, cut size, doneness, or vessel.",
      "Use the same lighting direction, paper tone, shadows, scale, and three-quarter camera angle across all later assets.",
      "Prefer one still-life sheet with grouped objects over a diagram. The board establishes visual truth; the HTML renderer supplies typography and process layout."
    ],
    prompt: [
      `Create an unlabeled visual continuity storyboard sheet for ${flow.title}.`,
      `Include the final dish, main raw ingredients, all intermediate mixtures or cooked states, repeated tools/stations, and serving/garnish elements that appear in the recipe.`,
      "Arrange the inventory in loose process order so the board can guide later per-step images, but do not draw a timeline, flowchart, labels, text, arrows, or UI.",
      "Make the cookware choices explicit through the art itself: repeated skillet/dish/bowl/cutting-board forms should be recognizable and reusable in later images.",
      "The board should feel like one coherent hand-painted recipe-world reference, not a collage of unrelated stock illustrations."
    ].join(" ")
  };
}

function buildAssets(flow: FlowRecipe, id: string, steps: any[]) {
  const components = componentMap(flow);
  const assets: any[] = [
    {
      filename: `hero-${id}.png`,
      placement: "Recipe header",
      alt: `${flow.title} finished dish`,
      aspectRatio: "16:9",
      prompt: heroPrompt(flow, id)
    }
  ];
  const previousAssets: string[] = [];
  for (const [index, action] of (flow.actions || []).entries()) {
    const step = steps[index];
    if (!step) continue;
    const deps = previousAssets.slice(-2);
    assets.push({
      filename: step.asset,
      placement: `Step ${step.number} card`,
      alt: `${flow.title}: ${step.title}`,
      aspectRatio: "4:3",
      dependsOnAssets: deps,
      prompt: actionAssetPrompt(flow, action, step, components)
    });
    previousAssets.push(step.asset);
  }
  return assets;
}

function normalizeStepIds(steps: any[]) {
  const seen = new Map<string, number>();
  for (const step of steps) {
    const base = step.id;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    if (count) step.id = `${base}-${count + 1}`;
  }
}

function convert(file: string) {
  const flow = readJson<FlowRecipe>(join(SOURCE_DIR, file));
  const shortname = sourceShortname(flow, file);
  const id = slugify(shortname);
  const steps = buildSteps(flow);
  normalizeStepIds(steps);
  const layout = buildLayout(flow, steps);
  const recipe = {
    $schema: "https://snarked.com/schemas/recipop-recipe.schema.json",
    id,
    title: flow.title,
    subtitle: flow.subtitle || "",
    source: {
      submittedBy: flow.source?.name || "",
      date: flow.source?.date || "",
      file: "recipe.md"
    },
    assetBasePath: "assets",
    unitSystems: [
      { id: "original", label: "Original" },
      { id: "metric", label: "Metric" }
    ],
    defaultUnitSystem: "metric",
    quickFacts: quickFacts(flow, steps),
    style: STYLE_PACK_ID,
    imageGeneration: {
      model: "openai/gpt-5.4-image-2",
      imageSize: "1K",
      defaultAspectRatio: "4:3",
      referenceMode: "image"
    },
    storyboard: buildStoryboard(flow, id, steps),
    heroAssets: [`hero-${id}.png`],
    layout,
    steps,
    assets: buildAssets(flow, id, steps),
    notes: flow.notes || []
  };
  return { shortname, recipe };
}

mkdirSync(OUT_DIR, { recursive: true });

const files = readdirSync(SOURCE_DIR).filter((file) => file.endsWith(".recipe-flow.json")).sort();
for (const file of files) {
  const { shortname, recipe } = convert(file);
  const outDir = join(OUT_DIR, shortname);
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "recipe.json");
  writeFileSync(outPath, JSON.stringify(recipe, null, 2) + "\n", "utf8");
  console.log(`wrote ${outPath}`);
}
