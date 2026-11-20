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

// Config popup for one variable row. It edits a draft copy: Save hands the draft back, while Cancel or a click outside
// discards it. The draft holds the type, value, step and options.
function openVariablePopup(title, draft, onSave) {
    const overlay = el("div", "nf-rs-overlay");
    const box = el("div", "nf-rs-popup nf-var-popup");
    const seg = el("div", "nf-var-seg");
    const segButtons = new Map();
    for (const [type, text, tip] of [
        [TYPE_VALUE, "Value", "Output the typed text"],
        [TYPE_CHOICE, "Choice", "Output the option picked in the dropdown"],
    ]) {
        const b = el("button", "", text);
        b.type = "button";
        b.title = tip;
        b.onclick = () => setType(type);
        segButtons.set(type, b);
    }
    seg.append(...segButtons.values());
    const body = el("div", "nf-var-popup-body");

    const setType = (type) => {
        if (draft.type === type) return;
        if (type === TYPE_CHOICE && !draft.options.length) {
            // Keep the typed value as the first option, so switching does not lose it.
            draft.options = [{ label: "option 1", value: draft.value }];
        }
        draft.type = type;
        renderBody();
    };

    const valueSection = () => {
        const area = el("textarea", "nf-rs-input nf-rs-popup-area");
        area.value = draft.value;
        area.placeholder = "value";
        area.spellcheck = false;
        area.addEventListener("input", () => {
            draft.value = area.value;
        });
        const stepInput = el("input", "nf-rs-input nf-var-step");
        stepInput.type = "number";
        stepInput.step = "1";
        stepInput.placeholder = "0";
        stepInput.title = "Add this to the value on each run (whole number, blank or 0 = off)";
        stepInput.value = draft.step;
        stepInput.addEventListener("input", () => {
            draft.step = stepInput.value;
        });
        const stepLine = el("div", "nf-rs-line");
        stepLine.append(el("span", "nf-var-label", "step"), stepInput);
        const section = el("div", "nf-var-opts-sec");
        section.append(area, stepLine);
        queueMicrotask(() => area.focus());
        return section;
    };

    const optionsSection = () => {
        const section = el("div", "nf-var-opts-sec");
        const optList = el("div", "nf-var-opt-list");
        const errLine = el("div", "nf-var-err");
        const drawErr = () => {
            errLine.textContent = optionsError(draft.options.map((o) => ({ label: o.label.trim() })));
        };
        const drawOptions = () => {
            optList.replaceChildren(...draft.options.map((o, i) => optionItem(o, i)));
            optList.querySelectorAll(".nf-var-text").forEach(autoGrow);
            drawErr();
        };
        const move = (index, dir) => {
            const opts = draft.options;
            [opts[index], opts[index + dir]] = [opts[index + dir], opts[index]];
            drawOptions();
        };
        const optionItem = (opt, index) => {
            const item = el("div", "nf-var-opt");
            const label = el("input", "nf-rs-input nf-var-opt-label");
            label.type = "text";
            label.placeholder = "label (shown in dropdown)";
            label.spellcheck = false;
            label.value = opt.label;
            label.addEventListener("input", () => {
                opt.label = label.value;
                drawErr();
            });
            const up = rsButton("↑", "Move up", () => move(index, -1));
            up.classList.add("nf-rs-x");
            up.disabled = index === 0;
            const down = rsButton("↓", "Move down", () => move(index, 1));
            down.classList.add("nf-rs-x");
            down.disabled = index === draft.options.length - 1;
            const removeOpt = rsButton("×", "Remove option", () => {
                draft.options.splice(index, 1);
                drawOptions();
            });
            removeOpt.classList.add("nf-rs-x", "remove");
            const labelLine = el("div", "nf-rs-line");
            labelLine.append(label, up, down, removeOpt);
            const area = el("textarea", "nf-rs-input nf-var-text");
            area.rows = 1;
            area.spellcheck = false;
            area.placeholder = "value (text that is output)";
            area.dataset.captureWheel = "true";
            area.value = opt.value;
            area.addEventListener("input", () => {
                opt.value = area.value;
                autoGrow(area);
            });
            item.append(labelLine, area);
            return item;
        };
        const addOpt = rsButton("+ Add option", "Add a choice option", () => {
            let n = draft.options.length + 1;
            while (draft.options.some((o) => o.label === `option ${n}`)) n++;
            draft.options.push({ label: `option ${n}`, value: "" });
            drawOptions();
            optList.lastElementChild?.querySelector(".nf-var-opt-label")?.focus();
        });
        section.append(el("div", "nf-var-sec", "Options"), optList, errLine, addOpt);
        drawOptions();
        return section;
    };

    const renderBody = () => {
        for (const [t, b] of segButtons) b.classList.toggle("on", t === draft.type);
        body.replaceChildren(draft.type === TYPE_CHOICE ? optionsSection() : valueSection());
    };

    const actions = el("div", "nf-rs-popup-actions");
    actions.append(
        rsButton("Cancel", "", () => overlay.remove()),
        rsButton("Save", "", () => {
            onSave(draft);
            overlay.remove();
        }),
    );
    box.append(el("div", "nf-rs-popup-head", title), seg, body, actions);
    overlay.append(box);
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.body.append(overlay);
    renderBody();
}

