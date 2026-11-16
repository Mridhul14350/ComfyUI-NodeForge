"""Shared file helpers for NodeForge. No node classes here."""

import os

MAX_FILE_BYTES = 10 * 1024 * 1024


def resolve_under(base_dir: str, rel_path: str, label: str) -> str:
    """Return the real path of rel_path inside base_dir, or raise ValueError
    if it escapes base_dir (for example through '..' or a symlink)."""
    base = os.path.realpath(os.path.abspath(base_dir))
    path = os.path.realpath(os.path.join(base, rel_path))
    if not path.startswith(base + os.sep):
        raise ValueError(f"{label}: path '{rel_path}' is outside {base_dir}")
    return path


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
