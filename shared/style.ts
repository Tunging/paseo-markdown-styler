import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Empty string means "follow the theme". Otherwise #RRGGBB or #RRGGBBAA (tints). */
export const colorOrEmpty = z.union([
  z.literal(""),
  z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/),
]);
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

/**
 * Every element the host Markdown renderer actually emits, taken from its
 * blockRenderers / inlineRenderers / listRenderers / tableRenderers maps.
 * `selector` is relative to the `.enrm-text` scope class. `background` marks an
 * element whose background the renderer also styles, so a tint is meaningful.
 */
export interface StyleElement {
  readonly id: string;
  readonly group: "block" | "inline" | "code" | "table" | "list";
  readonly selector: string;
  readonly background?: boolean;
  readonly tintable?: boolean;
}

export const STYLE_ELEMENTS: readonly StyleElement[] = [
  { id: "heading", group: "block", selector: "h1,h2,h3,h4,h5,h6" },
  { id: "paragraph", group: "block", selector: "p" },
  { id: "blockquote", group: "block", selector: "blockquote,blockquote p" },
  { id: "admonition", group: "block", selector: ".enrm-admonition,.enrm-admonition p", background: true, tintable: true },
  { id: "rule", group: "block", selector: "hr", background: true, tintable: true },
  { id: "image", group: "block", selector: "img", background: true, tintable: true },
  { id: "strong", group: "inline", selector: "strong" },
  { id: "emphasis", group: "inline", selector: "em" },
  { id: "strikethrough", group: "inline", selector: "s" },
  { id: "underline", group: "inline", selector: "u" },
  { id: "superscript", group: "inline", selector: "sup" },
  { id: "subscript", group: "inline", selector: "sub" },
  { id: "highlight", group: "inline", selector: "mark", background: true, tintable: true },
  { id: "link", group: "inline", selector: "a" },
  { id: "linkCode", group: "inline", selector: "a code" },
  { id: "inlineCode", group: "code", selector: ":not(pre) > code", background: true, tintable: true },
  { id: "codeBlock", group: "code", selector: "pre", background: true, tintable: true },
  { id: "codeBlockText", group: "code", selector: "pre code" },
  { id: "table", group: "table", selector: "table" },
  { id: "tableHeader", group: "table", selector: "thead th", background: true, tintable: true },
  { id: "tableCell", group: "table", selector: "tbody td" },
  { id: "tableRowEven", group: "table", selector: "tbody tr:nth-child(even)", background: true, tintable: true },
  { id: "tableRowOdd", group: "table", selector: "tbody tr:nth-child(odd)", background: true, tintable: true },
  { id: "listItem", group: "list", selector: "li" },
  { id: "listMarker", group: "list", selector: "li::marker" },
  { id: "taskCheckbox", group: "list", selector: 'li input[type="checkbox"]' },
];

export const STYLE_ELEMENT_GROUPS = ["block", "inline", "code", "table", "list"] as const;

/** Highest number of user presets. Each one stores a full look, so cap the total. */
export const MAX_PRESETS = 24;

/** A colour map keyed by element id. Unknown keys are ignored when building CSS. */
const colorMap = z.record(z.string(), colorOrEmpty).default({});

/**
 * The part of the settings a preset stores and a switch replaces: everything
 * that decides how Markdown looks. `enabled` stays outside because injection is
 * a global switch rather than a look.
 */
const lookSchema = z.object({
  /** Heading font sizes in px. 0 keeps the theme's size. */
  h1Size: z.number().int().min(0).max(64).default(0),
  h2Size: z.number().int().min(0).max(64).default(0),
  h3Size: z.number().int().min(0).max(64).default(0),
  /** Show # / ## / ### level markers before headings. */
  headingLevelIndicators: z.boolean().default(false),
  /** Text colour per element id. */
  elementColors: colorMap,
  /** Background colour per element id, for elements that declare `background`. */
  elementBackgrounds: colorMap,
  customCss: z.string().max(8000).default(""),
});

export type MarkdownLook = z.output<typeof lookSchema>;

