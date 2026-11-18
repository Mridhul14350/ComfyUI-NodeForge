"""NodeForge: Switch Case passes through the result input of the first case whose label
matches the value. Only the selected input is evaluated, so unused branches never run."""

MAX_CASES = 10
CASE_LABEL = "NodeForge: Switch Case"
ON_NO_MATCH = ["error", "block"]
STRING_MATCH = ["case_sensitive", "case_insensitive"]


def parse_cases(text):
    labels = [line.strip() for line in str(text).splitlines()]
    while labels and not labels[-1]:
        labels.pop()
    return labels


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _parse_int(label):
    try:
        return int(label)
    except ValueError:
        return None


def find_case(value, labels, case_insensitive=False):
    """Index of the first label that matches value, or None. Empty labels never match."""
    for index, label in enumerate(labels):
        if not label:
            continue
        if _is_int(value):
            if _parse_int(label) == value:
                return index
        else:
            left, right = str(value), label
            if case_insensitive:
                left, right = left.casefold(), right.casefold()
            if left == right:
                return index
    return None


def select_input(value, cases, string_match):
    """Return (input name, matched label). The name is 'default' when no case matches."""
    if not (_is_int(value) or isinstance(value, str)):
        raise ValueError(f"{CASE_LABEL}: value must be INT or STRING, got {type(value).__name__}")
    labels = parse_cases(cases)
    index = find_case(value, labels, string_match == "case_insensitive")
    if index is None:
        return "default", None
    if index >= MAX_CASES:
        raise ValueError(
            f"{CASE_LABEL}: value '{value}' matches case {index + 1} ('{labels[index]}'), "
            f"but only {MAX_CASES} case_result inputs exist"
        )
    return f"case_result_{index + 1}", labels[index]


def _blocker():
    from comfy_execution.graph_utils import ExecutionBlocker

    return ExecutionBlocker(None)


class NodeForgeSwitchCase:
    CATEGORY = "NodeForge/Flow"
    FUNCTION = "run"
    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("result",)
    DESCRIPTION = (
        "Passes the result of the first case whose label matches value. "
        "Unselected branches are not evaluated."
    )

    @classmethod
    def INPUT_TYPES(cls):
        lazy_inputs = {f"case_result_{i + 1}": ("*", {"lazy": True}) for i in range(MAX_CASES)}
        lazy_inputs["default"] = ("*", {"lazy": True})
        return {
            "required": {
                "value": ("*", {}),
                "cases": ("STRING", {"default": "1\n2\n3", "multiline": True}),
                "on_no_match": (ON_NO_MATCH, {"default": "error"}),
                "string_match": (STRING_MATCH, {"default": "case_sensitive"}),
            },
            "optional": lazy_inputs,
        }

    @classmethod
    def check_lazy_status(cls, value, cases="", on_no_match="error", string_match="case_sensitive", **inputs):
        # V1 passes only connected inputs. A connected input that has not run yet arrives as None.
        name, _label = select_input(value, cases, string_match)
        if inputs.get(name, False) is None:
            return [name]
        return []

    def run(self, value, cases="", on_no_match="error", string_match="case_sensitive", **inputs):
        name, label = select_input(value, cases, string_match)
        if label is not None:
            if name not in inputs:
                raise ValueError(
                    f"{CASE_LABEL}: value '{value}' matches case '{label}', "
                    f"but {name} is not connected"
                )
            return (inputs[name],)
        if "default" in inputs:
            return (inputs["default"],)
        if on_no_match == "block":
            return (_blocker(),)
        raise ValueError(f"{CASE_LABEL}: no case matches value '{value}' and default is not connected")
