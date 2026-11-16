import pytest

from nodes.json_nodes import get_path, parse_json, parse_keys, to_output


def test_parse_json_error_names_line_column_and_preview():
    with pytest.raises(ValueError) as err:
        parse_json('{\n  "a": 1,\n}', "x.json")
    message = str(err.value)
    assert "x.json" in message
    assert "line 3" in message
    assert "Input starts with" in message


def test_get_path_dotted_and_bracket_syntax_match():
    data = {"models": [{"name": "base"}]}
    assert get_path(data, "models.0.name") == "base"
    assert get_path(data, "models[0].name") == "base"


def test_get_path_missing_key_names_the_path():
    with pytest.raises(ValueError, match="models.5.name"):
        get_path({"models": [{"name": "base"}]}, "models.5.name")


def test_parse_keys_rejects_empty_and_too_many():
    assert parse_keys("a\n\n b.0 \n") == ["a", "b.0"]
    with pytest.raises(ValueError, match="at least one key"):
        parse_keys("  \n")
    with pytest.raises(ValueError, match="up to 16"):
        parse_keys("\n".join(f"k{i}" for i in range(17)))


def test_to_output_keeps_scalars_and_serialises_objects():
    assert to_output(3) == 3
    assert to_output(False) is False
    assert to_output("hi") == "hi"
    assert to_output({"a": 1}) == '{"a": 1}'
    assert to_output(None) == "null"
