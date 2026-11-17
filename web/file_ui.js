// NodeForge file UI: the file box on the node, and the file browser popup.
// Thumbnails and previews are read through ComfyUI's /view endpoint.

import { api } from "../../scripts/api.js";

const NF_ACCENT = "#4ea8ff";
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const PREVIEW_CHARS = 600;
const textCache = new Map();
let closeBrowser = null;

const CSS = `
.nf-kp-overlay, .nf-fb-pop, .nf-lf-root { --nf-acc:${NF_ACCENT}; }
.nf-kp-overlay { position:fixed; inset:0; z-index:99999; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; }
.nf-kp-pop { width:min(520px,90vw); height:70vh; display:flex; flex-direction:column; background:#191919; border:1px solid var(--nf-acc); border-radius:9px; box-shadow:0 14px 40px rgba(0,0,0,0.6); font-size:12px; color:#ddd; }
.nf-kp-head { padding:9px 12px; border-bottom:1px solid #333; font-size:12px; color:var(--nf-acc); font-weight:600; word-break:break-all; }
.nf-kp-body { flex:1; overflow:auto; padding:8px 10px; display:flex; flex-direction:column; gap:4px; }
.nf-kp-row { display:flex; align-items:center; gap:8px; padding:6px 9px; background:#141414; border:1px solid #2c2c2c; border-radius:6px; cursor:pointer; color:#ddd; font-family:monospace; font-size:12px; list-style:none; }
.nf-kp-row:hover { border-color:var(--nf-acc); background:#1c1c1c; }
.nf-kp-row.on { border-color:var(--nf-acc); background:color-mix(in srgb, var(--nf-acc) 18%, transparent); }
.nf-kp-row .nm { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.nf-kp-row input { margin:0; accent-color:var(--nf-acc); cursor:pointer; }
.nf-kp-arrow { color:var(--nf-acc); font-size:10px; width:8px; flex:0 0 auto; }
details[open] > .nf-kp-row .nf-kp-arrow { transform:rotate(90deg); }
summary.nf-kp-row::-webkit-details-marker { display:none; }
.nf-kp-children { display:flex; flex-direction:column; gap:4px; margin:4px 0 2px 16px; padding-left:8px; border-left:1px solid #333; }
.nf-kp-foot { padding:9px 12px; border-top:1px solid #333; display:flex; gap:8px; align-items:center; }
.nf-kp-status { flex:1; font-size:11px; color:#9a9a9a; }
.nf-kp-status.err { color:#e0a33e; }
.nf-kp-btn { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.16); border-radius:5px; padding:6px 12px; font-size:11px; color:#ddd; cursor:pointer; }
.nf-kp-btn:hover { border-color:var(--nf-acc); color:#fff; }
.nf-kp-btn.primary { background:var(--nf-acc); border-color:var(--nf-acc); color:#fff; }
.nf-kp-btn.primary:hover { filter:brightness(1.08); }

.nf-fb-pop { position:fixed; z-index:99999; display:flex; flex-direction:column; background:#191919; border:1px solid var(--nf-acc); border-radius:9px; box-shadow:0 14px 40px rgba(0,0,0,0.6); color:#ddd; font-size:12px; max-height:80vh; }
.nf-fb-head { display:flex; align-items:center; gap:8px; padding:9px 10px; border-bottom:1px solid #333; }
.nf-fb-search { flex:1; min-width:0; background:#141414; border:1px solid #3a3a3a; border-radius:5px; padding:6px 8px; color:#ddd; font-size:12px; box-sizing:border-box; }
.nf-fb-search:focus { outline:none; border-color:var(--nf-acc); }
.nf-fb-seg { display:flex; }
.nf-fb-seg button { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.16); color:#ddd; padding:5px 10px; font-size:11px; cursor:pointer; }
.nf-fb-seg button:first-child { border-radius:5px 0 0 5px; }
.nf-fb-seg button:last-child { border-radius:0 5px 5px 0; border-left:none; }
.nf-fb-seg button.on { background:var(--nf-acc); border-color:var(--nf-acc); color:#fff; }
.nf-fb-list { overflow:auto; max-height:320px; padding:6px; display:flex; flex-direction:column; gap:3px; }
.nf-fb-item { display:flex; align-items:center; gap:10px; padding:5px 8px; border-radius:6px; cursor:pointer; border:1px solid transparent; }
.nf-fb-item.active { background:#262626; }
.nf-fb-item.on { color:var(--nf-acc); font-weight:600; background:color-mix(in srgb, var(--nf-acc) 18%, transparent); }
.nf-fb-item.S { padding:3px 8px; gap:8px; }
.nf-fb-thumb { width:56px; height:56px; flex:0 0 auto; border-radius:5px; background:#0f0f0f; color:#888; font-size:10px; display:flex; align-items:center; justify-content:center; object-fit:cover; box-sizing:border-box; }
.nf-fb-item.S .nf-fb-thumb { width:26px; height:26px; }
.nf-fb-col { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
.nf-fb-name, .nf-lf-name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.nf-fb-sub, .nf-lf-path { font-size:10px; color:#8a8a8a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:400; }
.nf-fb-badge { font-size:9px; padding:2px 5px; border-radius:4px; border:1px solid var(--nf-acc); color:var(--nf-acc); letter-spacing:.04em; flex:0 0 auto; font-weight:600; }
.nf-fb-badge.out { border-style:dashed; }
.nf-fb-prev { border-top:1px solid #333; padding:8px 10px; min-height:90px; max-height:200px; display:flex; gap:10px; align-items:center; justify-content:center; overflow:hidden; }
.nf-fb-prev img { max-width:160px; max-height:180px; border-radius:5px; object-fit:contain; }
.nf-fb-prev pre { margin:0; width:100%; max-height:180px; overflow:auto; font-size:11px; color:#bbb; white-space:pre-wrap; word-break:break-all; font-family:monospace; }
.nf-fb-empty { padding:24px; text-align:center; color:#777; }
.nf-fb-foot { border-top:1px solid #333; padding:7px 10px; color:#9a9a9a; font-size:11px; }

.nf-lf-root { display:flex; flex-direction:column; gap:6px; padding:6px 8px; box-sizing:border-box; font-size:11px; }
.nf-lf-file { display:flex; align-items:center; gap:8px; width:100%; background:#141414; border:1px solid #3a3a3a; border-radius:6px; padding:6px 8px; color:#ddd; cursor:pointer; text-align:left; box-sizing:border-box; }
.nf-lf-file:hover { border-color:var(--nf-acc); }
.nf-lf-col { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.nf-lf-name { font-size:12px; }
.nf-lf-chev { color:var(--nf-acc); flex:0 0 auto; }
.nf-lf-nav { display:flex; align-items:center; gap:6px; }
.nf-lf-idx { flex:1; text-align:center; color:#9a9a9a; }
.nf-lf-iconbtn { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.16); border-radius:5px; padding:3px 9px; color:#ddd; font-size:10px; cursor:pointer; }
.nf-lf-iconbtn:hover:not(:disabled) { border-color:var(--nf-acc); color:#fff; }
.nf-lf-iconbtn:disabled { opacity:.35; cursor:default; }
.nf-lf-pick { background:var(--nf-acc); border:1px solid var(--nf-acc); border-radius:6px; padding:7px; color:#fff; font-size:12px; font-weight:500; cursor:pointer; }
.nf-lf-pick:hover { filter:brightness(1.08); }
.nf-lf-off { opacity:.55; }
.nf-lf-off, .nf-lf-off button:disabled { cursor:not-allowed; }
.nf-lf-off:hover, .nf-lf-off button:disabled:hover { border-color:#3a3a3a; filter:none; }
.nf-kp-info { display:flex; flex-wrap:wrap; gap:4px 14px; padding:6px 12px; border-bottom:1px solid #333; font-size:11px; color:#9a9a9a; }
.nf-kp-info span { white-space:nowrap; }
.nf-keys-box { --nf-acc:${NF_ACCENT}; display:flex; flex-direction:column; gap:4px; box-sizing:border-box; width:100%; height:100%; padding:0 8px; font-size:11px; }
.nf-keys-head { display:flex; align-items:center; gap:8px; color:#9a9a9a; }
.nf-keys-label { color:#ddd; font-size:11px; }
.nf-keys-count { flex:1; text-align:right; font-size:10px; color:#8a8a8a; }
.nf-keys-clear { background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.16); border-radius:4px; padding:2px 8px; color:#ddd; font-size:10px; cursor:pointer; }
.nf-keys-clear:hover { border-color:var(--nf-acc); color:#fff; }
.nf-keys { flex:1 1 auto; min-height:60px; box-sizing:border-box; width:100%; background:#1d1d1d; color:#ddd; border:1px solid #3a3a3a; border-radius:5px; padding:6px 8px; font:11px ui-monospace, Consolas, monospace; line-height:1.45; resize:none; outline:none; scrollbar-width:thin; scrollbar-color:#444 transparent; }
.nf-keys:focus { border-color:var(--nf-acc); }
.nf-var-root { --nf-acc:${NF_ACCENT}; display:flex; flex-direction:column; gap:4px; box-sizing:border-box; width:100%; padding:0 8px; font-size:11px; }
.nf-var-head { display:flex; align-items:center; gap:8px; color:#ddd; }
.nf-var-count { flex:1; text-align:right; font-size:10px; color:#8a8a8a; }
.nf-var-list { display:flex; flex-direction:column; gap:4px; max-height:260px; overflow:auto; scrollbar-width:thin; scrollbar-color:#444 transparent; }
.nf-var-row { display:flex; align-items:flex-start; gap:4px; }
.nf-var-name, .nf-var-value, .nf-var-text { box-sizing:border-box; min-width:0; background:#1d1d1d; color:#ddd; border:1px solid #3a3a3a; border-radius:5px; padding:4px 6px; font:11px ui-monospace, Consolas, monospace; outline:none; }
.nf-var-name { flex:0 0 35%; }
.nf-var-value { flex:1 1 auto; }
.nf-var-step { flex:0 0 52px; width:52px; box-sizing:border-box; min-width:0; background:#1d1d1d; color:#ddd; border:1px solid #3a3a3a; border-radius:5px; padding:4px 4px; font:11px ui-monospace, Consolas, monospace; outline:none; }
.nf-var-step:focus { border-color:var(--nf-acc); }
.nf-var-text { flex:1 1 auto; min-height:44px; resize:vertical; line-height:1.4; }
.nf-var-name:focus, .nf-var-value:focus, .nf-var-text:focus { border-color:var(--nf-acc); }
.nf-var-del { flex:0 0 auto; width:22px; height:22px; padding:0; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.16); border-radius:4px; color:#ddd; font-size:13px; line-height:1; cursor:pointer; }
.nf-var-del:hover { border-color:#e0a33e; color:#fff; }
.nf-var-add { align-self:flex-start; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.16); border-radius:5px; padding:3px 10px; color:#ddd; font-size:11px; cursor:pointer; }
.nf-var-add:hover:not(:disabled) { border-color:var(--nf-acc); color:#fff; }
.nf-var-add:disabled { opacity:.4; cursor:default; }
`;

