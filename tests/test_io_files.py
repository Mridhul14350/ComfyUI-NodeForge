import sys
import types

import pytest

from nodes.io_files import NodeForgeLoadFile, list_files, read_text_sections, resolve_file
from nodes.json_nodes import MAX_SPLIT_KEYS

STORY = (
    "[meta]\n"
    "title = Idlis\n"
    "\n"
    "[beat.01]\n"
    "action = Lakshmi enters.\n"
    "\n"
    "[end]\n"
)


@pytest.fixture
def folders(tmp_path, monkeypatch):
    inp = tmp_path / "input"
    out = tmp_path / "output"
    (inp / "sub").mkdir(parents=True)
    out.mkdir()
    fake = types.SimpleNamespace(
        get_input_directory=lambda: str(inp),
        get_output_directory=lambda: str(out),
    )
    monkeypatch.setitem(sys.modules, "folder_paths", fake)
    (inp / "notes.txt").write_text("hello world", encoding="utf-8")
    (inp / "sub" / "cfg.json").write_text(
        '{"name": "base", "steps": 20, "tags": ["a", "b"], "models": [{"id": 7}]}',
        encoding="utf-8",
    )
    (out / "bad.json").write_text('{"a": 1,}', encoding="utf-8")
    (out / "image.png").write_bytes(b"not text")
    return inp, out


def test_list_files_covers_input_and_output_and_skips_other_types(folders):
    assert list_files() == ["input/notes.txt", "input/sub/cfg.json", "output/bad.json"]


def test_resolve_file_rejects_escape_and_missing(folders):
    with pytest.raises(ValueError, match="outside"):
        resolve_file("input/../output/bad.json")
    with pytest.raises(FileNotFoundError):
        resolve_file("output/none.json")
    with pytest.raises(ValueError, match="input or output"):
        resolve_file("notes.txt")


def test_text_file_returns_file_text_in_first_slot(folders):
    out = NodeForgeLoadFile().run("input/notes.txt", "string")
    assert out[0] == "hello world"
    assert len(out) == MAX_SPLIT_KEYS


def test_text_file_refuses_json_output_types(folders):
    with pytest.raises(ValueError, match="needs a .json file"):
        NodeForgeLoadFile().run("input/notes.txt", "json_split", keys="name")


def test_json_string_returns_raw_text(folders):
    out = NodeForgeLoadFile().run("input/sub/cfg.json", "string")
    assert out[0] == '{"name": "base", "steps": 20, "tags": ["a", "b"], "models": [{"id": 7}]}'


def test_json_extension_is_detected_case_insensitively(folders):
    inp, _ = folders
    (inp / "UPPER.JSON").write_text('{"a": 5}', encoding="utf-8")
    out = NodeForgeLoadFile().run("input/UPPER.JSON", "json_split", keys="a")
    assert out[0] == 5


def test_json_pretty_output(folders):
    out = NodeForgeLoadFile().run("input/sub/cfg.json", "json")
    assert out[0].startswith('{\n  "name": "base"')


def test_json_split_returns_values_in_key_order(folders):
    keys = "name\nsteps\ntags\nmodels.0.id"
    out = NodeForgeLoadFile().run("input/sub/cfg.json", "json_split", keys=keys)
    assert out[:4] == ("base", 20, '["a", "b"]', 7)
    assert out[4:] == (None,) * (MAX_SPLIT_KEYS - 4)


def test_json_split_missing_key_raises(folders):
    with pytest.raises(ValueError, match="nope"):
        NodeForgeLoadFile().run("input/sub/cfg.json", "json_split", keys="nope")


def test_invalid_json_raises_with_file_path(folders):
    with pytest.raises(ValueError, match="bad.json"):
        NodeForgeLoadFile().run("output/bad.json", "string")


def test_is_changed_follows_file_content(folders):
    inp, _ = folders
    before = NodeForgeLoadFile.IS_CHANGED("input/notes.txt")
    (inp / "notes.txt").write_text("changed", encoding="utf-8")
    assert NodeForgeLoadFile.IS_CHANGED("input/notes.txt") != before


