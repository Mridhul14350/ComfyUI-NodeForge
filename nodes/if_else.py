"""NodeForge: If Else checks its branch conditions top to bottom and passes through the input of the
first true one. Conditions are Python expressions over NodeForge variables. Only the selected input
is evaluated, so unused branches never run."""

import ast
import json
import keyword

from .utils import resolve_variables, value_kind, typed_output, variables_from_json

MAX_BRANCHES = 10
CASE_LABEL = "NodeForge: If Else"
DEFAULT_BRANCHES = json.dumps([{"label": "Branch 01", "condition": ""}, {"label": "Branch 02", "condition": ""}])
ELSE_LABEL = "Else"
TRANSFORM_MODES = ("template", "expression")

HELPERS = {"len": len, "int": int, "float": float, "str": str, "abs": abs, "min": min, "max": max}

# Only these AST nodes are allowed. Attribute access, subscripts, lambdas, comprehensions,
# imports, ** and starred arguments are all rejected, so a condition cannot reach Python internals.
ALLOWED_NODES = (
    ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.UnaryOp, ast.Not, ast.USub, ast.UAdd,
    ast.BinOp, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod,
    ast.Compare, ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.In, ast.NotIn,
    ast.Is, ast.IsNot, ast.Name, ast.Load, ast.Constant, ast.Call, ast.Tuple, ast.List,
)
CONSTANT_TYPES = (int, float, str, bool, type(None))


def load_config(text):
    """Return (rows, else_row). The table is either a list of branch rows, or an object
    {"branches": [...], "else": {...}} that is used when the else input has a transform."""
    if not str(text).strip():
        return [], {}
    try:
        data = json.loads(text)
    except ValueError as err:
        raise ValueError(f"{CASE_LABEL}: branch table is not valid JSON ({err})") from err
    if isinstance(data, dict):
        rows, else_row = data.get("branches", []), data.get("else", {})
        if not isinstance(rows, list) or not isinstance(else_row, dict):
            raise ValueError(f"{CASE_LABEL}: branches must be a list and else must be an object")
        return rows, else_row
    if not isinstance(data, list):
        raise ValueError(f"{CASE_LABEL}: branch table must be a list of rows")
    return data, {}


def _transform_of(row):
    transform = str(row.get("transform") or "")
    mode = str(row.get("transform_mode") or "template")
    if mode not in TRANSFORM_MODES:
        raise ValueError(f"{CASE_LABEL}: transform mode must be one of {', '.join(TRANSFORM_MODES)}")
    return transform, mode


def parse_branches(text):
    """Return [(label, condition, transform, transform_mode)] in row order: row N is checked as branch_N."""
    rows, _else_row = load_config(text)
    if len(rows) > MAX_BRANCHES:
        raise ValueError(f"{CASE_LABEL}: {len(rows)} branches, the limit is {MAX_BRANCHES}")
    branches = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(f"{CASE_LABEL}: every branch row must be an object")
        label = str(row.get("label") or "").strip()
        condition = str(row.get("condition") or "").strip()
        transform, mode = _transform_of(row)
        branches.append((label, condition, transform, mode))
    return branches


def typed_variables(variables):
    """Bind each variable whose name is a valid Python identifier, typed like a NodeForge output
    (whole number -> int, decimal -> float, otherwise text). Names with '-' cannot be used."""
    env = {}
    for name, text in variables.items():
        if name.isidentifier() and not keyword.iskeyword(name) and not name.startswith("_"):
            env[name] = typed_output(text, value_kind(text))
    return env


def _check_allowed(tree):
    for node in ast.walk(tree):
        if not isinstance(node, ALLOWED_NODES):
            raise ValueError(f"'{type(node).__name__}' is not allowed in a condition")
        if isinstance(node, ast.Constant) and not isinstance(node.value, CONSTANT_TYPES):
            raise ValueError("this literal is not allowed in a condition")
        if isinstance(node, ast.Name) and node.id.startswith("_"):
            raise ValueError(f"name '{node.id}' is not allowed in a condition")
        if isinstance(node, ast.Call) and (node.keywords or not (
            isinstance(node.func, ast.Name) and node.func.id in HELPERS
        )):
            raise ValueError("only len, int, float, str, abs, min and max may be called")


