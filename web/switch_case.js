import { app } from "../../scripts/app.js";

const NODE_NAME = "NodeForgeSwitchCase";
const MAX_CASES = 10;
const CASE_OUTPUTS = Array.from({ length: MAX_CASES }, (_, i) => `case_result_${i + 1}`);
const DEFAULT_INPUT = "default";
const NODE_MIN_WIDTH = 360;
const HELP_TEXT =
    "Rows are checked top to bottom and the first match wins. Each row's input on the node shows its label. Empty rows are ignored.";

const CSS = `
.nf-sw-root { --nf-acc:#4ea8ff; display:flex; flex-direction:column; gap:4px; padding:4px; box-sizing:border-box; width:100%; font-size:12px; color:#ddd; }
.nf-sw-head, .nf-sw-row { display:grid; grid-template-columns:30px minmax(72px,1.4fr) minmax(56px,1fr) 22px; gap:5px; align-items:center; }
.nf-sw-head { color:#8a8a8a; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; padding:0 3px; }
.nf-sw-add { height:24px; border:1px dashed #3a3a3a; border-radius:6px; background:transparent; color:#9a9a9a; font:inherit; font-size:11px; cursor:pointer; }
.nf-sw-add:hover { border-color:var(--nf-acc); color:#ddd; }
.nf-sw-rows { display:flex; flex-direction:column; gap:4px; }
.nf-sw-row { padding:3px; box-sizing:border-box; border:1px solid #2c2c2c; border-radius:6px; background:#141414; }
.nf-sw-row:hover { border-color:#3a3a3a; }
.nf-sw-row.linked { border-color:var(--nf-acc); }
.nf-sw-row.warn { border-color:#e0a33e; }
.nf-sw-num { height:24px; border-radius:5px; background:#262626; color:#9a9a9a; font-size:11px; font-weight:600; display:flex; align-items:center; justify-content:center; }
.nf-sw-row.linked .nf-sw-num { background:var(--nf-acc); color:#fff; }
.nf-sw-row.warn .nf-sw-num { background:#e0a33e; color:#1a1a1a; }
.nf-sw-input { min-width:0; width:100%; height:24px; background:#1d1d1d; border:1px solid #3a3a3a; border-radius:5px; padding:3px 6px; color:#ddd; font:inherit; box-sizing:border-box; }
.nf-sw-input::placeholder { color:#666; }
.nf-sw-input:focus { outline:none; border-color:var(--nf-acc); }
.nf-sw-row.nf-sw-default .nf-sw-note { grid-column:2 / span 2; color:#8a8a8a; font-size:11px; }
.nf-sw-hint { color:#8a8a8a; font-size:11px; padding:2px 3px; line-height:1.4; white-space:pre-line; }
.nf-sw-del { width:22px; height:24px; padding:0; border:none; border-radius:5px; background:transparent; color:#777; font-size:16px; line-height:1; cursor:pointer; }
.nf-sw-del:hover { background:#2a2a2a; color:#ff7b7b; }
`;

function ensureCss() {
    if (document.getElementById("nf-sw-css")) return;
    const style = document.createElement("style");
    style.id = "nf-sw-css";
    style.textContent = CSS;
    document.head.append(style);
}

