"""NodeForge: Config Table looks up env in a table typed into the node and sends each
value of the matching [name] block to its own output slot, in keys: order."""

import re

MAX_KEYS = 10
CONFIG_LABEL = "NodeForge: Config Table"
DEFAULT_ENV = ""
DEFAULT_TABLE = ""

_INT = re.compile(r"-?\d+")
_FLOAT = re.compile(r"-?\d+\.\d+")


def _error(message):
    return ValueError(f"{CONFIG_LABEL}: {message}")


_ESCAPES = {"\\": "\\\\", "\n": "\\n", "\r": "\\r"}
_UNESCAPES = {"\\": "\\", "n": "\n", "r": "\r"}


def escape_text(text):
    """Escape a value so it fits on one table line: backslash becomes \\\\ and newline becomes \\n."""
    return "".join(_ESCAPES.get(ch, ch) for ch in text)


def unescape_text(text):
    out = []
    chars = iter(text)
    for ch in chars:
        if ch != "\\":
            out.append(ch)
            continue
        nxt = next(chars, "\\")
        out.append(_UNESCAPES.get(nxt, "\\" + nxt))
    return "".join(out)


def parse_value(text):
    if _INT.fullmatch(text):
        return int(text)
    if _FLOAT.fullmatch(text):
        return float(text)
    return text


def parse_table(table):
    """Return (keys, blocks). blocks maps each [name] to {key: value}."""
    keys = None
    blocks = {}
    current = None
    for number, raw in enumerate(str(table).splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        if keys is None:
            if not line.startswith("keys:"):
                raise _error(f"line {number} must be 'keys: name1, name2, ...'")
            keys = [key.strip() for key in line[len("keys:"):].split(",")]
            if any(not key for key in keys):
                raise _error("keys: contains an empty key name")
            if len(set(keys)) != len(keys):
                raise _error("keys: contains a duplicate key name")
            if len(keys) > MAX_KEYS:
                raise _error(f"keys: has {len(keys)} keys, the maximum is {MAX_KEYS}")
            continue
        if line.startswith("[") and line.endswith("]"):
            name = line[1:-1].strip()
            if not name:
                raise _error(f"line {number} has an empty block name")
            if name in blocks:
                raise _error(f"block [{name}] is defined more than once")
            current = name
            blocks[name] = {}
            continue
        if current is None:
            raise _error(f"line {number} must come after a [name] line")
        if "=" not in line:
            raise _error(f"line {number} must be key=value")
        key, value = (part.strip() for part in line.split("=", 1))
        if key not in keys:
            raise _error(f"unknown key '{key}' in [{current}] (line {number})")
        if key in blocks[current]:
            raise _error(f"key '{key}' is set twice in [{current}]")
        blocks[current][key] = parse_value(unescape_text(value))
    if keys is None:
        raise _error("table is empty; the first line must be 'keys: name1, name2, ...'")
    for name, values in blocks.items():
        missing = [key for key in keys if key not in values]
        if missing:
            raise _error(f"[{name}] is missing {', '.join(missing)}")
    return keys, blocks


def lookup(env, table):
    """Return MAX_KEYS values: the matched block's values in keys: order, then None for unused slots."""
    keys, blocks = parse_table(table)
    name = str(env).strip()
    if name not in blocks:
        available = ", ".join(f"[{block}]" for block in blocks) or "none"
        raise _error(f"no block [{name}] for env '{name}'. Blocks in table: {available}")
    values = blocks[name]
    return tuple(values[key] for key in keys) + (None,) * (MAX_KEYS - len(keys))


class NodeForgeConfigTable:
    CATEGORY = "NodeForge/Flow"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING",) + ("*",) * MAX_KEYS
    RETURN_NAMES = ("output_tag",) + tuple(f"value_{i + 1}" for i in range(MAX_KEYS))
    DESCRIPTION = (
        "Outputs the selected output tag first, then looks up env in the table and outputs "
        "each key's value in keys: order. Unused slots output nothing."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "env": ("STRING", {"default": DEFAULT_ENV}),
                "table": ("STRING", {"multiline": True, "default": DEFAULT_TABLE}),
            },
        }

    def run(self, env, table):
        return (str(env).strip(),) + lookup(env, table)
