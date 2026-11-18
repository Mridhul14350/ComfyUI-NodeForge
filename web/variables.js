import { app } from "../../scripts/app.js";
import { ensureCss } from "./file_ui.js";

const VARIABLES_NODE = "NodeForgeVariables";
const RESOLVE_NODE = "NodeForgeResolveString";
const MAX_STRINGS = 16;
const MAX_CHOICES = 8;

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

const TYPE_VALUE = "value";
const TYPE_CHOICE = "choice";

// Same rules as the Python side: labels are required and unique, and a choice needs at least one option.
function optionsError(options) {
    if (!options.length) return "Add at least one option";
    const seen = new Set();
    for (const { label } of options) {
        if (!label) return "Every option needs a label";
        if (seen.has(label)) return `Duplicate option label '${label}'`;
        seen.add(label);
    }
    return "";
}

// Name rows. A value row outputs its typed text (and can step); a choice row outputs the value of the
// option picked in its dropdown. Output is a JSON list; the node validates it on run.
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

    const addRow = (row = {}) => {
        const rowEl = el("div", "nf-var-row");
        const nameInput = el("input", "nf-var-name");
        nameInput.type = "text";
        nameInput.placeholder = "name";
        nameInput.spellcheck = false;
        nameInput.value = String(row.name ?? "");
        nameInput.addEventListener("input", refresh);
        const del = el("button", "nf-var-del", "×");
        del.type = "button";
        del.title = "Remove variable";
        del.onclick = () => {
            rowEl.remove();
            refresh();
            onChange();
        };
        const nameLine = el("div", "nf-var-line");
        nameLine.append(nameInput, del);

        const seg = el("div", "nf-var-seg");
        const segButtons = new Map();
        for (const [type, text, title] of [
            [TYPE_VALUE, "Value", "Output the typed text"],
            [TYPE_CHOICE, "Choice", "Output the option picked in the dropdown"],
        ]) {
            const b = el("button", "", text);
            b.type = "button";
            b.title = title;
            b.onclick = () => {
                if (rowEl.nfType === type) return;
                applyType(type);
                refresh();
                onChange();
            };
            segButtons.set(type, b);
            seg.append(b);
        }

        const valueInput = el("input", "nf-var-value");
        valueInput.type = "text";
        valueInput.placeholder = "value";
        valueInput.spellcheck = false;
        valueInput.value = String(row.value ?? "");
        const stepLabel = el("span", "", "step");
        const stepInput = el("input", "nf-var-step");
        stepInput.type = "number";
        stepInput.step = "1";
        stepInput.placeholder = "0";
        stepInput.title = "Add this to the value on each run (whole number, blank or 0 = off)";
        stepInput.value = String(row.step ?? "");
        stepInput.addEventListener("input", onChange);
        const valueLine = el("div", "nf-var-line");
        valueLine.append(valueInput, stepLabel, stepInput);

        const choice = el("select", "nf-var-choice");
        choice.title = "Option to output";
        rowEl.nfChoice = choice;
        const expandBtn = el("button", "nf-var-opts");
        expandBtn.type = "button";
        const choiceLine = el("div", "nf-var-line");
        choiceLine.append(choice, expandBtn);

        const body = el("div", "nf-var-line");
        body.append(seg, valueLine, choiceLine);

        const optList = el("div", "nf-var-opt-list");
        const optErr = el("div", "nf-var-err");
        const optAdd = el("button", "nf-var-add", "+ Add option");
        optAdd.type = "button";
        const panel = el("div", "nf-var-panel");
        panel.append(el("div", "nf-var-sec", "Options"), optList, optErr, optAdd);

        rowEl.nfOptions = Array.isArray(row.options)
            ? row.options.map((o) => ({ label: String(o?.label ?? ""), value: String(o?.value ?? "") }))
            : [];
        rowEl.nfExpanded = false;
        const optionKey = (o) => o.label.trim();
        const fillChoices = (keep) => {
            choice.replaceChildren(
                ...rowEl.nfOptions.map((o) => {
                    const opt = el("option", "", optionKey(o));
                    opt.value = optionKey(o);
                    return opt;
                }),
            );
            if (keep && rowEl.nfOptions.some((o) => optionKey(o) === keep)) choice.value = keep;
        };

        const renderPanel = () => {
            const open = rowEl.nfType === TYPE_CHOICE && rowEl.nfExpanded;
            panel.hidden = !open;
            expandBtn.classList.toggle("on", open);
            const n = rowEl.nfOptions.length;
            expandBtn.textContent = `${n} option${n === 1 ? "" : "s"} ${rowEl.nfExpanded ? "▴" : "▾"}`;
        };
        const drawErr = () => {
            optErr.textContent = optionsError(rowEl.nfOptions.map((o) => ({ label: optionKey(o), value: o.value })));
        };

        const move = (index, dir) => {
            const opts = rowEl.nfOptions;
            [opts[index], opts[index + dir]] = [opts[index + dir], opts[index]];
            fillChoices(choice.value);
            drawOptions();
            onChange();
        };
        const iconButton = (text, title, onClick) => {
            const b = el("button", "nf-var-del", text);
            b.type = "button";
            b.title = title;
            b.onclick = onClick;
            return b;
        };
        const optionItem = (opt, index) => {
            const item = el("div", "nf-var-opt");
            const label = el("input", "nf-var-opt-label");
            label.type = "text";
            label.placeholder = "label (shown in dropdown)";
            label.spellcheck = false;
            label.value = opt.label;
            label.addEventListener("input", () => {
                // Keep the dropdown on the same option when its label is edited.
                const wasSelected = choice.value === optionKey(opt);
                opt.label = label.value;
                fillChoices(wasSelected ? optionKey(opt) : choice.value);
                drawErr();
            });
            const up = iconButton("↑", "Move up", () => move(index, -1));
            up.disabled = index === 0;
            const down = iconButton("↓", "Move down", () => move(index, 1));
            down.disabled = index === rowEl.nfOptions.length - 1;
            const remove = iconButton("×", "Remove option", () => {
                rowEl.nfOptions.splice(index, 1);
                fillChoices(choice.value);
                drawOptions();
                onChange();
            });
            const line = el("div", "nf-var-line");
            line.append(label, up, down, remove);
            const area = el("textarea", "nf-var-text");
            area.rows = 1;
            area.spellcheck = false;
            area.placeholder = "value (text that is output)";
            area.dataset.captureWheel = "true";
            area.value = opt.value;
            area.addEventListener("input", () => {
                opt.value = area.value;
                autoGrow(area);
            });
            item.append(line, area);
            return item;
        };
        const drawOptions = () => {
            optList.replaceChildren(...rowEl.nfOptions.map((o, i) => optionItem(o, i)));
            optList.querySelectorAll(".nf-var-text").forEach(autoGrow);
            drawErr();
            renderPanel();
        };

        const applyType = (type) => {
            if (type === TYPE_CHOICE && !rowEl.nfOptions.length) {
                // Keep the typed value as the first option, so switching does not lose it.
                rowEl.nfOptions = [{ label: "option 1", value: valueInput.value }];
                fillChoices();
            }
            rowEl.nfType = type;
            for (const [t, b] of segButtons) b.classList.toggle("on", t === type);
            valueLine.hidden = type === TYPE_CHOICE;
            choiceLine.hidden = type !== TYPE_CHOICE;
            drawOptions();
        };

        expandBtn.onclick = () => {
            rowEl.nfExpanded = !rowEl.nfExpanded;
            renderPanel();
            onChange();
        };
        optAdd.onclick = () => {
            let n = rowEl.nfOptions.length + 1;
            while (rowEl.nfOptions.some((o) => o.label === `option ${n}`)) n++;
            rowEl.nfOptions.push({ label: `option ${n}`, value: "" });
            fillChoices(choice.value);
            drawOptions();
            onChange();
            const labels = optList.querySelectorAll(".nf-var-opt-label");
            labels[labels.length - 1]?.focus();
        };

        rowEl.append(nameLine, body, panel);
        fillChoices(String(row.selected ?? ""));
        applyType(row.type === TYPE_CHOICE ? TYPE_CHOICE : TYPE_VALUE);
        list.append(rowEl);
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
            const rows = [...list.querySelectorAll(".nf-var-row")].map((rowEl) => {
                const name = rowEl.querySelector(".nf-var-name").value;
                if (rowEl.nfType === TYPE_CHOICE) {
                    const out = {
                        name,
                        type: TYPE_CHOICE,
                        selected: rowEl.nfChoice.value,
                        options: rowEl.nfOptions.map((o) => ({ label: o.label.trim(), value: o.value })),
                    };
                    return out;
                }
                return {
                    name,
                    value: rowEl.querySelector(".nf-var-value").value,
                    step: rowEl.querySelector(".nf-var-step").value,
                };
            });
            return JSON.stringify(rows);
        },
        set(value) {
            list.replaceChildren();
            for (const row of parseRows(value)) {
                addRow(row ?? {});
            }
            if (!list.children.length) addRow();
            refresh();
            // Not laid out yet while the workflow loads, so measure again on the next frame.
            requestAnimationFrame(onChange);
        },
    };
    return box;
}

