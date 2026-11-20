// NodeForge: Load Image. Picks up to 10 images from input and output and shows
// them as a grid or a list. Outputs are shown as one IMAGE and one MASK per picked image,
// or one pair for all picked images when Batch is on.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { ensureCss, splitFile, viewUrl } from "./file_ui.js";

const NODE_NAME = "NodeForgeLoadImage";
const MAX_IMAGES = 10;
const LIST_URL = "/nodeforge/load_image/list";
const SAVED_ORDER = ["image", "images", "display", "file_path", "batch"];
const SOURCE_OPTIONS = [
    ["all", "Both"],
    ["input", "Input"],
    ["output", "Output"],
];
const VIEW_OPTIONS = [
    ["grid", "Grid"],
    ["list", "List"],
];
const ICON_GRID =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>';
const ICON_LIST =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="1" y="2" width="14" height="3" rx="1"/><rect x="1" y="6.5" width="14" height="3" rx="1"/><rect x="1" y="11" width="14" height="3" rx="1"/></svg>';
let closePicker = null;
let cssReady = false;
// The popup remembers its last filter and view within the session.
let pickerSource = "all";
let pickerView = "grid";

const CSS = `
.nf-li-bar { display:flex; align-items:center; gap:6px; }
.nf-li-pick { flex:1; min-width:0; height:34px; display:flex; align-items:center; justify-content:center; gap:6px; background:var(--nf-acc); border:1px solid var(--nf-acc); border-radius:7px; color:#fff; font-size:12px; font-weight:500; cursor:pointer; box-sizing:border-box; }
.nf-li-pick:hover { filter:brightness(1.08); }
.nf-li-toggle { display:flex; flex:0 0 auto; border:1px solid rgba(255,255,255,0.16); border-radius:7px; overflow:hidden; }
.nf-li-toggle button { width:34px; height:34px; padding:0; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); border:none; color:#ddd; cursor:pointer; box-sizing:border-box; }
.nf-li-toggle button + button { border-left:1px solid rgba(255,255,255,0.16); }
.nf-li-toggle button:hover { color:#fff; background:rgba(255,255,255,0.1); }
.nf-li-toggle button.on { background:var(--nf-acc); color:#fff; }
.nf-li-batch { flex:0 0 auto; height:34px; padding:0 10px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.16); border-radius:7px; color:#ddd; font-size:12px; cursor:pointer; box-sizing:border-box; }
.nf-li-batch:hover { color:#fff; background:rgba(255,255,255,0.1); }
.nf-li-batch.on { background:var(--nf-acc); border-color:var(--nf-acc); color:#fff; }
.nf-li-meta { display:flex; align-items:center; justify-content:space-between; font-size:11px; color:#9a9a9a; padding:0 2px; }
.nf-li-view { max-height:260px; overflow:auto; background:#0f0f0f; border:1px solid #2c2c2c; border-radius:7px; padding:6px; box-sizing:border-box; }
.nf-li-view.grid { display:flex; flex-wrap:wrap; align-content:flex-start; gap:6px; }
.nf-li-view.grid .nf-li-tile { flex:0 0 calc((100% - 12px) / 3); }
.nf-li-view.list { display:flex; flex-direction:column; gap:4px; }
.nf-li-tile { position:relative; aspect-ratio:1; border:1px solid #2c2c2c; border-radius:6px; overflow:hidden; background:#0a0a0a; }
.nf-li-num { position:absolute; top:3px; left:3px; background:var(--nf-acc); color:#fff; border-radius:4px; font-size:10px; padding:1px 5px; font-weight:600; }
.nf-li-row { display:flex; align-items:center; gap:8px; background:#161616; border:1px solid #2c2c2c; border-radius:6px; padding:4px 6px; }
.nf-li-img { width:100%; height:100%; object-fit:cover; display:block; box-sizing:border-box; }
.nf-li-tile .nf-li-img { position:absolute; inset:0; }
.nf-li-row .nf-li-img { width:40px; height:40px; flex:0 0 auto; border-radius:4px; }
.nf-li-fallback { display:flex; align-items:center; justify-content:center; background:#0a0a0a; color:#888; font-size:10px; }
.nf-li-empty { color:#777; text-align:center; padding:12px; font-size:11px; }
.nf-li-ord { width:18px; flex:0 0 auto; text-align:center; color:var(--nf-acc); font-weight:600; }
.nf-li-tools { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border-bottom:1px solid #333; }
.nf-fb-list.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:6px; align-content:start; }
.nf-li-card { position:relative; display:flex; flex-direction:column; border:1px solid #2c2c2c; border-radius:7px; overflow:hidden; background:#141414; cursor:pointer; }
.nf-li-card:hover { border-color:var(--nf-acc); }
.nf-li-card.on { border-color:var(--nf-acc); box-shadow:inset 0 0 0 1px var(--nf-acc); }
.nf-li-card .nf-li-img { aspect-ratio:1; height:auto; border-radius:0; }
.nf-li-card .nf-li-fallback { aspect-ratio:1; }
.nf-li-card .nf-li-num { top:4px; left:4px; }
.nf-li-card .nf-fb-badge { position:absolute; top:4px; right:4px; background:#191919; }
.nf-li-cap { padding:4px 6px; font-size:10px; color:#bbb; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
`;

