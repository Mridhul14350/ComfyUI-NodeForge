import json

import pytest

from nodes.if_else import MAX_BRANCHES, NodeForgeIfElse, select_branch


def table(*conditions):
    return json.dumps([{"label": f"B{i + 1}", "condition": c} for i, c in enumerate(conditions)])


def test_first_true_branch_wins_even_when_later_ones_are_also_true():
    assert select_branch(table("1 == 1", "2 == 2"), "") == ("branch_1", "B1")


def test_later_branch_is_selected_when_earlier_ones_are_false():
    assert select_branch(table("1 == 2", "x > 0"), json.dumps({"x": "5"})) == ("branch_2", "B2")


def test_no_true_condition_selects_else():
    assert select_branch(table("1 == 2"), "") == ("else", "Else")


def test_later_conditions_are_not_evaluated_after_a_match():
    assert select_branch(table("1 == 1", "undefined_name > 0"), "") == ("branch_1", "B1")


def test_run_passes_only_the_selected_input_through():
    out = NodeForgeIfElse().run(table("1 == 2", "1 == 1"), "", branch_1="A", branch_2="B", **{"else": "E"})
    assert out == ("B",)


def test_run_uses_else_when_nothing_is_true():
    out = NodeForgeIfElse().run(table("1 == 2"), "", branch_1="A", **{"else": "E"})
    assert out == ("E",)


def test_run_without_match_or_else_raises():
    with pytest.raises(ValueError, match="else is not connected"):
        NodeForgeIfElse().run(table("1 == 2"), "", branch_1="A")


def test_run_raises_when_selected_branch_is_not_connected():
    with pytest.raises(ValueError, match="B1 is true, but its input branch_1 is not connected"):
        NodeForgeIfElse().run(table("1 == 1"), "", branch_2="B")


def test_lazy_check_requests_only_the_selected_unevaluated_input():
    node = NodeForgeIfElse
    assert node.check_lazy_status(table("1 == 2", "1 == 1"), "", branch_2=None) == ["branch_2"]
    assert node.check_lazy_status(table("1 == 2", "1 == 1"), "", branch_2="x") == []


def test_lazy_check_requests_else_when_nothing_matches():
    assert NodeForgeIfElse.check_lazy_status(table("1 == 2"), "", **{"else": None}) == ["else"]


def test_variables_are_typed_like_node_outputs():
    variables = json.dumps({"count": "4", "ratio": "0.5", "name": "bob"})
    assert select_branch(table("count > 3 and ratio < 1"), variables) == ("branch_1", "B1")
    assert select_branch(table('name == "bob"'), variables) == ("branch_1", "B1")


def test_string_variable_is_not_compared_as_a_number():
    variables = json.dumps({"code": "007"})
    assert select_branch(table("code == 7"), variables) == ("branch_1", "B1")


def test_helper_functions_are_allowed():
    assert select_branch(table("len(name) == 3"), json.dumps({"name": "bob"})) == ("branch_1", "B1")


@pytest.mark.parametrize(
    "expression",
    ["().__class__", "__import__('os')", "open('x')", "x.upper()", "[1][0] == 1", "(lambda: 1)()", "x ** 9"],
)
def test_unsafe_expressions_are_rejected(expression):
    with pytest.raises(ValueError, match="condition"):
        select_branch(table(expression), json.dumps({"x": "a"}))


def test_error_names_the_branch_and_expression():
    with pytest.raises(ValueError, match=r"B2 condition 'nope > 1' failed"):
        select_branch(table("1 == 2", "nope > 1"), "")


def test_empty_condition_is_an_error():
    with pytest.raises(ValueError, match="B1 has no condition"):
        select_branch(table(""), "")


def test_more_than_max_branches_is_an_error():
    with pytest.raises(ValueError, match=f"limit is {MAX_BRANCHES}"):
        select_branch(table(*["1 == 2"] * (MAX_BRANCHES + 1)), "")


def transform_table(condition, transform="", mode=None):
    row = {"label": "B1", "condition": condition, "transform": transform}
    if mode is not None:
        row["transform_mode"] = mode
    return json.dumps([row])


def test_empty_transform_passes_the_input_through_unchanged():
    payload = object()
    assert NodeForgeIfElse().run(transform_table("1 == 1"), "", branch_1=payload) == (payload,)


def test_template_keeps_the_input_and_appends_text_and_a_variable():
    out = NodeForgeIfElse().run(
        transform_table("1 == 1", "%input%\n\nStyle: %style%"), json.dumps({"style": "noir"}), branch_1="a scene"
    )
    assert out == ("a scene\n\nStyle: noir",)


def test_template_without_input_token_replaces_the_text():
    assert NodeForgeIfElse().run(transform_table("1 == 1", "Fixed"), "", branch_1="ignored") == ("Fixed",)


def test_template_leaves_unknown_tokens_as_they_are():
    out = NodeForgeIfElse().run(transform_table("1 == 1", "%missing% %input%"), "", branch_1="x")
    assert out == ("%missing% x",)


def test_template_transform_needs_text_input():
    with pytest.raises(ValueError, match="B1 has a transform, but its input is not text"):
        NodeForgeIfElse().run(transform_table("1 == 1", "%input%"), "", branch_1=object())


def test_expression_transform_combines_text_and_variables():
    out = NodeForgeIfElse().run(
        transform_table("1 == 1", 'input + " / " + str(count)', "expression"),
        json.dumps({"count": "3"}),
        branch_1="shot",
    )
    assert out == ("shot / 3",)


def test_expression_transform_rejects_attribute_access():
    with pytest.raises(ValueError, match=r"B1 transform .* failed"):
        NodeForgeIfElse().run(transform_table("1 == 1", "input.upper()", "expression"), "", branch_1="x")


def test_transform_applies_only_to_the_selected_branch():
    rows = json.dumps([
        {"label": "A", "condition": "1 == 2", "transform": "X"},
        {"label": "B", "condition": "1 == 1", "transform": "%input%!"},
    ])
    assert NodeForgeIfElse().run(rows, "", branch_1="a", branch_2="b") == ("b!",)


def test_else_transform_applies_when_nothing_is_true():
    config = json.dumps({"branches": [{"label": "B1", "condition": "1 == 2"}], "else": {"transform": "%input% / else"}})
    assert NodeForgeIfElse().run(config, "", **{"else": "E"}) == ("E / else",)


def test_else_transform_does_not_apply_to_a_true_branch():
    config = json.dumps({
        "branches": [{"label": "B1", "condition": "1 == 1"}],
        "else": {"transform": "%input% / else"},
    })
    assert NodeForgeIfElse().run(config, "", branch_1="A", **{"else": "E"}) == ("A",)


def test_else_expression_transform_uses_variables():
    config = json.dumps({"branches": [], "else": {"transform": "input + ' ' + str(count)", "transform_mode": "expression"}})
    assert NodeForgeIfElse().run(config, json.dumps({"count": "3"}), **{"else": "E"}) == ("E 3",)


def test_else_transform_needs_text_input():
    config = json.dumps({"branches": [], "else": {"transform": "%input%"}})
    with pytest.raises(ValueError, match="Else has a transform, but its input is not text"):
        NodeForgeIfElse().run(config, "", **{"else": object()})


def test_unknown_transform_mode_is_an_error():
    with pytest.raises(ValueError, match="transform mode must be one of"):
        NodeForgeIfElse().run(transform_table("1 == 1", "x", "shout"), "", branch_1="a")
