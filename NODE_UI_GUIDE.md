# NodeForge UI and Node Design Guide

This guide records the look, layout and frontend patterns used by NodeForge nodes. Read it before building a new node or a new piece of node UI. It is written so the patterns can be reused for any node, not only the current ones.

Read [AGENTS.md](./AGENTS.md) first for the rules on naming, Python structure and the Pixaroma-first process. This file covers the visual and frontend side.

---

## 1. Where things live

| Path | Purpose |
|---|---|
| `nodes/<group>.py` | Python node classes (`io_files.py`, `json_nodes.py`). |
| `web/<node>.js` | Frontend extension for a node: widgets, outputs, popups. |
| `web/file_ui.js` | Shared UI kit: CSS string, `ensureCss()`, file box, file browser. |
| `tests/` | pytest tests for the Python side. |
| `README.md` | User-facing list of nodes, inputs, outputs and examples. |

Shared UI goes in one shared module (`file_ui.js`). Node-specific logic stays in the node's own `web/` file.

---

## 2. Design tokens

Use these values so every NodeForge node looks the same. Only the primary color is set per pack.

### Accent
- Primary accent: `#4ea8ff` (NodeForge blue).
- Define it once as a CSS variable on each root element that uses it:
  `.my-root { --nf-acc:#4ea8ff; }`
- Use `var(--nf-acc)` everywhere. Never hard-code the accent in a rule.
- Pixaroma's accent is not used. If a copied style contains a Pixaroma color, replace it with `--nf-acc`.

### Surfaces and borders
| Role | Value |
|---|---|
| Popup background | `#191919` |
| Field / row background | `#141414` |
| Row hover background | `#1c1c1c` |
| Active row background | `#262626` |
| Code / textarea background | `#1d1d1d` |
| Preview background | `#0f0f0f` |
| Field border | `#3a3a3a` |
| Row border | `#2c2c2c` |
| Divider lines | `#333` |
| Textarea border | `#444` |
| Ghost button background | `rgba(255,255,255,0.05)` |
| Ghost button border | `rgba(255,255,255,0.16)` |
| Overlay | `rgba(0,0,0,0.45)` |
| Popup shadow | `0 14px 40px rgba(0,0,0,0.6)` |

### Text
| Role | Value |
|---|---|
| Primary text | `#ddd` |
| Secondary / path text | `#8a8a8a` to `#9a9a9a` |
| Muted / empty state | `#777` |
| Warning / error status | `#e0a33e` |
| Text on accent fill | `#fff` |

### Shape and size
- Popups: border-radius `9px`, 1px accent border.
- Buttons, fields, rows: border-radius `5px` to `6px`.
- Code and textarea: border-radius `4px`.
- Thumbnails: `5px`.
- Base font size for node UI: `11px`. Labels and rows: `12px`. Badges: `9px`. Sub-text: `10px`.
- Keys, paths and code: `ui-monospace, Consolas, monospace`.
- Use `box-sizing:border-box` on every input, textarea and file box so widths do not overflow.
- Z-index for popups and overlays: `99999`.

### Focus and hover
- Hover: the border changes to `var(--nf-acc)`. Buttons also change text to `#fff`.
- Focus on inputs: `outline:none` and border `var(--nf-acc)`.
- Selected: accent border, accent tint background `color-mix(in srgb, var(--nf-acc) 18%, transparent)`, and accent text where it is a list item.
- Disabled: `opacity:.35` and `cursor:default`.
- Accent checkboxes: `accent-color:var(--nf-acc)`.

---

## 3. Node design

### Python side
- Follow the structure in [AGENTS.md](./AGENTS.md) section 5.
- `CATEGORY` is `NodeForge/<Group>`. Display name is `NodeForge: <Action>`, under about 25 characters.
- Inputs use short `snake_case` names. Outputs are named after the value they carry.
- NodeForge does not set custom node colors in code. The node body uses ComfyUI's defaults, and only the widgets listed below are restyled. If a future node needs a body color, add it in one place and document it here.