export const presetSchema = z.object({
  name: z.string().min(1).max(40),
  look: lookSchema,
});

export type MarkdownPreset = z.output<typeof presetSchema>;

export const markdownStyleSchema = lookSchema.extend({
  enabled: z.boolean().default(true),
  /**
   * Saved looks, keyed by generated id. Order comes from the map, so the UI
   * sorts by name instead of relying on insertion.
   */
  presets: z
    .record(z.string(), presetSchema)
    .default({})
    .refine(
      (presets) => Object.keys(presets).length <= MAX_PRESETS,
      `At most ${MAX_PRESETS} presets`,
    ),
  /**
   * The preset the look fields came from. Empty means the look is a working
   * copy that the user has not saved. Editing writes back into this preset, so
   * switching away and back preserves the change.
   */
  activePresetId: z.string().default(""),
});

export type MarkdownStyleValues = z.output<typeof markdownStyleSchema>;

/** The look fields of a settings object, ready to store in a preset. */
export function lookOf(values: MarkdownStyleValues): MarkdownLook {
  return {
    h1Size: values.h1Size,
    h2Size: values.h2Size,
    h3Size: values.h3Size,
    headingLevelIndicators: values.headingLevelIndicators,
    elementColors: values.elementColors,
    elementBackgrounds: values.elementBackgrounds,
    customCss: values.customCss,
  };
}

export const DEFAULT_LOOK: MarkdownLook = lookSchema.parse({});

/**
 * Preset operations are pure functions over the whole settings object: they
 * return the next values rather than mutating, so the panel has one write path
 * and the behaviour is testable without mounting anything.
 */

/** Store the current look under `id` and make it active. */
export function savePresetAs(
  values: MarkdownStyleValues,
  id: string,
  name: string,
): MarkdownStyleValues {
  return {
    ...values,
    presets: { ...values.presets, [id]: { name, look: lookOf(values) } },
    activePresetId: id,
  };
}

/** Write the current look back into the active preset. No-op for a working copy. */
export function syncActivePreset(values: MarkdownStyleValues): MarkdownStyleValues {
  const preset = values.presets[values.activePresetId];
  if (!preset) return values;
  return {
    ...values,
    presets: { ...values.presets, [values.activePresetId]: { ...preset, look: lookOf(values) } },
  };
}

export function renamePreset(
  values: MarkdownStyleValues,
  id: string,
  name: string,
): MarkdownStyleValues {
  const preset = values.presets[id];
  if (!preset) return values;
  return { ...values, presets: { ...values.presets, [id]: { ...preset, name } } };
}

/** Drop a preset. Deleting the active one leaves an unsaved working copy. */
export function deletePreset(values: MarkdownStyleValues, id: string): MarkdownStyleValues {
  if (!values.presets[id]) return values;
  const presets = { ...values.presets };
  delete presets[id];
  return {
    ...values,
    presets,
    activePresetId: values.activePresetId === id ? "" : values.activePresetId,
  };
}

/** Replace the look fields with a preset's, keeping the shell settings. */
export function applyPreset(
  values: MarkdownStyleValues,
  presetId: string,
  look: MarkdownLook,
): MarkdownStyleValues {
  return { ...values, ...look, activePresetId: presetId };
}

/**
 * A free display name derived from `base`. Names are labels, not keys, so
 * duplicates get a numeric suffix instead of overwriting silently.
 */
export function uniquePresetName(values: MarkdownStyleValues, base: string): string {
  const taken = new Set(
    [...Object.values(values.presets).map((preset) => preset.name), ...BUILTIN_PRESETS.map((preset) => preset.name)],
  );
  const trimmed = base.trim().slice(0, 40) || "Preset";
  if (!taken.has(trimmed)) return trimmed;
  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = `${trimmed} ${suffix}`.slice(0, 40);
    if (!taken.has(candidate)) return candidate;
  }
  return trimmed;
}

/** True when `id` addresses a saved preset rather than a built-in or working copy. */
export function isUserPreset(values: MarkdownStyleValues, id: string): boolean {
  return Object.hasOwn(values.presets, id);
}