// Keep one output per choice row, named v_choice_1, v_choice_2, ... in row order. Output 0 is `variables`.
function syncChoiceOutputs(node) {
    if (!node.outputs || !node.nfVariables) return;
    const choices = parseRows(node.nfVariables.get()).filter(
        (r) => r?.type === TYPE_CHOICE && String(r.name ?? "").trim(),
    ).length;
    const wanted = 1 + Math.min(MAX_CHOICES, choices);
    while (node.outputs.length > wanted) {
        node.removeOutput(node.outputs.length - 1);
    }
    while (node.outputs.length < wanted) {
        node.addOutput("string", "STRING");
    }
    for (let i = 1; i < wanted; i++) {
        const out = node.outputs[i];
        out.name = `v_choice_${i}`;
        out.label = `v_choice_${i}`;
        out.type = "STRING";
    }
    resizeToContent(node);
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
                const editor = buildVariablesEditor(() => {
                    syncChoiceOutputs(this);
                    resizeToContent(this);
                });
                this.nfVariables = editor;
                swapForDom(this, "data", editor.root, {
                    getValue: () => editor.get(),
                    setValue: (v) => {
                        editor.set(v);
                        syncChoiceOutputs(this);
                    },
                    getMinHeight: () => editor.root.scrollHeight,
                });
                syncChoiceOutputs(this);
                resizeToContent(this);
                return result;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                const result = onConfigure?.apply(this, arguments);
                syncChoiceOutputs(this);
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