def test_computed_path_overrides_dropdown(folders):
    out = NodeForgeLoadFile().run("input/notes.txt", "string", file_path="input/sub/cfg.json")
    assert out[0].startswith('{"name": "base"')


def test_computed_path_accepts_backslashes_and_spaces(folders):
    out = NodeForgeLoadFile().run("", "string", file_path=" input\\notes.txt ")
    assert out[0] == "hello world"


def test_computed_path_rejects_escape_absolute_and_bad_type(folders, tmp_path):
    with pytest.raises(ValueError, match="outside"):
        NodeForgeLoadFile().run("", "string", file_path="input/../output/bad.json")
    with pytest.raises(ValueError, match="input or output"):
        NodeForgeLoadFile().run("", "string", file_path=str(tmp_path / "input" / "notes.txt"))
    with pytest.raises(ValueError, match="not supported"):
        NodeForgeLoadFile().run("", "string", file_path="output/image.png")


def test_empty_file_and_path_is_an_error(folders):
    with pytest.raises(ValueError, match="choose a file"):
        NodeForgeLoadFile().run("", "string")


def test_is_changed_tracks_computed_path(folders):
    inp, _ = folders
    before = NodeForgeLoadFile.IS_CHANGED("", file_path="input/notes.txt")
    assert before != NodeForgeLoadFile.IS_CHANGED("input/sub/cfg.json", file_path="")
    assert before == NodeForgeLoadFile.IS_CHANGED("input/sub/cfg.json", file_path="input/notes.txt")


def test_text_parsed_without_keys_returns_text_unchanged(folders):
    inp, _ = folders
    (inp / "story.txt").write_bytes(STORY.encode("utf-8"))
    out = NodeForgeLoadFile().run("input/story.txt", "text_parsed", keys="  \n")
    assert out[0] == STORY
    assert out[1:] == (None,) * (MAX_SPLIT_KEYS - 1)


def test_text_parsed_outputs_each_selected_section_as_raw_block(folders):
    inp, _ = folders
    (inp / "story.txt").write_text(STORY, encoding="utf-8")
    out = NodeForgeLoadFile().run("input/story.txt", "text_parsed", keys="beat.01\nmeta")
    assert out[:2] == ("[beat.01]\naction = Lakshmi enters.", "[meta]\ntitle = Idlis")
    assert out[2:] == (None,) * (MAX_SPLIT_KEYS - 2)


def test_text_parsed_outputs_one_field_as_its_value(folders):
    inp, _ = folders
    (inp / "story.txt").write_text(STORY, encoding="utf-8")
    out = NodeForgeLoadFile().run("input/story.txt", "text_parsed", keys="beat.01/action\nmeta")
    assert out[0] == "Lakshmi enters."
    assert out[1] == "[meta]\ntitle = Idlis"
    assert out[2:] == (None,) * (MAX_SPLIT_KEYS - 2)


def test_text_parsed_missing_field_names_the_available_ones(folders):
    inp, _ = folders
    (inp / "story.txt").write_text(STORY, encoding="utf-8")
    with pytest.raises(ValueError, match=r"field 'sound' not found in \[beat\.01\]"):
        NodeForgeLoadFile().run("input/story.txt", "text_parsed", keys="beat.01/sound")


def test_text_parsed_missing_section_names_the_available_ones(folders):
    inp, _ = folders
    (inp / "story.txt").write_text(STORY, encoding="utf-8")
    with pytest.raises(ValueError, match=r"\[beat.02\].*Sections: meta, beat\.01"):
        NodeForgeLoadFile().run("input/story.txt", "text_parsed", keys="beat.02")


def test_text_parsed_refuses_json_file(folders):
    with pytest.raises(ValueError, match="needs a text file"):
        NodeForgeLoadFile().run("input/sub/cfg.json", "text_parsed", keys="meta")


def test_read_text_sections_serves_the_popup_and_refuses_json(folders):
    inp, _ = folders
    (inp / "story.txt").write_text(STORY, encoding="utf-8")
    assert read_text_sections("input/story.txt")["beat.01"] == {"action": "Lakshmi enters."}
    with pytest.raises(ValueError, match="needs a text file"):
        read_text_sections("input/sub/cfg.json")
