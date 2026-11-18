# NodeForge

Custom ComfyUI nodes for working with files and JSON.

## Nodes

### NodeForge: Load File

Category: `NodeForge/IO`

Loads a text or JSON file from the ComfyUI **input** or **output** folder. Click the file box to open a browser with a filter, a small/large view toggle, thumbnails for images, a preview, and INPUT/OUTPUT badges with the folder path. Supported types: `.txt`, `.json`, `.md`, `.csv`, `.log`. The popup and node use a blue accent (`#4ea8ff`).

**Inputs**

| Input | Choices | Default | Notes |
|---|---|---|---|
| `file` | files from input and output | none | Shown as `input/...` or `output/...`. The type is taken from the name: `.json` is JSON, anything else is text. Disabled while `file_path` is set. |
| `file_path` | text, or a link from another node | empty | Optional. A path under input or output, e.g. `output/run1/cfg.json`. Use `\` or `/`. Absolute paths and `..` are refused. When set, it overrides `file`. |
| `output_type` | `string`, `json`, `json_split`, `text_parsed` | `string` | See the table below. |
| `keys` | multi-line text | empty | Shown for `json_split` (key paths) and `text_parsed` (section names, or `section/field`). One entry per line. |
| `Pick keys` | button | - | Shown for `json_split` on a `.json` file, and for `text_parsed` on a text file. Works with `file` or a typed `file_path`. A linked `file_path` disables it, because the path is only known at run time. The popup shows the file's name, folder, type, size and section or key count, then the tree. For JSON it opens the file as a tree. For text it lists the sections, and each section expands to its fields. Click a row, or the checkbox on a group, to select it, then click Add to append it to `keys`. |

**Output type**

| File | `output_type` | Output |
|---|---|---|
| text (not `.json`) | `string` | `text`: the file text. |
| text (not `.json`) | `text_parsed` | One output per entry in `keys`: a section (`beat.01`, its raw text) or a field (`beat.01/action`, its value). With no keys, `text`: the file text, unchanged. |
| `.json` | `string` | `text`: the file text, unchanged. |
| `.json` | `json` | `json`: pretty-printed JSON text. |
| `.json` | `json_split` | One output per key, in the order listed. |

A text file with `json` or `json_split` is an error. A `.json` file with `text_parsed` is also an error.

**Text parsed format (INI-style)**

A text file for `text_parsed` uses sections, not free text:

```ini
; comment lines start with ;
[meta]
title = Morning Idlis
runtime_target_sec = 48

[beat.01]
action = Lakshmi enters with the idli plate.
dialogue = C1: "Wake up, the idlis are hot."
start = Arjun seated at the table,
  tumblers full on the table.
end = Lakshmi sets the plate down.

