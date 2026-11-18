import { app } from "../../scripts/app.js";

const CONFIG_NODE = "NodeForgeConfigTable";
const MAX_KEYS = 10;
const DEFAULT_TABLE = "keys: width, height\n[prod]\nwidth=100\nheight=200\n[dev]\nwidth=50\nheight=100";
const TAG_BAD_CHARS = /[\[\]\n]/;
const KEY_BAD_CHARS = /[,=\[\]\n]/;

const CSS = `
.nf-ct-root { --nf-acc:#4ea8ff; display:flex; flex-direction:column; gap:6px; padding:4px; box-sizing:border-box; width:100%; font-size:12px; color:#ddd; }
.nf-ct-tags { display:flex; flex-wrap:wrap; gap:4px; }
.nf-ct-btn { height:24px; padding:0 9px; border-radius:6px; border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.85); font:inherit; font-weight:600; cursor:pointer; }
.nf-ct-btn:hover:not(:disabled) { background:rgba(255,255,255,0.1); border-color:rgba(255,255,255,0.35); color:#fff; }
.nf-ct-btn.on { background:var(--nf-acc); border-color:var(--nf-acc); color:#fff; }
.nf-ct-btn:disabled { opacity:0.4; cursor:default; }
.nf-ct-panel { display:flex; flex-direction:column; gap:5px; background:#141414; border:1px solid #2c2c2c; border-radius:7px; padding:7px; box-sizing:border-box; }
.nf-ct-rows { display:flex; flex-direction:column; gap:5px; }
.nf-ct-line { display:flex; gap:5px; align-items:center; }
.nf-ct-colhead { display:flex; gap:5px; color:#8a8a8a; font-size:10px; text-transform:uppercase; letter-spacing:0.5px; padding:0 2px; }
.nf-ct-colhead span { flex:1; }
.nf-ct-colhead .nf-ct-spacer { flex:0 0 24px; }
.nf-ct-label { width:30px; flex:0 0 auto; color:var(--nf-acc); font-size:10px; font-weight:600; text-transform:uppercase; }
.nf-ct-input { flex:1; min-width:0; background:#1d1d1d; border:1px solid #3a3a3a; border-radius:5px; padding:4px 6px; color:#ddd; font:inherit; box-sizing:border-box; }
.nf-ct-input:focus { outline:none; border-color:var(--nf-acc); }
.nf-ct-input.invalid { border-color:#e05a5a; }
.nf-ct-x { width:24px; height:24px; flex:0 0 auto; border-radius:6px; border:1px solid #3a3a3a; background:transparent; color:#aaa; cursor:pointer; font:inherit; padding:0; }
.nf-ct-x:hover { border-color:#e05a5a; color:#fff; }
.nf-ct-hint { color:#8a8a8a; font-size:11px; padding:6px 2px; }
.nf-ct-hint.invalid { color:#e05a5a; }
.nf-ct-line .nf-ct-input, .nf-ct-line .nf-ct-x { height:26px; }
.nf-ct-valuewrap { flex:1; min-width:0; display:flex; gap:5px; align-items:center; }
.nf-ct-area { flex:1; min-width:0; resize:none; overflow:hidden; white-space:nowrap; line-height:16px; padding-top:4px; padding-bottom:4px; }
.nf-ct-overlay { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); }
.nf-ct-popup { width:min(560px,90vw); display:flex; flex-direction:column; gap:8px; padding:12px; box-sizing:border-box; background:#1a1a1a; border:1px solid #3a3a3a; border-radius:9px; color:#ddd; font:13px sans-serif; }
.nf-ct-popup-head { color:var(--nf-acc); font-weight:600; }
.nf-ct-popup-area { min-height:240px; resize:vertical; line-height:1.4; }
.nf-ct-popup-actions { display:flex; justify-content:flex-end; gap:6px; }
`;

function ensureCss() {
    if (document.getElementById("nf-ct-css")) return;
    const style = document.createElement("style");
    style.id = "nf-ct-css";
    style.textContent = CSS;
    document.head.append(style);
}

function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function button(text, title, onClick) {
    const b = el("button", "nf-ct-btn", text);
    b.type = "button";
    if (title) b.title = title;
    b.onclick = onClick;
    return b;
}