function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function getWidget(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

// Grow the node to fit the table. It never shrinks, so a size the user chose is kept.
function fitToContent(node) {
    const [w, h] = node.computeSize();
    node.setSize?.([Math.max(node.size[0], w, NODE_MIN_WIDTH), Math.max(node.size[1], h)]);
    node.setDirtyCanvas?.(true, true);
}

// A new node starts with one row, so it is sized to that instead of the full set of inputs it was created with.
function resetNodeSize(node) {
    const [w, h] = node.computeSize();
    node.setSize?.([Math.max(w, NODE_MIN_WIDTH), h]);
}

function defaultLabel(index) {
    return `Case ${String(index + 1).padStart(2, "0")}`;
}

function emptyRows() {
    return Array.from({ length: MAX_CASES }, (_, i) => ({ value: "", label: defaultLabel(i) }));
}

// Reads the saved value: JSON rows, or the older one-value-per-line text (which has no labels).
// An empty label falls back to the default "Case NN".
function parseRows(saved) {
    const rows = emptyRows();
    const text = String(saved ?? "");
    if (text.trimStart().startsWith("[")) {
        let data = [];
        try {
            data = JSON.parse(text);
        } catch {
            data = [];
        }
        if (Array.isArray(data)) {
            data.slice(0, MAX_CASES).forEach((row, i) => {
                const label = String(row?.label ?? "").trim();
                rows[i] = {
                    value: String(row?.value ?? "").trim(),
                    label: label || defaultLabel(i),
                };
            });
        }
    } else {
        text.split(/\r?\n/).slice(0, MAX_CASES).forEach((line, i) => {
            rows[i].value = line.trim();
        });
    }
    return rows;
}

function serializeRows(rows) {
    return JSON.stringify(rows.map(({ value, label }) => ({ value, label })));
}

function findSlot(node, name) {
    return node.inputs?.find((slot) => slot.name === name);
}

// Only the case and default inputs are managed here. Other inputs, such as value, keep their slot and link.
function isCaseSlot(slot) {
    return slot.name === DEFAULT_INPUT || CASE_OUTPUTS.includes(slot.name);
}

function isLinked(node, name) {
    return findSlot(node, name)?.link != null;
}

// The text shown next to a case input dot is the row's label only.
function caseSlotLabel(index, row) {
    return row.label.trim() || defaultLabel(index);
}

// Writes a label only when it changed, so an unchanged workflow is not marked as modified.
function applySlotLabels(node, rows) {
    if (!node.inputs) return;
    const wanted = new Map(CASE_OUTPUTS.map((name, i) => [name, caseSlotLabel(i, rows[i])]));
    wanted.set(DEFAULT_INPUT, "default (no match)");
    for (const slot of node.inputs) {
        const text = wanted.get(slot.name);
        if (text !== undefined && slot.label !== text) slot.label = text;
    }
}

// Keeps the case inputs as case_result_1..N followed by "default". N is the number of shown rows, or higher if a link needs it.
// Links are reconnected to their new slots, so this only runs once the graph has restored its links.
// removed is the index of a deleted row: its link is dropped and later links move up one slot with their rows.
function setCaseInputCount(node, count, removed = -1) {
    if (!node.inputs) return;
    const links = [];
    node.inputs.forEach((slot, i) => {
        const link = isCaseSlot(slot) ? node.getInputLink(i) : null;
        if (link) links.push({ name: slot.name, from: node.graph?.getNodeById(link.origin_id), fromSlot: link.origin_slot });
    });
    const moved = links
        .filter((link) => removed < 0 || CASE_OUTPUTS.indexOf(link.name) !== removed)
        .map((link) => {
            const index = CASE_OUTPUTS.indexOf(link.name);
            return removed >= 0 && index > removed ? { ...link, name: CASE_OUTPUTS[index - 1] } : link;
        });
    let highest = 0;
    for (const { name } of moved) {
        const index = CASE_OUTPUTS.indexOf(name);
        if (index >= 0) highest = Math.max(highest, index + 1);
    }
    const wanted = [...CASE_OUTPUTS.slice(0, Math.max(count, highest, 1)), DEFAULT_INPUT];
    const current = node.inputs.filter(isCaseSlot).map((slot) => slot.name);
    if (removed < 0 && current.length === wanted.length && current.every((name, i) => name === wanted[i])) return;

    for (let i = node.inputs.length - 1; i >= 0; i--) {
        if (!isCaseSlot(node.inputs[i])) continue;
        if (node.getInputLink(i)) node.disconnectInput(i);
        node.removeInput(i);
    }
    wanted.forEach((name) => node.addInput(name, "*"));
    for (const { name, from, fromSlot } of moved) {
        const target = node.inputs.findIndex((slot) => slot.name === name);
        if (from && target >= 0) from.connect(fromSlot, node, target);
    }
}

// Each row is unused, linked, unlinked, or a repeat of an earlier value (the first match wins, so a repeat never matches).
function rowStatus(node, rows) {
    const seen = new Set();
    return rows.map((row, i) => {
        const value = row.value.trim();
        const linked = isLinked(node, CASE_OUTPUTS[i]);
        if (!value) return { kind: "unused", linked };
        if (seen.has(value)) return { kind: "repeat", linked };
        seen.add(value);
        return { kind: linked ? "linked" : "unlinked", linked };
    });
}

function buildSwitchUi(node) {
    let rows = emptyRows();
    // How many rows are shown. Rows up to the last used one are always shown, and "Add case" shows more.
    let visible = 1;
    const root = el("div", "nf-sw-root");

    const head = el("div", "nf-sw-head");
    head.append(el("span", "", "#"), el("span", "", "Label"), el("span", "", "Value"), el("span"));

    const list = el("div", "nf-sw-rows");
    const lines = CASE_OUTPUTS.map((_name, i) => {
        const line = el("div", "nf-sw-row");
        const valueInput = el("input", "nf-sw-input");
        valueInput.type = "text";
        valueInput.placeholder = "value";
        valueInput.spellcheck = false;
        const labelInput = el("input", "nf-sw-input");
        labelInput.type = "text";
        labelInput.placeholder = defaultLabel(i);
        labelInput.spellcheck = false;
        const deleteButton = el("button", "nf-sw-del", "×");
        deleteButton.type = "button";
        deleteButton.title = "Delete case";
        deleteButton.addEventListener("click", () => removeRow(i));
        line.append(el("span", "nf-sw-num", String(i + 1)), labelInput, valueInput, deleteButton);
        valueInput.addEventListener("input", () => {
            rows[i].value = valueInput.value;
            refresh();
        });
        labelInput.addEventListener("input", () => {
            rows[i].label = labelInput.value;
            refresh();
        });
        list.append(line);
        return { line, valueInput, labelInput };
    });

    const addButton = el("button", "nf-sw-add", "+ Add case");
    addButton.type = "button";
    addButton.addEventListener("click", () => {
        visible = Math.min(visible + 1, MAX_CASES);
        syncInputs();
        refresh();
        fitToContent(node);
        lines[visible - 1].valueInput.focus();
    });

    const defaultLine = el("div", "nf-sw-row nf-sw-default");
    defaultLine.append(el("span", "nf-sw-num", "else"), el("span", "nf-sw-note", "When no case matches"));

    const hint = el("div", "nf-sw-hint", HELP_TEXT);
    root.append(head, list, addButton, defaultLine, hint);

    function refresh() {
        const status = rowStatus(node, rows);
        const lastUsed = status.reduce((last, s, i) => (s.kind === "unused" && !s.linked ? last : i + 1), 0);
        const next = Math.max(visible, lastUsed, 1);
        const grew = next !== visible;
        visible = next;
        lines.forEach(({ line }, i) => {
            line.style.display = i < visible ? "" : "none";
        });
        addButton.style.display = visible >= MAX_CASES ? "none" : "";
        if (grew) fitToContent(node);
        status.forEach((s, i) => {
            const warn = s.kind === "unlinked" || s.kind === "repeat" || (s.kind === "unused" && s.linked);
            lines[i].line.classList.toggle("linked", s.kind === "linked");
            lines[i].line.classList.toggle("warn", warn);
        });
        defaultLine.classList.toggle("linked", isLinked(node, DEFAULT_INPUT));
        applySlotLabels(node, rows);
    }

    function renderRows() {
        rows.forEach((row, i) => {
            if (lines[i].valueInput.value !== row.value) lines[i].valueInput.value = row.value;
            if (lines[i].labelInput.value !== row.label) lines[i].labelInput.value = row.label;
        });
    }

    function setRows(next) {
        rows = next;
        visible = 1;
        renderRows();
        refresh();
    }

    // Removes a row with its input and link. Later rows move up, and their default labels are renumbered.
    function removeRow(index) {
        rows.splice(index, 1);
        for (let i = index; i < MAX_CASES - 1; i++) {
            if (rows[i].label === defaultLabel(i + 1)) rows[i].label = defaultLabel(i);
        }
        rows.push({ value: "", label: defaultLabel(MAX_CASES - 1) });
        visible = Math.max(visible - 1, 1);
        renderRows();
        setCaseInputCount(node, visible, index);
        refresh();
        const [, height] = node.computeSize();
        node.setSize?.([node.size[0], height]);
        node.setDirtyCanvas?.(true, true);
    }

    // Inputs follow the shown rows. Call this only after links are restored.
    function syncInputs() {
        setCaseInputCount(node, visible);
        applySlotLabels(node, rows);
    }

    return { root, setRows, getValue: () => serializeRows(rows), refresh, syncInputs };
}

app.registerExtension({
    name: "NodeForge.SwitchCase",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onCreated?.apply(this, arguments);
            ensureCss();
            const ui = buildSwitchUi(this);
            const old = getWidget(this, "cases");
            const index = old ? this.widgets.indexOf(old) : -1;
            ui.setRows(parseRows(old?.value));
            if (old) {
                this.widgets.splice(index, 1);
                old.onRemove?.();
                old.element?.remove();
            }
            const widget = this.addDOMWidget("cases", "custom", ui.root, {
                getValue: ui.getValue,
                setValue: (v) => ui.setRows(parseRows(v)),
                getMinHeight: () => ui.root.scrollHeight,
            });
            // Keep the value at its old position so widgets_values still lines up with saved workflows.
            this.widgets.splice(this.widgets.indexOf(widget), 1);
            this.widgets.splice(index < 0 ? this.widgets.length : index, 0, widget);
            this.nfSwitch = ui;
            requestAnimationFrame(() => {
                ui.refresh();
                ui.syncInputs();
                if (!this.nfLoaded) resetNodeSize(this);
                fitToContent(this);
            });
            return result;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const result = onConnectionsChange?.apply(this, arguments);
            this.nfSwitch?.refresh();
            return result;
        };

        // Links are restored after configure, so sync the inputs and status once they exist.
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            this.nfLoaded = true;
            requestAnimationFrame(() => {
                this.nfSwitch?.refresh();
                this.nfSwitch?.syncInputs();
                fitToContent(this);
            });
            return result;
        };
    },
});
