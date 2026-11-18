import datetime
import json

import pytest

from nodes.variables import MAX_STRINGS, NodeForgeResolveString, NodeForgeVariables
from nodes.utils import resolve_dates, resolve_variables, variable_rows, variables_from_rows


def test_variables_node_outputs_json_object_and_skips_blank_names():
    rows = json.dumps(
        [
            {"name": "folder_001", "value": "tmp001"},
            {"name": "  ", "value": "ignored"},
            {"name": "empty", "value": ""},
        ]
    )
    (out,) = NodeForgeVariables().run(rows)
    assert json.loads(out) == {"folder_001": "tmp001", "empty": ""}


def test_variables_node_rejects_duplicate_names():
    rows = json.dumps([{"name": "a", "value": "1"}, {"name": "a", "value": "2"}])
    with pytest.raises(ValueError, match="'a' is set more than once"):
        NodeForgeVariables().run(rows)


def test_variables_rejects_invalid_name_characters():
    with pytest.raises(ValueError, match="may only use letters"):
        variables_from_rows(json.dumps([{"name": "bad name", "value": "x"}]), "t")


def test_variables_rejects_malformed_json():
    with pytest.raises(ValueError, match="not valid JSON"):
        variables_from_rows("[{", "t")


def _run_variables(rows, node_id):
    (out,) = NodeForgeVariables().run(json.dumps(rows), unique_id=node_id)
    return json.loads(out)


def test_step_outputs_typed_value_first_then_adds_step_each_run():
    rows = [{"name": "n", "value": "1", "step": "2"}]
    outs = [_run_variables(rows, "inc-step")["n"] for _ in range(3)]
    assert outs == ["1", "3", "5"]


def test_negative_step_counts_down_and_keeps_zero_padding():
    down = [{"name": "n", "value": "2", "step": "-1"}]
    assert [_run_variables(down, "inc-down")["n"] for _ in range(4)] == ["2", "1", "0", "-1"]
    padded = [{"name": "f", "value": "009", "step": "1"}]
    assert [_run_variables(padded, "inc-pad")["f"] for _ in range(3)] == ["009", "010", "011"]


def test_changing_typed_value_restarts_the_count():
    _run_variables([{"name": "n", "value": "1", "step": "1"}], "inc-reset")
    _run_variables([{"name": "n", "value": "1", "step": "1"}], "inc-reset")
    assert _run_variables([{"name": "n", "value": "10", "step": "1"}], "inc-reset")["n"] == "10"


def test_step_on_non_number_value_is_an_error():
    with pytest.raises(ValueError, match="must be a whole number"):
        NodeForgeVariables().run(json.dumps([{"name": "n", "value": "abc", "step": "1"}]))


def test_step_must_be_whole_number():
    with pytest.raises(ValueError, match="step for 'n' must be a whole number"):
        variable_rows(json.dumps([{"name": "n", "value": "1", "step": "1.5"}]), "t")


def test_is_changed_forces_rerun_only_when_a_step_is_set():
    stepped = json.dumps([{"name": "n", "value": "1", "step": "1"}])
    plain = json.dumps([{"name": "n", "value": "1", "step": ""}])
    assert NodeForgeVariables.IS_CHANGED(stepped) != NodeForgeVariables.IS_CHANGED(stepped)
    assert NodeForgeVariables.IS_CHANGED(plain) == NodeForgeVariables.IS_CHANGED(plain)


def test_resolve_is_changed_forces_rerun_only_when_a_date_token_is_present():
    dated = json.dumps(["out/%date:yyyy%.txt"])
    plain = json.dumps(["out/fixed.txt"])
    assert NodeForgeResolveString.IS_CHANGED(dated) != NodeForgeResolveString.IS_CHANGED(dated)
    assert NodeForgeResolveString.IS_CHANGED(plain) == NodeForgeResolveString.IS_CHANGED(plain)


def test_resolve_replaces_tokens_and_keeps_other_text():
    text = "output/%Variables.folder_001%/prompt_%Variables.n-1%.txt %date:yyyy%"
    variables = {"folder_001": "tmp001", "n-1": "7"}
    assert (
        resolve_variables(text, variables, "t")
        == "output/tmp001/prompt_7.txt %date:yyyy%"
    )


def test_resolve_unknown_variable_raises_with_name():
    with pytest.raises(ValueError, match="unknown variable 'missing'"):
        resolve_variables("%Variables.missing%", {}, "t")


def test_resolve_string_node_resolves_each_row_and_pads_outputs():
    strings = json.dumps(["out/%Variables.f%/a.png", "plain"])
    variables = json.dumps({"f": "tmp001"})
    out = NodeForgeResolveString().run(strings, variables)
    assert len(out) == MAX_STRINGS
    assert out[0] == "out/tmp001/a.png"
    assert out[1] == "plain"
    assert all(v is None for v in out[2:])


def test_resolve_dates_uses_core_format_tokens():
    now = datetime.datetime(2026, 1, 5, 7, 8, 9)
    text = "%date:yyyy-MM-dd_hh-mm-ss% %date:yy%%date:MM%"
    assert resolve_dates(text, now) == "2026-01-05_07-08-09 2601"


def test_resolve_dates_leaves_other_percent_text_alone():
    now = datetime.datetime(2026, 1, 5)
    assert resolve_dates("50% off %Variables.x% %date:abc%", now) == (
        "50% off %Variables.x% abc"
    )


def test_resolve_string_node_expands_date_and_variable_tokens():
    strings = json.dumps(["%Variables.shot%_%date:yyyy%"])
    out = NodeForgeResolveString().run(strings, json.dumps({"shot": "scene_a"}))
    assert out[0] == f"scene_a_{datetime.datetime.now():%Y}"


def test_variable_value_containing_date_token_is_not_expanded():
    strings = json.dumps(["%Variables.raw%"])
    out = NodeForgeResolveString().run(strings, json.dumps({"raw": "%date:yyyy%"}))
    assert out[0] == "%date:yyyy%"


def test_resolve_string_node_works_without_variables_input_when_no_tokens():
    out = NodeForgeResolveString().run(json.dumps(["no tokens"]))
    assert out[0] == "no tokens"


def test_resolve_string_node_rejects_more_than_max_strings():
    strings = json.dumps(["x"] * (MAX_STRINGS + 1))
    with pytest.raises(ValueError, match="at most 16 strings"):
        NodeForgeResolveString().run(strings)
