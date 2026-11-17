import { app } from "../../scripts/app.js";
import { ensureCss, fitNodeSize } from "./file_ui.js";

const VARIABLES_NODE = "NodeForgeVariables";
const RESOLVE_NODE = "NodeForgeResolveString";
const MAX_STRINGS = 16;

function getWidget(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

// Replace the built-in widget with a DOM widget that keeps the same name, so its value is saved.
function swapForDom(node, name, root, options) {
    const old = getWidget(node, name);
    if (old) {
        node.widgets.splice(node.widgets.indexOf(old), 1);
        old.onRemove?.();
        old.element?.remove();
    }
    return node.addDOMWidget(name, "custom", root, options);
}

function parseRows(value) {
    try {
        const rows = JSON.parse(String(value ?? "[]"));
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

// Name/value rows. Output is a JSON list of {name, value}; the node validates it on run.
function buildVariablesEditor(onChange) {
    const root = el("div", "nf-var-root");
    const head = el("div", "nf-var-head");
    head.append(el("span", "nf-var-title", "variables"), el("span", "nf-var-count"));
    const list = el("div", "nf-var-list");
    const add = el("button", "nf-var-add", "+ Add variable");
    add.type = "button";
    root.append(head, list, add);
    const count = head.querySelector(".nf-var-count");

    const refresh = () => {
        const n = [...list.querySelectorAll(".nf-var-name")].filter((i) => i.value.trim()).length;
        count.textContent = `${n} set`;
    };

    const addRow = (name = "", value = "", step = "") => {
        const row = el("div", "nf-var-row");
        const nameInput = el("input", "nf-var-name");
        nameInput.type = "text";
        nameInput.placeholder = "name";
        nameInput.spellcheck = false;
        nameInput.value = name;
        const valueInput = el("input", "nf-var-value");
        valueInput.type = "text";
        valueInput.placeholder = "value";
        valueInput.spellcheck = false;
        valueInput.value = value;
        const stepInput = el("input", "nf-var-step");
        stepInput.type = "number";
        stepInput.step = "1";
        stepInput.placeholder = "+step";
        stepInput.title = "Add this to the value on each run (whole number, blank or 0 = off)";
        stepInput.value = step;
        const del = el("button", "nf-var-del", "×");
        del.type = "button";
        del.title = "Remove variable";
        del.onclick = () => {
            row.remove();
            refresh();
            onChange();
        };
        nameInput.addEventListener("input", refresh);
        stepInput.addEventListener("input", onChange);
        row.append(nameInput, valueInput, stepInput, del);
        list.append(row);
        refresh();
        return nameInput;
    };

    add.onclick = () => {
        addRow().focus();
        onChange();
    };

    const box = {
        root,
        get() {
            const rows = [...list.querySelectorAll(".nf-var-row")].map((row) => ({
                name: row.children[0].value,
                value: row.children[1].value,
                step: row.children[2].value,
            }));
            return JSON.stringify(rows);
        },
        set(value) {
            list.replaceChildren();
            for (const row of parseRows(value)) {
                addRow(String(row?.name ?? ""), String(row?.value ?? ""), String(row?.step ?? ""));
            }
            if (!list.children.length) addRow();
            refresh();
        },
    };
    return box;
}

// One textarea per string. The number of rows sets the number of outputs.
function buildStringsEditor(onChange) {
    const root = el("div", "nf-var-root");
    const head = el("div", "nf-var-head");
    head.append(el("span", "nf-var-title", "strings"), el("span", "nf-var-count"));
    const list = el("div", "nf-var-list");
    const add = el("button", "nf-var-add", "+ Add string");
    add.type = "button";
    root.append(head, list, add);
    const count = head.querySelector(".nf-var-count");

    const rowCount = () => list.children.length;
    const refresh = () => {
        count.textContent = `${rowCount()} / ${MAX_STRINGS}`;
        add.disabled = rowCount() >= MAX_STRINGS;
    };

    const addRow = (text = "") => {
        const row = el("div", "nf-var-row");
        const area = el("textarea", "nf-var-text");
        area.rows = 2;
        area.spellcheck = false;
        area.placeholder = "out/%Variables.folder_001%/prompt_00001.txt";
        // ComfyUI forwards wheel to the canvas (zoom) unless this marker is set and the element is focused.
        area.dataset.captureWheel = "true";
        area.value = text;
        const del = el("button", "nf-var-del", "×");
        del.type = "button";
        del.title = "Remove string";
        del.onclick = () => {
            row.remove();
            refresh();
            onChange();
        };
        row.append(area, del);
        list.append(row);
        refresh();
        return area;
    };

    add.onclick = () => {
        if (rowCount() >= MAX_STRINGS) return;
        addRow().focus();
        onChange();
    };

    return {
        root,
        get() {
            return JSON.stringify([...list.querySelectorAll(".nf-var-text")].map((a) => a.value));
        },
        set(value) {
            list.replaceChildren();
            const items = parseRows(value).slice(0, MAX_STRINGS);
            for (const text of items) addRow(String(text ?? ""));
            if (!list.children.length) addRow();
            refresh();
        },
        count: rowCount,
    };
}

// Show one output per string row. Outputs are declared as 16 STRINGs in Python; extra ones are removed.
function syncStringOutputs(node) {
    if (!node.outputs || !node.nfStrings) return;
    const wanted = Math.max(1, Math.min(MAX_STRINGS, node.nfStrings.count()));
    while (node.outputs.length > wanted) {
        node.removeOutput(node.outputs.length - 1);
    }
    while (node.outputs.length < wanted) {
        node.addOutput("string", "STRING");
    }
    for (let i = 0; i < wanted; i++) {
        const out = node.outputs[i];
        out.name = `string_${i + 1}`;
        out.label = `string_${i + 1}`;
        out.type = "STRING";
    }
    fitNodeSize(node);
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "NodeForge.Variables",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === VARIABLES_NODE) {
            const onCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = onCreated?.apply(this, arguments);
                ensureCss();
                const editor = buildVariablesEditor(() => fitNodeSize(this));
                swapForDom(this, "data", editor.root, {
                    getValue: () => editor.get(),
                    setValue: (v) => editor.set(v),
                    getMinHeight: () => 70,
                });
                fitNodeSize(this);
                return result;
            };
        }

        if (nodeData.name === RESOLVE_NODE) {
            const onCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = onCreated?.apply(this, arguments);
                ensureCss();
                const editor = buildStringsEditor(() => {
                    syncStringOutputs(this);
                });
                this.nfStrings = editor;
                swapForDom(this, "strings", editor.root, {
                    getValue: () => editor.get(),
                    setValue: (v) => {
                        editor.set(v);
                        syncStringOutputs(this);
                    },
                    getMinHeight: () => 70,
                });
                syncStringOutputs(this);
                return result;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                const result = onConfigure?.apply(this, arguments);
                syncStringOutputs(this);
                return result;
            };
        }
    },
});
