Markdown Styler adjusts how rendered Markdown looks in the Paseo app without replacing the built-in renderer. It injects a small stylesheet on web clients (desktop and browser) that covers chat replies, file previews, plan cards and other Markdown surfaces.

Unlike chat-replacement plugins (Beautiful Chat, Better Paseo), it keeps Paseo's native chat view as the renderer and only styles its output, so upstream rendering features land immediately on Paseo updates instead of waiting for plugin re-implementation.

A live preview on the settings page renders sample headings, bold text and highlights through Paseo's own Markdown pipeline, so every change shows before leaving the page.

## What it can change

- Heading sizes for H1 to H3 in preset steps, or following the theme per level.
- A text color and, where the element has one, a background color for each of the 26 elements the renderer emits: headings, body paragraphs, blockquote, admonitions, thematic break, images, bold, italic, strikethrough, underline, superscript, subscript, highlight, links, code inside links, inline code, code block frame and text, table border, header, cell, even and odd row backgrounds, list items, list markers and task checkboxes. Solid swatches cover text colors; translucent tints cover backgrounds. Custom values accept #RRGGBB and #RRGGBBAA, typed or chosen from the system colour picker.
- Heading level indicators: an optional # / ## / ### marker before each heading, default off.
- Custom CSS appended after the generated rules, written in a multi-line editor with drag-to-resize.

Swatch taps and size and toggle changes apply immediately; custom color values and custom CSS use a save button. Settings saved by version 1 of the plugin keep their heading, bold and highlight colors, which move to the matching per-element fields on first load.

## Layout

The settings page puts the colour controls on the left and splits the right side into two stacked panes: presets on top, the live preview below. Each pane scrolls on its own, so a growing preset list cannot push the preview or the load controls out of view. The left column scrolls independently too, and the layout widens past the page's usual content cap to use the space a wide window has. When the pane is too narrow for two readable columns the page falls back to a single column ordered preview, presets, colours.

## Presets

Six built-in looks ship with the plugin, using the same palettes as the app's code highlighting themes: One Dark, Catppuccin, Dracula, Tokyo Night, Nord and Gruvbox. Loading one is read-only; it fills the controls so you can adjust it.

Saving stores the whole look under a name: every color, every background, the three heading sizes, the level-indicator switch and the custom CSS. Up to 24 presets are kept. While a preset is active, editing any control writes back into it, so switching away and returning keeps the change. Renaming keeps the look; deleting removes the stored copy but leaves what is on screen alone, which turns it into an unsaved working copy. Duplicate names get a numeric suffix rather than overwriting.

The injection switch is not part of a preset, because it is a global toggle rather than a look.

## How it works

The plugin generates one stylesheet from the settings and injects it into the app document. The element list is not a guess: it mirrors the renderer's own block, inline, list and table maps, so every id addresses an element Paseo actually produces. The renderer writes its colors inline, so generated declarations carry `!important`.

It styles the elements the built-in renderer produces; it never replaces that renderer, so Mermaid diagrams, file links, images and selection behavior are unaffected. Settings persist on the daemon, so every connected client reads the same values.

## Requirements and limits

CSS injection applies on desktop and browser clients only. The settings save on every platform, but phone rendering is unchanged.

The ==highlight== syntax depends on parser support that currently ships only in the Moyf Paseo build. The settings page detects this automatically by rendering a sample: on clients without support, the highlight settings hide and the preview shows the syntax as typed. Every other element works in any Paseo build.

Background colors apply only to elements that have one in the renderer: highlight, admonitions, inline code, code blocks, table headers, table rows, the thematic break, and images. Elements without a background of their own are skipped for that field.

Removing the plugin removes the injected stylesheet.