function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

export function ensureCss() {
    if (document.getElementById("nf-ui-css")) return;
    const style = document.createElement("style");
    style.id = "nf-ui-css";
    style.textContent = CSS;
    document.head.append(style);
}

// Grow the node enough for its content, but keep a size the user chose.
export function fitNodeSize(node) {
    const [w, h] = node.computeSize();
    node.setSize?.([Math.max(node.size[0], w), Math.max(node.size[1], h)]);
}

// "input/notes/a.json" -> source "input", folder "input/notes", name "a.json".
export function splitFile(value) {
    const text = String(value ?? "");
    const parts = text.split("/");
    const source = parts.shift() === "output" ? "output" : "input";
    const name = parts.pop() || "";
    const subfolder = parts.join("/");
    return {
        value: text,
        source,
        subfolder,
        name,
        folder: [source, subfolder].filter(Boolean).join("/"),
        isImage: IMAGE_RE.test(name),
    };
}

export function viewUrl(file, small = false) {
    const params = new URLSearchParams({ filename: file.name, type: file.source, subfolder: file.subfolder });
    if (small) params.set("preview", "webp;50");
    return api.apiURL(`/view?${params}`);
}

function thumbEl(file) {
    const fallback = () => el("div", "nf-fb-thumb", file.name.split(".").pop().toUpperCase());
    if (!file.isImage) return fallback();
    const img = el("img", "nf-fb-thumb");
    img.loading = "lazy";
    img.src = viewUrl(file, true);
    img.onerror = () => img.replaceWith(fallback());
    return img;
}

