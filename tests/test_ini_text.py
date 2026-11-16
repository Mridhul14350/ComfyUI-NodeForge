import re

import pytest

from nodes.ini_text import parse_ini_text, pick_field, pick_section, section_block

GOOD = """\
; a comment
[meta]
title = Morning Idlis
runtime_target_sec = 48

[beat.01]
action = Lakshmi enters with the plate.
h3_prompt =
  Reference <Picture 1> is the start.

  Motion: she sets the plate down.
sound = fan hum, 100% quiet

[end]
"""


def test_parses_sections_keys_and_multiline_values():
    data = parse_ini_text(GOOD, "story.txt")
    assert data["meta"] == {"title": "Morning Idlis", "runtime_target_sec": "48"}
    assert data["beat.01"]["action"] == "Lakshmi enters with the plate."
    assert data["beat.01"]["h3_prompt"] == (
        "Reference <Picture 1> is the start.\n\nMotion: she sets the plate down."
    )
    assert data["beat.01"]["sound"] == "fan hum, 100% quiet"
    assert "end" not in data


@pytest.mark.parametrize(
    "text, message",
    [
        ("[a]\nk = 1\n[a]\n[end]\n", "duplicate section"),
        ("[a]\nk = 1\nk = 2\n[end]\n", "duplicate key 'k'"),
        ("k = 1\n[end]\n", "outside any"),
        ("[a]\n  orphan continuation\n[end]\n", "indented line with no key"),
        ("[a]\nk = 1\n", "missing [end]"),
        ("[a]\n[end]\nstray = 1\n", "content after [end]"),
        ("[a]\njust words\n[end]\n", "expected [section] or key = value"),
    ],
)
def test_malformed_text_raises_with_line_number(text, message):
    with pytest.raises(ValueError, match=re.escape(message)) as info:
        parse_ini_text(text, "story.txt")
    assert "story.txt" in str(info.value)


def test_section_block_keeps_continuation_lines_and_drops_trailing_blanks():
    text = "[a]\nk = one\n  two\n\n[b]\nx = 1\n\n[end]\n"
    parse_ini_text(text, "story.txt")
    assert section_block(text, "a") == "[a]\nk = one\n  two"
    assert section_block(text, "b") == "[b]\nx = 1"

    data = parse_ini_text(GOOD, "story.txt")
    assert pick_section(data, "beat.01", "story.txt")["sound"] == "fan hum, 100% quiet"
    with pytest.raises(ValueError, match=r"Sections: meta, beat\.01"):
        pick_section(data, "beat.02", "story.txt")


def test_pick_field_returns_one_value_and_names_the_available_fields():
    data = parse_ini_text(GOOD, "story.txt")
    assert pick_field(data, "beat.01/sound", "story.txt") == "fan hum, 100% quiet"
    assert pick_field(data, "beat.01/h3_prompt", "story.txt").endswith("sets the plate down.")
    with pytest.raises(ValueError, match=r"field 'nope' not found in \[beat\.01\].*Fields: action"):
        pick_field(data, "beat.01/nope", "story.txt")
