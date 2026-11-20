"""Shared file helpers for NodeForge. No node classes here."""

import datetime
import json
import os
import re

MAX_FILE_BYTES = 10 * 1024 * 1024
VARIABLE_NAME_RE = re.compile(r"[A-Za-z0-9_-]+")
WHOLE_NUMBER_RE = re.compile(r"-?\d+")
VARIABLE_TOKEN_RE = re.compile(r"%([A-Za-z0-9_-]+)%")
DATE_TOKEN_RE = re.compile(r"%date:([^%]*)%")
DATE_FORMAT_RE = re.compile(r"yyyy|yy|MM|dd|hh|mm|ss")


def resolve_under(base_dir: str, rel_path: str, label: str) -> str:
    """Return the real path of rel_path inside base_dir, or raise ValueError
    if it escapes base_dir (for example through '..' or a symlink)."""
    base = os.path.realpath(os.path.abspath(base_dir))
    path = os.path.realpath(os.path.join(base, rel_path))
    if not path.startswith(base + os.sep):
        raise ValueError(f"{label}: path '{rel_path}' is outside {base_dir}")
    return path


def load_image_tensors(path: str):
    """Open an image and return (image, mask) tensors for ComfyUI.

    image: float32 [1, H, W, 3] in 0-1. mask: float32 [1, H, W], 1 where the
    picture is transparent. Images without alpha get an all-zero mask.
    Only the first frame of animated files is read.
    """
    import numpy as np
    import torch
    from PIL import Image, ImageOps

    with Image.open(path) as img:
        frame = ImageOps.exif_transpose(img)
        if frame.mode == "P" and "transparency" in frame.info:
            frame = frame.convert("RGBA")
        rgb = frame.convert("RGB")
        if "A" in frame.getbands():
            alpha = np.array(frame.getchannel("A"), dtype=np.float32) / 255.0
            mask = 1.0 - alpha
        else:
            mask = np.zeros((rgb.height, rgb.width), dtype=np.float32)

    image = np.array(rgb, dtype=np.float32) / 255.0
    return (
        torch.from_numpy(image)[None,],
        torch.from_numpy(mask)[None,],
    )


def read_text_file(path: str) -> str:
    """Read a UTF-8 text file (BOM allowed). Files over MAX_FILE_BYTES are
    refused so one huge file cannot exhaust memory."""
    size = os.path.getsize(path)
    if size > MAX_FILE_BYTES:
        raise ValueError(
            f"file is {size} bytes, the limit is {MAX_FILE_BYTES}: {path}"
        )
    with open(path, "rb") as f:
        raw = f.read()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise ValueError(f"file is not UTF-8 text: {path} ({e})") from e


def _load_json(text: str, label: str, what: str):
    try:
        return json.loads(text)
    except ValueError as e:
        raise ValueError(f"{label}: {what} is not valid JSON ({e})") from e


def variable_rows(text: str, label: str) -> list:
    """Parse the Variables editor's JSON list of {"name", "value", "step"} rows.
    Returns (name, value, step) tuples. Rows with a blank name are skipped.
    A blank or missing step means 0 (no increment)."""
    return [(name, value, step) for name, value, step, _choice in _parse_rows(text, label)]


def _parse_rows(text: str, label: str) -> list:
    """Return (name, value, step, choice label) tuples. The choice label is None for value rows."""
    rows = _load_json(text, label, "variables")
    if not isinstance(rows, list):
        raise ValueError(f"{label}: variables must be a list of name/value rows")
    named = []
    names = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(f"{label}: every variable row must be an object")
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        if not VARIABLE_NAME_RE.fullmatch(name):
            raise ValueError(
                f"{label}: variable name '{name}' may only use letters, digits, '_' and '-'"
            )
        if name in names:
            raise ValueError(f"{label}: variable '{name}' is set more than once")
        names.add(name)
        named.append((name, row))

    choices = {name: row for name, row in named if row.get("type") == "choice"}
    resolved = {}  # name -> (selected label, value)
    for name, row in choices.items():
        options = _options(row, label, name)
        selected = str(row.get("selected") or "")
        if selected not in options:
            raise ValueError(f"{label}: choice variable '{name}' has no option labelled '{selected}'")
        resolved[name] = (selected, options[selected])

    parsed = []
    for name, row in named:
        if name in resolved:
            selected, value = resolved[name]
            parsed.append((name, value, 0, selected))
            continue
        value = row.get("value")
        value = "" if value is None else str(value)
        step = _parse_step(row.get("step"), label, name)
        if step and not WHOLE_NUMBER_RE.fullmatch(value):
            raise ValueError(
                f"{label}: variable '{name}' has a step, so its value must be a whole number, got '{value}'"
            )
        parsed.append((name, value, step, None))
    return parsed