/**
 * Version 2 replaced four fixed colour fields with per-element maps. Version 3
 * added presets; its fields all have defaults, so only the 1 to 2 step has work.
 */
const LEGACY_COLOR_FIELDS: ReadonlyArray<{
  field: string;
  element: string;
  target: "elementColors" | "elementBackgrounds";
}> = [
  { field: "headingColor", element: "heading", target: "elementColors" },
  { field: "boldColor", element: "strong", target: "elementColors" },
  { field: "highlightTextColor", element: "highlight", target: "elementColors" },
  { field: "highlightBackground", element: "highlight", target: "elementBackgrounds" },
];

export const preferences = defineSettings({
  id: "markdown-style",
  scope: "host",
  version: 3,
  schema: markdownStyleSchema,
  migrate(values: unknown, fromVersion: number) {
    if (fromVersion >= 2) return values;
    const legacy = (values ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...legacy };
    const colors: Record<string, string> = {};
    const backgrounds: Record<string, string> = {};
    for (const { field, element, target } of LEGACY_COLOR_FIELDS) {
      const value = legacy[field];
      if (typeof value !== "string" || value === "") continue;
      if (target === "elementColors") colors[element] = value;
      else backgrounds[element] = value;
    }
    next.elementColors = colors;
    next.elementBackgrounds = backgrounds;
    return next;
  },
});

export const readStyle = defineRpc({
  name: "markdown-styler.read",
  input: z.object({}),
  output: z.object({ values: markdownStyleSchema }),
});

export const defaultStyleValues = (): MarkdownStyleValues => markdownStyleSchema.parse({});

/** Heading size presets in px, keyed 小/中/大/特大. 0 means "follow the theme". */
export const HEADING_SIZE_PRESETS = {
  h1: { small: 20, medium: 24, large: 28, extraLarge: 31 },
  h2: { small: 18, medium: 21, large: 24, extraLarge: 27 },
  h3: { small: 15, medium: 18, large: 21, extraLarge: 23 },
} as const;

/** Solid accent swatches for text colors. */
export const SOLID_COLORS = [
  "#e06c75",
  "#d19a66",
  "#dcb56a",
  "#98c379",
  "#56b6c2",
  "#61afef",
  "#6f9dd8",
  "#b078d0",
  "#a78bfa",
  "#e06c9f",
  "#c09664",
] as const;

/** Translucent tints for backgrounds. */
export const TINT_COLORS = [
  "#e06c7533",
  "#dcb56a33",
  "#98c37933",
  "#56b6c233",
  "#61afef33",
  "#b078d033",
  "#a78bfa33",
  "#e06c9f33",
] as const;

/**
 * Read-only starting points. Selecting one loads its look as a working copy, so
 * edits never touch the built-in; saving under a new name keeps them.
 */
export interface BuiltinPreset {
  readonly id: string;
  readonly name: string;
  readonly look: MarkdownLook;
}

interface Palette {
  readonly base: string;
  readonly keyword: string;
  readonly comment: string;
  readonly string: string;
  readonly number: string;
  readonly func: string;
  readonly type: string;
}

/**
 * Map a syntax palette onto Markdown roles. The palettes are the app's own
 * highlight themes, so a built-in preset matches the code colors a reader
 * already sees next to the prose.
 */
function lookFromPalette(palette: Palette): MarkdownLook {
  return lookSchema.parse({
    elementColors: {
      heading: palette.keyword,
      paragraph: palette.base,
      blockquote: palette.comment,
      admonition: palette.type,
      rule: palette.comment,
      image: palette.base,
      strong: palette.func,
      emphasis: palette.type,
      strikethrough: palette.comment,
      underline: palette.func,
      superscript: palette.number,
      subscript: palette.number,
      highlight: palette.number,
      // The Moyf-only highlight parser keys off `mark`; leaving it unset keeps
      // the theme's own treatment on clients that do support it.
      link: palette.func,
      linkCode: palette.string,
      inlineCode: palette.string,
      codeBlock: palette.comment,
      codeBlockText: palette.base,
      table: palette.comment,
      tableHeader: palette.keyword,
      tableCell: palette.base,
      tableRowEven: palette.base,
      tableRowOdd: palette.base,
      listItem: palette.base,
      listMarker: palette.number,
      taskCheckbox: palette.func,
    },
  });
}

