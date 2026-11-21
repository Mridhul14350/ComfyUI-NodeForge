import json

import pytest

from nodes.switch_case import MAX_CASES, NodeForgeSwitchCase, find_case, parse_cases, select_input


def test_parse_cases_trims_lines_and_drops_trailing_empties():
    assert parse_cases("  a \nb\n\n  \n") == ["a", "b"]


def test_json_table_keeps_row_index_when_middle_row_is_empty():
    table = json.dumps([{"value": "a", "label": "A"}, {"value": "", "label": ""}, {"value": "b", "label": ""}])
    assert parse_cases(table) == ["a", "", "b"]
    assert select_input("b", table) == ("case_result_3", "b")


def test_table_labels_never_match():
    table = json.dumps([{"value": "1", "label": "Portrait"}])
    assert select_input("Portrait", table) == ("default", None)


def test_invalid_json_table_raises():
    with pytest.raises(ValueError, match="not valid JSON"):
        parse_cases("[{'value': 1}")


def test_first_duplicate_label_wins():
    assert find_case("x", ["x", "y", "x"]) == 0


def test_int_value_matches_parsed_labels_and_skips_unparsable_ones():
    assert find_case(2, ["one", "2.0", " 2 "]) == 2


def test_string_match_ignores_case():
    assert find_case("ABC", ["abc"]) == 0
    assert find_case("abc", ["ABC"]) == 0


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


def test_no_match_without_default_raises_and_names_the_value():
    with pytest.raises(ValueError, match="no case matches value 'z'"):
        NodeForgeSwitchCase().run("z", "a\nb")


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
