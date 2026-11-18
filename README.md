# Markdown Styler

English · [简体中文](README.zh-CN.md)

<img src="assets/icon.png" alt="Markdown Styler icon" width="128" height="128" />

![Markdown Styler settings with live preview](assets/screenshot.webp)

A [Paseo](https://paseo.sh) plugin that adjusts how rendered Markdown looks in the Paseo app — per-element colors, heading sizes and custom CSS — without replacing the built-in renderer. The settings page includes a live preview rendered through Paseo's own Markdown pipeline.

> **This is a customized fork** of [Moyf/paseo-markdown-styler](https://github.com/Moyf/paseo-markdown-styler) by [Moyf](https://github.com/Moyf). All credit for the original plugin design and the stylesheet-injection approach belongs to its author. See [What this fork changes](#what-this-fork-changes) for the differences; the original is still the version to install if you only want the four-color feature set.

## How it differs from chat-replacement plugins

Plugins such as Beautiful Chat or Better Paseo **replace** the built-in chat renderer with their own, so every upstream rendering improvement must be re-implemented by the plugin before it appears. Markdown Styler takes the opposite approach: it **keeps Paseo's native chat view as the renderer** and only injects a stylesheet on top of it.

In practice:

- New Paseo features land in your chat the moment you update Paseo — Mermaid diagrams, workspace file links and images, native selection, tables, task lists, admonitions, timeline refinements — nothing to wait for and nothing to fall back on.
- No parallel Markdown pipeline to maintain, so the plugin cannot lag behind Paseo releases or lose compatibility with them.
- The cost: styling is limited to what CSS can express over the native output. If you want a fully different chat layout (compact tool rows, custom cards, a tasks board), a replacement plugin like Beautiful Chat is the right tool; if you want **your** Markdown styling to always track the latest Paseo, this is the lighter one.

## What this fork changes

The upstream plugin exposes four hard-coded colors (heading, bold, highlight text and highlight background). This fork replaces that with a full per-element system:

- **26 elements, each with its own colors.** Every block, inline, list and table element the renderer emits gets a text color and, where the element has a background, a background color. Selectors were read from the app bundle's own `blockRenderers` / `inlineRenderers` / `listRenderers` / `tableRenderers`, not guessed.
- **Presets.** Six built-in looks (One Dark, Catppuccin, Dracula, Tokyo Night, Nord, Gruvbox, using the same palettes as the app's code-highlight themes) plus up to 24 of your own. A preset stores the whole look, and editing while one is active writes back into it.
- **System colour picker** per field, alongside the swatch row and the hex input.
- **Two-column settings layout** that widens past the page's content cap; the colour column and the right-hand panes scroll independently.
- **Fixed a data-loss bug** in the original save path: rapid swatch taps wrote from a stale render closure and lost all but the last change to a compare-and-swap conflict. Saves are now single-flight with a debounce.
- **Schema v3** with migrations from the v1 and v2 settings shapes, so existing settings carry over.

The element registry, preset helpers and CSS builder live in `shared/style.ts`; all UI is in `client/settings-screen.tsx`.

Because the selectors mirror Paseo's DOM structure, a Paseo release that restructures the Markdown renderer can silently break a rule. The registry is the place to look when a style stops applying.

## Install

```bash
paseo plugin add git:Tunging/paseo-markdown-styler
```

The fork's default branch is `custom-styling`, so the command above installs the customized version. To pin a specific ref explicitly:

```bash
paseo plugin add git:Tunging/paseo-markdown-styler --ref custom-styling
```

Requires Paseo `>=0.14.0`. The bare `owner/repo` form does **not** work for this repository — the daemon reads that form as a plugin-registry reference, and this plugin is not published to the Paseo registry. Use the `git:` prefix.

Or install from a local checkout:

```bash
paseo plugin install /absolute/path/to/paseo-markdown-styler
```

To get the unmodified original instead:

```bash
paseo plugin add git:Moyf/paseo-markdown-styler
```

## Development

```bash
npm install
npm run typecheck
paseo plugin reload paseo-markdown-styler
```

The repository has two remotes: `origin` is this fork, `upstream` is `Moyf/paseo-markdown-styler`. To pull upstream changes:

```bash
git fetch upstream
git merge upstream/main
```

`package-lock.json` is still the upstream lockfile; regenerate it with `npm install` after any dependency change.

The plugin is client-side only: `index.server.ts` exists to persist settings and serve them to clients. CSS injection applies on desktop and browser clients; the ==highlight== syntax requires the Moyf Paseo build's parser support and is detected automatically, and the two highlight fields hide themselves on clients without it.

## Credits

Original plugin and concept: [Moyf](https://github.com/Moyf) — [Moyf/paseo-markdown-styler](https://github.com/Moyf/paseo-markdown-styler). The build-injection architecture, the `enrm-text` scoping and the original settings design come from that project.

## License

No license file is included, matching upstream — the original repository does not carry one either. If you intend to redistribute this fork, ask the original author for terms first.