export const BUILTIN_PRESETS: readonly BuiltinPreset[] = [
  {
    id: "one-dark",
    name: "One Dark",
    look: lookFromPalette({
      base: "#abb2bf", keyword: "#c678dd", comment: "#5c6370", string: "#98c379",
      number: "#d19a66", func: "#61afef", type: "#e5c07b",
    }),
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    look: lookFromPalette({
      base: "#cdd6f4", keyword: "#cba6f7", comment: "#9399b2", string: "#a6e3a1",
      number: "#fab387", func: "#89b4fa", type: "#f9e2af",
    }),
  },
  {
    id: "dracula",
    name: "Dracula",
    look: lookFromPalette({
      base: "#f8f8f2", keyword: "#ff79c6", comment: "#6272a4", string: "#f1fa8c",
      number: "#bd93f9", func: "#50fa7b", type: "#8be9fd",
    }),
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    look: lookFromPalette({
      base: "#c0caf5", keyword: "#bb9af7", comment: "#565f89", string: "#9ece6a",
      number: "#ff9e64", func: "#7aa2f7", type: "#2ac3de",
    }),
  },
  {
    id: "nord",
    name: "Nord",
    look: lookFromPalette({
      base: "#d8dee9", keyword: "#81a1c1", comment: "#616e88", string: "#a3be8c",
      number: "#b48ead", func: "#88c0d0", type: "#8fbcbb",
    }),
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    look: lookFromPalette({
      base: "#ebdbb2", keyword: "#fb4934", comment: "#928374", string: "#b8bb26",
      number: "#d3869b", func: "#8ec07c", type: "#fabd2f",
    }),
  },
];

// The library tags every rendered Markdown block with this class on web.
const SCOPE = ".enrm-text";

/**
 * Build the injected stylesheet. Pure string work so every runtime can use it.
 * The renderer writes inline styles, so every declaration needs `!important`.
 */
export function buildMarkdownCss(values: MarkdownStyleValues): string {
  if (!values.enabled) return "";
  const rules: string[] = [];
  const sizes: Array<[string, number]> = [
    ["h1", values.h1Size],
    ["h2", values.h2Size],
    ["h3", values.h3Size],
  ];
  for (const [tag, size] of sizes) {
    if (size > 0) rules.push(`${SCOPE} ${tag} { font-size: ${size}px !important; }`);
  }
  if (values.headingLevelIndicators) {
    const indicators: Array<[string, string]> = [
      ["h1", "#"],
      ["h2", "##"],
      ["h3", "###"],
    ];
    for (const [tag, prefix] of indicators) {
      rules.push(
        `${SCOPE} ${tag}::before { content: "${prefix}"; opacity: 0.5; font-weight: 400; margin-right: 8px; }`,
      );
    }
  }
  // Iterate the registry, not the stored map, so removed ids stop styling and
  // the emitted order stays stable across settings edits.
  for (const element of STYLE_ELEMENTS) {
    const declarations: string[] = [];
    const color = values.elementColors[element.id];
    if (color) declarations.push(`color: ${color} !important;`);
    const background = values.elementBackgrounds[element.id];
    if (background && element.background) {
      declarations.push(`background-color: ${background} !important;`);
      // The renderer draws the admonition and table accent as a border.
      if (element.id === "admonition") declarations.push(`border-inline-start-color: ${background} !important;`);
      if (element.id === "table") declarations.push(`border-color: ${background} !important;`);
      if (element.id === "rule") declarations.push(`border-top-color: ${background} !important;`);
    }
    if (declarations.length === 0) continue;
    const selector = element.selector
      .split(",")
      .map((part) => `${SCOPE} ${part.trim()}`)
      .join(",");
    rules.push(`${selector} { ${declarations.join(" ")} }`);
  }
  const custom = values.customCss.trim();
  if (custom) rules.push(custom);
  return rules.join("\n");
}
