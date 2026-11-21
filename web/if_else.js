import { app } from "../../scripts/app.js";

const NODE_NAME = "NodeForgeIfElse";
const MAX_BRANCHES = 10;
const BRANCH_INPUTS = Array.from({ length: MAX_BRANCHES }, (_, i) => `branch_${i + 1}`);
const ELSE_INPUT = "else";
const NODE_MIN_WIDTH = 380;

const CSS = `
.nf-if-root { --nf-acc:#4ea8ff; display:flex; flex-direction:column; gap:4px; padding:4px; box-sizing:border-box; width:100%; font-size:12px; color:#ddd; }
.nf-if-head, .nf-if-row { display:grid; grid-template-columns:30px minmax(72px,1fr) minmax(110px,1.8fr) 22px; gap:5px; align-items:center; }
.nf-if-head { color:#8a8a8a; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; padding:0 3px; }
.nf-if-add { height:24px; border:1px dashed #3a3a3a; border-radius:6px; background:transparent; color:#9a9a9a; font:inherit; font-size:11px; cursor:pointer; }
.nf-if-add:hover { border-color:var(--nf-acc); color:#ddd; }
.nf-if-rows { display:flex; flex-direction:column; gap:4px; }
.nf-if-row { padding:3px; box-sizing:border-box; border:1px solid #2c2c2c; border-radius:6px; background:#141414; }
.nf-if-row:hover { border-color:#3a3a3a; }
.nf-if-row.linked { border-color:var(--nf-acc); }
.nf-if-row.warn { border-color:#e0a33e; }
.nf-if-num { height:24px; border-radius:5px; background:#262626; color:#9a9a9a; font-size:11px; font-weight:600; display:flex; align-items:center; justify-content:center; }
.nf-if-row.linked .nf-if-num { background:var(--nf-acc); color:#fff; }
.nf-if-row.warn .nf-if-num { background:#e0a33e; color:#1a1a1a; }
.nf-if-input { min-width:0; width:100%; height:24px; background:#1d1d1d; border:1px solid #3a3a3a; border-radius:5px; padding:3px 6px; color:#ddd; font:inherit; font-family:Consolas, monospace; box-sizing:border-box; }
.nf-if-input::placeholder { color:#666; }
.nf-if-input:focus { outline:none; border-color:var(--nf-acc); }
.nf-if-row.nf-if-else .nf-if-note { grid-column:2 / span 2; color:#8a8a8a; font-size:11px; }
.nf-if-del { width:22px; height:24px; padding:0; border:none; border-radius:5px; background:transparent; color:#777; font-size:16px; line-height:1; cursor:pointer; }
.nf-if-del:hover { background:#2a2a2a; color:#ff7b7b; }
`;