// Name and value per row, in the same table as ResolveString. A value row outputs its typed text. A choice row outputs
// the option picked in its dropdown. ⚙ opens the popup for the value box, step and options. Output is a JSON list; the
// node validates it on run.
function buildVariablesEditor(onChange) {
    ensureStringCss();
    const root = el("div", "nf-rs-root");
    const panel = el("div", "nf-rs-panel");
    const head = el("div", "nf-rs-colhead");
    head.append(el("span", "nf-rs-key-col", "name"), el("span", "nf-rs-val-col", "value"), el("span", "nf-rs-spacer"));
    const list = el("div", "nf-rs-rows");
    const add = rsButton("+ Add Variables", "Add a variable row", () => {
        addRow().focus();
        onChange();
    });
    panel.append(head, list, add);
    root.append(panel);

    const addRow = (row = {}) => {
        const rowEl = el("div", "nf-rs-line");
        rowEl.nfType = row.type === TYPE_CHOICE ? TYPE_CHOICE : TYPE_VALUE;
        rowEl.nfStep = String(row.step ?? "");
        rowEl.nfOptions = Array.isArray(row.options)
            ? row.options.map((o) => ({ label: String(o?.label ?? ""), value: String(o?.value ?? "") }))
            : [];

        const nameInput = el("input", "nf-rs-input nf-rs-key");
        nameInput.type = "text";
        nameInput.placeholder = "name";
        nameInput.spellcheck = false;
        nameInput.value = String(row.name ?? "");
        nameInput.addEventListener("input", onChange);

        const valueInput = el("input", "nf-rs-input nf-rs-value");
        valueInput.type = "text";
        valueInput.placeholder = "value";
        valueInput.spellcheck = false;
        // Full value (may contain newlines from the popup); the one-line input shows it flattened.
        const flat = (s) => s.replace(/\r?\n/g, " ");
        rowEl.nfValueText = String(row.value ?? "");
        valueInput.value = flat(rowEl.nfValueText);
        valueInput.addEventListener("input", () => {
            if (valueInput.value !== flat(rowEl.nfValueText)) rowEl.nfValueText = valueInput.value;
            onChange();
        });

        const choice = el("select", "nf-rs-input nf-var-choice");
        choice.title = "Option to output";
        choice.addEventListener("change", onChange);
        const valueCell = el("div", "nf-var-cell");
        valueCell.append(valueInput, choice);

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
        fillChoices(String(row.selected ?? ""));

        const renderRow = () => {
            const choiceRow = rowEl.nfType === TYPE_CHOICE;
            valueInput.hidden = choiceRow;
            choice.hidden = !choiceRow;
        };

        const config = rsButton("⚙", "Configure this variable: value, step and options", () => {
            const draft = {
                type: rowEl.nfType,
                value: rowEl.nfValueText,
                step: rowEl.nfStep,
                options: rowEl.nfOptions.map((o) => ({ ...o })),
                selected: choice.value,
            };
            openVariablePopup(`Variable: ${nameInput.value.trim() || "(unnamed)"}`, draft, (saved) => {
                rowEl.nfType = saved.type;
                rowEl.nfStep = saved.step;
                rowEl.nfOptions = saved.options;
                rowEl.nfValueText = saved.value;
                valueInput.value = flat(saved.value);
                fillChoices(saved.selected);
                renderRow();
                onChange();
            });
        });
        config.classList.add("nf-rs-x");

        const remove = rsButton("×", "Remove this row", () => {
            rowEl.remove();
            onChange();
        });
        remove.classList.add("nf-rs-x", "remove");

        rowEl.append(nameInput, valueCell, config, remove);
        rowEl.nfName = nameInput;
        rowEl.nfValue = valueInput;
        rowEl.nfChoice = choice;
        renderRow();
        list.append(rowEl);
        return nameInput;
    };

    return {
        root,
        get() {
            const rows = [...list.children].map((rowEl) => {
                if (rowEl.nfType === TYPE_CHOICE) {
                    return {
                        name: rowEl.nfName.value,
                        type: TYPE_CHOICE,
                        selected: rowEl.nfChoice.value,
                        options: rowEl.nfOptions.map((o) => ({ label: o.label.trim(), value: o.value })),
                    };
                }
                return {
                    name: rowEl.nfName.value,
                    value: rowEl.nfValueText,
                    step: rowEl.nfStep,
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
            // Not laid out yet while the workflow loads, so measure again on the next frame.
            requestAnimationFrame(onChange);
        },
    };
}

// One output per named choice row, in row order, labelled with the row name. Output 0 is `variables`.
// The internal name stays v_choice_N so the slot index and links are unaffected by renames.
function syncChoiceOutputs(node) {
    if (!node.outputs || !node.nfVariables) return;
    const names = parseRows(node.nfVariables.get())
        .filter((r) => r?.type === TYPE_CHOICE && String(r.name ?? "").trim())
        .map((r) => String(r.name).trim())
        .slice(0, MAX_CHOICES);
    const wanted = 1 + names.length;
    while (node.outputs.length > wanted) {
        node.removeOutput(node.outputs.length - 1);
    }
    while (node.outputs.length < wanted) {
        node.addOutput("string", "STRING");
    }
    for (let i = 1; i < wanted; i++) {
        const out = node.outputs[i];
        out.name = `v_choice_${i}`;
        out.label = names[i - 1];
        out.type = "STRING";
    }
    resizeToContent(node);
}

const RS_CSS = `
.nf-rs-root { --nf-acc:#4ea8ff; display:flex; flex-direction:column; gap:6px; padding:4px; box-sizing:border-box; width:100%; font-size:12px; color:#ddd; }
.nf-rs-btn { height:24px; padding:0 9px; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.85); font:inherit; font-weight:600; cursor:pointer; }
.nf-rs-btn:hover:not(:disabled) { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.35); color:#fff; }
.nf-rs-btn:disabled { opacity:0.4; cursor:default; }
.nf-rs-panel { display:flex; flex-direction:column; gap:5px; background:#141414; border:1px solid #2c2c2c; border-radius:7px; padding:7px; box-sizing:border-box; }
.nf-rs-rows { display:flex; flex-direction:column; gap:5px; }
.nf-rs-line { display:flex; gap:5px; align-items:center; }
.nf-rs-colhead { display:flex; gap:5px; color:#8a8a8a; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; padding:0 2px; }
.nf-rs-colhead .nf-rs-key-col { flex:0 0 96px; }
.nf-rs-colhead .nf-rs-val-col { flex:1 1 auto; }
.nf-rs-colhead .nf-rs-spacer { flex:0 0 52px; }
.nf-rs-input { height:26px; min-width:0; background:#1d1d1d; border:1px solid #3a3a3a; border-radius:5px; padding:4px 6px; color:#ddd; font:inherit; box-sizing:border-box; }
.nf-rs-input:focus { outline:none; border-color:var(--nf-acc); }
.nf-rs-input.invalid { border-color:#e05a5a; }
.nf-rs-key { flex:0 0 96px; width:96px; }
.nf-rs-value { flex:1 1 auto; resize:none; overflow:hidden; white-space:nowrap; line-height:16px; padding-top:4px; padding-bottom:4px; }
.nf-rs-x { width:24px; height:26px; flex:0 0 auto; border-radius:6px; border:1px solid #3a3a3a; background:transparent; color:#aaa; cursor:pointer; font:inherit; padding:0; }
.nf-rs-x:hover { border-color:var(--nf-acc); color:#fff; }
.nf-rs-x.remove:hover { border-color:#e05a5a; }
.nf-rs-hint { color:#8a8a8a; font-size:11px; padding:6px 2px; }
.nf-rs-overlay { --nf-acc:#4ea8ff; position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); }
.nf-rs-popup { width:min(560px,90vw); display:flex; flex-direction:column; gap:8px; padding:12px; box-sizing:border-box; background:#1a1a1a; border:1px solid #3a3a3a; border-radius:9px; color:#ddd; font:13px sans-serif; }
.nf-rs-popup-head { color:var(--nf-acc); font-weight:600; }
.nf-rs-popup-area { min-height:240px; resize:vertical; line-height:1.4; white-space:pre-wrap; overflow:auto; }
.nf-rs-popup-actions { display:flex; justify-content:flex-end; gap:6px; }
.nf-rs-root [hidden] { display:none !important; }
.nf-rs-x.on { border-color:var(--nf-acc); color:#fff; }
.nf-var-cell { flex:1 1 auto; min-width:0; display:flex; gap:5px; }
.nf-var-cell .nf-rs-input { flex:1 1 auto; }
.nf-var-seg { display:flex; flex:0 0 auto; border:1px solid #3a3a3a; border-radius:5px; overflow:hidden; }
.nf-var-seg button { height:24px; background:#1d1d1d; border:none; color:#999; font:inherit; padding:0 8px; cursor:pointer; }
.nf-var-seg button + button { border-left:1px solid #3a3a3a; }
.nf-var-seg button:hover { color:#fff; }
.nf-var-seg button.on { background:var(--nf-acc); color:#fff; }
.nf-var-label { color:#8a8a8a; font-size:11px; }
.nf-var-step { flex:0 0 64px; width:64px; }
.nf-var-choice { padding:0 4px; }
.nf-var-sec { font-size:10px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--nf-acc); }
.nf-var-opts-sec, .nf-var-opt-list { display:flex; flex-direction:column; gap:5px; }
.nf-var-opt { display:flex; flex-direction:column; gap:4px; padding:5px; background:#202020; border:1px solid #2e2e2e; border-radius:5px; }
.nf-var-opt-label { flex:1 1 auto; }
.nf-var-text { line-height:16px; padding:4px 6px; resize:none; overflow:hidden; white-space:pre-wrap; }
.nf-var-err { font-size:10px; color:#e0a33e; }
.nf-var-err:empty { display:none; }
.nf-var-popup { width:min(600px,90vw); }
.nf-var-popup-body { display:flex; flex-direction:column; gap:8px; }
`;

function ensureStringCss() {
    if (document.getElementById("nf-rs-css")) return;
    const style = document.createElement("style");
    style.id = "nf-rs-css";
    style.textContent = RS_CSS;
    document.head.append(style);
}

function rsButton(text, title, onClick) {
    const b = el("button", "nf-rs-btn", text);
    b.type = "button";
    if (title) b.title = title;
    b.onclick = onClick;
    return b;
}

// Popup for editing one value. Save writes the text back; Cancel or a click outside discards it.
function openValuePopup(title, initial, onSave) {
    const overlay = el("div", "nf-rs-overlay");
    const box = el("div", "nf-rs-popup");
    const area = el("textarea", "nf-rs-input nf-rs-popup-area");
    area.value = initial;
    area.placeholder = "value";
    area.spellcheck = false;
    const actions = el("div", "nf-rs-popup-actions");
    actions.append(
        rsButton("Cancel", "", () => overlay.remove()),
        rsButton("Save", "", () => {
            onSave(area.value);
            overlay.remove();
        }),
    );
    box.append(el("div", "nf-rs-popup-head", title), area, actions);
    overlay.append(box);
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.body.append(overlay);
    area.focus();
}

// Smallest string_N that no key uses yet, for a new row.
function nextKeyName(rows) {
    const taken = new Set(rows.map((r) => r.key.trim()));
    let n = 1;
    while (taken.has(`string_${n}`)) n++;
    return `string_${n}`;
}

// Saved rows are {key, value}. Older saves hold plain text, which gets the key string_N for its position.
function parseStringRows(value) {
    return parseRows(value).map((item, i) => {
        if (item && typeof item === "object") {
            return { key: String(item.key ?? ""), value: String(item.value ?? "") };
        }
        return { key: `string_${i + 1}`, value: String(item ?? "") };
    });
}

// Key/value table, styled like the Config Table. Each row's key is its output label. The number of rows sets the
// number of outputs. Keys must be unique and non-empty; a row with a bad key is marked red.
function buildStringsEditor(onChange) {
    ensureStringCss();
    const rows = [];
    const entries = [];
    const root = el("div", "nf-rs-root");
    const panel = el("div", "nf-rs-panel");
    const head = el("div", "nf-rs-colhead");
    head.append(el("span", "nf-rs-key-col", "key"), el("span", "nf-rs-val-col", "value"), el("span", "nf-rs-spacer"));
    const list = el("div", "nf-rs-rows");
    const add = rsButton("+ Add key", `Add a row (up to ${MAX_STRINGS})`, () => {
        rows.push({ key: nextKeyName(rows), value: "" });
        renderRows();
        onChange();
        entries[entries.length - 1]?.keyInput.focus();
    });
    panel.append(head, list, add);
    root.append(panel);

    const keyOk = (row) => {
        const n = row.key.trim();
        return Boolean(n) && !rows.some((other) => other !== row && other.key.trim() === n);
    };
    const markKeys = () => {
        for (const { row, keyInput } of entries) keyInput.classList.toggle("invalid", !keyOk(row));
    };

    const buildRow = (row) => {
        const line = el("div", "nf-rs-line");
        const keyInput = el("input", "nf-rs-input nf-rs-key");
        keyInput.type = "text";
        keyInput.placeholder = "key";
        keyInput.spellcheck = false;
        keyInput.value = row.key;
        keyInput.addEventListener("input", () => {
            row.key = keyInput.value;
            markKeys();
            onChange();
        });

        const valueArea = el("textarea", "nf-rs-input nf-rs-value");
        valueArea.rows = 1;
        valueArea.placeholder = "value";
        valueArea.spellcheck = false;
        valueArea.value = row.value;
        valueArea.addEventListener("input", () => {
            row.value = valueArea.value;
            onChange();
        });

        const expand = rsButton("⤢", "Edit this value in a popup", () => {
            openValuePopup(row.key.trim() || "value", valueArea.value, (text) => {
                valueArea.value = text;
                row.value = text;
                onChange();
            });
        });
        expand.classList.add("nf-rs-x");

        const remove = rsButton("×", "Remove this row", () => {
            rows.splice(rows.indexOf(row), 1);
            renderRows();
            onChange();
        });
        remove.classList.add("nf-rs-x", "remove");

        line.append(keyInput, valueArea, expand, remove);
        entries.push({ row, keyInput });
        return line;
    };

    const renderRows = () => {
        entries.length = 0;
        list.replaceChildren(...rows.map(buildRow));
        add.disabled = rows.length >= MAX_STRINGS;
        markKeys();
    };

    return {
        root,
        get() {
            return JSON.stringify(rows.map((r) => ({ key: r.key, value: r.value })));
        },
        set(value) {
            rows.splice(0, rows.length, ...parseStringRows(value));
            // Keep every saved row. Going over MAX_STRINGS is reported when the node runs.
            if (!rows.length) rows.push({ key: "string_1", value: "" });
            renderRows();
            requestAnimationFrame(onChange);
        },
        // The output label for each row: its key, or string_N when the key is blank.
        labels: () => rows.map((r, i) => r.key.trim() || `string_${i + 1}`),
    };
}

// Show one output per row. Output names stay string_1..string_16 (Python declares them), so links keep working.
// Each output's label is its row key.
function syncStringOutputs(node) {
    if (!node.outputs || !node.nfStrings) return;
    const labels = node.nfStrings.labels();
    const wanted = Math.max(1, Math.min(MAX_STRINGS, labels.length));
    while (node.outputs.length > wanted) {
        node.removeOutput(node.outputs.length - 1);
    }
    while (node.outputs.length < wanted) {
        node.addOutput("string", "STRING");
    }
    for (let i = 0; i < wanted; i++) {
        const out = node.outputs[i];
        out.name = `string_${i + 1}`;
        out.label = labels[i] ?? `string_${i + 1}`;
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
                this.setSize?.([Math.max(this.size[0], 460), this.size[1]]);
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
                this.setSize?.([Math.max(this.size[0], 460), this.size[1]]);
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
