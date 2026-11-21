# NodeForge

Custom ComfyUI nodes for working with files, JSON and text.

## Nodes

### NodeForge: Load File

Category: `NodeForge/IO`

Loads a text or JSON file from the ComfyUI **input** or **output** folder. Click the file box to open a browser with a filter, a small/large view toggle, thumbnails for images, a preview, and INPUT/OUTPUT badges with the folder path. Supported types: `.txt`, `.json`, `.md`, `.csv`, `.log`. The popup and node use a blue accent (`#4ea8ff`). The node fits its height to its content in every output mode, so there is no empty space; `keys` mode only grows the node.

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

The popup has a filter (**Both**, **Input**, **Output**), a search box, a **Grid** or **List** view, and an **Upload** button. The uploaded image is saved to the ComfyUI input folder. It is added to the picked images if there is room. Uploads are not limited by the 10-image cap, but the selection is. The node preview has a small grid/list button next to **Select images**. The popup remembers its last filter and grid/list view for the session. With the pointer over the node preview, the mouse wheel scrolls it instead of zooming the canvas.

By default each image gets its own output pair. The backend always has 10 pairs; the node shows only as many as are selected (1 image gives 1 pair, 2 images give 2 pairs, and so on). Click the **Batch: off** button next to **Select images** to switch to batch mode, which then reads **Batch: on**. In batch mode all selected images form one batched `IMAGE` and one `MASK` (the node shows them as `images` and `masks`; the output names stay `image_1` / `mask_1`). Pictures of a different size are resized to the first picture's size with ComfyUI's center crop. The mask is `1 - alpha`, so transparent pixels are 1; with no alpha channel the mask is all zeros. Only the first frame of animated images is read. EXIF rotation is applied.

**Inputs**

| Input | Default | Notes |
|---|---|---|
| `images` | empty | Selected files, one per line, set by the popup. Entries start with `input/` or `output/`. |
| `display` | `grid` | `grid` or `list`. Set by the grid/list button on the node. Controls the preview only. |
| `file_path` | empty | Optional. Paths under `input/` or `output/`, one per line (backslashes are accepted). They are added to the selected `images`, and duplicates are skipped. The total is capped at 10. The box shows one line while empty (placeholder `file_path`), grows to 5 lines, then scrolls. |
| `batch` | `false` | `true` or `false`. Set by the **Batch** button on the node. `true` returns all selected images as one batched pair in `image_1` / `mask_1`. |

**Outputs**

| Output | Type |
|---|---|
| `image_1` … `image_10` | `IMAGE`, `[1, H, W, 3]`, float 0–1. With `batch` on, `[N, H, W, 3]` in `image_1` only. |
| `mask_1` … `mask_10` | `MASK`, `[1, H, W]`, float 0–1. With `batch` on, `[N, H, W]` in `mask_1` only. |

Unused pairs are empty (`None`). Selecting no image, or more than 10, is an error.

The node re-runs when any selected file content changes. Requires `torch`, `numpy` and `Pillow`, which ComfyUI already provides.

### NodeForge: Variables

Category: `NodeForge/Text`

Sets named text values. The editor is a NAME / VALUE table, like ResolveString. Click **+ Add Variables** to add a row, and × to remove it. The value box is wide. The count is unlimited.

Names may use letters, digits, `_` and `-`. Rows with a blank name are skipped. A name used twice is an error.

**Config (⚙):** click ⚙ on a row to open its popup. The popup holds the **Value / Choice** toggle. A value row shows a larger value box for multi-line text and the **step** box. A choice row shows the **Options** list. **Save** applies the changes; **Cancel**, or a click outside the popup, discards them. The table shows the value, or the dropdown for a choice row.

**Increment:** in the ⚙ popup, the **step** box adds a whole number to the value on each run. Leave it blank or `0` for no change. With value `1` and step `2`, the runs give `1`, `3`, `5`. A negative step counts down. Leading zeros are kept, so `001` with step `1` gives `002`. The value must be a whole number. The count is kept by the server and restarts from the typed value when you change it or restart ComfyUI.

**Choice:** in the ⚙ popup, switch the toggle to **Choice** to pick one of several options. The table then shows a dropdown in place of the value. The **Options** list lets you add, edit, reorder (↑ ↓), or remove options. Each option has a **label** (shown in the dropdown) and a **value** (the text that is output, can be several lines). Labels must be unique. Use the dropdown on the node to pick the active option. A choice row has no step.

**Outputs:**
- `variables` (`STRING`): a JSON object of name to value, for all rows. Connect it to **NodeForge: ResolveString**.
- One output per choice row (up to 8), in row order (not counting value rows). Each output is labelled with its row's **name**. It outputs the selected option's **value**, not its label. The label is only the text shown in the dropdown. The type follows the values of all options in that row, the same rule as Config Table: every option a whole number gives `INT`, whole numbers with at least one decimal give `FLOAT`, and any other text or an empty option gives `STRING`. The number of outputs follows the number of choice rows. Outputs are connected by position among choice rows, so deleting an earlier choice row shifts the later outputs and their links must be reconnected. Changing a row's type also changes its output type, so reconnect links that no longer match. More than 8 choice rows is an error.

