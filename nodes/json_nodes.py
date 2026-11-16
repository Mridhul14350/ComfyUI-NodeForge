"""JSON parsing and value extraction helpers for NodeForge. No node classes here."""

import json
import re

MAX_SPLIT_KEYS = 16
PREVIEW_CHARS = 200

_TOKEN = re.compile(r"[^.\[\]]+")


def parse_json(text: str, source: str):
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"invalid JSON in {source} at line {e.lineno}, column {e.colno}: "
            f"{e.msg}. Input starts with: {text[:PREVIEW_CHARS]!r}"
        ) from e


def get_path(data, path: str):
    """Read a value by dotted or bracket path, e.g. 'models.0.name' or
    'models[0].name'. Raises ValueError naming the path if it is missing."""
    current = data
    for token in _TOKEN.findall(path):
        if isinstance(current, dict) and token in current:
            current = current[token]
        elif isinstance(current, list) and token.isdigit() and int(token) < len(current):
            current = current[int(token)]
        else:
            raise ValueError(f"path '{path}' not found (missing '{token}')")
    return current


def parse_keys(text: str, label: str = "JSON split") -> list:
    """Split the keys box into one path per line, ignoring blank lines."""
    keys = [line.strip() for line in text.splitlines() if line.strip()]
    if not keys:
        raise ValueError(f"{label} needs at least one key, one per line")
    if len(keys) > MAX_SPLIT_KEYS:
        raise ValueError(
            f"{label} supports up to {MAX_SPLIT_KEYS} keys, got {len(keys)}"
        )
    return keys


def to_output(value):
    """Numbers, booleans and strings pass through as their own type. Objects,
    lists and null are returned as JSON text, because they are not a
    registered ComfyUI type."""
    if isinstance(value, (str, bool, int, float)):
        return value
    return json.dumps(value, ensure_ascii=False)
