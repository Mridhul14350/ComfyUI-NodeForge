import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { buildFileUi, ensureCss } from "./file_ui.js";

const NODE_NAME = "NodeForgeLoadFile";
const MAX_OUTPUTS = 16;
const MAX_PICK_BYTES = 10 * 1024 * 1024;
const SYNC_WIDGETS = ["file", "file_path", "output_type", "keys"];
const OUTPUT_TYPES = ["string", "json", "json_split", "text_parsed"];
const LEGACY_TYPES = ["text", "json"];
const JSON_EXT_RE = /\.json$/i;
let closeKeyPicker = null;

function getWidget(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

// file_path overrides the dropdown. A connected input wins over a typed path.
// Returns null when the dropdown is in use.
function computedSource(node) {
    const linked = !!node.inputs?.some(
        (i) => (i.name === "file_path" || i.widget?.name === "file_path") && i.link != null,
    );
    if (linked) return { linked: true, path: "" };
    const typed = String(getWidget(node, "file_path")?.value ?? "").trim().replace(/\\/g, "/");
    return typed ? { linked: false, path: typed } : null;
}

// The file type comes from the file name: .json is JSON, anything else is text.
// A linked path cannot be read until run, so it is treated as JSON.
function isJsonFile(node) {
    const source = computedSource(node);
    if (source?.linked) return true;
    const path = source ? source.path : String(getWidget(node, "file")?.value ?? "");
    return JSON_EXT_RE.test(path);
}


// Keys and Pick keys apply to a JSON file in json_split mode, or to a text file
// in text_parsed mode. A linked path is unknown until run, so keys stay visible.
function keysEnabled(node) {
    const mode = getWidget(node, "output_type")?.value;
    if (mode === "json_split") return isJsonFile(node);
    if (mode === "text_parsed") return !isJsonFile(node) || !!computedSource(node)?.linked;
    return false;
}

// Map saved widgets_values from older layouts to [file, file_path, output_type, keys].
// Returns null when the saved values already match the current layout.
function upgradeWidgetValues(saved) {
    if (!Array.isArray(saved)) return null;
    // [file, file_type, output_type, keys], before file_type was removed.
    if (saved.length === 4 && LEGACY_TYPES.includes(saved[1])) {
        return [saved[0], "", saved[2], saved[3] ?? ""];
    }
    if (saved.length === 3 && LEGACY_TYPES.includes(saved[1]) && OUTPUT_TYPES.includes(saved[2])) {
        return [saved[0], "", saved[2], ""];
    }
    // [file, output_type, keys], before file_path was added.
    if (saved.length === 3 && OUTPUT_TYPES.includes(saved[1])) {
        return [saved[0], "", saved[1], saved[2] ?? ""];
    }
    return null;
}


// Decide which outputs the node should show, from the mode and keys box.
// text_parsed with no sections listed shows one text output (the file as it is).
function wantedOutputs(node) {
    const outputType = getWidget(node, "output_type")?.value;
    const keys = String(getWidget(node, "keys")?.value ?? "")
        .split("\n")
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, MAX_OUTPUTS);
    if (keysEnabled(node) && (outputType === "json_split" || keys.length)) {
        return keys.map((k) => ({ name: k, type: "*" }));
    }
    const name = outputType === "json" ? "json" : "text";
    return [{ name, type: "STRING" }];
}

function setKeysVisible(node) {
    const show = keysEnabled(node);
    const keys = getWidget(node, "keys");
    if (!keys) return;
    keys.hidden = !show;
    keys.computeSize = show ? keys.nfComputeSize : () => [0, -4];
    if (keys.element) keys.element.style.display = show ? "" : "none";
}

// Keys mode only grows the node, so the keys box has room. Other modes fit the height to the content.
function fitLoadFileNode(node) {
    const [w, h] = node.computeSize();
    const height = keysEnabled(node) ? Math.max(node.size[1], h) : h;
    node.setSize([Math.max(node.size[0], w), height]);
}

function syncOutputs(node) {
    if (!node.outputs) return;
    setKeysVisible(node);
    const wanted = wantedOutputs(node);

    while (node.outputs.length > wanted.length) {
        node.removeOutput(node.outputs.length - 1);
    }
    while (node.outputs.length < wanted.length) {
        node.addOutput("value", "*");
    }
    wanted.forEach((want, i) => {
        const out = node.outputs[i];
        out.name = want.name;
        out.label = want.name;
        out.type = want.type;
    });

    node.nfRefreshFileBox?.();
    fitLoadFileNode(node);
    node.setDirtyCanvas?.(true, true);
}