### NodeForge: ResolveString

Category: `NodeForge/Text`

Replaces `%name%` (a Variables name) and `%date:FORMAT%` tokens in one or more strings. The editor is a KEY / VALUE table. Click **+ Add key** to add a row, and × to remove it. The value box is wide, and ⤢ opens it in a larger editor for multi-line text. Up to 16 rows.

Each row's **key** is the output's label, so name it for what it carries (for example `image_prefix`). Keys must be filled in and unique; a blank or duplicate key is an error and is shown in red. Workflows saved with the older plain-text list still load; their outputs are named by position.

**Inputs**

| Input | Notes |
|---|---|
| `strings` | One KEY / VALUE row per output. Set by the node, not a socket. |
| `variables` | Optional. Connect the output of **NodeForge: Variables**. Without it, `%name%` tokens are left as text. |

**Outputs:** `string_1` … `string_N`, one per row, `STRING`. Each output is labelled with its row's key. The number of outputs follows the number of rows. Output names stay positional, so links are not affected by renaming a key.

Example: a Variables row `folder_001` = `tmp001`, and a string `output/%folder_001%/prompt_00001.txt` resolves to `output/tmp001/prompt_00001.txt`. Use the name alone, without a prefix. A `%...%` that matches no variable name is left unchanged, so `100%_done%` stays as typed. Two tokens cannot share one `%`: in `%x%y%`, where `x` is unknown, `%y%` is not replaced. Write `%x%%y%` or put a character between them. Old `%Variables.name%` tokens are not replaced and must be changed to `%name%`. Connect `string_1` to a Save node's `filename_prefix` to use the result there.

Date tokens use the same format letters as core ComfyUI: `yyyy`, `yy`, `MM`, `dd`, `hh` (24-hour), `mm`, `ss`. For example `%date:yyyy-MM-dd_hh-mm-ss%` gives `2026-11-18_02-23-10`. The time is the server's local time when the queue runs, and all strings in one run share the same time.

Tokens are replaced once (values are not expanded again). Dates are replaced first, so a variable value that contains `%date:...%` stays as typed. An unknown name is not an error; its token stays as text. A malformed `strings` or `variables` input, or a duplicate key, stops the run with an error that names the node.

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
| `env` | STRING, shown as **output tag**. A dropdown that lists the tag names in the table, for example `prod`, `dev` or `plan_pro`. The list updates as tags are added, renamed or removed. Renaming the selected tag keeps it selected under the new name. Removing the selected tag clears the output tag. Matching is exact and case-sensitive. |
| `table` | Edited with buttons and fields on the node (see below). Stored as text in the workflow. |

**Outputs:** output 1 is always `output_tag` (`STRING`): the selected output tag. After it come one output per key, labelled with the key name (for example `width`, `height`). The node shows only as many key outputs as there are keys, up to 10. Values go out in the order of the keys. Renaming a key changes its output label. Outputs removed by deleting keys are dropped from the node, so reconnect any links to the outputs that remain.

Each key output takes its type from that key's values in **every** tag, so the type does not change when you switch the output tag. All whole numbers give `INT`. Decimals give `FLOAT`, and mixing whole numbers and decimals also gives `FLOAT`. Any text, or any empty value, gives `STRING`. A key with no tags yet is `STRING`. The output type updates as you edit. Existing links are not removed when a type changes, so reconnect a link whose type no longer matches the new one.

**Values:** each value is 1 word or up to 1000 words. The box stays one line tall and shows the start of the text. Click **⤢** beside a value to see or edit the full text in a popup. Values may contain line breaks. The table stores them as `\n` and a literal backslash as `\\`, so keep these escapes when editing the saved text by hand.

**Editing the table on the node**

- A new node starts empty: no tags, no keys, and a blank **output tag**. Add tags and keys, then pick the output tag from the dropdown.
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
- Values are typed automatically: whole numbers are passed as numbers (INT), decimals as FLOAT, and anything else as text. Each key's output type is set from its values (see Outputs), so a number connects straight to an INT or FLOAT input with no converter node.

Rules:
- An `env` value with no matching block is an error. The message lists the blocks in the table.
- Errors name the node and the line or block involved.

## Development

Make all changes in this dev copy, never in the installed copy at `ComfyUI/custom_nodes/ComfyUI-NodeForge`. To test a change in ComfyUI, run `scripts\sync-to-comfyui.ps1`. It copies the runtime files (`__init__.py`, `nodes/`, `web/`) into the installed copy.

The sync uses `robocopy /MIR`, which deletes files in the installed copy that are missing from dev, and it makes no backup. Compare the two folders first, and do not sync while a file exists only in the installed copy.
## Install

Copy this folder into `ComfyUI/custom_nodes/` and restart ComfyUI. No extra packages are needed.

## Tests

```
pip install pytest
pytest
```