### Frontend side
- Hook into the node with `beforeRegisterNodeDef`, matching the node by its `NODE_NAME` (see `web/load_file.js`).
- Wrap `onNodeCreated` and `onConfigure` with the original call first, then add NodeForge behavior.
- Use a `SYNC_WIDGETS` list of widget names. Wrap each widget's `callback` so it calls `syncOutputs(node)`. Also listen to the `input` event on DOM textareas, because multiline text does not always fire the callback while typing.
- After each change, call `syncOutputs(node)` to add or remove outputs.
- Set `node.setSize` / `computeSize` after showing or hiding a widget so the node resizes correctly.

### Hiding a native widget
Keep the native widget so its value still saves, but hide it and draw a custom box in its place:

```js
fileWidget.hidden = true;
fileWidget.computeSize = () => [0, -4];
```

### Adding a custom DOM widget
- Create the element with `document.createElement`, give it a class prefixed `nf-`, and register it with `addDOMWidget(name, "custom", element, options)`.
- Use `"custom"`, not `"customtext"`. The built-in `customtext` type is drawn by the frontend and ignores your element.
- Provide `getValue` and `setValue` so the value saves and restores.
- Set `widget.serialize = false` directly on DOM boxes that only display state. Passing `{ serialize: false }` to `addDOMWidget` is not reliable in this frontend. An unserialized leading widget also shifts `widgets_values`.
- To move a widget to the top of the node, remove it from `node.widgets` and `unshift` it back.
- To replace a built-in text widget with a styled one, remove the old widget from `node.widgets`, then add the DOM widget.

### Saved-workflow compatibility
When a widget is removed or reordered, old saved workflows store values in the old order. Handle this in `onConfigure`:
1. Detect the old layout by array length and value types.
2. Rebuild `widgets_values` in the new order.
3. Set each widget's value explicitly, then call `syncOutputs`.
4. Test by setting `node.widgets_values` to the old array and calling `node.onConfigure()`.

---

## 4. Shared UI components

Reuse these from `web/file_ui.js` before writing new ones. Copy the pattern and change only the accent (already a variable).

| Component | Class names | Notes |
|---|---|---|
| Node file box | `.nf-lf-root`, `.nf-lf-file`, `.nf-lf-col`, `.nf-lf-name`, `.nf-lf-path`, `.nf-lf-chev` | A button that shows the chosen file, with an INPUT/OUTPUT badge and path sub-text. Opens the file browser. |
| Prev / next row | `.nf-lf-nav`, `.nf-lf-iconbtn`, `.nf-lf-idx` | Steps through a list (for example, the file list). Disabled at the ends. |
| Primary button | `.nf-lf-pick` | Full-width accent fill. Used for the main action on the node. |
| Keys / code textarea | `.nf-keys` | Dark `#1d1d1d` background, `#444` border, monospace 11px, resizable vertically, min height 44px. |
| Popup overlay | `.nf-kp-overlay`, `.nf-kp-pop`, `.nf-kp-head`, `.nf-kp-body`, `.nf-kp-foot` | Modal, centered, width `min(520px, 90vw)`, height `70vh`. Header, scrolling body, footer with status and buttons. |
| Tree rows | `.nf-kp-row`, `.nf-kp-arrow`, `.nf-kp-children` | Collapsible rows. Arrow rotates 90° when open. Children are indented with a left border. |
| Popup buttons | `.nf-kp-btn`, `.nf-kp-btn.primary` | Ghost button by default. `primary` uses the accent fill. |
| Status text | `.nf-kp-status`, `.err` | Muted by default, warning color on error. |
| File browser popup | `.nf-fb-pop`, `.nf-fb-head`, `.nf-fb-list`, `.nf-fb-foot` | Floating panel positioned next to its anchor. Max height `80vh`. |
| Search field | `.nf-fb-search` | Full-width in the header row, `#141414` background. |
| Segmented control | `.nf-fb-seg` | Two or more joined buttons. The active one uses the accent fill. Used for list / grid or S / L view. |
| List item | `.nf-fb-item`, `.nf-fb-item.S`, `.nf-fb-item.active`, `.nf-fb-item.on` | Thumbnail, name and sub-text. `S` is the compact size. `active` is keyboard or hover focus. `on` is the selected item. |
| Thumbnail | `.nf-fb-thumb` | 56px square, 26px in `S` view, dark background, `object-fit:cover`. |
| Source badge | `.nf-fb-badge`, `.nf-fb-badge.out` | Tiny outlined label: `INPUT` solid, `OUTPUT` dashed. |
| Preview pane | `.nf-fb-prev`, `.nf-fb-prev img`, `.nf-fb-prev pre` | Shows an image or the first 600 characters of text. Max height 200px. |
| Empty state | `.nf-fb-empty` | Centered muted text when a list is empty. |

