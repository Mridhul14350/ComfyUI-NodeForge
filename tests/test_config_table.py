import pytest

from nodes.config_table import MAX_KEYS, NodeForgeConfigTable, escape_text, lookup

TABLE = "keys: width, height\n[prod]\nwidth=100\nheight=200\n[dev]\nwidth=50\nheight=100\n"


def test_multiline_value_with_backslash_round_trips_through_escapes():
    text = "line one\nline two with C:\\new folder"
    table = f"keys: prompt\n[prod]\nprompt={escape_text(text)}\n"
    assert lookup("prod", table)[0] == text


def test_returns_matched_block_values_in_keys_order_and_pads_unused_slots():
    result = lookup("prod", TABLE)
    assert len(result) == MAX_KEYS
    assert result[:2] == (100, 200)
    assert result[2:] == (None,) * (MAX_KEYS - 2)


def test_other_block_is_selected_by_env():
    assert lookup("dev", TABLE)[:2] == (50, 100)


def test_values_are_typed_int_float_or_text():
    table = "keys: a, b, c\n[x]\na=-3\nb=1.5\nc=hd 1080p\n"
    assert lookup("x", table)[:3] == (-3, 1.5, "hd 1080p")


def test_env_without_matching_block_raises_and_lists_blocks():
    with pytest.raises(ValueError, match=r"no block \[staging\].*\[prod\], \[dev\]"):
        lookup("staging", TABLE)


def test_matching_is_case_sensitive():
    with pytest.raises(ValueError, match="no block"):
        lookup("PROD", TABLE)


def test_block_missing_a_key_raises():
    table = "keys: width, height\n[prod]\nwidth=100\n"
    with pytest.raises(ValueError, match=r"\[prod\] is missing height"):
        lookup("prod", table)


def test_unknown_key_raises():
    table = "keys: width\n[prod]\nwidth=100\nheight=200\n"
    with pytest.raises(ValueError, match="unknown key 'height'"):
        lookup("prod", table)


def test_more_than_ten_keys_raises():
    keys = ", ".join(f"k{i}" for i in range(MAX_KEYS + 1))
    with pytest.raises(ValueError, match="maximum is 10"):
        lookup("prod", f"keys: {keys}\n[prod]\n")


def test_node_run_returns_ten_outputs_and_has_ten_named_slots():
    node = NodeForgeConfigTable()
    assert len(node.run("dev", TABLE)) == MAX_KEYS
    assert NodeForgeConfigTable.RETURN_NAMES == tuple(f"value_{i}" for i in range(1, MAX_KEYS + 1))
