# NodeForge

Custom ComfyUI nodes for working with files and JSON.

## Nodes

### NodeForge: Load File

Category: `NodeForge/IO`

Loads a text or JSON file from the ComfyUI **input** or **output** folder. Click the file box to open a browser with a filter, a small/large view toggle, thumbnails for images, a preview, and INPUT/OUTPUT badges with the folder path. Supported types: `.txt`, `.json`, `.md`, `.csv`, `.log`. The popup and node use a blue accent (`#4ea8ff`), styled after Pixaroma (MIT). Pixaroma-derived CSS and layout are adapted in `web/file_ui.js`.

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

## Install

Copy this folder into `ComfyUI/custom_nodes/` and restart ComfyUI. No extra packages are needed.

## Tests

```
pip install pytest
pytest
```
