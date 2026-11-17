"""NodeForge: Variables sets named values. NodeForge: ResolveString replaces
%Variables.name% and %date:FORMAT% tokens in one or more strings."""

import datetime
import json
import uuid

from .utils import (
    apply_increments,
    resolve_dates,
    resolve_variables,
    strings_from_json,
    variable_rows,
    variables_from_json,
)

MAX_STRINGS = 16
VARIABLES_LABEL = "NodeForge: Variables"
RESOLVE_LABEL = "NodeForge: ResolveString"

# (node id, variable name) -> (typed value, last number output). Lives until the server restarts.
INCREMENT_STATE = {}


class NodeForgeVariables:
    CATEGORY = "NodeForge/Text"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("variables",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"data": ("STRING", {"default": "[]", "multiline": True})},
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    @classmethod
    def IS_CHANGED(cls, data="[]", **_kwargs):
        # A row with a step gives a new value on every run, so it must not be cached.
        try:
            stepped = any(step for _name, _value, step in variable_rows(data, VARIABLES_LABEL))
        except ValueError:
            return ""
        return uuid.uuid4().hex if stepped else ""

    def run(self, data, unique_id=None):
        rows = variable_rows(data, VARIABLES_LABEL)
        values = apply_increments(rows, str(unique_id), INCREMENT_STATE)
        return (json.dumps(values),)


class NodeForgeResolveString:
    CATEGORY = "NodeForge/Text"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING",) * MAX_STRINGS
    RETURN_NAMES = tuple(f"string_{i + 1}" for i in range(MAX_STRINGS))

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"strings": ("STRING", {"default": "[]", "multiline": True})},
            "optional": {"variables": ("STRING", {"default": "", "forceInput": True})},
        }

    def run(self, strings, variables=""):
        items = strings_from_json(strings, RESOLVE_LABEL)
        if len(items) > MAX_STRINGS:
            raise ValueError(
                f"{RESOLVE_LABEL}: at most {MAX_STRINGS} strings, got {len(items)}"
            )
        values = variables_from_json(variables, RESOLVE_LABEL)
        now = datetime.datetime.now()
        resolved = [
            resolve_variables(resolve_dates(s, now), values, RESOLVE_LABEL)
            for s in items
        ]
        return tuple(resolved + [None] * (MAX_STRINGS - len(resolved)))
