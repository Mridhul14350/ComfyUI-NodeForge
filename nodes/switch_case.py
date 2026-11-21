"""NodeForge: Switch Case passes through the result input of the first case whose value
matches the input value. Only the selected input is evaluated, so unused branches never run."""

import json

MAX_CASES = 10
CASE_LABEL = "NodeForge: Switch Case"
DEFAULT_CASES = json.dumps([{"value": "1", "label": ""}, {"value": "2", "label": ""}, {"value": "3", "label": ""}])


def parse_cases(text):
    """Case values in row order: row N feeds case_result_N. Labels are display-only and are not read here.

    The table is saved as JSON rows. Older workflows saved one value per line, which is still accepted.
    """
    text = str(text)
    if text.lstrip().startswith("["):
        try:
            rows = json.loads(text)
        except ValueError as err:
            raise ValueError(f"{CASE_LABEL}: cases table is not valid JSON ({err})") from err
        if not isinstance(rows, list):
            raise ValueError(f"{CASE_LABEL}: cases table must be a list of rows")
        values = [_cell(row.get("value") if isinstance(row, dict) else None) for row in rows]
    else:
        values = [line.strip() for line in text.splitlines()]
    while values and not values[-1]:
        values.pop()
    return values


def _cell(value):
    return "" if value is None else str(value).strip()


def _is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _parse_int(label):
    try:
        return int(label)
    except ValueError:
        return None


def find_case(value, values):
    """Index of the first case value that matches value, or None. Empty values never match.

    Strings match case-insensitively. An INT value matches a label that parses to the same integer.
    """
    for index, case_value in enumerate(values):
        if not case_value:
            continue
        if _is_int(value):
            if _parse_int(case_value) == value:
                return index
        elif str(value).casefold() == case_value.casefold():
            return index
    return None


def select_input(value, cases):
    """Return (input name, matched case value). The name is 'default' when no case matches."""
    if not (_is_int(value) or isinstance(value, str)):
        raise ValueError(f"{CASE_LABEL}: value must be INT or STRING, got {type(value).__name__}")
    values = parse_cases(cases)
    index = find_case(value, values)
    if index is None:
        return "default", None
    if index >= MAX_CASES:
        raise ValueError(
            f"{CASE_LABEL}: value '{value}' matches case {index + 1} ('{values[index]}'), "
            f"but only {MAX_CASES} case_result inputs exist"
        )
    return f"case_result_{index + 1}", values[index]


class NodeForgeSwitchCase:
    CATEGORY = "NodeForge/Flow"
    FUNCTION = "run"
    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
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
                "cases": ("STRING", {"default": DEFAULT_CASES, "multiline": True}),
            },
            "optional": lazy_inputs,
        }

    @classmethod
    def check_lazy_status(cls, value, cases="", **inputs):
        # V1 passes only connected inputs. A connected input that has not run yet arrives as None.
        name, _matched = select_input(value, cases)
        if inputs.get(name, False) is None:
            return [name]
        return []

    def run(self, value, cases="", **inputs):
        name, matched = select_input(value, cases)
        if matched is not None:
            if name not in inputs:
                raise ValueError(
                    f"{CASE_LABEL}: value '{value}' matches case '{matched}', "
                    f"but {name} is not connected"
                )
            return (inputs[name],)
        if "default" in inputs:
            return (inputs["default"],)
        raise ValueError(f"{CASE_LABEL}: no case matches value '{value}' and default is not connected")