function getWidget(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

// Fit the node to its content. Width only grows, so a node the user widened keeps its width.
function resizeToContent(node) {
    const [w, h] = node.computeSize();
    node.setSize?.([Math.max(node.size[0], w), h]);
    node.setDirtyCanvas?.(true, true);
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

// One output per key, labelled with the key name. Output i is the i-th key, which matches the Python node.
function syncOutputs(node, names) {
    if (!node.outputs) return;
    const wanted = names.length;
    while (node.outputs.length > wanted) node.removeOutput(node.outputs.length - 1);
    while (node.outputs.length < wanted) node.addOutput("*", "*");
    names.forEach((name, i) => {
        const out = node.outputs[i];
        out.name = name;
        out.label = name;
        out.type = "*";
    });
    resizeToContent(node);
}

// Model: keys are shared by every tag. Values are stored by key id, so renaming a key keeps its values.
let idCounter = 1;
const newId = () => idCounter++;

function uniqueName(base, taken) {
    let name = base;
    let n = 1;
    while (taken.includes(name)) name = `${base}${++n}`;
    return name;
}

// Values may hold line breaks; the table stores them as \n and a literal backslash as \\.
const ESCAPE_MAP = { "\\": "\\\\", "\n": "\\n", "\r": "\\r" };
const escapeText = (text) => text.replace(/[\\\n\r]/g, (ch) => ESCAPE_MAP[ch]);
const unescapeText = (text) => text.replace(/\\([\\nr])/g, (_, ch) => (ch === "n" ? "\n" : ch === "r" ? "\r" : "\\"));

const MAX_WORDS = 1000;
const wordCount = (text) => {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
};
const valueOk = (text) => text.trim() !== "" && wordCount(text) <= MAX_WORDS;

// Read the text format used by the Python node (keys: line, then [name] blocks of key=value).
function parseTable(text) {
    const model = { keys: [], tags: [], active: null };
    let tag = null;
    for (const raw of String(text ?? "").split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith("keys:")) {
            model.keys = line.slice("keys:".length).split(",")
                .map((name) => name.trim())
                .filter(Boolean)
                .map((name) => ({ id: newId(), name }));
        } else if (line.startsWith("[") && line.endsWith("]")) {
            tag = { id: newId(), name: line.slice(1, -1).trim(), values: {} };
            model.tags.push(tag);
        } else if (tag && line.includes("=")) {
            const cut = line.indexOf("=");
            const key = model.keys.find((k) => k.name === line.slice(0, cut).trim());
            if (key) tag.values[key.id] = unescapeText(line.slice(cut + 1).trim());
        }
    }
    model.active = model.tags[0]?.id ?? null;
    return model;
}

function serializeTable(model) {
    const lines = [`keys: ${model.keys.map((k) => k.name.trim()).join(", ")}`];
    for (const tag of model.tags) {
        lines.push(`[${tag.name.trim()}]`);
        for (const key of model.keys) {
            lines.push(`${key.name.trim()}=${escapeText((tag.values[key.id] ?? "").trim())}`);
        }
    }
    return lines.join("\n");
}

// A text input that marks itself red while its value would not serialize to a valid table.
function textInput(className, value, placeholder, isValid, onInput) {
    const input = el("input", className);
    input.type = "text";
    input.value = value;
    input.placeholder = placeholder;
    input.spellcheck = false;
    const check = () => input.classList.toggle("invalid", !isValid(input.value));
    check();
    input.addEventListener("input", () => {
        check();
        onInput(input.value);
    });
    return input;
}

// Popup for editing one value. Save writes the text back; Cancel or a click outside discards it.
function openValuePopup(title, initial, onSave) {
    const overlay = el("div", "nf-ct-overlay");
    const box = el("div", "nf-ct-popup");
    const area = el("textarea", "nf-ct-input nf-ct-popup-area");
    area.value = initial;
    area.placeholder = `value (1 to ${MAX_WORDS} words)`;
    area.spellcheck = false;
    const count = el("div", "nf-ct-hint");
    const save = button("Save", "", () => {
        if (!valueOk(area.value)) return;
        onSave(area.value);
        overlay.remove();
    });
    const update = () => {
        const n = wordCount(area.value);
        count.textContent = `${n} / ${MAX_WORDS} words`;
        count.classList.toggle("invalid", !valueOk(area.value));
        save.disabled = !valueOk(area.value);
    };
    area.addEventListener("input", update);
    const actions = el("div", "nf-ct-popup-actions");
    actions.append(button("Cancel", "", () => overlay.remove()), save);
    box.append(el("div", "nf-ct-popup-head", title), area, count, actions);
    overlay.append(box);
    overlay.addEventListener("mousedown", (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.body.append(overlay);
    update();
    area.focus();
}

function buildTableEditor(onChange) {
    const model = { keys: [], tags: [], active: null };
    const root = el("div", "nf-ct-root");
    const tagRow = el("div", "nf-ct-tags");
    const panel = el("div", "nf-ct-panel");
    root.append(tagRow, panel);

    const activeTag = () => model.tags.find((t) => t.id === model.active) ?? null;
    const tagNameOk = (name, self) => {
        const n = name.trim();
        return Boolean(n) && !TAG_BAD_CHARS.test(n) && !model.tags.some((t) => t !== self && t.name.trim() === n);
    };
    const keyNameOk = (name, self) => {
        const n = name.trim();
        return Boolean(n) && !KEY_BAD_CHARS.test(n) && !model.keys.some((k) => k !== self && k.name.trim() === n);
    };

    const renderTags = () => {
        tagRow.replaceChildren();
        for (const tag of model.tags) {
            const chip = button(tag.name.trim() || "(unnamed)", "Edit this tag", () => {
                model.active = tag.id;
                render();
            });
            chip.classList.toggle("on", tag.id === model.active);
            tagRow.append(chip);
        }
        tagRow.append(button("+ Add tag", "Add a tag such as prod or dev", addTag));
    };

    const renderPanel = () => {
        panel.replaceChildren();
        const tag = activeTag();
        if (!tag) {
            panel.append(el("div", "nf-ct-hint", "Click + Add tag to create a block such as prod or dev."));
            return;
        }

        const nameInput = textInput("nf-ct-input", tag.name, "tag name",
            (v) => tagNameOk(v, tag),
            (v) => {
                tag.name = v;
                renderTags();
                onChange();
            });
        const nameLine = el("div", "nf-ct-line");
        nameLine.append(el("span", "nf-ct-label", "tag"), nameInput,
            button("Remove tag", "Remove this tag", () => removeTag(tag)));

        const head = el("div", "nf-ct-colhead");
        head.append(el("span", "", "key"), el("span", "", "value"), el("span", "nf-ct-spacer"));

        const rows = el("div", "nf-ct-rows");
        for (const key of model.keys) {
            const row = el("div", "nf-ct-line");
            const keyInput = textInput("nf-ct-input", key.name, "key",
                (v) => keyNameOk(v, key),
                (v) => {
                    key.name = v;
                    onChange();
                });
            const valueArea = el("textarea", "nf-ct-input nf-ct-area");
            valueArea.rows = 1;
            valueArea.value = tag.values[key.id] ?? "";
            valueArea.placeholder = "value";
            valueArea.spellcheck = false;
            const checkValue = () => valueArea.classList.toggle("invalid", !valueOk(valueArea.value));
            checkValue();
            valueArea.addEventListener("input", () => {
                checkValue();
                tag.values[key.id] = valueArea.value;
                onChange();
            });
            const expand = button("⤢", "Edit this value in a popup", () => {
                openValuePopup(`${tag.name.trim() || "tag"} · ${key.name.trim() || "key"}`, valueArea.value, (text) => {
                    valueArea.value = text;
                    valueArea.dispatchEvent(new Event("input"));
                });
            });
            expand.classList.add("nf-ct-x", "nf-ct-expand");
            const valueWrap = el("div", "nf-ct-valuewrap");
            valueWrap.append(valueArea, expand);
            const del = button("×", "Remove this key from every tag", () => removeKey(key));
            del.classList.add("nf-ct-x");
            row.append(keyInput, valueWrap, del);
            rows.append(row);
        }

        const addKey = button("+ Add key", `Add a key (up to ${MAX_KEYS})`, addKeyRow);
        addKey.disabled = model.keys.length >= MAX_KEYS;
        panel.append(nameLine, head, rows, addKey);
    };

    const render = () => {
        renderTags();
        renderPanel();
        requestAnimationFrame(() => {
            onChange();
        });
    };

    const changed = () => {
        render();
        onChange();
    };

    const addTag = () => {
        const tag = { id: newId(), name: uniqueName("new", model.tags.map((t) => t.name.trim())), values: {} };
        model.tags.push(tag);
        model.active = tag.id;
        changed();
    };

    const removeTag = (tag) => {
        model.tags = model.tags.filter((t) => t !== tag);
        if (model.active === tag.id) model.active = model.tags[0]?.id ?? null;
        changed();
    };

    const addKeyRow = () => {
        if (model.keys.length >= MAX_KEYS) return;
        model.keys.push({ id: newId(), name: uniqueName("key", model.keys.map((k) => k.name.trim())) });
        changed();
    };

    const removeKey = (key) => {
        model.keys = model.keys.filter((k) => k !== key);
        for (const tag of model.tags) delete tag.values[key.id];
        changed();
    };

    return {
        root,
        get: () => serializeTable(model),
        keyNames: () => model.keys.map((k, i) => k.name.trim() || `value_${i + 1}`),
        set: (text) => {
            Object.assign(model, parseTable(text));
            changed();
        },
    };
}

app.registerExtension({
    name: "NodeForge.ConfigTable",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== CONFIG_NODE) return;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onCreated?.apply(this, arguments);
            ensureCss();
            const initial = getWidget(this, "table")?.value ?? DEFAULT_TABLE;
            const editor = buildTableEditor(() => syncOutputs(this, editor.keyNames()));
            swapForDom(this, "table", editor.root, {
                getValue: () => editor.get(),
                setValue: (v) => editor.set(v),
                getMinHeight: () => editor.root.scrollHeight,
            });
            const envWidget = getWidget(this, "env");
            if (envWidget) envWidget.label = "output tag";
            editor.set(initial);
            resizeToContent(this);
            return result;
        };
    },
});