### Dropdown pattern (file picker)
ComfyUI's native combo is hidden and kept for its value. The visible dropdown is the file box, and its popup is the file browser.
- Show the source badge, file name and path sub-text on the box.
- Popup has a header (search and view toggle), a list, a preview pane and a footer with the count.
- Support filtering as you type, list and compact views, and a preview for the selected item.
- Thumbnails come from ComfyUI's `/view` endpoint. Text previews come from the same endpoint.
- Close the popup on outside click, and keep one popup open at a time (`closeBrowser`).
- Override pattern: when another input (a typed path or a linked socket) sets the value, disable the box (`.nf-lf-off` dims it to 55% opacity), its nav buttons and dependent buttons. Pass `getComputed()` into `buildFileUi` to drive this. Use `onConnectionsChange` to refresh on link changes.

### Key picker pattern (tree popup)
- Load the JSON, then show it as a tree that expands only the first level.
- Clicking a summary row only toggles expansion. It must not select the row, so a parent path is not added by accident.
- Checkboxes select leaf paths. Pressing Add writes the selected paths into the keys textarea, one per line.
- Cap the file size (`MAX_PICK_BYTES`, 10 MB in the current code).
- Text mode (`text_parsed` on Load File): the same popup lists sections, not a tree. Sections come from `GET /nodeforge/load_file/sections?path=...`, which returns the parsed INI text. Each section row is collapsible. Its checkbox selects the whole section, and its field rows select one field each, written as `section/field`. Pressing Add writes the entries into the keys textarea.

---

## 5. Building a new node: checklist

1. Check Pixaroma for a similar node. If one exists, copy it and remove Pixaroma names, logos and colors. Otherwise use a ComfyUI built-in as the base. (See [AGENTS.md](./AGENTS.md) section 1.)
2. Keep the Pixaroma MIT notice at the top of any copied file, as `io_files.py` does.
3. Set the accent to `#4ea8ff` through `--nf-acc`. Remove all other Pixaroma colors.
4. Reuse components from section 4 before writing new CSS. Add new rules to the shared CSS string in `file_ui.js` only if they are used by more than one node.
5. Use short names for nodes, inputs, outputs, labels and buttons.
6. Hide native widgets you replace. Keep a `serialize` path that round-trips.
7. Handle saved-workflow compatibility if you remove or reorder widgets.
8. Test:
   - Python: `pytest` for the node logic.
   - Frontend: copy the files to the local ComfyUI `custom_nodes` folder, reload the page with the browser tools, and check the node. Confirm that the stylesheet `#nf-ui-css` exists on load, and that the box backgrounds are `#141414` and `#1d1d1d`.
   - Run a real workflow only on a lightweight node. Do not run heavy workflows on the local GPU.
9. Update `README.md` with the node's inputs, outputs and an example.
10. Do not save test workflows to disk unless the user asks.

---

## 6. Pitfalls already hit

- **Styles missing on load.** A stylesheet injected only when a popup opens leaves the node unstyled. Call `ensureCss()` when the node UI is built, not only when the popup opens.
- **Wrong widget type.** `customtext` ignores DOM elements. Use `custom`.
- **Serialize option ignored.** Set `widget.serialize = false` directly.
- **Shifted values after a change.** Old saved workflows keep the old order. Add a migration in `onConfigure`.
- **Summary click toggles the parent.** Stop the click from reaching the row's selection handler.
- **Stale browser tab.** Reload the page after syncing files, and accept the `beforeunload` dialog.
- **Text previews.** Limit the preview to 600 characters so large files do not slow the popup.
