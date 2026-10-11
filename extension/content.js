// Better Review Helper v2 - works on Amazon.in, Flipkart, Myntra, Meesho, Nykaa, Ajio.
// The script is loaded on every page of these sites, but it only shows its button on a
// PRODUCT page, and it only reads the page when you press that button.
//id = (#), class = (.)
(() => {
    if (window.__brhLoaded) return;
    window.__brhLoaded = true;

    const MAX_STEPS = 5; // AI questions after Q0 (Q0 = how long used)
    const RESULT_STYLE = "tabs"; // "tabs" = Paragraph / Bullet points tabs; "both" = show both together
    const DURATIONS = [
        "Received it, not used yet",
        "Less than a week",
        "1-4 weeks",
        "1-6 months",
        "More than 6 months",
    ];

    // ============================================================
    // 1. SITE SETTINGS  (one block per website - edit here when a site changes)
    //    isProduct : is this URL a product page?
    //    productId : the product code in the URL (only Amazon uses it for a review link)
    //    title/brand/desc : CSS selectors, tried in order, first one with text wins
    //    bullets/rows     : CSS selectors, every match is collected
    //    If a selector finds nothing, the generic readers in section 2 take over.
    // ============================================================
    const SITES = [{
            id: "amazon",
            name: "Amazon",
            host: "amazon.in",
            isProduct: (u) => /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/.test(u.pathname),
            productId: (u) => ((u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/) || [])[1] || ""),
            title: ["#titleSection", "#productTitle"],
            brand: ["#bylineInfo"],
            bullets: ["#pqv-feature-bullets", "#feature-bullets li"],
            desc: ["#poExpander", "#productDescription"],
            rows: [
                "#productDetails_techSpec_section_1 tr", "#productDetails_detailBullets_sections1 tr",
                "#detailBullets_feature_div li", "#poExpander tr",
            ],
            reviewUrl: (id) => "https://www.amazon.in/review/create-review?ie=UTF8&asin=" + id,
            postHint: "",
        },
        {
            id: "flipkart",
            name: "Flipkart",
            host: "flipkart.com",
            isProduct: (u) => /\/p\/itm[a-z0-9]+/i.test(u.pathname),
            productId: (u) => u.searchParams.get("pid") || ((u.pathname.match(/\/p\/(itm[a-z0-9]+)/i) || [])[1] || ""),
            title: ["h1"],
            brand: [],
            bullets: [],
            desc: [
                "[class*='_1psv1zegc']",
                "[class*='productDescription']",
                "[class*='description']",
                "[data-testid*='description']"
            ],
            rows: [],
            reviewUrl: null,
            postHint: "On Flipkart, open My Orders, choose this item and use Rate & Review Product. Paste your draft there.",
        },
        {
            id: "myntra",
            name: "Myntra",
            host: "myntra.com",
            isProduct: (u) => /\/\d+\/buy\/?$/.test(u.pathname),
            productId: (u) => ((u.pathname.match(/\/(\d+)\/buy/) || [])[1] || ""),
            title: [".pdp-name", "h1"],
            brand: [".pdp-title"],
            bullets: [],
            desc: [".pdp-productDescriptorsContainer", ".content-details"],
            rows: [],
            reviewUrl: null,
            postHint: "Myntra mostly takes reviews through its app: open Orders, choose this item and rate or review it. Paste your draft there.",
        },
        {
            id: "meesho",
            name: "Meesho",
            host: "meesho.com",
            isProduct: (u) => /\/p\/[a-z0-9]+\/?$/i.test(u.pathname),
            productId: (u) => ((u.pathname.match(/\/p\/([a-z0-9]+)/i) || [])[1] || ""),
            title: ["h1"],
            brand: [],
            bullets: [],
            //desc: [".sc-gIIpAQ.gpuKZH"],
            desc: ["[class*='efdQZj']"],
            //.StructuredProductDetailsstyled_AttributesContainer-sc-1w7azxu-0efdQZj
            rows: [],
            reviewUrl: null,
            postHint: "Meesho mostly takes reviews through its app: open My Orders, choose this item and rate it. Paste your draft there.",
        },
        {
            id: "nykaa",
            name: "Nykaa",
            host: "nykaa.com",
            isProduct: (u) => /\/p\/\d+/.test(u.pathname),
            productId: (u) => ((u.pathname.match(/\/p\/(\d+)/) || [])[1] || ""),
            title: ["h1"],
            brand: [],
            bullets: [],
            desc: ["#content-details"],
            rows: [],
            reviewUrl: null,
            postHint: "On Nykaa, find the Reviews section on this product (or your Orders page) and add your review. Paste your draft there.",
        },
        {
            id: "ajio",
            name: "Ajio",
            host: "ajio.com",
            isProduct: (u) => /\/p\/[a-z0-9_]+/i.test(u.pathname),
            productId: (u) => ((u.pathname.match(/\/p\/([a-z0-9_]+)/i) || [])[1] || ""),
            title: [".prod-name", "h1"],
            brand: [".brand-name"],
            bullets: [],
            desc: [".prod-desc"],
            rows: [],
            reviewUrl: null,
            postHint: "On Ajio, open My Account, then Orders, choose this item and rate or review it. Paste your draft there.",
        },
    ];

    const site = SITES.find((s) => location.hostname.endsWith(s.host));
    if (!site) return; // not one of our sites
    const here = () => new URL(location.href); // current address as a URL object

    // ============================================================
    // 2. READ THE PRODUCT FROM THE PAGE
    // ============================================================
    const textOf = (el) =>
        el ?
        (el.innerText || el.textContent || "")
        .replace(/[\u200e\u200f]/g, "")
        .replace(/\s+/g, " ")
        .trim() :
        "";

    const unique = (arr) => Array.from(new Set(arr));

    function pick(selectors) {
        for (const s of selectors || []) {
            let el = null;
            try { el = document.querySelector(s); } catch (e) { /* bad selector */ }
            const t = textOf(el);
            if (t) return t;
        }
        return "";
    }

    function collect(selectors) {
        const out = [];
        (selectors || []).forEach((s) => {
            let list = [];
            try { list = document.querySelectorAll(s); } catch (e) { /* bad selector */ }
            list.forEach((el) => { const t = textOf(el); if (t) out.push(t); });
        });
        return unique(out).join(" | ");
    }

    // Structured data (JSON-LD) that most shopping sites put in the page for Google.
    function findProduct(node, depth) {
        if (!node || depth > 5) return null;
        if (Array.isArray(node)) {
            for (const n of node) { const r = findProduct(n, depth + 1); if (r) return r; }
            return null;
        }
        if (typeof node === "object") {
            const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
            if (types.some((x) => String(x).toLowerCase() === "product")) return node;
            if (node["@graph"]) return findProduct(node["@graph"], depth + 1);
        }
        return null;
    }

    function jsonLdProduct() {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const s of Array.from(scripts)) {
            let data = null;
            try { data = JSON.parse(s.textContent); } catch (e) { continue; }
            const p = findProduct(data, 0);
            if (p) return p;
        }
        return null;
    }

    const meta = (sel) => {
        const el = document.querySelector(sel);
        return el ? (el.getAttribute("content") || "").replace(/\s+/g, " ").trim() : "";
    };

    // Last resort: find headings like "Product Details" and take the text next to them.
    const DETAIL_HEADS =
        /^(product details?|product description|description|specifications?|highlights?|key features?|about (this )?(item|product)|how to use|ingredients?|size (&|and) fit|material (&|and) care)$/i;

    function headingDetails() {
        const out = [];
        const els = document.querySelectorAll("h2, h3, h4, div, span, p, button");
        for (const el of Array.from(els)) {
            if (out.length >= 4) break;
            if (el.childElementCount > 1) continue; // only small, leaf-like elements can be headings
            const own = (el.textContent || "").trim();
            if (own.length > 30 || !DETAIL_HEADS.test(own)) continue;
            let box = el.parentElement;
            if (box && textOf(box).length < own.length + 40 && box.parentElement) box = box.parentElement;
            const t = textOf(box);
            if (t.length > own.length + 20) out.push(t.slice(0, 600));
        }
        return unique(out).join(" | ");
    }

    const SUFFIX = /\s*[-|:]\s*(Flipkart(\.com)?|Myntra|Nykaa|AJIO|Ajio|Meesho|Amazon\.in)\s*$/i;
    const tidy = (t) => (t || "").replace(SUFFIX, "").trim();

    function readProduct() {
        const ld = jsonLdProduct();
        const src = {};

        let title = pick(site.title);
        if (title) src.title = "site selector";
        if (!title && ld && ld.name) {
            title = String(ld.name);
            src.title = "page data (JSON-LD)";
        }
        if (!title) { title = meta('meta[property="og:title"]'); if (title) src.title = "og:title tag"; }
        if (!title) { title = textOf(document.querySelector("h1")); if (title) src.title = "first h1 heading"; }
        if (!title) {
            title = document.title;
            src.title = "page title";
        }
        title = tidy(title);

        let brand = pick(site.brand);
        if (brand) src.brand = "site selector";
        if (!brand && ld && ld.brand) {
            brand = typeof ld.brand === "string" ? ld.brand : ld.brand.name || "";
            if (brand) src.brand = "page data (JSON-LD)";
        }

        const parts = [collect(site.bullets), pick(site.desc), collect(site.rows)].filter(Boolean);
        let details = parts.join(" || ");
        src.details = parts.length ? "site selectors" : "none yet";

        if (details.length < 200) {
            const extra = [];
            if (ld) {
                if (ld.description) extra.push(String(ld.description).replace(/\s+/g, " ").trim());
                ["category", "color", "material"].forEach((k) => {
                    if (ld[k] && typeof ld[k] === "string") extra.push(k + ": " + ld[k]);
                });
            }
            const md = meta('meta[property="og:description"]') || meta('meta[name="description"]');
            if (md) extra.push(md);
            const hd = headingDetails();
            if (hd) extra.push(hd);
            if (extra.length) {
                details = [details].concat(unique(extra)).filter(Boolean).join(" || ");
                src.details += (parts.length ? " + " : "") + "page data / meta tags / headings";
            }
        }

        return {
            title: title.slice(0, 300),
            brand: String(brand || "").slice(0, 100),
            details: details.slice(0, 3500),
            site: site.name,
            id: site.productId(here()),
            sources: src,
        };
    }

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Shopping sites draw their pages with JavaScript, so wait a little if the page looks empty.
    async function readProductPatiently() {
        let p = readProduct();
        for (let i = 0; i < 3 && (p.sources.title === "page title" || p.details.length < 40); i++) {
            await sleep(600);
            p = readProduct();
        }
        return p;
    }

    const apiProduct = (p) => ({ title: p.title, brand: p.brand, details: p.details, site: p.site });

    // ============================================================
    // 3. TALK TO THE BACKEND (through background.js)
    // ============================================================
    function callApi(payload) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "ASK", payload: payload }, (res) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (!res || !res.ok) return reject(new Error((res && res.error) || "No response"));
                resolve(res.data);
            });
        });
    }

    // ============================================================
    // 4. THE PANEL (inside a shadow root so the site's CSS cannot touch it)
    // ============================================================
    const h = (tag, attrs, ...kids) => {
        const el = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k === "class") el.className = v;
            else if (k.indexOf("on") === 0) el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v);
        });
        kids.flat(Infinity).forEach((c) => el.append(c));
        return el;
    };

    const CSS = `
    * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
    [hidden] { display: none !important; }
    #fab { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; background: #232f3e;
      color: #fff; border: 0; border-radius: 24px; padding: 12px 18px; font-size: 14px;
      cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
    #panel { position: fixed; right: 20px; bottom: 74px; width: 340px; max-height: 80vh;
      overflow: auto; background: #fff; color: #111; border: 1px solid #bbb; border-radius: 12px;
      z-index: 2147483647; box-shadow: 0 4px 16px rgba(0,0,0,.3); }
    .top { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px;
      background: #232f3e; color: #fff; border-radius: 12px 12px 0 0; font-size: 14px; }
    .x { background: none; border: 0; color: #fff; font-size: 18px; cursor: pointer; }
    .body { padding: 14px; font-size: 14px; line-height: 1.4; }
    .muted { color: #555; font-size: 12px; margin: 0 0 8px; }
    h3 { font-size: 15px; margin: 6px 0 10px; }
    .chip { display: block; width: 100%; text-align: left; margin: 0 0 6px; padding: 9px 10px;
      border: 1px solid #aaa; border-radius: 8px; background: #fff; color: #111; font-size: 14px;
      cursor: pointer; }
    .chip.on { background: #e7f3ff; border-color: #0b6bcb; }
    .btn { display: inline-block; padding: 9px 14px; margin: 8px 6px 0 0; border: 0; border-radius: 8px;
      background: #ffd814; color: #111; font-size: 14px; cursor: pointer; text-decoration: none; }
    .btn.second { background: #eee; }
    .tabs { display: flex; gap: 6px; margin: 4px 0 8px; }
    .tab { padding: 6px 10px; border: 1px solid #aaa; border-radius: 16px; background: #fff;
      font-size: 12px; cursor: pointer; }
    .tab.on { background: #232f3e; color: #fff; border-color: #232f3e; }
    .link { background: none; border: 0; color: #0b6bcb; text-decoration: underline; font-size: 12px;
      padding: 0; cursor: pointer; margin-top: 4px; }
    .readbox { white-space: pre-wrap; font-size: 11px; background: #f4f4f4; padding: 8px;
      border-radius: 6px; margin-top: 6px; color: #333; }
    textarea { width: 100%; border: 1px solid #aaa; border-radius: 8px; padding: 8px; font-size: 14px; }
    .note { font-size: 11px; color: #666; margin-top: 12px; }
    .err { color: #b00020; }
  `;

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    try {
        // Constructed stylesheets are not blocked by a site's security policy (CSP).
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        root.adoptedStyleSheets = [sheet];
    } catch (e) {
        const style = document.createElement("style");
        style.textContent = CSS;
        root.appendChild(style);
    }

    const fab = h("button", { id: "fab", type: "button" }, "Write a better review");
    const panel = h("div", { id: "panel" });
    panel.hidden = true;
    fab.hidden = true;
    root.append(fab, panel);

    let product = null;
    let duration = "";
    let qa = [];
    let step = 0;
    let run = 0; // changes whenever a new flow starts, so old answers from the AI are ignored

    function show(...nodes) {
        const close = h("button", { class: "x", type: "button", onclick: () => { panel.hidden = true; } }, "X");
        const top = h("div", { class: "top" }, h("span", {}, "Better Review Helper"), close);
        const note = h("div", { class: "note" },
            "Your answers are sent to an AI service to write the draft. Nothing is posted for you.");
        panel.replaceChildren(top, h("div", { class: "body" }, nodes, note));
    }

    function waiting(msg) {
        show(h("p", { class: "muted" }, msg));
    }

    function showError(e, retry) {
        show(
            h("p", { class: "err" }, "Something went wrong: " + (e && e.message ? e.message : String(e))),
            h("button", { class: "btn", type: "button", onclick: retry }, "Try again")
        );
    }

    // ============================================================
    // 5. THE FLOW: Q0 -> 5 AI questions -> review
    // ============================================================
    async function start() {
        run += 1;
        const my = run;
        qa = [];
        step = 0;
        duration = "";
        panel.hidden = false;
        waiting("Reading this page...");
        const p = await readProductPatiently();
        if (my !== run) return;
        product = p;

        const chips = DURATIONS.map((d) =>
            h("button", {
                class: "chip",
                type: "button",
                onclick: () => {
                    duration = d;
                    nextQuestion();
                }
            }, d)
        );
        const info = h("div", { class: "readbox" },
            "Site: " + product.site +
            "\nTitle: " + product.title + "  [" + product.sources.title + "]" +
            "\nBrand: " + (product.brand || "(none found)") + (product.sources.brand ? "  [" + product.sources.brand + "]" : "") +
            "\nDetails: " + product.details.length + " characters  [" + product.sources.details + "]" +
            "\n" + product.details.slice(0, 300));
        info.hidden = true;
        const toggle = h("button", {
            class: "link",
            type: "button",
            onclick: () => { info.hidden = !info.hidden; }
        }, "What did the tool read from this page?");

        show(
            h("p", { class: "muted" }, product.title.slice(0, 90)),
            h("h3", {}, "How long have you been using this product?"),
            chips,
            toggle,
            info
        );
    }

    async function nextQuestion() {
        const my = run;
        step += 1;
        waiting("Thinking of your next question...");
        try {
            const q = await callApi({
                mode: "question",
                step: step,
                product: apiProduct(product),
                duration: duration,
                qa: qa,
            });
            if (my !== run) return;
            showQuestion(q);
        } catch (e) {
            if (my !== run) return;
            showError(e, () => {
                step -= 1;
                nextQuestion();
            });
        }
    }

    function showQuestion(q) {
        const isLast = step === MAX_STEPS;
        const picked = new Set();
        const chips = q.options.map((o) => {
            const b = h("button", { class: "chip", type: "button" }, o);
            b.addEventListener("click", () => {
                if (picked.has(o)) {
                    picked.delete(o);
                    b.classList.remove("on");
                } else {
                    if (!q.multi) {
                        picked.clear();
                        chips.forEach((c) => c.classList.remove("on"));
                    }
                    picked.add(o);
                    b.classList.add("on");
                }
            });
            return b;
        });
        const box = isLast ?
            h("textarea", { rows: "3", placeholder: "Anything else? Say it in your own words (optional)" }) :
            null;

        const finish = (skip) => {
            let a = "(skipped)";
            if (!skip) {
                const own = box ? box.value.trim().slice(0, 600) : "";
                const joined = [Array.from(picked).join("; "), own ? "Own words: " + own : ""]
                    .filter(Boolean).join(" | ");
                if (joined) a = joined;
            }
            qa.push({ q: q.question, a: a });
            if (isLast) makeReview();
            else nextQuestion();
        };

        show(
            h("p", { class: "muted" }, "Question " + step + " of " + MAX_STEPS +
                (q.multi ? " (you can pick more than one)" : "")),
            h("h3", {}, q.question),
            chips,
            box || "",
            h("button", { class: "btn", type: "button", onclick: () => finish(false) },
                isLast ? "Make my review" : "Next"),
            h("button", { class: "btn second", type: "button", onclick: () => finish(true) }, "Skip")
        );
    }

    async function makeReview() {
        const my = run;
        waiting("Writing your review draft...");
        try {
            const r = await callApi({
                mode: "summary",
                product: apiProduct(product),
                duration: duration,
                qa: qa,
            });
            if (my !== run) return;
            showResult(r);
        } catch (e) {
            if (my !== run) return;
            showError(e, makeReview);
        }
    }

    function showResult(r) {
        const head = r.headline || "";
        const para = r.summary || "";
        const pts = Array.isArray(r.points) ? r.points : [];
        const bullets = pts.map((p) => "- " + p);
        const tidyText = (lines) => lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
        const both = tidyText([head, "", para, ""].concat(bullets));

        // Each view = [tab name, text]. Two tabs when we have both a paragraph and bullets.
        let views;
        if (RESULT_STYLE === "tabs" && para && pts.length) {
            views = [
                ["Paragraph", tidyText([head, "", para])],
                ["Bullet points", tidyText([head, ""].concat(bullets))],
            ];
        } else {
            views = [
                ["Review", both]
            ];
        }

        const edits = {};
        let current = 0;
        const ta = h("textarea", { rows: "10" });
        ta.value = views[0][1];

        const tabEls = views.map((v, i) => {
            const t = h("button", { class: "tab" + (i === 0 ? " on" : ""), type: "button" }, v[0]);
            t.addEventListener("click", () => {
                edits[current] = ta.value; // keep what the buyer already edited
                current = i;
                ta.value = edits[i] !== undefined ? edits[i] : views[i][1];
                tabEls.forEach((x, j) => x.classList.toggle("on", j === i));
            });
            return t;
        });

        const copied = h("span", { class: "muted" }, "");
        const copy = h("button", {
            class: "btn",
            type: "button",
            onclick: async() => {
                try { await navigator.clipboard.writeText(ta.value); } catch (e) {
                    ta.select();
                    document.execCommand("copy");
                }
                copied.textContent = "Copied. Now paste it in the review box.";
            },
        }, "Copy review");

        let where;
        if (site.reviewUrl && product.id) {
            where = h("a", { class: "btn second", href: site.reviewUrl(product.id), target: "_blank", rel: "noopener" },
                "Open " + site.name + " review page");
        } else {
            where = h("p", { class: "muted" }, site.postHint);
        }

        show(
            h("h3", {}, "Your review draft"),
            h("p", { class: "muted" }, "Edit anything you like before posting. You choose the star rating."),
            tabEls.length > 1 ? h("div", { class: "tabs" }, tabEls) : "",
            ta, copy, where, h("div", {}, copied),
            h("button", { class: "btn second", type: "button", onclick: start }, "Start over")
        );
    }

    // ============================================================
    // 6. SHOW / HIDE THE BUTTON (shopping sites change pages without reloading)
    // ============================================================
    let lastKey = location.origin + location.pathname;

    function refresh() {
        if (!host.isConnected && document.body) document.body.appendChild(host);
        const key = location.origin + location.pathname;
        if (key !== lastKey) { // moved to another page: forget the old flow
            lastKey = key;
            run += 1;
            panel.hidden = true;
        }
        const onProduct = site.isProduct(here());
        fab.hidden = !onProduct;
        if (!onProduct) panel.hidden = true;
    }

    fab.addEventListener("click", start);
    refresh();
    setInterval(refresh, 700);
})();