async function readText(file) {
    if (!textCache.has(file.value)) {
        const load = fetch(viewUrl(file))
            .then((res) => {
                if (!res.ok) throw new Error(String(res.status));
                return res.text();
            })
            .then((text) => text.slice(0, PREVIEW_CHARS))
            .catch(() => "Could not read this file");
        textCache.set(file.value, load);
    }
    return textCache.get(file.value);
}

// Popup listing input and output files. files: splitFile() results.
export function openFileBrowser(anchor, files, currentValue, onChoose) {
    if (closeBrowser) {
        closeBrowser();
        return;
    }
    ensureCss();

    let view = "L";
    let shown = [];
    let previewToken = 0;

    const pop = el("div", "nf-fb-pop");
    const head = el("div", "nf-fb-head");
    const search = el("input", "nf-fb-search");
    search.type = "text";
    search.placeholder = "Filter files...";
    search.spellcheck = false;
    const seg = el("div", "nf-fb-seg");
    const btnS = el("button", "", "S");
    btnS.type = "button";
    btnS.title = "Small rows";
    const btnL = el("button", "", "L");
    btnL.type = "button";
    btnL.title = "Large rows";
    seg.append(btnS, btnL);
    head.append(search, seg);
    const list = el("div", "nf-fb-list");
    const preview = el("div", "nf-fb-prev");
    const foot = el("div", "nf-fb-foot");
    pop.append(head, list, preview, foot);
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
        closeBrowser = null;
    }
    function choose(value) {
        close();
        onChoose(value);
    }
    function onDown(e) {
        if (!pop.contains(e.target) && !anchor.contains(e.target)) close();
    }
    function onKey(e) {
        if (e.key === "Escape") close();
    }
    closeBrowser = close;
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);

    async function showPreview(file) {
        const token = ++previewToken;
        preview.replaceChildren();
        if (!file) {
            preview.append(el("div", "nf-fb-empty", "Hover a file to preview it"));
            return;
        }
        if (file.isImage) {
            const img = el("img");
            img.src = viewUrl(file);
            preview.append(img);
            return;
        }
        const pre = el("pre", "", "Loading...");
        preview.append(pre);
        const text = await readText(file);
        if (token === previewToken) pre.textContent = text;
    }

    function setActive(index, scroll) {
        [...list.children].forEach((row, i) => row.classList.toggle("active", i === index));
        if (scroll) list.children[index]?.scrollIntoView({ block: "nearest" });
        showPreview(shown[index]);
    }

    function renderList(scrollToCurrent = false) {
        const query = search.value.trim().toLowerCase();
        shown = files.filter((f) => !query || f.value.toLowerCase().includes(query));
        btnS.classList.toggle("on", view === "S");
        btnL.classList.toggle("on", view === "L");
        list.replaceChildren();
        if (!shown.length) {
            list.append(el("div", "nf-fb-empty", files.length ? "No matching files" : "No text or JSON files in input or output"));
        }
        shown.forEach((file) => {
            const row = el("div", `nf-fb-item${view === "S" ? " S" : ""}${file.value === currentValue ? " on" : ""}`);
            const col = el("div", "nf-fb-col");
            col.append(el("div", "nf-fb-name", file.name), el("div", "nf-fb-sub", file.folder));
            const badge = el("span", `nf-fb-badge${file.source === "output" ? " out" : ""}`, file.source === "output" ? "OUTPUT" : "INPUT");
            row.append(thumbEl(file), col, badge);
            row.addEventListener("click", () => choose(file.value));
            row.addEventListener("mouseenter", () => setActive(shown.indexOf(file), false));
            list.append(row);
        });
        foot.textContent = `${query ? `${shown.length} of ${files.length}` : files.length} files · ↑↓ move · Enter pick · Esc close`;
        const current = shown.findIndex((f) => f.value === currentValue);
        setActive(current, scrollToCurrent);
    }

    search.addEventListener("input", () => renderList());
    search.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const active = [...list.children].findIndex((row) => row.classList.contains("active"));
            const next = Math.max(0, Math.min(shown.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
            if (shown.length) setActive(next, true);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const active = [...list.children].findIndex((row) => row.classList.contains("active"));
            if (shown[active]) choose(shown[active].value);
        }
    });
    btnS.addEventListener("click", () => {
        view = "S";
        renderList(true);
    });
    btnL.addEventListener("click", () => {
        view = "L";
        renderList(true);
    });

    renderList(true);
    search.focus();
}