function ensureImageCss() {
    if (cssReady) return;
    cssReady = true;
    const style = document.createElement("style");
    style.id = "nf-li-css";
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

function setWidgetValue(node, name, value) {
    const widget = getWidget(node, name);
    if (widget) widget.value = value;
}

function setHidden(widget) {
    widget.hidden = true;
    widget.computeSize = () => [0, -4];
    if (widget.element) widget.element.style.display = "none";
}

// The chosen paths from the popup, in pick order. Falls back to the legacy single 'image' value.
function pickedOf(node) {
    const lines = String(getWidget(node, "images")?.value ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length) return lines;
    const legacy = String(getWidget(node, "image")?.value ?? "");
    return legacy ? [`input/${legacy}`] : [];
}

// What the node runs on: the picked images, then the typed file_path lines. Duplicates are skipped, as in the backend.
function selectionOf(node) {
    const typed = String(getWidget(node, "file_path")?.value ?? "")
        .split("\n")
        .map((line) => line.trim().replace(/\\/g, "/"))
        .filter(Boolean);
    return [...new Set([...pickedOf(node), ...typed])];
}

function setSelection(node, values) {
    setWidgetValue(node, "images", values.join("\n"));
    setWidgetValue(node, "image", "");
}

function displayMode(node) {
    return getWidget(node, "display")?.value === "list" ? "list" : "grid";
}

function batchOn(node) {
    return getWidget(node, "batch")?.value === true;
}

// One IMAGE and one MASK per picked image, at least one pair, at most MAX_IMAGES.
// In batch mode the picked images form a single pair.
// Pairs are image_1, mask_1, image_2, ... to match the backend RETURN_TYPES order.
function syncOutputs(node) {
    if (!node.outputs) return;
    const count = batchOn(node) ? 1 : Math.max(1, Math.min(MAX_IMAGES, selectionOf(node).length));
    const wanted = count * 2;

    while (node.outputs.length > wanted) {
        node.removeOutput(node.outputs.length - 1);
    }
    for (let i = 0; i < wanted; i++) {
        const slot = Math.floor(i / 2) + 1;
        const isMask = i % 2 === 1;
        const name = `${isMask ? "mask" : "image"}_${slot}`;
        const label = batchOn(node) ? (isMask ? "masks" : "images") : name;
        const type = isMask ? "MASK" : "IMAGE";
        if (i >= node.outputs.length) {
            node.addOutput(name, type);
        }
        const out = node.outputs[i];
        out.name = name;
        out.label = label;
        out.type = type;
    }

    node.nfRefresh?.();
    sizeFilePath(node);
    fitToContent(node);
    node.setDirtyCanvas?.(true, true);
}

// Measured from the rendered preview, so the box fits the thumbnails and the view's own scroll cap.
function previewHeight(node) {
    const root = node.nfRoot;
    if (!root?.isConnected) return node.nfPreviewHeight ?? 120;
    const cs = getComputedStyle(root);
    const parts = [...root.children];
    const gap = parseFloat(cs.rowGap) || 0;
    const content = parts.reduce((sum, part) => sum + part.offsetHeight, 0) + gap * (parts.length - 1);
    node.nfPreviewHeight = content + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    return node.nfPreviewHeight;
}

const FILE_PATH_ROWS = 5;
const FILE_PATH_PAD = 8;

// The Vue layout ignores widget size hints, so the node's own textarea is sized here.
// One line when empty, grows with the typed lines, and scrolls after FILE_PATH_ROWS.
function sizeFilePath(node) {
    const widget = getWidget(node, "file_path");
    const ta = document.querySelector(`[node-id="${node.id}"] textarea`);
    if (!widget || !ta) return;
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 15;
    const rows = Math.min(Math.max(String(widget.value ?? "").split("\n").length, 1), FILE_PATH_ROWS);
    ta.style.paddingTop = `${FILE_PATH_PAD}px`;
    ta.style.paddingBottom = `${FILE_PATH_PAD}px`;
    ta.style.height = `${rows * lineHeight + 2 * FILE_PATH_PAD}px`;
    ta.style.minHeight = ta.style.height;
    ta.placeholder = "file_path";
}

// Set the node to its content height. Width is kept.
function fitToContent(node) {
    const [, height] = node.computeSize();
    node.setSize([node.size[0], height]);
}

// Thumbnail through ComfyUI's /view endpoint. Falls back to the extension if it fails.
function imageEl(file, className) {
    const img = el("img", className);
    img.loading = "lazy";
    img.alt = file.name;
    img.src = viewUrl(file, true);
    img.onerror = () => img.replaceWith(el("div", `${className} nf-li-fallback`, file.name.split(".").pop().toUpperCase()));
    return img;
}

// Marks the active grid/list toggle button on the node.
function markView(buttons, active) {
    for (const [mode, button] of Object.entries(buttons || {})) {
        button.classList.toggle("on", mode === active);
    }
}

function sourceBadge(file) {
    const out = file.source === "output";
    return el("span", `nf-fb-badge${out ? " out" : ""}`, out ? "OUTPUT" : "INPUT");
}

function renderPreview(node) {
    const view = node.nfImageView;
    if (!view) return;
    const values = selectionOf(node);
    const mode = displayMode(node);
    const batched = batchOn(node);
    node.nfImageCount.textContent =
        `${values.length} of ${MAX_IMAGES} selected` + (batched && values.length ? " · batched into 1 output" : "");
    view.className = `nf-li-view ${mode}`;
    markView(node.nfViewButtons, mode);
    if (node.nfBatchButton) {
        node.nfBatchButton.classList.toggle("on", batched);
        node.nfBatchButton.textContent = batched ? "Batch: on" : "Batch: off";
        node.nfBatchButton.title = batched
            ? "Output one batched image from all picked images. Click for separate outputs."
            : "Output each picked image separately. Click to batch them into one output.";
    }

    if (!values.length) {
        view.replaceChildren(el("div", "nf-li-empty", "No images selected. Click Select images."));
        return;
    }
    const items = values.map((value, i) => {
        const file = splitFile(value);
        if (mode === "list") {
            const row = el("div", "nf-li-row");
            const col = el("div", "nf-lf-col");
            col.append(el("div", "nf-lf-name", `${i + 1}. ${file.name}`), el("div", "nf-lf-path", file.folder));
            row.append(imageEl(file, "nf-li-img"), col);
            return row;
        }
        const tile = el("div", "nf-li-tile");
        tile.title = value;
        tile.append(imageEl(file, "nf-li-img"), el("span", "nf-li-num", String(i + 1)));
        return tile;
    });
    view.replaceChildren(...items);
}

// Multi-select popup over input and output images. Selection keeps click order.
function openImagePicker(anchor, node) {
    if (closePicker) {
        closePicker();
        return;
    }
    ensureCss();
    ensureImageCss();

    const selected = [...pickedOf(node)];
    let files = [];
    let shown = [];
    let loaded = false;

    const pop = el("div", "nf-fb-pop");
    const head = el("div", "nf-fb-head");
    const search = el("input", "nf-fb-search");
    search.type = "text";
    search.placeholder = "Filter images...";
    search.spellcheck = false;
    head.append(search);
    const tools = el("div", "nf-li-tools");
    const upload = el("button", "nf-kp-btn", "Upload");
    upload.type = "button";
    const fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.hidden = true;
    upload.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        fileInput.value = "";
        if (file) uploadImage(file);
    });
    const list = el("div", "nf-fb-list");
    const foot = el("div", "nf-kp-foot");
    const status = el("div", "nf-kp-status", "Loading images...");
    const cancel = el("button", "nf-kp-btn", "Cancel");
    cancel.type = "button";
    const done = el("button", "nf-kp-btn primary", "Done");
    done.type = "button";
    foot.append(status, cancel, done);
    pop.append(head, tools, list, foot);
    document.body.append(pop);

    const rect = anchor.getBoundingClientRect();
    const width = Math.min(520, window.innerWidth - 16);
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    pop.style.top = `${rect.bottom + 4}px`;
    requestAnimationFrame(() => {
        const height = pop.getBoundingClientRect().height;
        if (rect.bottom + 4 + height > window.innerHeight - 8) {
            pop.style.top = `${Math.max(8, window.innerHeight - 8 - height)}px`;
        }
    });

    function close() {
        document.removeEventListener("mousedown", onDown, true);
        document.removeEventListener("keydown", onKey, true);
        pop.remove();
        closePicker = null;
    }
    function commit() {
        setSelection(node, selected);
        close();
        syncOutputs(node);
    }
    function onDown(e) {
        if (!pop.contains(e.target) && !anchor.contains(e.target)) close();
    }
    function onKey(e) {
        if (e.key === "Escape") {
            close();
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (loaded) commit();
        }
    }
    closePicker = close;
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    cancel.addEventListener("click", close);
    done.addEventListener("click", commit);

    function setStatus(text, err = false) {
        status.textContent = text;
        status.classList.toggle("err", err);
    }

    function toggle(value) {
        const at = selected.indexOf(value);
        if (at >= 0) {
            selected.splice(at, 1);
        } else if (selected.length >= MAX_IMAGES) {
            setStatus(`Up to ${MAX_IMAGES} images`, true);
            return;
        } else {
            selected.push(value);
        }
        renderRows();
    }

    function segment(options, active, onPick) {
        const seg = el("div", "nf-fb-seg");
        for (const [value, label] of options) {
            const button = el("button", value === active ? "on" : "", label);
            button.type = "button";
            button.addEventListener("click", () => onPick(value));
            seg.append(button);
        }
        return seg;
    }

    function paintTools() {
        const filter = segment(SOURCE_OPTIONS, pickerSource, (value) => {
            pickerSource = value;
            paintTools();
            renderRows();
        });
        const view = segment(VIEW_OPTIONS, pickerView, (value) => {
            pickerView = value;
            paintTools();
            renderRows();
        });
        tools.replaceChildren(filter, view, upload, fileInput);
    }

    // Uploads go to ComfyUI's input folder and are not limited. The new file is picked only while the selection has room.
    async function uploadImage(file) {
        setStatus(`Uploading ${file.name}...`);
        const body = new FormData();
        body.append("image", file);
        try {
            const res = await api.fetchApi("/upload/image", { method: "POST", body });
            if (!res.ok) throw new Error(String(res.status));
            const data = await res.json();
            const uploaded = splitFile([data.type, data.subfolder, data.name].filter(Boolean).join("/"));
            if (!files.some((f) => f.value === uploaded.value)) files.push(uploaded);
            if (!selected.includes(uploaded.value) && selected.length < MAX_IMAGES) selected.push(uploaded.value);
            pickerSource = "all";
            paintTools();
            renderRows();
            if (selected.length >= MAX_IMAGES && !selected.includes(uploaded.value)) {
                setStatus(`Uploaded. Selection is full (${MAX_IMAGES} max)`, true);
            }
        } catch {
            setStatus("Upload failed", true);
        }
    }

    function gridCard(file, order) {
        const card = el("div", `nf-li-card${order >= 0 ? " on" : ""}`);
        card.title = file.value;
        card.append(imageEl(file, "nf-li-img"), el("div", "nf-li-cap", file.name), sourceBadge(file));
        if (order >= 0) card.append(el("span", "nf-li-num", String(order + 1)));
        return card;
    }

    function listRow(file, order) {
        const row = el("div", `nf-fb-item${order >= 0 ? " on" : ""}`);
        const col = el("div", "nf-fb-col");
        col.append(el("div", "nf-fb-name", file.name), el("div", "nf-fb-sub", file.folder));
        row.append(
            imageEl(file, "nf-fb-thumb"),
            col,
            el("span", "nf-li-ord", order >= 0 ? String(order + 1) : ""),
            sourceBadge(file),
        );
        return row;
    }

    function renderRows() {
        if (!loaded) return;
        const query = search.value.trim().toLowerCase();
        shown = files.filter(
            (f) =>
                (pickerSource === "all" || f.source === pickerSource) &&
                (!query || f.value.toLowerCase().includes(query)),
        );
        list.className = `nf-fb-list${pickerView === "grid" ? " grid" : ""}`;
        list.replaceChildren();
        if (!shown.length) {
            list.append(el("div", "nf-fb-empty", files.length ? "No matching images" : "No images in input or output"));
        }
        shown.forEach((file) => {
            const order = selected.indexOf(file.value);
            const item = pickerView === "grid" ? gridCard(file, order) : listRow(file, order);
            item.addEventListener("click", () => toggle(file.value));
            list.append(item);
        });
        setStatus(`${selected.length} of ${MAX_IMAGES} selected · Enter done · Esc cancel`);
    }

    search.addEventListener("input", renderRows);
    paintTools();
    fetch(api.apiURL(LIST_URL))
        .then((res) => {
            if (!res.ok) throw new Error(String(res.status));
            return res.json();
        })
        .then((data) => {
            files = (data.files || []).map(splitFile);
            loaded = true;
            renderRows();
        })
        .catch(() => setStatus("Could not load the image list", true));
    search.focus();
}

