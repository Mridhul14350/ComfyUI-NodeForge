"""NodeForge: If Else checks its branch conditions top to bottom and passes through the input of the
first true one. Conditions are Python expressions over NodeForge variables. Only the selected input
is evaluated, so unused branches never run."""

import ast
import json
import keyword

from .utils import value_kind, typed_output, variables_from_json

MAX_BRANCHES = 10
CASE_LABEL = "NodeForge: If Else"
DEFAULT_BRANCHES = json.dumps([{"label": "Branch 01", "condition": ""}, {"label": "Branch 02", "condition": ""}])
ELSE_LABEL = "Else"

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


def parse_branches(text):
    """Return [(label, condition)] in row order: row N is checked as branch_N."""
    if not str(text).strip():
        return []
    try:
        rows = json.loads(text)
    except ValueError as err:
        raise ValueError(f"{CASE_LABEL}: branch table is not valid JSON ({err})") from err
    if not isinstance(rows, list):
        raise ValueError(f"{CASE_LABEL}: branch table must be a list of rows")
    if len(rows) > MAX_BRANCHES:
        raise ValueError(f"{CASE_LABEL}: {len(rows)} branches, the limit is {MAX_BRANCHES}")
    branches = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError(f"{CASE_LABEL}: every branch row must be an object")
        label = str(row.get("label") or "").strip()
        condition = str(row.get("condition") or "").strip()
        branches.append((label, condition))
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
    for index, (label, expression) in enumerate(branches):
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


class NodeForgeIfElse:
    CATEGORY = "NodeForge/Flow"
    FUNCTION = "run"
    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
    DESCRIPTION = (
        "Checks branch conditions top to bottom and passes through the input of the first true one. "
        "Uses else when none is true. Unused branches are not evaluated."
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
        return (inputs[name],)