// The file box on the node. fileWidget is the hidden combo that stores the value.
// keysVisible() decides whether the Pick keys button shows.
// getComputed() returns null, or { linked, path } when file_path overrides the dropdown.
export function buildFileUi(node, { fileWidget, onPickKeys, keyCount, keysVisible, getComputed }) {
    ensureCss();
    const root = el("div", "nf-lf-root");

    const fileBtn = el("button", "nf-lf-file");
    fileBtn.type = "button";
    fileBtn.title = "Browse input and output files";
    const badge = el("span", "nf-fb-badge");
    const col = el("span", "nf-lf-col");
    const name = el("span", "nf-lf-name");
    const folder = el("span", "nf-lf-path");
    col.append(name, folder);
    fileBtn.append(badge, col, el("span", "nf-lf-chev", "▾"));

    const nav = el("div", "nf-lf-nav");
    const prevBtn = el("button", "nf-lf-iconbtn", "◀");
    prevBtn.type = "button";
    prevBtn.title = "Previous file";
    const nextBtn = el("button", "nf-lf-iconbtn", "▶");
    nextBtn.type = "button";
    nextBtn.title = "Next file";
    const idx = el("span", "nf-lf-idx");
    nav.append(prevBtn, idx, nextBtn);

    const pick = el("button", "nf-lf-pick");
    pick.type = "button";
    pick.title = "Choose JSON keys to split";
    root.append(fileBtn, nav, pick);

    const fileValues = () => fileWidget.options?.values ?? [];

    function refresh() {
        const values = fileValues();
        const computed = getComputed?.() ?? null;
        const current = computed ? computed.path : (fileWidget.value ?? "");
        const file = splitFile(current);
        badge.textContent = file.source === "output" ? "OUTPUT" : "INPUT";
        badge.classList.toggle("out", file.source === "output");
        if (computed?.linked) {
            name.textContent = "Connected input";
            folder.textContent = "Path comes from a linked node";
        } else {
            name.textContent = file.name || "Choose a file";
            folder.textContent = file.name ? file.folder : "Browse input and output";
        }
        const i = values.indexOf(fileWidget.value ?? "");
        idx.textContent = `${i + 1} / ${values.length}`;
        prevBtn.disabled = !!computed || i <= 0;
        nextBtn.disabled = !!computed || values.length === 0 || i >= values.length - 1;
        fileBtn.disabled = !!computed;
        fileBtn.classList.toggle("nf-lf-off", !!computed);
        nav.classList.toggle("nf-lf-off", !!computed);
        pick.textContent = `Pick keys (${keyCount()})`;
        // A typed file_path can be read, so only a linked path (unknown until run) blocks Pick keys.
        pick.disabled = !!computed?.linked;
        pick.title = computed?.linked ? "Pick keys needs a typed file_path, not a linked input" : "Choose keys to split";
        pick.style.display = keysVisible() ? "" : "none";
        fitNodeSize(node);
    }

    function setFile(value) {
        fileWidget.value = value;
        fileWidget.callback?.(value);
        refresh();
    }

    function step(delta) {
        const values = fileValues();
        const i = values.indexOf(fileWidget.value);
        const target = values[Math.max(0, Math.min(values.length - 1, i + delta))];
        if (target !== undefined && target !== fileWidget.value) setFile(target);
    }

    fileBtn.addEventListener("click", () => {
        openFileBrowser(fileBtn, fileValues().map(splitFile), fileWidget.value, setFile);
    });
    prevBtn.addEventListener("click", () => step(-1));
    nextBtn.addEventListener("click", () => step(1));
    pick.addEventListener("click", onPickKeys);

    return { root, refresh };
}