[end]
```

- A `[section]` header sits alone at column 0. Names use letters, digits, `_`, `.` and `-`.
- `key = value` lines hold one field. Blank values are allowed.
- An indented line (two or more spaces) continues the previous value on a new line.
- `[end]` is required and must be the last line. A missing `[end]` means the text was cut off, so the run stops with an error.
- Duplicate sections or keys are errors and name the line.

**Pick keys for `text_parsed`** lists the sections. Each section row can be selected whole, or expanded to pick single fields:

- `beat.01` outputs the whole section as written, header line included, so it can be fed straight back into a text parser or prompt.
- `beat.01/action` outputs one field's value as plain text, without the key name.

Section and field names must match exactly. Up to 16 keys per run, counting sections and fields together.

**Key paths** (`json_split`)

- Use dots or brackets: `name`, `models.0.name`, or `models[0].name`.
- Up to 16 keys. Blank lines are ignored.
- A missing key stops the run with an error that names the path.
- Each split output is named after its key. Its type follows the value:
  - Strings, numbers and booleans pass through as their own type.
  - Objects, lists and `null` are passed as JSON text.

**Example**

File `input/sub/cfg.json`:

```json
{"name": "base", "steps": 20, "models": [{"id": 7}]}
```

Settings: `file` = a `.json` file, `output_type` = `json_split`, `keys`:

```
name
steps
models.0.id
```

Outputs: `name` = `"base"`, `steps` = `20`, `models.0.id` = `7`.

**Limits**

- Files over 10 MB are refused.
- Files must be UTF-8 (a BOM is allowed).
- The node re-runs when the file content changes.

### NodeForge: Load Image

Category: `NodeForge/IO`

Loads one or more images from the ComfyUI **input** and **output** folders (subfolders included, images only). Click **Select images** to open a multi-select popup. Click images to select them in order (up to 10), then press Enter or **Done**. Esc or **Cancel** closes the popup without changes.

The popup has a filter (**Both**, **Input**, **Output**), a search box, a **Grid** or **List** view, and an **Upload** button. The uploaded image is saved to the ComfyUI input folder. It is added to the picked images if there is room. Uploads are not limited by the 10-image cap, but the selection is. The node preview has a small grid/list button next to **Select images**. Both views remember the last choice in the session.

Each image gets its own output pair. The backend always has 10 pairs; the node shows only as many as are selected (1 image gives 1 pair, 2 images give 2 pairs, and so on). The mask is `1 - alpha`, so transparent pixels are 1; with no alpha channel the mask is all zeros. Only the first frame of animated images is read. EXIF rotation is applied.

**Inputs**

| Input | Default | Notes |
|---|---|---|
| `images` | empty | Selected files, one per line, set by the popup. Entries start with `input/` or `output/`. |
| `display` | `grid` | `grid` or `list`. Set by the grid/list button on the node. Controls the preview only. |
| `file_path` | empty | Optional. Paths under `input/` or `output/`, one per line (backslashes are accepted). They are added to the selected `images`, and duplicates are skipped. The total is capped at 10. |

**Outputs**

| Output | Type |
|---|---|
| `image_1` … `image_10` | `IMAGE`, `[1, H, W, 3]`, float 0–1 |
| `mask_1` … `mask_10` | `MASK`, `[1, H, W]`, float 0–1 |

Unused pairs are empty (`None`). Selecting no image, or more than 10, is an error.

The node re-runs when any selected file content changes. Requires `torch`, `numpy` and `Pillow`, which ComfyUI already provides.

### NodeForge: Variables

Category: `NodeForge/Text`

Sets named text values. Click **+ Add variable** to add a row, and × to remove it. Each row has a **name** and a **value**. The count is unlimited.

Names may use letters, digits, `_` and `-`. Rows with a blank name are skipped. A name used twice is an error.

**Increment:** the small **+step** box adds a whole number to the value on each run. Leave it blank or `0` for no change. With value `1` and step `2`, the runs give `1`, `3`, `5`. A negative step counts down. Leading zeros are kept, so `001` with step `1` gives `002`. The value must be a whole number. The count is kept by the server and restarts from the typed value when you change it or restart ComfyUI.

**Choice:** switch a row's **Value / Choice** toggle to **Choice** to pick one of several options. The options are hidden by default. Click the **N options ▾** button to expand them inline, where you can add, edit, reorder, or remove options. Each option has a **label** (shown in the dropdown) and a **value** (the text that is output, can be several lines). Labels must be unique. Use the dropdown on the node to pick the active option. A choice row has no step.

**Outputs:**
- `variables` (`STRING`): a JSON object of name to value, for all rows. Connect it to **NodeForge: ResolveString**.
- `v_choice_1` … `v_choice_8` (`STRING`): one output per choice row, in row order (not counting value rows). Each outputs the selected option's **label**, so you can branch on the mode (for example `Scene only`, `Reference only`, `Both`). The number of outputs follows the number of choice rows. Numbers are by position among choice rows only, so deleting an earlier choice row renumbers the later ones and their links must be reconnected. More than 8 choice rows is an error.

### NodeForge: ResolveString

Category: `NodeForge/Text`

Replaces `%Variables.name%` and `%date:FORMAT%` tokens in one or more strings. Click **+ Add string** to add a text box, and × to remove it. Up to 16 strings.

**Inputs**

| Input | Notes |
|---|---|
| `strings` | One text box per string. Set by the node, not a socket. |
| `variables` | Optional. Connect the output of **NodeForge: Variables**. Without it, any token is an error. |

**Outputs:** `string_1` … `string_N`, one per string box, `STRING`. The number of outputs follows the number of boxes.

Example: a Variables row `folder_001` = `tmp001`, and a string `output/%Variables.folder_001%/prompt_00001.txt` resolves to `output/tmp001/prompt_00001.txt`. Connect `string_1` to a Save node's `filename_prefix` to use the result there.

Date tokens use the same format letters as core ComfyUI: `yyyy`, `yy`, `MM`, `dd`, `hh` (24-hour), `mm`, `ss`. For example `%date:yyyy-MM-dd_hh-mm-ss%` gives `2026-11-18_02-23-10`. The time is the server's local time when the queue runs, and all strings in one run share the same time.

Tokens are replaced once (values are not expanded again). Dates are replaced first, so a variable value that contains `%date:...%` stays as typed. An unknown name, or a malformed input, stops the run with an error that names the node.

### NodeForge: Switch Case

Category: `NodeForge/Flow`

Works like a `match`/`case` or `switch` statement. It compares `value` with the case labels in `cases`, one per line, in order. Line N goes to `case_result_N`. The first match wins, and no later case is checked. Only the selected input is evaluated, so unused branches (for example expensive image nodes) never run.

**Inputs**

| Input | Notes |
|---|---|
| `value` | INT or STRING. Connect a value, for example a Primitive or a string output. |
| `cases` | Multiline. One label per line. Lines are trimmed, trailing empty lines are ignored. Empty lines in the middle still take a case number but never match. |
| `case_result_1` … `case_result_10` | Optional, lazy. Any type. Each one is evaluated only when its label is selected. |
| `default` | Optional, lazy. Used when no label matches. |
| `on_no_match` | `error` (default) raises an error that names the value. `block` stops downstream nodes from running, without an error. |
| `string_match` | `case_sensitive` (default) or `case_insensitive`. Affects STRING values only. |

**Output:** `result`, type `*`. Connect it to any node that accepts the selected type.

Rules:
- For an INT value, labels are read as integers. A label that is not a whole number (for example `abc` or `1.5`) never matches.
- A value that is not INT or STRING is an error.
- A matched label whose `case_result_N` input is not connected is an error, even when `on_no_match` is `block`.
- Labels beyond line 10 have no input. If one matches, the node raises an error.
- With `default` connected and no match, the default is used and `on_no_match` is not applied.

Example: `value` = `2`, `cases` = `1` / `2` / `3`, with image branches on `case_result_1`–`_3`. Only the image branch for `2` runs.

### NodeForge: Config Table

Category: `NodeForge/Flow`

Looks up `env` in a table built on the node with buttons and fields, and sends each value of the matching block to its own output. Works for any selector name, for example `env`, `project` or `plan`.

**Inputs**

| Input | Notes |
|---|---|
| `env` | STRING. The block name to select, for example `prod`, `dev` or `plan_pro`. Matching is exact and case-sensitive. Whitespace around the value is ignored. |
| `table` | Edited with buttons and fields on the node (see below). Stored as text in the workflow. |

**Outputs:** one per key, type `*`, labelled with the key name (for example `width`, `height`). The node shows only as many outputs as there are keys, up to 10. Values go out in the order of the keys. Renaming a key changes its output label. Outputs removed by deleting keys are dropped from the node, so reconnect any links to the outputs that remain.

**Values:** each value is 1 word or up to 1000 words. The box stays one line tall and shows the start of the text. Click **⤢** beside a value to see or edit the full text in a popup. Values may contain line breaks. The table stores them as `\n` and a literal backslash as `\\`, so keep these escapes when editing the saved text by hand.

**Editing the table on the node**

- **+ Add tag** creates a block such as `prod` or `dev`. Click a tag button to edit it. The tag name is a field, and **Remove tag** deletes it.
- Under the tags, each key has a `key` field and a `value` field. **+ Add key** adds a key to every tag (up to 10). The × button removes it from every tag.
- Fields turn red when a name is empty or duplicated, or a value is empty.

The table is saved as this text, which the node parses when it runs:

```
keys: width, height
[prod]
width=100
height=200
[dev]
width=50
height=100
```

- The first non-empty line is `keys:` followed by comma-separated key names (at most 10, no duplicates).
- Each `[name]` line starts a block. Each `key=value` line after it sets one key. Split on the first `=`.
- Every block must set every key. Unknown, duplicate or missing keys stop the run with an error.
- Values are typed automatically: whole numbers become INT, decimals become FLOAT, and anything else stays text.

Rules:
- An `env` value with no matching block is an error. The message lists the blocks in the table.
- Errors name the node and the line or block involved.

## Install

Copy this folder into `ComfyUI/custom_nodes/` and restart ComfyUI. No extra packages are needed.

## Tests

```
pip install pytest
pytest
```