app.registerExtension({
    name: "NodeForge.LoadImage",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            // Styles must be in place before the toolbar is built, not only when the popup opens.
            ensureCss();
            ensureImageCss();
            const result = onNodeCreated?.apply(this, arguments);
            for (const name of ["image", "images"]) {
                const widget = getWidget(this, name);
                if (widget) setHidden(widget);
            }

            const pick = el("button", "nf-li-pick", "Select images");
            pick.type = "button";
            const gridBtn = el("button");
            gridBtn.type = "button";
            gridBtn.title = "Grid view";
            gridBtn.innerHTML = ICON_GRID;
            const listBtn = el("button");
            listBtn.type = "button";
            listBtn.title = "List view";
            listBtn.innerHTML = ICON_LIST;
            const batchBtn = el("button", "nf-li-batch");
            batchBtn.type = "button";
            const toggle = el("div", "nf-li-toggle");
            toggle.append(gridBtn, listBtn);
            const bar = el("div", "nf-li-bar");
            bar.append(pick, batchBtn, toggle);
            const count = el("div", "nf-li-meta");
            const view = el("div", "nf-li-view grid");
            // Focusable so the wheel scrolls the list instead of zooming the canvas (see load_file.js).
            view.tabIndex = 0;
            view.dataset.captureWheel = "true";
            // Focus on hover so the first wheel tick scrolls the list instead of zooming the canvas.
            view.addEventListener("pointerenter", () => {
                const active = document.activeElement;
                const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
                if (!typing) view.focus({ preventScroll: true });
            });
            const root = el("div", "nf-lf-root");
            root.append(bar, count, view);
            pick.addEventListener("click", (e) => {
                e.stopPropagation();
                openImagePicker(pick, this);
            });
            gridBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                setWidgetValue(this, "display", "grid");
                renderPreview(this);
                this.setDirtyCanvas?.(true, true);
            });
            listBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                setWidgetValue(this, "display", "list");
                renderPreview(this);
                this.setDirtyCanvas?.(true, true);
            });
            batchBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                setWidgetValue(this, "batch", !batchOn(this));
                syncOutputs(this);
                renderPreview(this);
                this.setDirtyCanvas?.(true, true);
            });
            this.nfImageView = view;
            this.nfImageCount = count;
            this.nfViewButtons = { grid: gridBtn, list: listBtn };
            this.nfBatchButton = batchBtn;
            this.nfRoot = root;
            this.nfRefresh = () => renderPreview(this);

            const box = this.addDOMWidget("image_box", "custom", root, {
                serialize: false,
                getMinHeight: () => previewHeight(this),
            });
            box.serialize = false;
            this.widgets.splice(this.widgets.indexOf(box), 1);
            this.widgets.unshift(box);

            // The grid/list toggle above drives this value, so the combo is hidden.
            const display = getWidget(this, "display");
            if (display) setHidden(display);
            // The Batch button above drives this value, so the toggle is hidden.
            const batch = getWidget(this, "batch");
            if (batch) setHidden(batch);
            // Typing a path re-renders the preview and output pairs at once.
            const filePath = getWidget(this, "file_path");
            if (filePath) {
                // The label sits in the textarea's top padding and scrolled text slides under it.
                // A blank label plus a placeholder keeps the name visible while the box is empty.
                filePath.label = " ";
                const previous = filePath.callback;
                filePath.callback = (...args) => {
                    previous?.apply(filePath, args);
                    syncOutputs(this);
                };
            }
            syncOutputs(this);
            // The widgets are measured once they are in the page, so size again after the first frame.
            requestAnimationFrame(() => syncOutputs(this));
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const saved = Array.isArray(this.widgets_values) ? this.widgets_values : [];
            // Older saves have fewer values (only 'image', or no 'file_path'), so missing slots take their defaults.
            const defaults = ["", "", "grid", "", false];
            const values = SAVED_ORDER.map((_, i) => (saved[i] !== undefined ? saved[i] : defaults[i]));
            this.widgets_values = values;
            const result = onConfigure?.apply(this, arguments);
            SAVED_ORDER.forEach((name, i) => setWidgetValue(this, name, values[i]));
            syncOutputs(this);
            requestAnimationFrame(() => syncOutputs(this));
            return result;
        };
    },
});
