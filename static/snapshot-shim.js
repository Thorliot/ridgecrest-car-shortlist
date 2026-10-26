/* Full-site snapshot: answer the app's /api requests from the static files written by
   tools/snapshot_data.py, refuse changes (read-only), and keep the service worker off.
   Loaded before app.js; also sets window.RCF.api to wherever the snapshot is hosted. */
(() => {
  const BASE = location.href.replace(/[#?].*$/, "").replace(/\/[^/]*$/, "");
  const BASE_PATH = new URL(BASE).pathname.replace(/\/$/, "");
  // Build stamp from this script's ?v=, added to data requests so browsers don't mix in cached old snapshots.
  const V = new URL(document.currentScript.src).searchParams.get("v") || "";
  const versioned = (u) => (V ? `${u}${u.includes("?") ? "&" : "?"}v=${V}` : u);
  window.RCF = { api: BASE, snapshot: true };
  const realFetch = window.fetch.bind(window);
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
  const slug = (...parts) => parts.join(" ").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const file = async (path, missing = "Not included in this snapshot.") => {
    const r = await realFetch(versioned(`${BASE}/${path}`));
    return r.ok ? r : json({ error: missing }, 404);
  };

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (!url.href.startsWith(`${BASE}/api/`)) return realFetch(input, init);
    const method = (init.method || (typeof input === "string" ? "GET" : input.method) || "GET").toUpperCase();
    if (method !== "GET") return json({ error: "This is a read-only snapshot, so changes can't be saved." }, 403);
    const p = url.pathname.slice(BASE_PATH.length);
    const q = url.searchParams;
    if (p === "/api/auth/status") return json({ pin_set: true, unlocked: false });
    if (p === "/api/cars") return file("api/cars.json");
    if (p === "/api/dash-metrics") return file("api/dash-metrics.json");
    if (p === "/api/settings/plan") return file("api/settings-plan.json");
    if (p === "/api/gofundme") return file("api/gofundme.json");
    if (p === "/api/marketing") return file("api/marketing.json", "No marketing materials in this snapshot.");
    if (p === "/api/options") return file(`api/options/${q.get("car_id") || "default"}.json`);
    if (p === "/api/budget") {
      const r = await file(`api/budget/${q.get("car_id") || "default"}.json`);
      const n = parseInt(q.get("extra"), 10);
      if (!r.ok || !(n > 0)) return r;
      const d = await r.json();
      const w = await realFetch(versioned(`${BASE}/api/budget-whatif/${d.car_id}.json`));
      if (w.ok) for (const [i, col] of (await w.json())[n] || []) d.columns.splice(i, 0, col);
      return json(d);
    }
    if (p === "/api/model-stats") return file(`api/model-stats/${slug(q.get("year"), q.get("make"), q.get("model"))}.json`);
    if (p.startsWith("/api/vin/")) {
      return file(`api/vin/${decodeURIComponent(p.slice(9)).trim().toUpperCase()}.json`,
        "This snapshot only has VIN details for the cars on the shortlist.");
    }
    if (/^\/api\/cars\/\d+\/(plan|report)\//.test(p)) return realFetch(versioned(`${BASE}${p}`)); // PDFs; settings are baked in
    return json({ error: "Not included in this snapshot." }, 404);
  };

  // No offline mode for the snapshot: GitHub Pages serves it, and saving would cache someone else's copy.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = () => Promise.reject(new Error("Snapshot: service worker disabled"));
    try { Object.defineProperty(navigator.serviceWorker, "ready", { value: new Promise(() => {}) }); } catch {}
  }
})();