// Labeled, editable keys box: header with count and Clear, then a textarea that fills the widget.
function buildKeysBox(initial) {
    const root = document.createElement("div");
    root.className = "nf-keys-box";
    const head = document.createElement("div");
    head.className = "nf-keys-head";
    const label = document.createElement("span");
    label.className = "nf-keys-label";
    label.textContent = "keys";
    const count = document.createElement("span");
    count.className = "nf-keys-count";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "nf-keys-clear";
    clear.textContent = "Clear";
    clear.title = "Remove all keys";
    head.append(label, count, clear);

    const area = document.createElement("textarea");
    area.className = "nf-keys";
    area.placeholder = "name\nmodels.0.name";
    area.spellcheck = false;
    // ComfyUI forwards wheel to the canvas (zoom) unless this marker is set and the element is focused.
    area.dataset.captureWheel = "true";

    const refreshCount = () => {
        const n = area.value.split("\n").filter((line) => line.trim()).length;
        count.textContent = `${n} key${n === 1 ? "" : "s"}`;
    };
    area.addEventListener("input", refreshCount);
    // Bubbles to the widget element, where the node listens and re-syncs outputs.
    clear.onclick = () => {
        area.value = "";
        refreshCount();
        area.dispatchEvent(new Event("input", { bubbles: true }));
    };

    root.append(head, area);
    const box = {
        root,
        area,
        set(value) {
            area.value = value;
            refreshCount();
        },
    };
    box.set(initial);
    return box;
}

function currentKeys(node) {
    return String(getWidget(node, "keys")?.value ?? "")
        .split("\n")
        .map((k) => k.trim())
        .filter(Boolean);
}

async function fetchBlob(fileValue) {
    if (!fileValue) throw new Error("Choose a file first");
    const parts = String(fileValue).split("/");
    const type = parts.shift();
    const filename = parts.pop();
    const params = new URLSearchParams({ filename, type, subfolder: parts.join("/") });
    const res = await fetch(api.apiURL(`/view?${params}`));
    if (!res.ok) throw new Error(`Could not read file (${res.status})`);
    return res.blob();
}