def _options(row: dict, label: str, name: str) -> dict:
    """Return {option label: value} for a choice row. Labels must be present and unique."""
    if _parse_step(row.get("step"), label, name):
        raise ValueError(f"{label}: choice variable '{name}' cannot have a step")
    options = row.get("options")
    if not isinstance(options, list) or not options:
        raise ValueError(f"{label}: choice variable '{name}' needs at least one option")
    values = {}
    for option in options:
        if not isinstance(option, dict):
            raise ValueError(f"{label}: every option of '{name}' must be an object")
        option_label = str(option.get("label") or "")
        if not option_label.strip():
            raise ValueError(f"{label}: every option of '{name}' needs a label")
        if option_label in values:
            raise ValueError(f"{label}: option '{option_label}' of '{name}' is listed more than once")
        option_value = option.get("value")
        values[option_label] = "" if option_value is None else str(option_value)
    return values


def _parse_step(raw, label: str, name: str) -> int:
    if raw is None or str(raw).strip() == "":
        return 0
    text = str(raw).strip()
    if not WHOLE_NUMBER_RE.fullmatch(text):
        raise ValueError(f"{label}: step for '{name}' must be a whole number, got '{text}'")
    return int(text)


def choice_labels(text: str, label: str) -> list:
    """Return the selected option label of each choice row, in row order. Value rows are left out."""
    return [choice for _name, _value, _step, choice in _parse_rows(text, label) if choice is not None]


def variables_from_rows(text: str, label: str) -> dict:
    """Build {name: value} from the Variables editor's rows, without increments."""
    return {name: value for name, value, _step in variable_rows(text, label)}


def apply_increments(rows: list, node_id: str, state: dict) -> dict:
    """Build {name: value} for one run. A row with a step outputs its value on
    the first run, then value + step * (runs since). `state` keeps (typed value,
    last number) per node and name; if the typed value changes, the count restarts."""
    values = {}
    for name, value, step in rows:
        if not step:
            values[name] = value
            continue
        key = (node_id, name)
        previous = state.get(key)
        if previous and previous[0] == value:
            number = previous[1] + step
        else:
            number = int(value)
        state[key] = (value, number)
        digits = value.lstrip("-")
        width = len(digits) if digits.startswith("0") and len(digits) > 1 else 0
        values[name] = f"{number:0{width}d}"
    return values


def variables_from_json(text: str, label: str) -> dict:
    """Read the {name: value} JSON that NodeForge: Variables outputs.
    Empty text means no variables."""
    if not text.strip():
        return {}
    data = _load_json(text, label, "variables input")
    if not isinstance(data, dict) or not all(isinstance(v, str) for v in data.values()):
        raise ValueError(f"{label}: variables input must be a JSON object of text values")
    return data


def string_rows_from_json(text: str, label: str) -> list:
    """Read the rows that NodeForge: ResolveString edits, as (key, value) pairs.
    A row is {"key": ..., "value": ...}; keys must be set and unique. A plain
    list of text values (the older format) is read with keys string_1, string_2, ..."""
    data = _load_json(text, label, "strings")
    if not isinstance(data, list):
        raise ValueError(f"{label}: strings must be a list of key/value rows")
    rows = []
    keys = set()
    for i, item in enumerate(data):
        if isinstance(item, str):
            key, value = f"string_{i + 1}", item
        elif isinstance(item, dict):
            key = str(item.get("key") or "").strip()
            if not key:
                raise ValueError(f"{label}: every row needs a key")
            value = item.get("value")
            value = "" if value is None else str(value)
        else:
            raise ValueError(f"{label}: every row must be a key/value object or text")
        if key in keys:
            raise ValueError(f"{label}: key '{key}' is used more than once")
        keys.add(key)
        rows.append((key, value))
    return rows


def resolve_dates(text: str, now: datetime.datetime) -> str:
    """Replace each %date:FORMAT% token with the time `now`, using the same
    tokens as core ComfyUI (yyyy, yy, MM, dd, hh, mm, ss). Other characters in
    FORMAT are copied as they are."""
    stamps = {
        "yyyy": f"{now.year:04d}",
        "yy": f"{now.year % 100:02d}",
        "MM": f"{now.month:02d}",
        "dd": f"{now.day:02d}",
        "hh": f"{now.hour:02d}",
        "mm": f"{now.minute:02d}",
        "ss": f"{now.second:02d}",
    }

    def replace(match):
        return DATE_FORMAT_RE.sub(lambda m: stamps[m.group(0)], match.group(1))

    return DATE_TOKEN_RE.sub(replace, text)


def resolve_variables(text: str, variables: dict) -> str:
    """Replace each %name% token whose name is a known variable. Any other
    %...% text is left as it is, so 100%_done% stays unchanged."""

    def replace(match):
        return variables.get(match.group(1), match.group(0))

    return VARIABLE_TOKEN_RE.sub(replace, text)