function ensureCss() {
    if (document.getElementById("nf-if-css")) return;
    const style = document.createElement("style");
    style.id = "nf-if-css";
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

// A new node starts with its rows only, not the full set of inputs it was created with.
function resetNodeSize(node) {
    const [w, h] = node.computeSize();
    node.setSize?.([Math.max(w, NODE_MIN_WIDTH), h]);
}

function defaultLabel(index) {
    return `Branch ${String(index + 1).padStart(2, "0")}`;
}

function emptyRows() {
    return Array.from({ length: MAX_BRANCHES }, (_, i) => ({ label: defaultLabel(i), condition: "" }));
}

// Reads the saved JSON rows. An empty label falls back to the default "Branch NN".
function parseRows(saved) {
    const rows = emptyRows();
    let data = [];
    try {
        data = JSON.parse(String(saved ?? "") || "[]");
    } catch {
        data = [];
    }
    if (Array.isArray(data)) {
        data.slice(0, MAX_BRANCHES).forEach((row, i) => {
            const label = String(row?.label ?? "").trim();
            rows[i] = {
                label: label || defaultLabel(i),
                condition: String(row?.condition ?? "").trim(),
            };
        });
    }
    return rows;
}

function findSlot(node, name) {
    return node.inputs?.find((slot) => slot.name === name);
}

// Only the branch and else inputs are managed here. Other inputs, such as variables, keep their slot and link.
function isBranchSlot(slot) {
    return slot.name === ELSE_INPUT || BRANCH_INPUTS.includes(slot.name);
}

function isLinked(node, name) {
    return findSlot(node, name)?.link != null;
}

// Writes a label only when it changed, so an unchanged workflow is not marked as modified.
function applySlotLabels(node, rows) {
    if (!node.inputs) return;
    const wanted = new Map(BRANCH_INPUTS.map((name, i) => [name, rows[i].label.trim() || defaultLabel(i)]));
    wanted.set(ELSE_INPUT, "else (none true)");
    for (const slot of node.inputs) {
        const text = wanted.get(slot.name);
        if (text !== undefined && slot.label !== text) slot.label = text;
    }
}

// Keeps the branch inputs as branch_1..N followed by else. N is the number of shown rows, or higher if a link needs it.
// removed is the index of a deleted row: its link is dropped and later links move up one slot with their rows.
function setBranchInputCount(node, count, removed = -1) {
    if (!node.inputs) return;
    const links = [];
    node.inputs.forEach((slot, i) => {
        const link = isBranchSlot(slot) ? node.getInputLink(i) : null;
        if (link) links.push({ name: slot.name, from: node.graph?.getNodeById(link.origin_id), fromSlot: link.origin_slot });
    });
    const moved = links
        .filter((link) => removed < 0 || BRANCH_INPUTS.indexOf(link.name) !== removed)
        .map((link) => {
            const index = BRANCH_INPUTS.indexOf(link.name);
            return removed >= 0 && index > removed ? { ...link, name: BRANCH_INPUTS[index - 1] } : link;
        });
    let highest = 0;
    for (const { name } of moved) {
        const index = BRANCH_INPUTS.indexOf(name);
        if (index >= 0) highest = Math.max(highest, index + 1);
    }
    const wanted = [...BRANCH_INPUTS.slice(0, Math.max(count, highest, 1)), ELSE_INPUT];
    const current = node.inputs.filter(isBranchSlot).map((slot) => slot.name);
    if (removed < 0 && current.length === wanted.length && current.every((name, i) => name === wanted[i])) return;

    for (let i = node.inputs.length - 1; i >= 0; i--) {
        if (!isBranchSlot(node.inputs[i])) continue;
        if (node.getInputLink(i)) node.disconnectInput(i);
        node.removeInput(i);
    }
    wanted.forEach((name) => node.addInput(name, "*"));
    for (const { name, from, fromSlot } of moved) {
        const target = node.inputs.findIndex((slot) => slot.name === name);
        if (from && target >= 0) from.connect(fromSlot, node, target);
    }
}

// The number of rows the node needs: up to the last row with a condition or a link.
// Trailing rows that are empty and unlinked are not saved, so an unused row never fails at run time.
function usedCount(node, rows) {
    let used = 0;
    rows.forEach((row, i) => {
        if (row.condition.trim() || isLinked(node, BRANCH_INPUTS[i])) used = i + 1;
    });
    return used;
}

function buildIfUi(node) {
    let rows = emptyRows();
    // How many rows are shown. Rows up to the last used one are always shown, and "Add branch" shows more.
    let visible = 1;
    const root = el("div", "nf-if-root");

    const head = el("div", "nf-if-head");
    head.append(el("span", "", "#"), el("span", "", "Label"), el("span", "", "Condition"), el("span"));

    const list = el("div", "nf-if-rows");
    const lines = BRANCH_INPUTS.map((_name, i) => {
        const line = el("div", "nf-if-row");
        const labelInput = el("input", "nf-if-input");
        labelInput.type = "text";
        labelInput.placeholder = defaultLabel(i);
        labelInput.spellcheck = false;
        const conditionInput = el("input", "nf-if-input");
        conditionInput.type = "text";
        conditionInput.placeholder = "e.g. count > 3";
        conditionInput.title =
            "Python expression. Variables from NodeForge: Variables can be used by name. " +
            "Helpers: len, int, float, str, abs, min, max.";
        conditionInput.spellcheck = false;
        const deleteButton = el("button", "nf-if-del", "×");
        deleteButton.type = "button";
        deleteButton.title = "Delete branch";
        deleteButton.addEventListener("click", () => removeRow(i));
        line.append(el("span", "nf-if-num", String(i + 1)), labelInput, conditionInput, deleteButton);
        labelInput.addEventListener("input", () => {
            rows[i].label = labelInput.value;
            refresh();
        });
        conditionInput.addEventListener("input", () => {
            rows[i].condition = conditionInput.value;
            refresh();
        });
        list.append(line);
        return { line, labelInput, conditionInput };
    });

    const addButton = el("button", "nf-if-add", "+ Add branch");
    addButton.type = "button";
    addButton.addEventListener("click", () => {
        visible = Math.min(visible + 1, MAX_BRANCHES);
        syncInputs();
        refresh();
        fitToContent(node);
        lines[visible - 1].conditionInput.focus();
    });

    const elseLine = el("div", "nf-if-row nf-if-else");
    elseLine.append(el("span", "nf-if-num", "else"), el("span", "nf-if-note", "When no condition is true"));

    root.append(head, list, addButton, elseLine);

    function refresh() {
        const used = usedCount(node, rows);
        const next = Math.max(visible, used, 1);
        const grew = next !== visible;
        visible = next;
        lines.forEach(({ line }, i) => {
            line.style.display = i < visible ? "" : "none";
        });
        addButton.style.display = visible >= MAX_BRANCHES ? "none" : "";
        if (grew) fitToContent(node);
        lines.forEach(({ line }, i) => {
            const hasCondition = rows[i].condition.trim() !== "";
            const linked = isLinked(node, BRANCH_INPUTS[i]);
            line.classList.toggle("linked", hasCondition && linked);
            line.classList.toggle("warn", hasCondition !== linked);
        });
        elseLine.classList.toggle("linked", isLinked(node, ELSE_INPUT));
        applySlotLabels(node, rows);
    }

    function renderRows() {
        rows.forEach((row, i) => {
            if (lines[i].labelInput.value !== row.label) lines[i].labelInput.value = row.label;
            if (lines[i].conditionInput.value !== row.condition) lines[i].conditionInput.value = row.condition;
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
        for (let i = index; i < MAX_BRANCHES - 1; i++) {
            if (rows[i].label === defaultLabel(i + 1)) rows[i].label = defaultLabel(i);
        }
        rows.push({ label: defaultLabel(MAX_BRANCHES - 1), condition: "" });
        visible = Math.max(visible - 1, 1);
        renderRows();
        setBranchInputCount(node, visible, index);
        refresh();
        const [, height] = node.computeSize();
        node.setSize?.([node.size[0], height]);
        node.setDirtyCanvas?.(true, true);
    }

    // Inputs follow the shown rows. Call this only after links are restored.
    function syncInputs() {
        setBranchInputCount(node, visible);
        applySlotLabels(node, rows);
    }

    function getValue() {
        return JSON.stringify(rows.slice(0, usedCount(node, rows)).map(({ label, condition }) => ({ label, condition })));
    }

    return { root, setRows, getValue, refresh, syncInputs };
}

app.registerExtension({
    name: "NodeForge.IfElse",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onCreated?.apply(this, arguments);
            ensureCss();
            const ui = buildIfUi(this);
            const old = getWidget(this, "condition");
            const index = old ? this.widgets.indexOf(old) : -1;
            ui.setRows(parseRows(old?.value));
            if (old) {
                this.widgets.splice(index, 1);
                old.onRemove?.();
                old.element?.remove();
            }
            const widget = this.addDOMWidget("condition", "custom", ui.root, {
                getValue: ui.getValue,
                setValue: (v) => ui.setRows(parseRows(v)),
                getMinHeight: () => ui.root.scrollHeight,
            });
            // Keep the value at its old position so widgets_values still lines up with saved workflows.
            this.widgets.splice(this.widgets.indexOf(widget), 1);
            this.widgets.splice(index < 0 ? this.widgets.length : index, 0, widget);
            this.nfIf = ui;
            requestAnimationFrame(() => {
                if (!this.graph) return;
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
            this.nfIf?.refresh();
            return result;
        };

        // Links are restored after configure, so sync the inputs and status once they exist.
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            this.nfLoaded = true;
            requestAnimationFrame(() => {
                if (!this.graph) return;
                this.nfIf?.refresh();
                this.nfIf?.syncInputs();
                fitToContent(this);
            });
            return result;
        };
    },
});