async function loadSections(fileValue) {
    const params = new URLSearchParams({ path: fileValue });
    const res = await fetch(api.apiURL(`/nodeforge/load_file/sections?${params}`));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Could not read file (${res.status})`);
    return body;
}

// Data for the Pick keys popup, plus the file size for the details row.
async function loadPickerData(fileValue, parsed) {
    if (!fileValue) throw new Error("Choose a file first");
    if (parsed) {
        const [data, blob] = await Promise.all([loadSections(fileValue), fetchBlob(fileValue)]);
        return { data, size: blob.size };
    }
    if (!JSON_EXT_RE.test(fileValue)) throw new Error("Pick keys needs a .json file");
    const blob = await fetchBlob(fileValue);
    if (blob.size > MAX_PICK_BYTES) throw new Error("File is over 10 MB");
    try {
        return { data: JSON.parse(await blob.text()), size: blob.size };
    } catch {
        throw new Error("File is not valid JSON");
    }
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// One line of details: name, folder, type, size and how many sections or keys the file has.
function renderFileInfo(info, fileValue, size, parsed, data) {
    const parts = fileValue.split("/");
    const name = parts.pop();
    const count = Array.isArray(data) ? data.length : Object.keys(data).length;
    const countLabel = parsed ? "Sections" : Array.isArray(data) ? "Items" : "Top-level keys";
    const rows = [
        ["File", name],
        ["Folder", parts.join("/")],
        ["Type", parsed ? "Text (INI)" : "JSON"],
        ["Size", formatSize(size)],
        [countLabel, count],
    ];
    info.replaceChildren(
        ...rows.map(([label, value]) => {
            const span = document.createElement("span");
            span.textContent = `${label}: ${value}`;
            return span;
        }),
    );
}

function formatPreview(value) {
    if (Array.isArray(value)) return `[${value.length}]`;
    if (value && typeof value === "object") return `{${Object.keys(value).length}}`;
    const text = typeof value === "string" ? JSON.stringify(value) : String(value);
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

// Render one level of JSON. Containers stay collapsed; their children load on first open.
function renderEntries(container, data, parentPath, ctx) {
    const entries = Array.isArray(data) ? data.map((v, i) => [String(i), v]) : Object.entries(data);
    for (const [key, value] of entries) {
        const path = parentPath ? `${parentPath}.${key}` : key;
        const isBox = value !== null && typeof value === "object";
        const text = isBox ? `${key} ${formatPreview(value)}` : `${key}: ${formatPreview(value)}`;

        if (isBox) {
            const details = document.createElement("details");
            details.className = "nf-kp-group";
            const summary = document.createElement("summary");
            summary.className = "nf-kp-row";
            summary.dataset.path = path;
            const arrow = document.createElement("span");
            arrow.className = "nf-kp-arrow";
            arrow.textContent = "▶";
            const box = document.createElement("input");
            box.type = "checkbox";
            box.dataset.boxPath = path;
            box.addEventListener("click", (e) => {
                e.stopPropagation();
                ctx.toggle(path);
            });
            const name = document.createElement("span");
            name.className = "nm";
            name.textContent = text;
            summary.append(arrow, box, name);
            details.append(summary);
            details.addEventListener("toggle", () => {
                if (!details.open || details.dataset.loaded) return;
                details.dataset.loaded = "1";
                const inner = document.createElement("div");
                inner.className = "nf-kp-children";
                details.append(inner);
                renderEntries(inner, value, path, ctx);
                ctx.refresh();
            });
            container.append(details);
        } else {
            const row = document.createElement("div");
            row.className = "nf-kp-row";
            row.dataset.path = path;
            const name = document.createElement("span");
            name.className = "nm";
            name.textContent = text;
            row.append(name);
            row.addEventListener("click", () => ctx.toggle(path));
            container.append(row);
        }
    }
}

// Text parsed: each section is a collapsible row. Its checkbox picks the whole
// section, and its field rows pick one field as section/field.
function renderSections(container, sections, ctx) {
    for (const [name, fields] of Object.entries(sections)) {
        const details = document.createElement("details");
        details.className = "nf-kp-group";
        const summary = document.createElement("summary");
        summary.className = "nf-kp-row";
        summary.dataset.path = name;
        const arrow = document.createElement("span");
        arrow.className = "nf-kp-arrow";
        arrow.textContent = "▶";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.dataset.boxPath = name;
        box.addEventListener("click", (e) => {
            e.stopPropagation();
            ctx.toggle(name);
        });
        const label = document.createElement("span");
        label.className = "nm";
        const count = Object.keys(fields).length;
        label.textContent = `${name} - ${count} ${count === 1 ? "field" : "fields"}`;
        summary.append(arrow, box, label);
        details.append(summary);

        const inner = document.createElement("div");
        inner.className = "nf-kp-children";
        for (const field of Object.keys(fields)) {
            const path = `${name}/${field}`;
            const row = document.createElement("div");
            row.className = "nf-kp-row";
            row.dataset.path = path;
            const fieldLabel = document.createElement("span");
            fieldLabel.className = "nm";
            fieldLabel.textContent = field;
            row.append(fieldLabel);
            row.addEventListener("click", () => ctx.toggle(path));
            inner.append(row);
        }
        details.append(inner);
        container.append(details);
    }
}

function openKeyPicker(node) {
    if (closeKeyPicker) closeKeyPicker();
    const source = computedSource(node);
    if (source?.linked) return;
    const fileValue = source ? source.path : getWidget(node, "file")?.value;

    ensureCss();
    const overlay = document.createElement("div");
    overlay.className = "nf-kp-overlay";

    const panel = document.createElement("div");
    panel.className = "nf-kp-pop";

    const parsed = getWidget(node, "output_type")?.value === "text_parsed";
    const header = document.createElement("div");
    header.className = "nf-kp-head";
    header.textContent = `${parsed ? "Pick sections" : "Pick JSON keys"}${fileValue ? ` - ${fileValue}` : ""}`;

    const info = document.createElement("div");
    info.className = "nf-kp-info";
    info.textContent = "Loading file details...";

    const body = document.createElement("div");
    body.className = "nf-kp-body";
    body.textContent = "Loading...";

    const footer = document.createElement("div");
    footer.className = "nf-kp-foot";
    const status = document.createElement("span");
    status.className = "nf-kp-status";
    const addBtn = document.createElement("button");
    addBtn.className = "nf-kp-btn primary";
    addBtn.textContent = "Add (0)";
    const closeBtn = document.createElement("button");
    closeBtn.className = "nf-kp-btn";
    closeBtn.textContent = "Close";
    footer.append(status, addBtn, closeBtn);
    panel.append(header, info, body, footer);
    overlay.append(panel);

    const selected = new Set();

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle("err", isError);
    }

    function refresh() {
        body.querySelectorAll("[data-path]").forEach((el) => {
            el.classList.toggle("on", selected.has(el.dataset.path));
        });
        body.querySelectorAll("input[data-box-path]").forEach((box) => {
            box.checked = selected.has(box.dataset.boxPath);
        });
        addBtn.textContent = `Add (${selected.size})`;
    }

    const ctx = {
        refresh,
        toggle(path) {
            if (selected.has(path)) selected.delete(path);
            else selected.add(path);
            refresh();
        },
    };

    function close() {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        closeKeyPicker = null;
    }
    function onKey(e) {
        if (e.key === "Escape") close();
    }
    closeKeyPicker = close;
    document.addEventListener("keydown", onKey);
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
    });
    closeBtn.onclick = close;

    addBtn.onclick = () => {
        const keysWidget = getWidget(node, "keys");
        if (!keysWidget) return;
        const existing = currentKeys(node);
        const toAdd = [...selected].filter((p) => !existing.includes(p));
        if (!selected.size) return setStatus("Select keys first");
        if (!toAdd.length) return setStatus("Already in the list");
        if (existing.length + toAdd.length > MAX_OUTPUTS) {
            return setStatus(`Max ${MAX_OUTPUTS} keys`, true);
        }
        keysWidget.value = [...existing, ...toAdd].join("\n");
        syncOutputs(node);
        selected.clear();
        refresh();
        setStatus(`Added ${toAdd.length} key(s)`);
    };

    document.body.append(overlay);
    loadPickerData(fileValue, parsed)
        .then(({ data, size }) => {
            body.textContent = "";
            if (parsed) {
                renderSections(body, data, ctx);
            } else {
                if (!data || typeof data !== "object") {
                    throw new Error("JSON top level must be an object or list");
                }
                renderEntries(body, data, "", ctx);
            }
            renderFileInfo(info, fileValue, size, parsed, data);
            refresh();
            setStatus("Click keys, then Add");
        })
        .catch((err) => {
            body.textContent = "";
            info.textContent = "";
            setStatus(err.message, true);
        });
}

app.registerExtension({
    name: "NodeForge.LoadFile",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onCreated?.apply(this, arguments);
            const fileWidget = getWidget(this, "file");
            if (fileWidget) {
                // The combo still stores the value; the file box below shows it.
                fileWidget.hidden = true;
                fileWidget.computeSize = () => [0, -4];
                const { root, refresh } = buildFileUi(this, {
                    fileWidget,
                    onPickKeys: () => openKeyPicker(this),
                    keyCount: () => currentKeys(this).length,
                    keysVisible: () => keysEnabled(this),
                    getComputed: () => computedSource(this),
                });
                // Pin the box to its content so it does not stretch into spare node height.
                const box = this.addDOMWidget("file_box", "custom", root, {
                    serialize: false,
                    getMinHeight: () => root.offsetHeight,
                    getMaxHeight: () => root.offsetHeight,
                });
                // Not every frontend version reads the serialize option, so set it directly.
                box.serialize = false;
                this.widgets.splice(this.widgets.indexOf(box), 1);
                this.widgets.unshift(box);
                this.nfRefreshFileBox = refresh;
                refresh();
                // The box settles after layout, so refit whenever its real size changes.
                new ResizeObserver(() => fitLoadFileNode(this)).observe(root);
            }
            // Replace the built-in text widget with a labeled box so the node's CSS applies.
            const oldKeys = getWidget(this, "keys");
            if (oldKeys) {
                const keysBox = buildKeysBox(String(oldKeys.value ?? ""));
                this.widgets.splice(this.widgets.indexOf(oldKeys), 1);
                // Removing it from the list leaves its built-in textarea on the node, so dispose it too.
                oldKeys.onRemove?.();
                oldKeys.element?.remove();
                const keys = this.addDOMWidget("keys", "custom", keysBox.root, {
                    getValue: () => keysBox.area.value,
                    setValue: (v) => keysBox.set(String(v ?? "")),
                    getMinHeight: () => 110,
                });
                keys.nfComputeSize = keys.computeSize;
            }
            for (const name of SYNC_WIDGETS) {
                const widget = getWidget(this, name);
                if (!widget) continue;
                const original = widget.callback;
                widget.callback = (...args) => {
                    original?.apply(widget, args);
                    syncOutputs(this);
                };
                // Multiline text does not always fire the callback while typing.
                widget.element?.addEventListener("input", () => syncOutputs(this));
            }
            syncOutputs(this);
            return result;
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const result = onConnectionsChange?.apply(this, arguments);
            syncOutputs(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const upgraded = upgradeWidgetValues(this.widgets_values);
            if (upgraded) this.widgets_values = upgraded;
            const result = onConfigure?.apply(this, arguments);
            if (upgraded) {
                const [file, filePath, outputType, keys] = upgraded;
                const values = { file, file_path: filePath, output_type: outputType, keys };
                for (const [name, value] of Object.entries(values)) {
                    const widget = getWidget(this, name);
                    if (widget) widget.value = value;
                }
            }
            syncOutputs(this);
            // Saved sizes were set before the file box laid out, so fit again after the next frame.
            requestAnimationFrame(() => fitLoadFileNode(this));
            return result;
        };
    },
});
