import { app } from "../../scripts/app.js";

const NODE_NAME = "NodeForgeIfElse";
const MAX_BRANCHES = 10;
const BRANCH_INPUTS = Array.from({ length: MAX_BRANCHES }, (_, i) => `branch_${i + 1}`);
const ELSE_INPUT = "else";
const NODE_MIN_WIDTH = 380;
const TRANSFORM_MODES = ["template", "expression"];
const TRANSFORM_HINTS = {
    template: "Text with %input% for the incoming text and %name% for a variable. Unknown %names% stay as written.",
    expression: "Python expression. Use input for the incoming text and variable names directly. Helpers: len, int, float, str, abs, min, max.",
};
const TRANSFORM_PLACEHOLDERS = {
    template: "%input%\n\nStyle: %style%",
    expression: "input + ' / ' + str(count)",
};

const CSS = `
.nf-if-root { --nf-acc:#4ea8ff; display:flex; flex-direction:column; gap:4px; padding:4px; box-sizing:border-box; width:100%; font-size:12px; color:#ddd; }
.nf-if-head, .nf-if-row { display:grid; grid-template-columns:30px minmax(72px,1fr) minmax(110px,1.8fr) 22px 22px; gap:5px; align-items:center; }
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
.nf-if-gear { position:relative; width:22px; height:24px; padding:0; border:none; border-radius:5px; background:transparent; color:#777; font-size:13px; line-height:1; cursor:pointer; }
.nf-if-gear:hover { background:#2a2a2a; color:#ddd; }
.nf-if-gear.on { color:var(--nf-acc); }
.nf-if-gear.on::after { content:""; position:absolute; top:3px; right:3px; width:5px; height:5px; border-radius:50%; background:var(--nf-acc); }
.nf-if-overlay { --nf-acc:#4ea8ff; position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); }
.nf-if-popup { width:min(560px,90vw); display:flex; flex-direction:column; gap:12px; padding:12px; box-sizing:border-box; background:#1a1a1a; border:1px solid #3a3a3a; border-radius:9px; color:#ddd; font:13px sans-serif; }
.nf-if-popup-head { color:var(--nf-acc); font-weight:600; }
.nf-if-sec { display:flex; flex-direction:column; gap:5px; }
.nf-if-sec-title { color:#8a8a8a; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; }
.nf-if-area { width:100%; min-height:64px; resize:vertical; box-sizing:border-box; padding:6px; background:#1d1d1d; border:1px solid #3a3a3a; border-radius:5px; color:#ddd; font-family:Consolas, monospace; font-size:12px; line-height:1.4; white-space:pre-wrap; }
.nf-if-area.cond { min-height:72px; }
.nf-if-area::placeholder { color:#666; }
.nf-if-area:focus { outline:none; border-color:var(--nf-acc); }
.nf-if-seg { display:inline-flex; align-self:flex-start; border:1px solid #3a3a3a; border-radius:6px; overflow:hidden; }
.nf-if-seg button { height:24px; padding:0 12px; border:none; background:#1d1d1d; color:#9a9a9a; font:inherit; cursor:pointer; }
.nf-if-seg button.on { background:var(--nf-acc); color:#fff; }
.nf-if-hint { color:#8a8a8a; font-size:11px; }
.nf-if-actions { display:flex; justify-content:flex-end; gap:6px; }
.nf-if-btn { height:26px; padding:0 10px; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.85); font:inherit; font-weight:600; cursor:pointer; }
.nf-if-btn:hover { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.35); color:#fff; }
.nf-if-btn.primary { border-color:var(--nf-acc); }
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

function blankRow(index) {
    return { label: defaultLabel(index), condition: "", transform: "", transform_mode: TRANSFORM_MODES[0] };
}

function emptyRows() {
    return Array.from({ length: MAX_BRANCHES }, (_, i) => blankRow(i));
}

function blankElse() {
    return { transform: "", transform_mode: TRANSFORM_MODES[0] };
}

function parseMode(value) {
    const mode = String(value ?? "");
    return TRANSFORM_MODES.includes(mode) ? mode : TRANSFORM_MODES[0];
}

// Reads the saved value: a list of branch rows, or {"branches": [...], "else": {...}} when the else has a transform.
// An empty label falls back to the default "Branch NN". The transforms are kept as typed (newlines matter), so only
// their emptiness is checked when saving.
function parseConfig(saved) {
    const rows = emptyRows();
    let elseRow = blankElse();
    let data = [];
    try {
        data = JSON.parse(String(saved ?? "") || "[]");
    } catch {
        data = [];
    }
    let list = data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
        list = data.branches;
        if (data.else && typeof data.else === "object") {
            elseRow = { transform: String(data.else.transform ?? ""), transform_mode: parseMode(data.else.transform_mode) };
        }
    }
    if (Array.isArray(list)) {
        list.slice(0, MAX_BRANCHES).forEach((row, i) => {
            const label = String(row?.label ?? "").trim();
            rows[i] = {
                label: label || defaultLabel(i),
                condition: String(row?.condition ?? "").trim(),
                transform: String(row?.transform ?? ""),
                transform_mode: parseMode(row?.transform_mode),
            };
        });
    }
    return { rows, elseRow };
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

function segButton(text, onClick) {
    const b = el("button", "", text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
}

// Settings popup for one row. It edits a draft copy: Save hands the draft back, while Cancel or a click outside
// discards it. The draft holds the transform with its mode, and the condition too when the row has one (the else row does not).
function openTransformPopup(title, draft, onSave, transformTitle = "Transform when true") {
    const overlay = el("div", "nf-if-overlay");
    const box = el("div", "nf-if-popup");

    const sections = [];
    let cond = null;
    if ("condition" in draft) {
        const condSec = el("div", "nf-if-sec");
        cond = el("textarea", "nf-if-area cond");
        cond.value = draft.condition;
        cond.placeholder = "e.g. count > 3 and style == 'noir'";
        cond.spellcheck = false;
        cond.addEventListener("input", () => {
            draft.condition = cond.value;
        });
        condSec.append(
            el("div", "nf-if-sec-title", "Condition"),
            cond,
            el("div", "nf-if-hint", "Python expression. Variables from NodeForge can be used by name."),
        );
        sections.push(condSec);
    }

    const transSec = el("div", "nf-if-sec");
    const modeButtons = new Map();
    const seg = el("div", "nf-if-seg");
    for (const [mode, text] of [
        ["template", "Template"],
        ["expression", "Expression"],
    ]) {
        const b = segButton(text, () => setMode(mode));
        modeButtons.set(mode, b);
    }
    seg.append(...modeButtons.values());
    const area = el("textarea", "nf-if-area");
    area.spellcheck = false;
    area.value = draft.transform;
    area.addEventListener("input", () => {
        draft.transform = area.value;
    });
    const hint = el("div", "nf-if-hint");
    transSec.append(el("div", "nf-if-sec-title", transformTitle), seg, area, hint);

    const setMode = (mode) => {
        draft.transform_mode = mode;
        for (const [name, b] of modeButtons) b.classList.toggle("on", name === mode);
        area.placeholder = TRANSFORM_PLACEHOLDERS[mode];
        hint.textContent = `${TRANSFORM_HINTS[mode]} Leave empty to send the incoming text unchanged.`;
    };
    setMode(draft.transform_mode);

    const close = () => overlay.remove();
    const actions = el("div", "nf-if-actions");
    const cancel = el("button", "nf-if-btn", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", close);
    const save = el("button", "nf-if-btn primary", "Save");
    save.type = "button";
    save.addEventListener("click", () => {
        onSave(draft);
        close();
    });
    actions.append(cancel, save);

    box.append(el("div", "nf-if-popup-head", title), ...sections, transSec, actions);
    overlay.append(box);
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) close();
    });
    document.body.append(overlay);
    (cond ?? area).focus();
}

function buildIfUi(node) {
    let rows = emptyRows();
    let elseRow = blankElse();
    // How many rows are shown. Rows up to the last used one are always shown, and "Add branch" shows more.
    let visible = 1;
    const root = el("div", "nf-if-root");

    const head = el("div", "nf-if-head");
    head.append(el("span", "", "#"), el("span", "", "Label"), el("span", "", "Condition"), el("span"), el("span"));

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
        const gearButton = el("button", "nf-if-gear", "⚙");
        gearButton.type = "button";
        gearButton.title = "Condition and transform";
        gearButton.addEventListener("click", () => {
            const row = rows[i];
            openTransformPopup(
                `${row.label || defaultLabel(i)} settings`,
                { condition: row.condition, transform: row.transform, transform_mode: row.transform_mode },
                (draft) => {
                    // The row's condition field is one line, so line breaks become spaces (valid inside brackets).
                    row.condition = draft.condition.replace(/\s*\n\s*/g, " ").trim();
                    row.transform = draft.transform;
                    row.transform_mode = draft.transform_mode;
                    renderRows();
                    refresh();
                },
            );
        });
        const deleteButton = el("button", "nf-if-del", "×");
        deleteButton.type = "button";
        deleteButton.title = "Delete branch";
        deleteButton.addEventListener("click", () => removeRow(i));
        line.append(el("span", "nf-if-num", String(i + 1)), labelInput, conditionInput, gearButton, deleteButton);
        labelInput.addEventListener("input", () => {
            rows[i].label = labelInput.value;
            refresh();
        });
        conditionInput.addEventListener("input", () => {
            rows[i].condition = conditionInput.value;
            refresh();
        });
        list.append(line);
        return { line, labelInput, conditionInput, gearButton };
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
    const elseGear = el("button", "nf-if-gear", "⚙");
    elseGear.type = "button";
    elseGear.title = "Transform for the else path";
    elseGear.addEventListener("click", () => {
        openTransformPopup(
            "Else settings",
            { transform: elseRow.transform, transform_mode: elseRow.transform_mode },
            (draft) => {
                elseRow.transform = draft.transform;
                elseRow.transform_mode = draft.transform_mode;
                refresh();
            },
            "Transform when no condition is true",
        );
    });
    elseLine.append(
        el("span", "nf-if-num", "else"),
        el("span", "nf-if-note", "When no condition is true"),
        elseGear,
        el("span"),
    );

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
        lines.forEach(({ line, gearButton }, i) => {
            const hasCondition = rows[i].condition.trim() !== "";
            const linked = isLinked(node, BRANCH_INPUTS[i]);
            line.classList.toggle("linked", hasCondition && linked);
            line.classList.toggle("warn", hasCondition !== linked);
            gearButton.classList.toggle("on", rows[i].transform.trim() !== "");
        });
        elseLine.classList.toggle("linked", isLinked(node, ELSE_INPUT));
        elseGear.classList.toggle("on", elseRow.transform.trim() !== "");
        applySlotLabels(node, rows);
    }

    function renderRows() {
        rows.forEach((row, i) => {
            if (lines[i].labelInput.value !== row.label) lines[i].labelInput.value = row.label;
            if (lines[i].conditionInput.value !== row.condition) lines[i].conditionInput.value = row.condition;
        });
    }

    function setConfig(config) {
        rows = config.rows;
        elseRow = config.elseRow;
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
        rows.push(blankRow(MAX_BRANCHES - 1));
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
        const branches = rows.slice(0, usedCount(node, rows)).map(({ label, condition, transform, transform_mode }) => {
            const row = { label, condition };
            // Only a non-empty transform is saved, so an unused transform keeps the saved JSON as before.
            if (transform.trim()) Object.assign(row, { transform, transform_mode });
            return row;
        });
        // The plain list is saved unless the else has a transform, so existing workflows keep their format.
        if (!elseRow.transform.trim()) return JSON.stringify(branches);
        const otherwise = { transform: elseRow.transform, transform_mode: elseRow.transform_mode };
        return JSON.stringify({ branches, else: otherwise });
    }

    return { root, setConfig, getValue, refresh, syncInputs };
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
            ui.setConfig(parseConfig(old?.value));
            if (old) {
                this.widgets.splice(index, 1);
                old.onRemove?.();
                old.element?.remove();
            }
            const widget = this.addDOMWidget("condition", "custom", ui.root, {
                getValue: ui.getValue,
                setValue: (v) => ui.setConfig(parseConfig(v)),
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
