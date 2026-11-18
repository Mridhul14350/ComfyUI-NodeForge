"""NodeForge: Load File. Loads a text or JSON file from the input or output folder."""

import hashlib
import json
import os

from .ini_text import parse_ini_text, pick_field, pick_section, section_block
from .json_nodes import MAX_SPLIT_KEYS, get_path, parse_json, parse_keys, to_output
from .utils import read_text_file, resolve_under

FILE_EXTS = (".txt", ".json", ".md", ".csv", ".log")
FOLDERS = ("input", "output")
TEXT_OUTPUT_TYPES = ("string", "text_parsed")


def _folder_dir(folder: str) -> str:
    import folder_paths

    if folder == "input":
        return folder_paths.get_input_directory()
    return folder_paths.get_output_directory()


def list_files() -> list:
    """Text and JSON files from input and output, e.g. 'input/notes/a.json'."""
    options = []
    for folder in FOLDERS:
        base = _folder_dir(folder)
        if not os.path.isdir(base):
            continue
        for root, _dirs, names in os.walk(base):
            for name in names:
                if os.path.splitext(name)[1].lower() in FILE_EXTS:
                    rel = os.path.relpath(os.path.join(root, name), base)
                    options.append(f"{folder}/{rel.replace(os.sep, '/')}")
    return sorted(options)


def resolve_file(choice: str) -> str:
    folder, sep, rel = choice.partition("/")
    if folder not in FOLDERS or not sep or not rel:
        raise ValueError(
            f"Load File: path must be under input or output (e.g. input/a.json), got '{choice}'"
        )
    if os.path.splitext(rel)[1].lower() not in FILE_EXTS:
        raise ValueError(f"Load File: file type not supported: '{choice}'")
    path = resolve_under(_folder_dir(folder), rel, "Load File")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Load File: file not found: {path}")
    return path


def resolve_source(file: str, file_path: str = "") -> str:
    """A non-empty file_path wins over the dropdown choice."""
    computed = (file_path or "").strip().replace("\\", "/")
    if computed:
        return resolve_file(computed)
    if not file:
        raise ValueError("Load File: choose a file, or set file_path")
    return resolve_file(file)


def is_json_file(path: str) -> bool:
    return os.path.splitext(path)[1].lower() == ".json"


def read_text_sections(choice: str) -> dict:
    """Parsed sections of a text file, used by the Pick keys popup."""
    path = resolve_file(choice)
    if is_json_file(path):
        raise ValueError(f"Load File: Pick keys for text parsed needs a text file, got '{choice}'")
    return parse_ini_text(read_text_file(path), path)


class NodeForgeLoadFile:
    DESCRIPTION = (
        "Loads a text or JSON file from the input or output folder. "
        "Text mode outputs the file text. JSON mode outputs the JSON as a string, "
        "or with JSON split, one output per key you list (dotted or bracket "
        "paths, e.g. models.0.name). Text parsed reads an INI-style text file "
        "and outputs one section per name you list (e.g. beat.01) as its raw text, "
        "or one field as text (e.g. beat.01/action). The text is unchanged when no keys are listed. Split outputs are any type: "
        "numbers and booleans pass as-is, objects, lists and null are JSON text."
    )
    CATEGORY = "NodeForge/IO"
    # Split outputs are fixed at MAX_SPLIT_KEYS slots. The frontend shows
    # only the slots in use, named after each key.
    RETURN_TYPES = tuple("*" for _ in range(MAX_SPLIT_KEYS))
    RETURN_NAMES = tuple(f"value_{i + 1}" for i in range(MAX_SPLIT_KEYS))
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        files = list_files()
        return {
            "required": {
                # The empty option keeps the dropdown valid while file_path is used.
                "file": (["", *files], {"default": files[0] if files else "", "tooltip": "A text or JSON file from the input or output folder. Ignored when file_path is set."}),
                "file_path": ("STRING", {"default": "", "tooltip": "Optional. A path under input or output, e.g. input/character/cast.json. When set, the file dropdown is ignored."}),
                "output_type": (["string", "json", "json_split", "text_parsed"], {"default": "string", "tooltip": "String: the text. Json: pretty JSON text. Json split: one output per key below. Text parsed: INI-style text file, one output per section below, or the text unchanged if none."}),
            },
            "optional": {
                "keys": ("STRING", {"multiline": True, "default": "", "tooltip": "JSON split: one path per line, e.g. name or models.0.name. Text parsed: one section per line, e.g. beat.01, or one field, e.g. beat.01/action."}),
            },
        }

    @classmethod
    def IS_CHANGED(cls, file, file_path="", **_kwargs):
        try:
            path = resolve_source(file, file_path)
        except (ValueError, FileNotFoundError):
            return "missing"
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def run(self, file, output_type, keys="", file_path=""):
        path = resolve_source(file, file_path)
        text = read_text_file(path)
        pad = (None,) * (MAX_SPLIT_KEYS - 1)

        if not is_json_file(path):
            if output_type not in TEXT_OUTPUT_TYPES:
                raise ValueError(
                    f"Load File: output '{output_type}' needs a .json file, "
                    f"but '{os.path.basename(path)}' is a text file"
                )
            if output_type == "string" or not keys.strip():
                return (text,) + pad
            sections = parse_ini_text(text, path)
            values = []
            for name in parse_keys(keys, "Text parsed"):
                if "/" in name:
                    values.append(pick_field(sections, name, path))
                else:
                    pick_section(sections, name, path)
                    values.append(section_block(text, name))
            return tuple(values) + (None,) * (MAX_SPLIT_KEYS - len(values))

        if output_type == "text_parsed":
            raise ValueError(
                f"Load File: output 'text_parsed' needs a text file, "
                f"but '{os.path.basename(path)}' is a .json file"
            )
        data = parse_json(text, path)
        if output_type == "string":
            return (text,) + pad
        if output_type == "json":
            return (json.dumps(data, indent=2, ensure_ascii=False),) + pad

        key_list = parse_keys(keys)
        values = [to_output(get_path(data, key)) for key in key_list]
        return tuple(values) + (None,) * (MAX_SPLIT_KEYS - len(values))
