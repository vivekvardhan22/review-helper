// Better Review Helper - background script.
// It sends requests from the page to your Cloudflare Worker.

// EDIT THESE TWO LINES (keep the quotes):
const API_URL = "";
const APP_TOKEN = "";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "ASK") return;

    fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-App-Token": APP_TOKEN },
            body: JSON.stringify(msg.payload),
        })
        .then(async(r) => {
            let data = {};
            try { data = await r.json(); } catch (e) { /* ignore */ }
            if (r.ok) sendResponse({ ok: true, data: data });
            else sendResponse({ ok: false, error: data.error || "Server error " + r.status });
        })
        .catch((e) => sendResponse({ ok: false, error: "Network problem: " + String(e) }));

    return true; // keeps the message channel open for the async answer
});