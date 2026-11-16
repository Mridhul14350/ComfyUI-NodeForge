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
| `output_type` | `string`, `json`, `json_split` | `string` | See the table below. |
| `keys` | multi-line text | empty | Shown only for a `.json` file with `json_split`. One path per line. |
| `Pick keys` | button | - | Shown only for a `.json` file with `json_split`. Opens a popup with the JSON file as a tree. Click a row, or the checkbox on a group, to select it, then click Add to append it to `keys`. Click a group's arrow to expand it. Disabled while `file_path` is set. |

**Output type**

| File | `output_type` | Output |
|---|---|---|
| text (not `.json`) | `string` | `text`: the file text. |
| `.json` | `string` | `text`: the file text, unchanged. |
| `.json` | `json` | `json`: pretty-printed JSON text. |
| `.json` | `json_split` | One output per key, in the order listed. |

A text file with `json` or `json_split` is an error. Pick a `.json` file instead.

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
