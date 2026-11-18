import sys
import types

import pytest

from nodes.switch_case import MAX_CASES, NodeForgeSwitchCase, find_case, parse_cases


@pytest.fixture
def fake_blocker(monkeypatch):
    module = types.ModuleType("comfy_execution.graph_utils")

    class ExecutionBlocker:
        def __init__(self, message):
            self.message = message

    module.ExecutionBlocker = ExecutionBlocker
    monkeypatch.setitem(sys.modules, "comfy_execution.graph_utils", module)
    return ExecutionBlocker


def test_parse_cases_trims_lines_and_drops_trailing_empties():
    assert parse_cases("  a \nb\n\n  \n") == ["a", "b"]


def test_first_duplicate_label_wins():
    assert find_case("x", ["x", "y", "x"]) == 0


def test_int_value_matches_parsed_labels_and_skips_unparsable_ones():
    assert find_case(2, ["one", "2.0", " 2 "]) == 2


def test_case_insensitive_string_match():
    assert find_case("ABC", ["abc"], case_insensitive=True) == 0
    assert find_case("ABC", ["abc"]) is None


def test_lazy_check_requests_only_the_selected_unevaluated_input():
    node = NodeForgeSwitchCase
    assert node.check_lazy_status("b", "a\nb", case_result_2=None) == ["case_result_2"]
    assert node.check_lazy_status("b", "a\nb", case_result_2="img") == []


def test_lazy_check_requests_default_when_nothing_matches():
    assert NodeForgeSwitchCase.check_lazy_status("z", "a\nb", default=None) == ["default"]


def test_run_returns_selected_branch_only():
    out = NodeForgeSwitchCase().run("b", "a\nb", case_result_1="A", case_result_2="B")
    assert out == ("B",)


def test_run_uses_default_when_no_case_matches():
    out = NodeForgeSwitchCase().run("z", "a\nb", case_result_1="A", default="D")
    assert out == ("D",)


def test_no_match_with_error_names_the_value():
    with pytest.raises(ValueError, match="no case matches value 'z'"):
        NodeForgeSwitchCase().run("z", "a\nb", on_no_match="error")


def test_no_match_with_block_returns_blocker(fake_blocker):
    (out,) = NodeForgeSwitchCase().run("z", "a\nb", on_no_match="block")
    assert isinstance(out, fake_blocker)


def test_matched_case_without_connected_input_raises():
    with pytest.raises(ValueError, match="case_result_1 is not connected"):
        NodeForgeSwitchCase().run("a", "a\nb", case_result_2="B")


def test_label_beyond_the_case_slots_raises():
    cases = "\n".join(str(i) for i in range(MAX_CASES + 1))
    with pytest.raises(ValueError, match="only 10 case_result inputs"):
        NodeForgeSwitchCase.check_lazy_status(str(MAX_CASES), cases)


def test_value_type_must_be_int_or_string():
    with pytest.raises(ValueError, match="INT or STRING"):
        NodeForgeSwitchCase.check_lazy_status(1.5, "1")
