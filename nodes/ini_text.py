"""INI-style text parsing for NodeForge Load File. No node classes here.

Format: [section] headers at column 0, key = value lines, lines starting with
';' are comments, indented lines after a key continue its value, and the file
ends with [end]. Section and key names use letters, digits, '_', '.' and '-'.
"""

import re

SECTION_RE = re.compile(r"^\[([A-Za-z0-9_.\-]+)\]$")
KEY_RE = re.compile(r"^([A-Za-z0-9_.\-]+)\s*=(.*)$")
END_SECTION = "end"


def parse_ini_text(text: str, source: str) -> dict:
    """Return {section: {key: value}}. The [end] marker is not returned.
    Raises ValueError naming the source and line number on any problem."""
    sections: dict = {}
    section = None
    key = None
    blanks = 0
    ended_at = None

    def fail(number: int, message: str) -> ValueError:
        return ValueError(f"text parse error in {source} at line {number}: {message}")

    for number, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if ended_at is not None:
            if stripped and not stripped.startswith(";"):
                raise fail(number, f"content after [end] (line {ended_at})")
            continue
        if not stripped:
            blanks += 1
            continue
        if stripped.startswith(";"):
            continue

        if raw[0] in " \t":
            if key is None:
                raise fail(number, "indented line with no key above it")
            sections[section][key].extend([""] * blanks + [stripped])
            blanks = 0
            continue

        blanks = 0
        header = SECTION_RE.match(stripped)
        if header:
            name = header.group(1)
            if name == END_SECTION:
                ended_at = number
                section = None
                key = None
                continue
            if name in sections:
                raise fail(number, f"duplicate section [{name}]")
            sections[name] = {}
            section = name
            key = None
            continue

        pair = KEY_RE.match(stripped)
        if not pair:
            raise fail(number, f"expected [section] or key = value, got {stripped[:60]!r}")
        if section is None:
            raise fail(number, f"key '{pair.group(1)}' is outside any [section]")
        name = pair.group(1)
        if name in sections[section]:
            raise fail(number, f"duplicate key '{name}' in [{section}]")
        sections[section][name] = [pair.group(2).strip()]
        key = name

    if ended_at is None:
        raise ValueError(
            f"text parse error in {source}: missing [end] at the end; "
            "the text may be cut off"
        )
    return {
        name: {k: "\n".join(lines) for k, lines in fields.items()}
        for name, fields in sections.items()
    }


def pick_section(sections: dict, name: str, source: str) -> dict:
    """Return one whole section by its exact name, e.g. 'beat.01'."""
    if name not in sections:
        available = ", ".join(sections) or "none"
        raise ValueError(
            f"section [{name}] not found in {source}. Sections: {available}"
        )
    return sections[name]