def evaluate(expression, env):
    """Evaluate one condition expression with the variables in env and the helper functions."""
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as err:
        raise ValueError(f"invalid expression ({err.msg})") from err
    _check_allowed(tree)
    code = compile(tree, "<condition>", "eval")
    return eval(code, {"__builtins__": {}}, {**env, **HELPERS})


def select_branch(condition, variables_text):
    """Return (input name, label) of the first true branch, or ('else', 'Else') when none is true."""
    branches = parse_branches(condition)
    env = typed_variables(variables_from_json(variables_text, CASE_LABEL))
    for index, (label, expression, _transform, _mode) in enumerate(branches):
        name = f"branch_{index + 1}"
        shown = label or name
        if not expression:
            raise ValueError(f"{CASE_LABEL}: {shown} has no condition")
        try:
            result = evaluate(expression, env)
        except (ValueError, TypeError, NameError, ArithmeticError) as err:
            raise ValueError(f"{CASE_LABEL}: {shown} condition '{expression}' failed: {err}") from err
        if bool(result):
            return name, shown
    return "else", ELSE_LABEL


def branch_transform(condition, name):
    """Return (transform, transform_mode) for the input name. An empty transform passes the input through."""
    if name == "else":
        _rows, else_row = load_config(condition)
        return _transform_of(else_row)
    index = int(name.split("_")[1]) - 1
    _label, _expression, transform, mode = parse_branches(condition)[index]
    return transform, mode


def apply_transform(value, transform, mode, variables_text, shown):
    """Rewrite the selected branch's value. An empty transform passes the value through unchanged.
    template: %input% is the branch text and %name% is a NodeForge variable. Unknown %...% stays as it is.
    expression: a Python expression with input (the branch text) and the variables by name."""
    if not transform.strip():
        return value
    if not isinstance(value, str):
        raise ValueError(f"{CASE_LABEL}: {shown} has a transform, but its input is not text")
    variables = variables_from_json(variables_text, CASE_LABEL)
    if mode == "template":
        return resolve_variables(transform, {**variables, "input": value})
    env = {**typed_variables(variables), "input": value}
    try:
        result = evaluate(transform, env)
    except (ValueError, TypeError, NameError, ArithmeticError) as err:
        raise ValueError(f"{CASE_LABEL}: {shown} transform '{transform}' failed: {err}") from err
    if result is None:
        raise ValueError(f"{CASE_LABEL}: {shown} transform '{transform}' gave no value")
    return str(result)


class NodeForgeIfElse:
    CATEGORY = "NodeForge/Flow"
    FUNCTION = "run"
    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
    DESCRIPTION = (
        "Checks branch conditions top to bottom and passes through the input of the first true one. "
        "Uses else when none is true. Unused branches are not evaluated. A branch can transform its "
        "text before it is passed on."
    )

    @classmethod
    def INPUT_TYPES(cls):
        lazy_inputs = {f"branch_{i + 1}": ("*", {"lazy": True}) for i in range(MAX_BRANCHES)}
        lazy_inputs["else"] = ("*", {"lazy": True})
        return {
            "required": {
                "condition": ("STRING", {"default": DEFAULT_BRANCHES, "multiline": True}),
            },
            "optional": {"variables": ("STRING", {"default": "", "forceInput": True}), **lazy_inputs},
        }

    @classmethod
    def check_lazy_status(cls, condition="", variables="", **inputs):
        # A connected input that has not run yet arrives as None.
        name, _label = select_branch(condition, variables)
        if inputs.get(name, False) is None:
            return [name]
        return []

    def run(self, condition="", variables="", **inputs):
        name, label = select_branch(condition, variables)
        if name not in inputs:
            if name == "else":
                raise ValueError(f"{CASE_LABEL}: no condition is true and else is not connected")
            raise ValueError(f"{CASE_LABEL}: {label} is true, but its input {name} is not connected")
        transform = branch_transform(condition, name)
        return (apply_transform(inputs[name], *transform, variables, label),)
