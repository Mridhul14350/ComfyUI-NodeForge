import { app } from "../../scripts/app.js";
import { ensureCss } from "./file_ui.js";

const VARIABLES_NODE = "NodeForgeVariables";
const RESOLVE_NODE = "NodeForgeResolveString";
const MAX_STRINGS = 16;

function getWidget(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

// Fit the node to its content in both directions. Width only grows, so a node the user widened keeps its width.
function resizeToContent(node) {
    const [w, h] = node.computeSize();
    node.setSize?.([Math.max(node.size[0], w), h]);
    node.setDirtyCanvas?.(true, true);
}

// Grow a textarea to show all of its text. The border is added back because sizing is border-box.
function autoGrow(area) {
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
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
        stepInput.placeholder = "0";
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
        const line = el("div", "nf-var-line");
        line.append(nameInput, valueInput, del);
        const stepLine = el("div", "nf-var-stepline");
        stepLine.append(el("span", "", "step"), stepInput);
        row.append(line, stepLine);
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
                name: row.querySelector(".nf-var-name").value,
                value: row.querySelector(".nf-var-value").value,
                step: row.querySelector(".nf-var-step").value,
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
            // Not laid out yet while the workflow loads, so measure again on the next frame.
            requestAnimationFrame(onChange);
        },
    };
    return box;
}

// One textarea per string. The number of rows sets the number of outputs. Each textarea grows with its text.
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
    const fitAll = () => list.querySelectorAll(".nf-var-text").forEach(autoGrow);

    const addRow = (text = "") => {
        const row = el("div", "nf-var-row nf-var-row-text");
        const area = el("textarea", "nf-var-text");
        area.rows = 1;
        area.spellcheck = false;
        area.placeholder = "out/%Variables.folder_001%/prompt_00001.txt";
        // ComfyUI forwards wheel to the canvas (zoom) unless this marker is set and the element is focused.
        area.dataset.captureWheel = "true";
        area.value = text;
        area.addEventListener("input", () => {
            autoGrow(area);
            onChange();
        });
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
        autoGrow(area);
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
            // Keep every saved string. Going over MAX_STRINGS is reported when the node runs.
            for (const text of parseRows(value)) addRow(String(text ?? ""));
            if (!list.children.length) addRow();
            refresh();
            requestAnimationFrame(() => {
                fitAll();
                onChange();
            });
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
    resizeToContent(node);
}

app.registerExtension({
    name: "NodeForge.Variables",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === VARIABLES_NODE) {
            const onCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = onCreated?.apply(this, arguments);
                ensureCss();
                const editor = buildVariablesEditor(() => resizeToContent(this));
                swapForDom(this, "data", editor.root, {
                    getValue: () => editor.get(),
                    setValue: (v) => editor.set(v),
                    getMinHeight: () => editor.root.scrollHeight,
                });
                resizeToContent(this);
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
                    getMinHeight: () => editor.root.scrollHeight,
                });
                editor.set("[]");
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
