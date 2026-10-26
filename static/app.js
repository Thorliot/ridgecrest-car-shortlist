const ZIP = "93555";
// Set by the WordPress plugin; absent when the app is served by itself on :8095.
const CFG = window.RCF || {};
const API = (CFG.api || "").replace(/\/$/, "");
const abs = (u) => (u && u.startsWith("/") ? API + u : u);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = (n) => (isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "–");
const money2 = (n) => (isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : "–");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slug = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------------- Bootstrap helpers ---------------- */
function toast(message, variant = "success") {
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${variant} border-0`;
  el.setAttribute("role", "status");
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(message)}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
  $("#toasts").append(el);
  el.addEventListener("hidden.bs.toast", () => el.remove());
  bootstrap.Toast.getOrCreateInstance(el, { delay: 4000 }).show();
}

const confirmModal = new bootstrap.Modal("#confirm-modal");
function confirmBox(text) {
  return new Promise((resolve) => {
    $("#confirm-text").textContent = text;
    let ok = false;
    $("#confirm-ok").onclick = () => { ok = true; confirmModal.hide(); };
    $("#confirm-modal").addEventListener("hidden.bs.modal", () => resolve(ok), { once: true });
    confirmModal.show();
  });
}

/* ---------------- Tabs (Bootstrap tab component) ---------------- */
$$("#tabs [data-bs-toggle=tab]").forEach((b) =>
  b.addEventListener("shown.bs.tab", () => { try { localStorage.setItem("tab", b.dataset.tab); } catch {} })
);
function showTab(name) {
  const btn = $(`#tabs [data-tab="${name}"]`);
  if (btn) return bootstrap.Tab.getOrCreateInstance(btn).show();
  // Embedded in WordPress there's no tab bar: show the pane directly.
  for (const p of $$(".tab-content > .tab-pane")) {
    const on = p.id === `tab-${name}`;
    p.classList.toggle("active", on);
    p.classList.toggle("show", on);
  }
}
// Go to another part of the app: its own WordPress page when embedded, otherwise switch tabs.
// `params` travel in the URL hash, e.g. {vin: "..."} so the VIN page looks it up on arrival.
function goTab(name, params = {}) {
  const page = CFG.pages?.[name];
  if (page && CFG.tab !== name) {
    const hash = new URLSearchParams(params).toString();
    location.href = page + (hash ? "#" + hash : "");
    return true;
  }
  showTab(name);
  return false;
}
if (CFG.tab) showTab(CFG.tab);
else if (/^#[a-z]+$/.test(location.hash) && $(`#tabs [data-tab="${location.hash.slice(1)}"]`)) showTab(location.hash.slice(1)); // app shortcuts
else try { const t = localStorage.getItem("tab"); if (t && $(`#tabs [data-tab="${t}"]`)) showTab(t); } catch {}

/* ---------------- Listing sources ---------------- */
// [label, url pattern, Bootstrap icon, badge color]
const SOURCES = [
  ["Facebook Marketplace", /facebook\.com|fb\.com/, "fa-brands fa-facebook", "fb"],
  ["AutosToday", /autostoday\.com/, "fa-solid fa-earth-americas", "info"],
  ["Craigslist", /craigslist\.org/, "fa-solid fa-list-ul", "secondary"],
  ["OfferUp", /offerup\.com/, "fa-solid fa-tag", "success"],
  ["Cars.com", /cars\.com/, "fa-solid fa-car-side", "dark"],
  ["Autotrader", /autotrader\.com/, "fa-solid fa-car-side", "dark"],
  ["CarGurus", /cargurus\.com/, "fa-solid fa-car-side", "dark"],
  ["eBay Motors", /ebay\.com/, "fa-solid fa-bag-shopping", "warning"],
  ["CarMax", /carmax\.com/, "fa-solid fa-shop", "warning"],
  ["Carvana", /carvana\.com/, "fa-solid fa-truck-pickup", "warning"],
  ["Dealer website", /americandreamautosales\.com|toyotaofridgecrest|charlon/, "fa-solid fa-store", "success"],
  ["Dealer lot (in person)", null, "fa-solid fa-location-dot", "success"],
  ["Word of mouth", null, "fa-solid fa-people-group", "secondary"],
  ["Other", null, "fa-solid fa-circle-question", "secondary"],
];
const sourceInfo = (label) => SOURCES.find(([l]) => l === label) || [label, null, "fa-solid fa-link", "secondary"];
function detectSource(url) {
  if (!url) return null;
  const hit = SOURCES.find(([, re]) => re && re.test(url));
  if (hit) return hit[0];
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Other"; }
}
// Manual choice wins; otherwise it's worked out from the listing link.
const carSource = (c) => c.source || detectSource(c.url) || "Manual entry";
function sourceBadge(c, extra = "") {
  const label = carSource(c);
  const [, , icon, color] = sourceInfo(label);
  const auto = !c.source && c.url ? " (detected from the listing link)" : "";
  return `<span class="badge text-bg-${color} ${extra}" title="Source: ${esc(label)}${auto}"><i class="${icon} me-1"></i>${esc(label)}</span>`;
}
$("#car-source").innerHTML = `<option value="">Auto-detect from link</option>` +
  SOURCES.map(([l]) => `<option value="${esc(l)}">${esc(l)}</option>`).join("");

/* ---------------- Search link builder ---------------- */
function buildLinks(q) {
  const make = q.make?.trim() || "";
  const model = q.model?.trim() || "";
  const mm = [make, model].filter(Boolean).join(" ");
  const r = q.radius || 100;
  const cond = q.condition;
  const P = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "" && v != null)).toString();

  const carsCom = new URLSearchParams();
  carsCom.set("stock_type", cond === "all" ? "all" : cond);
  if (make) carsCom.append("makes[]", slug(make));
  if (make && model) carsCom.append("models[]", `${slug(make)}-${slug(model)}`);
  if (q.maxPrice) carsCom.set("list_price_max", q.maxPrice);
  if (q.maxMiles) carsCom.set("mileage_max", q.maxMiles);
  if (q.minYear) carsCom.set("year_min", q.minYear);
  carsCom.set("maximum_distance", r);
  carsCom.set("zip", ZIP);

  const atPath = [cond === "new" ? "new-cars" : cond === "used" ? "used-cars" : "all-cars", make && slug(make), make && model && slug(model), "ridgecrest-ca"]
    .filter(Boolean).join("/");

  const cl = () =>
    `https://www.craigslist.org/search/city/ridgecrest-ca?` +
    P({ cat: "cta", query: mm, max_price: q.maxPrice, min_auto_year: q.minYear, max_auto_miles: q.maxMiles, postal: ZIP, radius: r });

  return [
    {
      group: "Big marketplaces", icon: "fa-solid fa-globe",
      items: [
        { name: "Cars.com", url: `https://www.cars.com/shopping/results/?${carsCom}`, note: "Dealer + some private; good filters" },
        { name: "Autotrader", url: `https://www.autotrader.com/cars-for-sale/${atPath}?` + P({ zip: ZIP, searchRadius: r, maxPrice: q.maxPrice, startYear: q.minYear }), note: "Large dealer inventory" },
        { name: "CarGurus", url: `https://www.cargurus.com/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?` + P({ zip: ZIP, distance: r, maxPrice: q.maxPrice, startYear: q.minYear, maxMileage: q.maxMiles }), note: "Shows deal ratings vs. market — pick make/model on site" },
        { name: "eBay Motors", url: `https://www.ebay.com/sch/Cars-Trucks/6001/i.html?` + P({ _nkw: mm || "car", _stpos: ZIP, _sadis: r }), note: "Local pickup + auctions" },
      ],
    },
    {
      group: "Private sellers", icon: "fa-solid fa-user",
      items: [
        { name: "Facebook Marketplace", url: `https://www.facebook.com/marketplace/ridgecrest/vehicles?` + P({ query: mm, maxPrice: q.maxPrice, minYear: q.minYear, maxMileage: q.maxMiles, exact: "false" }), note: "Most active private market in Ridgecrest" },
        { name: "Craigslist", url: cl(), note: "All Craigslist regions within your radius of Ridgecrest" },
        { name: "OfferUp", url: `https://offerup.com/search?` + P({ q: mm || "car", price_max: q.maxPrice }), note: "Set location to Ridgecrest on the site" },
      ],
    },
    {
      group: "No-haggle & local dealers", icon: "fa-solid fa-shop",
      items: [
        { name: "CarMax", url: `https://www.carmax.com/cars${make ? "/" + slug(make) : ""}${make && model ? "/" + slug(model) : ""}?` + P({ zip: ZIP }), note: "Nearest stores: Bakersfield, Palmdale" },
        { name: "Carvana", url: `https://www.carvana.com/cars${make ? "/" + slug(make) + (model ? "-" + slug(model) : "") : ""}`, note: "Delivers; 7-day return" },
        { name: "Toyota of Ridgecrest (used)", url: `https://www.google.com/search?q=${encodeURIComponent("Toyota of Ridgecrest used inventory " + mm)}`, note: "Local — easiest to test drive" },
        { name: "Jim Charlon Ford (used)", url: `https://www.google.com/search?q=${encodeURIComponent("Jim Charlon Ford Ridgecrest used inventory " + mm)}`, note: "Local — easiest to test drive" },
      ],
    },
    {
      group: "Price research first", icon: "fa-solid fa-chart-line",
      items: [
        { name: "Kelley Blue Book", url: make && model ? `https://www.kbb.com/${slug(make)}/${slug(model)}/` : "https://www.kbb.com/whats-my-car-worth/", note: "Fair purchase price by ZIP" },
        { name: "Edmunds", url: make && model ? `https://www.edmunds.com/${slug(make)}/${slug(model)}/` : "https://www.edmunds.com/appraisal/", note: "True market value + reviews" },
        { name: "Consumer Reports reliability", url: `https://www.google.com/search?q=${encodeURIComponent((mm || "used car") + " reliability by year consumer reports")}`, note: "Which years to avoid" },
        { name: "Owner forums / problems", url: `https://www.google.com/search?q=${encodeURIComponent((mm || "used car") + " common problems by year")}`, note: "Known failure points" },
      ],
    },
  ];
}

function summarize(q) {
  const parts = [];
  const mm = [q.make, q.model].map((x) => x?.trim()).filter(Boolean).join(" ");
  parts.push(mm || "Any make & model");
  parts.push(q.condition === "all" ? "new or used" : q.condition);
  if (q.minYear) parts.push(`${q.minYear} or newer`);
  if (q.maxPrice) parts.push(`under ${money(+q.maxPrice)}`);
  if (q.maxMiles) parts.push(`under ${(+q.maxMiles).toLocaleString()} mi`);
  parts.push(`within ${q.radius} mi of Ridgecrest`);
  return parts.map(esc).join(" · ");
}

function renderSearch(q, flash = false) {
  $("#search-summary").innerHTML = `<i class="fa-solid fa-filter me-1"></i><b>Searching for:</b> ${summarize(q)}
    <span class="text-body-secondary"> — click any site below to open its results in a new tab.</span>`;
  $("#search-results").innerHTML = buildLinks(q)
    .map((g) => `<div class="col"><div class="card shadow-sm h-100">
      <div class="card-header fw-semibold"><i class="${g.icon} me-1"></i>${esc(g.group)}</div>
      <div class="list-group list-group-flush">${g.items
        .map((i) => `<a class="list-group-item list-group-item-action" href="${esc(i.url)}" target="_blank" rel="noopener">
          <div class="fw-semibold text-primary">${esc(i.name)} <i class="fa-solid fa-arrow-up-right-from-square small"></i></div>
          <div class="small text-body-secondary">${esc(i.note)}</div></a>`)
        .join("")}</div></div></div>`)
    .join("");
  if (flash) {
    const el = $("#search-summary");
    el.classList.remove("summary-flash"); void el.offsetWidth; el.classList.add("summary-flash");
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function runSearch(flash) {
  const q = Object.fromEntries(new FormData($("#search-form")));
  try { localStorage.setItem("search", JSON.stringify(q)); } catch {}
  renderSearch(q, flash);
}
$("#search-form").addEventListener("submit", (e) => { e.preventDefault(); runSearch(true); });
$("#search-form").addEventListener("input", () => runSearch(false));
$("#search-clear").addEventListener("click", () => { $("#search-form").reset(); runSearch(false); });
(function restoreSearch() {
  let q = {};
  try { q = JSON.parse(localStorage.getItem("search") || "{}"); } catch {}
  for (const [k, v] of Object.entries(q)) { const el = $(`#search-form [name="${k}"]`); if (el) el.value = v; }
  renderSearch(Object.fromEntries(new FormData($("#search-form"))));
})();

const DEALERS = [
  { name: "Toyota of Ridgecrest", addr: "321 N China Lake Blvd, Ridgecrest", kind: "New Toyota + used" },
  { name: "Jim Charlon Ford", addr: "269 S China Lake Blvd, Ridgecrest", kind: "New Ford + used" },
  { name: "American Dream Auto Sales", addr: "239 E Ridgecrest Blvd, Ridgecrest", kind: "Independent used lot" },
  { name: "All used car lots in Ridgecrest", addr: "used car dealers Ridgecrest CA", kind: "Map search", search: true },
  { name: "Bakersfield dealers", addr: "car dealerships Bakersfield CA", kind: "~2 hrs west via CA-178", search: true },
  { name: "Lancaster / Palmdale dealers", addr: "car dealerships Lancaster CA", kind: "~1.5 hrs south via CA-14", search: true },
  { name: "Victorville dealers", addr: "car dealerships Victorville CA", kind: "~1.5 hrs southeast via US-395", search: true },
];
$("#dealers").innerHTML = DEALERS.map(
  (d) => `<div class="col"><a class="card h-100 text-decoration-none" href="https://www.google.com/maps/search/${encodeURIComponent(d.search ? d.addr : d.name + " " + d.addr)}" target="_blank" rel="noopener">
    <div class="card-body py-2">
      <div class="fw-semibold"><i class="${d.search ? "fa-solid fa-map-location-dot" : "fa-solid fa-location-dot"} me-1 text-primary"></i>${esc(d.name)}</div>
      ${d.search ? "" : `<div class="small text-body-secondary">${esc(d.addr)}</div>`}
      <span class="badge bg-primary-subtle text-primary-emphasis">${esc(d.kind)}</span>
    </div></a></div>`
).join("");

/* ---------------- Shortlist ---------------- */
const STATUSES = [
  ["interested", "Interested", "secondary"], ["contacted", "Contacted seller", "info"], ["test-driven", "Test driven", "info"],
  ["inspected", "Inspected", "primary"], ["negotiating", "Negotiating", "warning"], ["bought", "Bought 🎉", "success"], ["passed", "Passed", "dark"],
  ["sold", "Sold (gone)", "dark"],
];
const CHECKS = [
  ["price_research", "Checked KBB/Edmunds fair price"],
  ["vin_decoded", "VIN decoded & matches listing"],
  ["recalls", "Recalls checked / completed"],
  ["history", "History report (Carfax/AutoCheck/NMVTIS)"],
  ["title_clean", "Clean title in seller's name (no salvage)"],
  ["smog", "Valid smog cert (< 90 days) from seller"],
  ["test_drive", "Test drive incl. highway (US-395) & hills"],
  ["ac", "A/C blows cold after 15+ min"],
  ["cooling", "No overheating; coolant clean"],
  ["tires", "Tires: tread + no dry-rot cracks; check DOT date"],
  ["ppi", "Pre-purchase inspection by independent mechanic"],
  ["out_the_door", "Got written out-the-door price"],
];
const statusLabel = Object.fromEntries(STATUSES.map(([v, l]) => [v, l]));
const statusColor = Object.fromEntries(STATUSES.map(([v, , c]) => [v, c]));
$('#car-form [name="status"]').innerHTML = STATUSES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
$("#filter-status").innerHTML += STATUSES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
// "Available only" (the default) hides cars you passed on and ones that sold to someone else.
const GONE = ["passed", "sold"];
try { const f = localStorage.getItem("statusFilter"); if (f !== null && $(`#filter-status option[value="${f}"]`)) $("#filter-status").value = f; } catch {}

let cars = [];
const selected = new Set();

// Saving needs the Car Finder server; reading works offline from the service worker's saved copies.
function requireOnline() {
  if (!navigator.onLine) throw new Error("You're offline — reconnect to save changes.");
}

/* ---------------- Edit PIN ----------------
   The server rejects every change without a token from /api/auth/unlock; this only asks for the PIN
   and remembers the token (it expires on the server after 12 hours). */
const TOKEN_KEY = "rcfEditToken";
let editToken = null;
try { editToken = localStorage.getItem(TOKEN_KEY); } catch {}
function setEditToken(t) {
  editToken = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
  const b = $("#edit-lock");
  if (b) {
    b.querySelector("i").className = `${t ? "fa-solid fa-lock-open" : "fa-solid fa-lock"} me-1`;
    b.querySelector("span").textContent = t ? "Editing unlocked" : "Locked";
    b.title = t ? "Lock editing on this device" : "Enter the PIN to edit";
  }
}
setEditToken(editToken);
// A remembered token may have expired or been revoked by a PIN change; ask the server.
if (editToken && navigator.onLine) {
  fetch(API + "/api/auth/status", { headers: { "X-RCF-Token": editToken }, cache: "no-store" })
    .then((r) => r.json()).then((st) => { if (st.pin_set !== undefined && !st.unlocked) setEditToken(null); }).catch(() => {});
}

const pinModal = new bootstrap.Modal("#pin-modal");
let pinPrompt = null;
// Resolves true once unlocked, false if cancelled. Concurrent callers share one prompt.
function askPin() {
  pinPrompt ??= new Promise((resolve) => {
    let ok = false;
    $("#pin-input").value = "";
    $("#pin-error").textContent = "";
    $("#pin-form").onsubmit = async (e) => {
      e.preventDefault();
      $("#pin-ok").disabled = true;
      try {
        requireOnline();
        const res = await fetch(API + "/api/auth/unlock", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: $("#pin-input").value }) });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(r.error || res.statusText);
        setEditToken(r.token);
        ok = true;
        pinModal.hide();
      } catch (err) {
        $("#pin-error").textContent = err.message;
        $("#pin-input").select();
      } finally { $("#pin-ok").disabled = false; }
    };
    $("#pin-modal").addEventListener("shown.bs.modal", () => $("#pin-input").focus(), { once: true });
    $("#pin-modal").addEventListener("hidden.bs.modal", () => { pinPrompt = null; resolve(ok); }, { once: true });
    pinModal.show();
  });
  return pinPrompt;
}

// fetch() for changes: sends the token, and on "PIN required" asks for it and tries once more.
async function authFetch(url, opts = {}) {
  requireOnline();
  const send = () => fetch(url, { ...opts, headers: { ...(opts.headers || {}), ...(editToken ? { "X-RCF-Token": editToken } : {}) } });
  let res = await send();
  if (res.status === 401) {
    setEditToken(null);
    if (!(await askPin())) throw new Error("Not saved — editing is locked.");
    res = await send();
  }
  return res;
}

$("#edit-lock").addEventListener("click", () => {
  if (editToken) { setEditToken(null); toast("Editing locked on this device.", "secondary"); }
  else askPin().then((ok) => ok && toast("Editing unlocked for 12 hours on this device."));
});

async function api(path, opts = {}) {
  const writing = opts.method && opts.method !== "GET";
  const init = { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } };
  const res = writing ? await authFetch(API + path, init) : await fetch(API + path, init);
  if (writing && res.ok) markOfflineStale();
  setOffline(Boolean(res.headers.get("X-RCF-Offline")) || !navigator.onLine); // saved copy vs. fresh data
  if (!res.ok && res.status !== 204) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.status === 204 ? null : res.json();
}

const REL_LABELS = ["Unknown", "Poor", "Below average", "Average", "Good", "Excellent"];
const REL_COLORS = ["secondary", "danger", "danger", "warning", "success", "success"];
const relDots = (n) => "●".repeat(n) + "○".repeat(5 - n);
const lines = (t) => (t || "").split("\n").map((x) => x.trim()).filter(Boolean);

// NHTSA recall/complaint counts per year/make/model, fetched once per page load.
const statsCache = {};
function modelStats(c) {
  if (!(c.year && c.make && c.model)) return Promise.resolve(null);
  const key = `${c.year}|${c.make}|${c.model}`.toLowerCase();
  statsCache[key] ??= api(`/api/model-stats?${new URLSearchParams({ make: c.make, model: c.model, year: c.year })}`).catch((e) => ({ error: e.message }));
  return statsCache[key];
}
function statsLine(st) {
  if (!st) return "";
  if (st.error) return `<span class="text-warning-emphasis">NHTSA data unavailable</span>`;
  return `${st.recalls} recall${st.recalls === 1 ? "" : "s"} · ${st.complaints.toLocaleString()} owner complaint${st.complaints === 1 ? "" : "s"}`;
}
function fillStats() {
  for (const el of $$("[data-stats]")) {
    const c = cars.find((x) => x.id == el.dataset.stats);
    modelStats(c).then((st) => { el.innerHTML = statsLine(st); });
  }
}

// DoorDash profit per car at each weekly delivery tier (from the Car Plan settings).
let dash = { tiers: [], cars: {} };
async function loadDash() {
  try { dash = await api("/api/dash-metrics"); } catch { dash = { tiers: [], cars: {} }; }
}

async function loadCars() {
  [cars] = await Promise.all([api("/api/cars"), loadDash()]);
  for (const c of cars) c.images = (c.images || []).map(abs);
  const sources = [...new Set(cars.map(carSource))].sort();
  const cur = $("#filter-source").value;
  $("#filter-source").innerHTML = `<option value="">All sources</option>` +
    sources.map((s) => `<option ${s === cur ? "selected" : ""}>${esc(s)}</option>`).join("");
  renderCars();
  renderHome();
  renderBudget();
  renderGoFundMe();
  renderMarketing();
  renderNotebook();
  if (!loadCars.autoSaved) { loadCars.autoSaved = true; setTimeout(autoSaveForOffline, 3000); }
}

function renderCars() {
  const count = $("#shortlist-count"); // in the tab bar, which WordPress pages don't have
  if (count) count.textContent = cars.filter((c) => !["passed", "bought", "sold"].includes(c.status)).length;
  const f = $("#filter-status").value;
  const src = $("#filter-source").value;
  const sort = $("#sort-by").value;
  const statusOk = (c) => !f || (f === "available" ? !GONE.includes(c.status) : c.status === f);
  let list = cars.filter((c) => statusOk(c) && (!src || carSource(c) === src));
  const num = (v, d) => (v == null ? d : v);
  if (sort === "price") list.sort((a, b) => num(a.price, 1e12) - num(b.price, 1e12));
  if (sort === "mileage") list.sort((a, b) => num(a.mileage, 1e12) - num(b.mileage, 1e12));
  if (sort === "year") list.sort((a, b) => num(b.year, 0) - num(a.year, 0));
  if (sort === "rating") list.sort((a, b) => num(b.rating, 0) - num(a.rating, 0));
  if (sort === "mpg") list.sort((a, b) => (mpgOf(b).city || mpgOf(b).comb || 0) - (mpgOf(a).city || mpgOf(a).comb || 0));
  if (sort === "dash") list.sort((a, b) => dashSortKey(b) - dashSortKey(a));

  if (!list.length) {
    $("#car-list").innerHTML = `<div class="col-12"><div class="alert alert-secondary text-center mb-0">
      ${cars.length ? "No cars match these filters." : "No cars yet. Find one in <b>Search</b>, then click <b>Add a car</b> and paste the listing link."}</div></div>`;
    return;
  }
  $("#car-list").innerHTML = list.map(carCard).join("");
  fillStats();
}

// EPA fuel economy for a car: city / highway / combined, from its Budget fields.
function mpgOf(c) {
  const b = c.budget || {};
  return { city: +b.mpg_city || null, hwy: +b.mpg_hwy || null, comb: +b.mpg || null };
}
// Monthly gas cost at this week's deliveries, from the DoorDash numbers (city driving).
function gasPerMonth(c) {
  const t = dash.cars[c.id]?.tiers.find((x) => x.deliveries === dash.recent);
  return t ? (t.gas * 52) / 12 : null;
}
function mpgLine(c, { compact = false } = {}) {
  const m = mpgOf(c);
  if (!m.city && !m.hwy && !m.comb) return compact ? "" : `<div class="small text-body-secondary"><i class="fa-solid fa-gas-pump me-1"></i>MPG not set — add it in Edit</div>`;
  const gas = compact ? null : gasPerMonth(c);
  if ((c.budget?.fuel || "").toLowerCase() === "electric") {
    // Stored as gas-equivalent MPG: what a gas car would need to match the charging cost per mile.
    return `<div class="small d-flex flex-wrap align-items-center gap-1">
      <span class="badge text-bg-success"><i class="fa-solid fa-bolt"></i></span><span>Electric · costs like a <b>${m.city || m.comb}</b> MPG car</span>
      ${gas ? `<span class="text-body-secondary ms-auto" title="Supercharger charging at ${dash.recent} deliveries a week">~${money(gas)}/mo charging</span>` : ""}
    </div>`;
  }
  const parts = [m.city && `<b>${m.city}</b> city`, m.hwy && `<b>${m.hwy}</b> hwy`, m.comb && `<b>${m.comb}</b> combined`].filter(Boolean).join(" · ");
  const color = (m.city || m.comb) >= 30 ? "success" : (m.city || m.comb) >= 24 ? "warning" : "danger";
  return `<div class="small d-flex flex-wrap align-items-center gap-1">
    <span class="badge text-bg-${color}"><i class="fa-solid fa-gas-pump"></i></span><span>${parts} MPG</span>
    ${gas ? `<span class="text-body-secondary ms-auto" title="Gas at ${dash.recent} deliveries a week (city MPG, Car Plan gas price)">~${money(gas)}/mo gas</span>` : ""}
  </div>`;
}

function carCard(c) {
  const done = CHECKS.filter(([k]) => c.checklist?.[k]).length;
  const pct = Math.round((done / CHECKS.length) * 100);
  const title = c.title || [c.year, c.make, c.model, c.trim].filter(Boolean).join(" ") || "Untitled car";
  const imgs = c.images || [];
  return `<div class="col"><div class="card h-100 shadow-sm car-card status-${c.status}">
    ${imgs.length
      ? `<button class="car-photo ratio ratio-4x3 card-img-top overflow-hidden" data-gallery="${c.id}" aria-label="View photos">
          <img src="${esc(imgs[0])}" alt="" loading="lazy" class="w-100 h-100"><span class="badge text-bg-dark bg-opacity-75"><i class="fa-solid fa-camera me-1"></i>${imgs.length}</span></button>`
      : `<div class="ratio ratio-4x3 card-img-top bg-body-secondary"><div class="d-flex align-items-center justify-content-center text-body-tertiary"><i class="fa-solid fa-image fs-1"></i></div></div>`}
    <div class="card-body d-flex flex-column gap-2">
      <div class="d-flex flex-wrap gap-1 align-items-center">
        ${sourceBadge(c)}
        <span class="badge text-bg-${statusColor[c.status] || "secondary"}">${esc(statusLabel[c.status] || c.status)}</span>
        <div class="form-check ms-auto mb-0 small">
          <input class="form-check-input" type="checkbox" id="sel-${c.id}" data-sel="${c.id}" ${selected.has(c.id) ? "checked" : ""}>
          <label class="form-check-label text-body-secondary" for="sel-${c.id}">compare</label>
        </div>
      </div>
      <h3 class="h6 card-title mb-0">${esc(title)}</h3>
      <div class="row g-0 text-center bg-body-tertiary rounded py-2">
        <div class="col"><div class="fw-bold">${money(c.price)}</div><div class="small text-body-secondary">price</div></div>
        <div class="col border-start"><div class="fw-bold">${c.mileage != null ? c.mileage.toLocaleString() : "–"}</div><div class="small text-body-secondary">miles</div></div>
        <div class="col border-start"><div class="fw-bold text-warning">${"★".repeat(c.rating || 0) || "–"}</div><div class="small text-body-secondary">my rating</div></div>
      </div>
      ${mpgLine(c)}
      <div class="small text-body-secondary"><i class="fa-solid fa-user me-1"></i>${esc([c.seller, c.seller_type === "private" ? "private" : "dealer", c.location].filter(Boolean).join(" · "))}</div>
      ${relBlock(c)}
      ${dashBlock(c)}
      ${c.notes ? `<details class="small"><summary class="text-body-secondary">Notes</summary><p class="notes mb-0 mt-1">${esc(c.notes)}</p></details>` : ""}
      <div class="mt-auto">
        <div class="d-flex justify-content-between small text-body-secondary"><span>Vetting</span><span>${done}/${CHECKS.length}</span></div>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" style="height:6px">
          <div class="progress-bar bg-success" style="width:${pct}%"></div></div>
      </div>
    </div>
    <div class="card-footer bg-transparent d-flex flex-wrap gap-1">
      <button class="btn btn-sm btn-outline-secondary" data-edit="${c.id}"><i class="fa-solid fa-pen"></i> Edit</button>
      ${c.url ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(c.url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Listing</a>` : ""}
      ${c.vin ? `<button class="btn btn-sm btn-outline-secondary" data-vin="${esc(c.vin)}"><i class="fa-solid fa-barcode"></i> VIN</button>` : ""}
      <button class="btn btn-sm btn-outline-secondary" data-cost="${c.id}"><i class="fa-solid fa-calculator"></i> Cost</button>
      <div class="btn-group btn-group-sm ms-auto">
        <a class="btn btn-primary" href="${API}/api/cars/${c.id}/plan/${c.pdf_names?.plan || "plan.pdf"}" target="_blank" rel="noopener"><i class="fa-solid fa-file-lines"></i> Car Plan</a>
        <a class="btn btn-outline-primary" href="${reportUrl(c.id)}" data-report="${c.id}" target="_blank" rel="noopener" title="Details PDF">Details</a>
      </div>
    </div>
  </div></div>`;
}

// The Details PDF uses the Cost Calculator's current settings.
function reportUrl(id) {
  const f = Object.fromEntries(new FormData($("#cost-form")));
  const map = { taxRate: "tax_rate", docFee: "doc_fee", dealerMisc: "dealer_misc", down: "down", apr: "apr", term: "term",
    ppi: "ppi", budget: "budget", milesMonth: "miles_month", gasPrice: "gas_price" };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(map)) if (f[k] !== undefined && f[k] !== "") q.set(v, f[k]);
  const name = cars.find((c) => c.id == id)?.pdf_names?.report || "report.pdf";
  return `${API}/api/cars/${id}/report/${name}?${q}`;
}
// Refresh report links when calculator settings change, so the PDF matches what's on screen.
$("#cost-form").addEventListener("input", () => { for (const a of $$("[data-report]")) a.href = reportUrl(a.dataset.report); });

// Sort by weekly profit at the middle tier, the typical "recovered" week.
function dashSortKey(c) {
  const t = dash.cars[c.id]?.tiers || [];
  return t.length ? t[Math.floor(t.length / 2)].profit : -1e9;
}

const signed = (n) => `${n < 0 ? "-" : ""}${money(Math.abs(n))}`;
function dashBlock(c) {
  const m = dash.cars[c.id];
  if (!m) return "";
  const recent = dash.recent;
  const id = `dash-${c.id}`;
  const rows = m.tiers.map((t) => `<tr class="${t.deliveries === recent ? "table-warning" : ""}">
      <td class="fw-semibold">${t.deliveries}${t.deliveries === recent ? ' <span class="badge text-bg-secondary">now</span>' : ""}</td>
      <td class="text-end ${t.profit < 0 ? "text-danger" : ""}">${signed(t.profit)}</td>
      <td class="text-end">${t.profit_per_delivery < 0 ? "-" : ""}${money2(Math.abs(t.profit_per_delivery))}</td>
      <td class="text-end ${t.left_month < 0 ? "text-danger" : "text-success"}">${signed(t.left_month)}</td>
    </tr>`).join("");
  const detail = m.tiers.map((t) => `<tr><td>${t.deliveries}</td><td class="text-end">${money(t.earnings)}</td><td class="text-end">${t.miles}</td>
      <td class="text-end">-${money(t.gas)}</td><td class="text-end">-${money(t.maintenance)}</td><td class="text-end">-${money(t.insurance + t.registration)}</td>
      <td class="text-end">${money2(t.cost_per_mile)}</td><td class="text-end">${t.safe_payment ? money(t.safe_payment) : "$0"}</td></tr>`).join("");
  return `<div class="border rounded small">
    <div class="d-flex align-items-center px-3 pt-2">
      <span class="text-body-secondary text-uppercase me-2" style="font-size:.7rem"><i class="fa-solid fa-bag-shopping me-1"></i>DoorDash</span>
      <span class="badge ${m.breakeven <= (recent ?? 0) ? "text-bg-success" : "text-bg-secondary"} ms-auto" title="Deliveries per week needed to cover living costs with this car">Break-even ${m.breakeven}/wk</span>
    </div>
    <table class="table table-sm table-borderless mb-0 small">
      <thead><tr class="text-body-secondary"><th class="fw-normal">Deliv/wk</th><th class="fw-normal text-end" title="Earnings minus this car's gas, maintenance, insurance and registration">Profit/wk</th><th class="fw-normal text-end">Per deliv.</th><th class="fw-normal text-end" title="Left each month after child support, taxes, phone, food and utilities — before any car payment">Left/mo</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="px-3 pb-2">
      <a class="small" data-bs-toggle="collapse" href="#${id}" role="button">Cost details</a>
      <div class="collapse" id="${id}">
        <div class="text-body-secondary mb-1" style="font-size:.75rem">${m.mpg_city} MPG in town · ${money2(m.maint_per_mile)}/mi maintenance · ${money(m.insurance_month)}/mo insurance (own liability + delivery endorsement)</div>
        <div class="table-responsive"><table class="table table-sm mb-0" style="font-size:.75rem">
          <thead><tr><th>Deliv</th><th class="text-end">Earn</th><th class="text-end">Miles</th><th class="text-end">Gas</th><th class="text-end">Maint</th><th class="text-end">Ins+reg</th><th class="text-end">Cost/mi</th><th class="text-end">Safe pmt</th></tr></thead>
          <tbody>${detail}</tbody></table></div>
      </div>
    </div>
  </div>`;
}

function relBlock(c) {
  const r = c.reliability || {};
  const score = +r.score || 0;
  const issues = r.issues || [], checks = r.checks || [];
  const id = `rel-${c.id}`;
  return `<div class="accordion accordion-flush border rounded small">
    <div class="accordion-item">
      <h4 class="accordion-header"><button class="accordion-button collapsed py-2 px-3 small" type="button" data-bs-toggle="collapse" data-bs-target="#${id}">
        <span class="me-2 text-body-secondary text-uppercase" style="font-size:.7rem">Reliability</span>
        <span class="rel-dots text-${REL_COLORS[score]} me-2">${relDots(score)}</span><b>${REL_LABELS[score]}</b>
      </button></h4>
      <div class="px-3 pb-1 text-body-secondary" style="font-size:.75rem" data-stats="${c.id}"></div>
      <div id="${id}" class="accordion-collapse collapse"><div class="accordion-body py-2 px-3">
        ${r.summary ? `<p class="mb-2">${esc(r.summary)}</p>` : ""}
        ${issues.length ? `<div class="fw-semibold">Known issues</div><ul class="mb-2 ps-3">${issues.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
        ${checks.length ? `<div class="fw-semibold">Check on this car</div><ul class="mb-1 ps-3">${checks.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
        ${!r.summary && !issues.length ? `<p class="text-body-secondary mb-0">No reliability notes yet — click Edit to add some.</p>` : ""}
      </div></div>
    </div></div>`;
}

$("#filter-status").addEventListener("change", () => {
  try { localStorage.setItem("statusFilter", $("#filter-status").value); } catch {}
  renderCars();
});
$("#filter-source").addEventListener("change", renderCars);
$("#sort-by").addEventListener("change", renderCars);

$("#car-list").addEventListener("click", (e) => {
  const t = e.target.closest("[data-gallery],[data-edit],[data-vin],[data-cost]");
  if (!t) return;
  if (t.dataset.gallery) openLightbox(cars.find((c) => c.id == t.dataset.gallery).images, 0);
  if (t.dataset.edit) openCar(cars.find((c) => c.id == t.dataset.edit));
  if (t.dataset.vin) {
    if (goTab("vin", { vin: t.dataset.vin })) return;
    $('#vin-form [name="vin"]').value = t.dataset.vin; lookupVin(t.dataset.vin);
  }
  if (t.dataset.cost) {
    const c = cars.find((x) => x.id == t.dataset.cost);
    const seller = c.seller_type === "private" ? "private" : "dealer";
    if (goTab("cost", { price: c.price || "", seller })) return;
    if (c.price) $('#cost-form [name="price"]').value = c.price;
    $('#cost-form [name="sellerType"]').value = seller;
    calcCost();
  }
});
$("#car-list").addEventListener("change", (e) => {
  const id = e.target.dataset.sel;
  if (id) e.target.checked ? selected.add(+id) : selected.delete(+id);
});

const carModal = new bootstrap.Modal("#car-modal");
let editing = null;

function openCar(car) {
  editing = car || null;
  const form = $("#car-form");
  form.reset();
  $("#car-dialog-title").textContent = car ? "Edit car" : "Add a car";
  $("#car-delete").classList.toggle("d-none", !car);
  for (const el of form.elements) if (el.name && car && car[el.name] != null) el.value = car[el.name];
  const cl = car?.checklist || {};
  $("#checklist").innerHTML = CHECKS.map(([k, l]) => `<div class="col"><div class="form-check">
    <input class="form-check-input" type="checkbox" id="chk-${k}" data-check="${k}" ${cl[k] ? "checked" : ""}>
    <label class="form-check-label" for="chk-${k}">${esc(l)}</label></div></div>`).join("");
  const rel = car?.reliability || {};
  $("#rel-score").value = rel.score || 0;
  $("#rel-summary").value = rel.summary || "";
  $("#rel-issues").value = (rel.issues || []).join("\n");
  $("#rel-checks").value = (rel.checks || []).join("\n");
  $("#rel-stats").innerHTML = "";
  const bud = car?.budget || {};
  $("#bud-mpg").value = bud.mpg || "";
  $("#bud-mpg-hwy").value = bud.mpg_hwy || "";
  $("#bud-ins").value = bud.insurance_monthly || "";
  $("#bud-cov").value = bud.coverage || "";
  $("#plan-target").value = bud.target_price || "";
  $("#plan-ins").value = bud.plan_insurance || "";
  $("#plan-mpg").value = bud.mpg_city || "";
  $("#plan-fund").value = bud.repair_fund_weekly || "";
  $("#plan-extras").value = bud.plan_extras || "";
  $("#plan-condition").value = bud.plan_condition || "";
  $("#plan-buyif").value = bud.buy_only_if || "";
  if (car) modelStats(car).then((st) => {
    if (!st || st.error) { $("#rel-stats").innerHTML = st ? `<div class="alert alert-warning small mb-0">NHTSA data unavailable: ${esc(st.error)}</div>` : ""; return; }
    $("#rel-stats").innerHTML = `<div class="alert alert-light border small mb-0"><b>NHTSA data for ${esc([car.year, car.make, car.model].join(" "))}:</b> ${statsLine(st)}${st.crashes ? ` · ${st.crashes} involving a crash` : ""}${st.fires ? ` · ${st.fires} fire` : ""}.
      ${st.top_components.length ? `Most-complained-about: ${st.top_components.map(([k, n]) => `${esc(k)} (${n})`).join(", ")}.` : ""}
      <a href="${esc(st.complaints_url)}" target="_blank" rel="noopener" class="alert-link">Read complaints</a></div>`;
  });
  $("#photo-section").classList.toggle("d-none", !car);
  $("#photo-save-first").classList.toggle("d-none", !!car);
  renderPhotos(car?.images || []);
  $$("#car-sections .accordion-collapse.show").forEach((el) => bootstrap.Collapse.getOrCreateInstance(el, { toggle: false }).hide());
  carModal.show();
}

/* ---------------- Photos ---------------- */
function renderPhotos(imgs) {
  if (editing) editing.images = imgs;
  $("#photo-grid").innerHTML = imgs.length
    ? imgs.map((src, i) => `<div class="col"><div class="thumb ratio ratio-1x1 rounded overflow-hidden">
        <img src="${esc(src)}" alt="" data-thumb="${i}" class="w-100 h-100">
        <button type="button" class="btn btn-sm btn-dark" data-del-photo="${esc(src)}" aria-label="Remove photo"><i class="fa-solid fa-xmark"></i></button></div></div>`).join("")
    : `<div class="col-12 text-body-secondary small">No photos yet.</div>`;
}

async function addPhotos(body, isForm) {
  try {
    const res = await authFetch(`${API}/api/cars/${editing.id}/images`, isForm ? { method: "POST", body } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || res.statusText);
    renderPhotos(r.images.map(abs));
    markOfflineStale();
    toast(`Added ${r.saved.length} photo(s).` + (r.errors.length ? ` Failed: ${r.errors.join("; ")}` : ""), r.errors.length ? "warning" : "success");
    loadCars();
  } catch (err) { toast("Adding photos failed: " + err.message, "danger"); }
}

$("#photo-files").addEventListener("change", (e) => {
  if (!e.target.files.length) return;
  const fd = new FormData();
  for (const f of e.target.files) fd.append("files", f);
  addPhotos(fd, true);
  e.target.value = "";
});
$("#photo-url-add").addEventListener("click", () => {
  const url = $("#photo-url").value.trim();
  if (url) { addPhotos({ urls: [url] }); $("#photo-url").value = ""; }
});
$("#photo-grid").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del-photo]")?.dataset.delPhoto;
  if (del) {
    if (!navigator.onLine) { toast("You're offline — reconnect to remove photos.", "warning"); return; }
    try {
      const res = await authFetch(del, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    } catch (err) { toast("Removing the photo failed: " + err.message, "danger"); return; }
    renderPhotos(editing.images.filter((x) => x !== del));
    loadCars();
  } else if (e.target.dataset.thumb) openLightbox(editing.images, +e.target.dataset.thumb);
});

// Fullscreen Bootstrap carousel with thumbnails. Opened from the editor it stacks on top of it.
const photoModal = new bootstrap.Modal("#photo-modal");
const carouselEl = $("#photo-carousel");
function openLightbox(imgs, i) {
  if (!imgs?.length) return;
  $(".carousel-inner", carouselEl).innerHTML = imgs.map((src, n) =>
    `<div class="carousel-item ${n === i ? "active" : ""}"><img src="${esc(src)}" class="d-block" alt="Photo ${n + 1} of ${imgs.length}"></div>`).join("");
  $("#photo-thumbs").innerHTML = imgs.length < 2 ? "" : imgs.map((src, n) =>
    `<button type="button" class="thumb-btn ${n === i ? "active" : ""}" data-bs-target="#photo-carousel" data-bs-slide-to="${n}" aria-label="Photo ${n + 1}" ${n === i ? 'aria-current="true"' : ""}>
      <img src="${esc(src)}" alt="" loading="lazy"></button>`).join("");
  $$(".photo-nav", carouselEl).forEach((b) => b.classList.toggle("d-none", imgs.length < 2));
  updatePhotoCount(i, imgs.length);
  bootstrap.Carousel.getInstance(carouselEl)?.dispose();
  bootstrap.Carousel.getOrCreateInstance(carouselEl, { interval: false, keyboard: true, touch: true, wrap: true });
  photoModal.show();
}
function updatePhotoCount(i, total) {
  $("#photo-count").textContent = `${i + 1} / ${total}`;
  $$("#photo-thumbs .thumb-btn").forEach((b, n) => {
    b.classList.toggle("active", n === i);
    if (n === i) { b.setAttribute("aria-current", "true"); b.scrollIntoView({ block: "nearest", inline: "center" }); }
    else b.removeAttribute("aria-current");
  });
}
carouselEl.addEventListener("slid.bs.carousel", (e) => updatePhotoCount(e.to, $$(".carousel-item", carouselEl).length));
$("#photo-modal").addEventListener("keydown", (e) => {
  const c = bootstrap.Carousel.getInstance(carouselEl);
  if (e.key === "ArrowLeft") c?.prev();
  if (e.key === "ArrowRight") c?.next();
});

/* ---------------- PDF viewer ----------------
   Installed as an app there's no back button, so PDFs open in a viewer inside the app instead of a new
   window. Loading through fetch() also means a PDF saved for offline opens without a connection. */
const pdfModal = new bootstrap.Modal("#pdf-modal");
let pdfObjectUrl = null;
async function openPdf(url) {
  const name = decodeURIComponent(new URL(url, location.href).pathname.split("/").pop()) || "document.pdf";
  $("#pdf-title").textContent = name.replace(/\.pdf$/i, "").replace(/_/g, " ");
  $("#pdf-spinner").classList.remove("d-none");
  $("#pdf-frame").classList.remove("d-none");
  $("#pdf-fallback").classList.add("d-none");
  $("#pdf-fallback").classList.remove("d-flex");
  pdfModal.show();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Couldn't load the PDF (${res.status}).`);
    pdfObjectUrl = URL.createObjectURL(await res.blob());
    for (const a of [$("#pdf-download"), $("#pdf-fallback-download")]) { a.href = pdfObjectUrl; a.download = name; }
    if (navigator.pdfViewerEnabled === false) {
      // e.g. phones: no built-in PDF viewer, so offer the download instead
      $("#pdf-frame").classList.add("d-none");
      $("#pdf-fallback-text").textContent = "This device can't show PDFs inside the app — download it to view or share.";
      $("#pdf-fallback").classList.remove("d-none");
      $("#pdf-fallback").classList.add("d-flex");
    } else {
      $("#pdf-frame").src = pdfObjectUrl;
    }
  } catch (e) {
    $("#pdf-frame").classList.add("d-none");
    $("#pdf-fallback-text").textContent = e.message;
    $("#pdf-fallback").classList.remove("d-none");
    $("#pdf-fallback").classList.add("d-flex");
    $("#pdf-fallback-download").classList.add("d-none");
  } finally {
    $("#pdf-spinner").classList.add("d-none");
  }
}
$("#pdf-modal").addEventListener("hidden.bs.modal", () => {
  $("#pdf-frame").removeAttribute("src");
  $("#pdf-fallback-download").classList.remove("d-none");
  if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
  pdfObjectUrl = null;
});
// Every PDF link in the app (Car Plan, Details, Budget tab). Ctrl/⌘/middle-click still opens a tab.
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href*="/api/cars/"][href*="/plan"], a[href*="/api/cars/"][href*="/report"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || a.hasAttribute("download")) return;
  e.preventDefault();
  openPdf(a.href);
});

$("#add-car").addEventListener("click", () => openCar(null));
$("#car-delete").addEventListener("click", async () => {
  if (!editing) return;
  carModal.hide();
  if (!(await confirmBox("Delete this car from your shortlist?"))) { carModal.show(); return; }
  try { await api(`/api/cars/${editing.id}`, { method: "DELETE" }); }
  catch (err) { toast("Delete failed: " + err.message, "danger"); return; }
  selected.delete(editing.id);
  toast("Car deleted.", "secondary");
  loadCars();
});
$("#car-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data.source = data.source || null;
  data.checklist = Object.fromEntries($$("#checklist [data-check]").map((c) => [c.dataset.check, c.checked]));
  data.budget = {
    ...(editing?.budget || {}),
    mpg: $("#bud-mpg").value ? +$("#bud-mpg").value : null,
    mpg_hwy: $("#bud-mpg-hwy").value ? +$("#bud-mpg-hwy").value : null,
    insurance_monthly: $("#bud-ins").value ? +$("#bud-ins").value : null,
    coverage: $("#bud-cov").value || null,
    target_price: $("#plan-target").value ? +$("#plan-target").value : null,
    plan_insurance: $("#plan-ins").value ? +$("#plan-ins").value : null,
    mpg_city: $("#plan-mpg").value ? +$("#plan-mpg").value : null,
    repair_fund_weekly: $("#plan-fund").value ? +$("#plan-fund").value : null,
    plan_extras: $("#plan-extras").value.trim(),
    plan_condition: $("#plan-condition").value.trim(),
    buy_only_if: $("#plan-buyif").value.trim(),
  };
  data.reliability = {
    ...(editing?.reliability || {}),
    score: +$("#rel-score").value,
    summary: $("#rel-summary").value.trim(),
    issues: lines($("#rel-issues").value),
    checks: lines($("#rel-checks").value),
  };
  try {
    if (editing) await api(`/api/cars/${editing.id}`, { method: "PUT", body: JSON.stringify(data) });
    else await api("/api/cars", { method: "POST", body: JSON.stringify(data) });
    carModal.hide();
    toast(editing ? "Car saved." : "Car added to your shortlist.");
    loadCars();
  } catch (err) { toast("Save failed: " + err.message, "danger"); }
});

$("#compare-btn").addEventListener("click", () => {
  const pick = cars.filter((c) => selected.has(c.id));
  const box = $("#compare");
  if (pick.length < 2) { toast("Tick “compare” on at least two cars.", "warning"); return; }
  const rows = [
    ["Photo", (c) => (c.images?.length ? `<img class="cmp-photo rounded" src="${esc(c.images[0])}" alt="">` : "–")],
    ["Source", (c) => sourceBadge(c)],
    ["Reliability", (c) => { const n = +c.reliability?.score || 0; return `<span class="rel-dots text-${REL_COLORS[n]}">${relDots(n)}</span> ${REL_LABELS[n]}`; }],
    ["NHTSA recalls / complaints", (c) => `<span data-stats="${c.id}"></span>`],
    ["DoorDash break-even", (c) => (dash.cars[c.id] ? `${dash.cars[c.id].breakeven} deliveries/wk` : "–")],
    ...dash.tiers.map((n, i) => [`Profit at ${n} deliveries/wk`, (c) => {
      const t = dash.cars[c.id]?.tiers[i];
      return t ? `<span class="${t.profit < 0 ? "text-danger" : ""}">${signed(t.profit)}/wk</span> · ${money2(t.profit_per_delivery)}/deliv · <span class="${t.left_month < 0 ? "text-danger" : "text-success"}">${signed(t.left_month)}/mo left</span>` : "–";
    }]),
    ["Price", (c) => money(c.price)],
    ["Est. out-the-door", (c) => money(quickOTD(c))],
    ["Year", (c) => c.year ?? "–"],
    ["Mileage", (c) => (c.mileage != null ? c.mileage.toLocaleString() : "–")],
    ["MPG (city / hwy / combined)", (c) => { const m = mpgOf(c); return [m.city, m.hwy, m.comb].map((x) => x || "–").join(" / "); }],
    ["Gas per month (this week's deliveries)", (c) => { const g = gasPerMonth(c); return g ? money(g) : "–"; }],
    ["Price / 1k mi left*", (c) => (c.price && c.mileage != null ? money2(c.price / Math.max(1, (200000 - c.mileage) / 1000)) : "–")],
    ["Seller", (c) => esc([c.seller, c.seller_type].filter(Boolean).join(" · ") || "–")],
    ["Status", (c) => `<span class="badge text-bg-${statusColor[c.status] || "secondary"}">${esc(statusLabel[c.status])}</span>`],
    ["My rating", (c) => `<span class="text-warning">${"★".repeat(c.rating || 0) || "–"}</span>`],
    ["Vetting done", (c) => `${CHECKS.filter(([k]) => c.checklist?.[k]).length}/${CHECKS.length}`],
    ...CHECKS.map(([k, l]) => [l, (c) => (c.checklist?.[k] ? `<i class="fa-solid fa-circle-check text-success"></i>` : `<span class="text-body-tertiary">—</span>`)]),
  ];
  box.innerHTML = `<div class="card-header d-flex align-items-center"><h2 class="h5 mb-0">Comparison</h2>
      <button type="button" class="btn-close ms-auto" aria-label="Close" id="compare-close"></button></div>
    <div class="table-responsive"><table class="table table-sm table-striped table-hover align-middle mb-0">
      <thead><tr><th></th>${pick.map((c) => `<th>${esc(c.title || [c.year, c.make, c.model].filter(Boolean).join(" "))}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(([l, f]) => `<tr><th class="text-body-secondary fw-normal">${esc(l)}</th>${pick.map((c) => `<td>${f(c)}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>
    <div class="card-footer small text-body-secondary">*Rough value metric assuming a 200k-mile useful life.</div>`;
  box.classList.remove("d-none");
  $("#compare-close").addEventListener("click", () => box.classList.add("d-none"));
  fillStats();
  box.scrollIntoView({ behavior: "smooth" });
});

/* ---------------- VIN ---------------- */
async function lookupVin(vin) {
  const out = $("#vin-result");
  out.innerHTML = `<div class="d-flex align-items-center gap-2 text-body-secondary"><div class="spinner-border spinner-border-sm"></div>Looking up ${esc(vin)}…</div>`;
  try {
    const r = await api(`/api/vin/${encodeURIComponent(vin)}`);
    const d = r.decoded;
    const err = d.ErrorText && !/^0\b/.test(d.ErrorText) ? `<div class="alert alert-warning small">NHTSA note: ${esc(d.ErrorText)}</div>` : "";
    delete d.ErrorText;
    out.innerHTML = `${err}<h3 class="h5">${esc([d.ModelYear, d.Make, d.Model, d.Trim].filter(Boolean).join(" "))}</h3>
      <dl class="row small mb-4">${Object.entries(d).map(([k, v]) => `<dt class="col-sm-4 col-lg-3 text-body-secondary fw-normal">${esc(k.replace(/([a-z])([A-Z])/g, "$1 $2"))}</dt><dd class="col-sm-8 col-lg-9 mb-1">${esc(v)}</dd>`).join("")}</dl>
      <h3 class="h6">Recall campaigns for this model <span class="badge text-bg-secondary">${r.recalls.length}</span></h3>
      ${r.recall_error ? `<div class="alert alert-warning">${esc(r.recall_error)} — recalls could not be checked; try again later.</div>`
        : r.recalls.length ? `<div class="accordion mb-3" id="recall-acc">${r.recalls.map((x, n) => `<div class="accordion-item">
            <h4 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#recall-${n}">
              <span><b>${esc(x.component)}</b><br><span class="small text-body-secondary">${esc(x.campaign)} · ${esc(x.date)}</span></span></button></h4>
            <div id="recall-${n}" class="accordion-collapse collapse" data-bs-parent="#recall-acc"><div class="accordion-body small">
              <p>${esc(x.summary)}</p><p><b>Risk:</b> ${esc(x.consequence)}</p><p class="mb-0"><b>Fix:</b> ${esc(x.remedy)}</p></div></div></div>`).join("")}</div>`
        : `<div class="alert alert-success">No recall campaigns found for this year/make/model.</div>`}
      <div class="form-text">Recalls listed are for the model, not necessarily this car. Ask the seller or a dealer service dept to confirm they were done — repairs are free.</div>`;
  } catch (e) {
    out.innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}
$("#vin-form").addEventListener("submit", (e) => { e.preventDefault(); lookupVin(e.target.vin.value.trim()); });

/* ---------------- Cost calculator ---------------- */
// Rough CA DMV estimate for a transfer/new registration. Real fees vary; DMV's calculator is authoritative.
function dmvFees(price) {
  const vlf = price * 0.0065;
  const reg = 74, chp = 34, title = 15;
  const tif = price < 5000 ? 32 : price < 25000 ? 65 : price < 35000 ? 130 : price < 60000 ? 195 : 227;
  return { vlf, reg, chp, title, tif, total: vlf + reg + chp + title + tif };
}

function quickOTD(c) {
  if (!c.price) return NaN;
  const dealer = c.seller_type !== "private";
  return c.price * 1.0925 + (dealer ? 125 : 0) + dmvFees(c.price).total;
}

function calcCost() {
  const f = Object.fromEntries(new FormData($("#cost-form")));
  const v = (k) => parseFloat(f[k]) || 0;
  const price = v("price");
  const dealer = f.sellerType === "dealer";
  // California taxes the full price — trade-ins do NOT reduce sales tax.
  const tax = price * (v("taxRate") / 100);
  const dealerFees = dealer ? v("docFee") + v("dealerMisc") : 0;
  const dmv = f.dmv ? dmvFees(price) : { total: 0 };
  const ppi = v("ppi");
  const otd = price + tax + dealerFees + dmv.total;
  const equity = v("tradeIn") - v("tradeOwed");
  const financed = Math.max(0, otd - v("down") - equity);
  const n = parseInt(f.term, 10);
  const i = v("apr") / 100 / 12;
  const pmt = financed === 0 ? 0 : i === 0 ? financed / n : (financed * i) / (1 - Math.pow(1 + i, -n));
  const interest = pmt * n - financed;
  const budget = v("budget");

  const line = (l, val, total = false) => `<tr class="${total ? "table-active fw-bold" : ""}"><td>${l}</td><td class="text-end font-monospace">${money2(val)}</td></tr>`;
  $("#cost-out").innerHTML = `<h2 class="h5">Out-the-door</h2>
    <div class="display-6 fw-bold text-primary mb-2">${money(otd)}</div>
    ${budget ? `<div class="alert ${otd <= budget ? "alert-success" : "alert-danger"} py-2 small">${otd <= budget ? "Within" : "Over"} your ${money(budget)} budget by ${money(Math.abs(budget - otd))}</div>` : ""}
    <table class="table table-sm">
      ${line("Vehicle price", price)}
      ${line(`${dealer ? "Sales" : "Use"} tax (${v("taxRate")}%)${dealer ? "" : " — paid at DMV"}`, tax)}
      ${dealer ? line("Dealer doc + filing fees", dealerFees) : ""}
      ${f.dmv ? line("Vehicle license fee (0.65%)", dmv.vlf) + line("Registration + CHP fee", dmv.reg + dmv.chp) + line("Transportation improvement fee", dmv.tif) + line("Title / transfer", dmv.title) : ""}
      ${line("Total out-the-door", otd, true)}
      ${ppi ? line("+ Pre-purchase inspection (you pay)", ppi) : ""}
    </table>
    <h2 class="h5 mt-3">Financing</h2>
    <table class="table table-sm">
      ${equity ? line(equity >= 0 ? "Trade-in equity" : "Negative equity rolled in", Math.abs(equity)) : ""}
      ${line("Down payment", v("down"))}
      ${line("Amount financed", financed)}
      ${line(`Monthly payment (${n} mo @ ${v("apr")}%)`, pmt, true)}
      ${line("Total interest", interest)}
      ${line("Total paid (incl. down)", pmt * n + v("down") + ppi)}
    </table>
    <div class="form-text">DMV fees are estimates — get exact amounts from the <a href="https://www.dmv.ca.gov/wasapp/FeeCalculatorWeb/" target="_blank" rel="noopener">CA DMV fee calculator</a>. Ridgecrest DMV: 540 Perdew Ave (check hours, book ahead).</div>
    <div class="form-text">Get pre-approved at a credit union before visiting a dealer — it gives you a rate to beat.</div>`;
}
$("#cost-form").addEventListener("input", () => {
  calcCost();
  try { localStorage.setItem("cost", JSON.stringify(Object.fromEntries(new FormData($("#cost-form"))))); } catch {}
});
try {
  const saved = JSON.parse(localStorage.getItem("cost") || "{}");
  for (const [k, v] of Object.entries(saved)) { const el = $(`#cost-form [name="${k}"]`); if (el && el.type !== "checkbox") el.value = v; }
} catch {}
calcCost();

/* ---------------- Car Plan settings ---------------- */
const PLAN_FIELDS = [
  ["owner", "Who you're asking", "text"], ["alt_owner", "Alternate owner", "text"], ["app", "Delivery app", "text"],
  ["dasher_status", "Dasher status", "text"], ["recent_deliveries", "Deliveries last week", "number"],
  ["recent_earned", "Earned last week ($)", "number"], ["online_hours", "Hours online", "number"],
  ["delivering_hours", "Hours delivering", "number"], ["violation_remaining", "Deliveries until violation clears", "number"],
  ["violation_days", "Days to clear at current pace", "number"], ["prepay", "Up-front payment ($)", "number"],
  ["step1", "First payment step ($/mo)", "number"], ["step2", "Full payment step ($/mo)", "number"],
  ["example_zero_months", "Example: months at $0", "number"], ["example_step1_months", "Example: months at first step", "number"],
  ["base_insurance", "Insurance for a typical car ($/mo)", "number"], ["gas_price", "Gas price ($/gal)", "number"],
  ["miles_per_delivery", "Miles per delivery", "number"], ["weekly_base_miles", "Extra miles per week", "number"],
  ["child_support_pct", "Child support (% of earnings)", "number"], ["phone_weekly", "Phone ($/week)", "number"],
  ["food_utilities_monthly", "Food & utilities ($/month)", "number"], ["tax_rate_pct", "Tax set-aside rate (%)", "number"],
  ["mileage_rate", "Mileage deduction ($/mile)", "number"], ["cushion", "Cushion kept at each step (0–1)", "number"],
  ["options_insurance", "Own liability insurance, typical car ($/mo)", "number"],
  ["delivery_tiers", "DoorDash tiers on each car (deliveries/wk, comma-separated)", "text"],
  ["legal_aid", "Legal aid organization", "text"], ["late_days", "Late after (days)", "number"],
  ["default_days", "Default after (days late)", "number"], ["cure_days", "Days to fix a default", "number"],
];
async function loadPlanSettings() {
  const st = await api("/api/settings/plan");
  $("#plan-form").innerHTML = PLAN_FIELDS.map(([k, label, type]) =>
    `<div class="col-6 col-md-4 col-xl-3"><label class="form-label small" for="ps-${k}">${esc(label)}</label>
      <input class="form-control" id="ps-${k}" name="${k}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${esc(st[k] ?? "")}"></div>`).join("");
}
$("#plan-save").addEventListener("click", async () => {
  const data = Object.fromEntries(new FormData($("#plan-form")));
  for (const [k, , type] of PLAN_FIELDS) if (type === "number" && data[k] !== "") data[k] = +data[k];
  try {
    await api("/api/settings/plan", { method: "PUT", body: JSON.stringify(data) });
    toast("Saved — the Home and Budget tabs, DoorDash numbers and every Car Plan PDF now use these settings.");
    loadCars();
  } catch (e) { toast("Save failed: " + e.message, "danger"); }
});
loadPlanSettings();

/* ---------------- Home (car options overview) ---------------- */
// Same order the server uses for the default car: most reliable, then best city MPG, then cheapest.
const homeRank = (a, b) => (+(b.reliability?.score || 0) - +(a.reliability?.score || 0))
  || ((b.budget?.mpg_city || 0) - (a.budget?.mpg_city || 0)) || ((a.price || 1e9) - (b.price || 1e9));
const carTitle = (c) => c.title || [c.year, c.make, c.model].filter(Boolean).join(" ");

let homeCarId = null;
try { homeCarId = +localStorage.getItem("homeCar") || null; } catch {}

async function renderHome() {
  const active = cars.filter((c) => !["passed", "sold"].includes(c.status)).sort(homeRank);
  if (homeCarId && !active.some((c) => c.id === homeCarId)) homeCarId = null;
  const q = homeCarId ? `?car_id=${homeCarId}` : "";
  let o;
  try { o = await api(`/api/options${q}`); } catch (e) { $("#home-afford").innerHTML = `<tr><td colspan="3" class="text-danger">${esc(e.message)}</td></tr>`; return; }
  homeCarId = o.car_id;
  $("#home-car").innerHTML = active.map((c) => `<option value="${c.id}" ${c.id === o.car_id ? "selected" : ""}>${esc(carTitle(c))}</option>`).join("");

  $("#home-sub").textContent = `For our talk, ${o.owner} | Ridgecrest, CA | ${o.app}, ${o.dasher_status}`;
  const stat = (label, value, sub = "") => `<div class="col"><div class="card h-100 text-center shadow-sm"><div class="card-body">
      <div class="small text-body-secondary text-uppercase">${label}</div><div class="fs-3 fw-bold">${value}</div>${sub ? `<div class="small text-body-secondary">${sub}</div>` : ""}</div></div></div>`;
  $("#home-stats").innerHTML =
    stat("Deliveries", o.recent) +
    stat("Earned", money2(o.earned), `about ${money2(o.per_delivery)} per delivery`) +
    stat("Online / delivering", `${o.online_hours}h / ${o.delivering_hours}h`, `${Math.round((o.delivering_hours / o.online_hours) * 100)}% of my time is spent delivering`);
  const weeks = o.violation_days / 7;
  $("#home-slow").innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><div><b>Why it's slow:</b> a contract violation on my account slows offers until I complete
    ${o.violation_remaining} more deliveries (about ${weeks >= 1.25 ? `${weeks.toFixed(1).replace(/\.0$/, "")} weeks` : `${o.violation_days} days`} at this pace).
    <div class="mt-1"><b>Keeping it from happening again:</b> when a pickup runs late, the app sometimes lets me wait it out or pass the
    rest of the delivery without hurting my completion rate. Taking that option gives me some control over avoiding another late-pickup violation.</div></div>`;

  $("#home-afford").innerHTML = o.rows.map((r) => `<tr class="${r.deliveries === o.recent ? "table-warning" : ""}">
      <td class="fw-semibold">${r.deliveries}${r.deliveries === o.recent ? ' <span class="badge text-bg-secondary">now</span>' : ""}</td>
      <td class="${r.left < 0 ? "text-danger" : ""}">${r.left < 0 ? "-" : ""}${money(Math.abs(r.left))}</td>
      <td>${r.safe ? `<span class="badge text-bg-success fs-6">About ${money(r.safe)}</span>` : '<span class="badge text-bg-secondary">$0 (not yet)</span>'}</td></tr>`).join("");
  const reliable = (cars.find((c) => c.id === o.car_id)?.reliability?.score || 0) >= 4;
  $("#home-assume").textContent = `Assumes ${reliable ? "a reliable car like" : ""} the ${o.car} (about ${o.mpg_city} MPG in town), with me paying my own insurance (~${money(o.insurance)}/month liability with a delivery endorsement), gas at $${o.gas_price}/gallon, maintenance, phone, child support (${o.child_support_pct}% of my earnings), and food and utilities (${money(o.food_utilities)}/month). "Safe" leaves about a third of what's left as a cushion for repairs and slow weeks.`;
  const nowLeft = o.rows.find((r) => r.deliveries === o.recent)?.left ?? 0;
  $("#home-bottom").innerHTML = `<b>Bottom line:</b> with child support included, I need about <b>${o.breakeven}</b> deliveries a week just to cover my living costs, so right now
    ${nowLeft < 0 ? "I can't take on a car payment" : `I have about ${money(nowLeft)} a month to spare`}. At about <b>${o.step1_at}</b> deliveries a week I can pay around ${money(o.step1)} a month, and at about <b>${o.step2_at}</b> around ${money(o.step2)}.`;

  // Cars I'm looking at: the best four from the shortlist.
  $("#home-cars").innerHTML = active.slice(0, 4).map((c) => {
    const n = +(c.reliability?.score || 0);
    return `<div class="col"><div class="card h-100 shadow-sm">
      ${c.images?.length ? `<img src="${esc(c.images[0])}" class="card-img-top object-fit-cover" style="aspect-ratio:4/3" alt="" loading="lazy">`
        : `<div class="ratio ratio-4x3 bg-body-secondary"><div class="d-flex align-items-center justify-content-center text-body-tertiary"><i class="fa-solid fa-image fs-2"></i></div></div>`}
      <div class="card-body">
        <div class="mb-1">${sourceBadge(c)}</div>
        <h4 class="h6 mb-1">${esc(carTitle(c))}</h4>
        <div class="small text-body-secondary">${money(c.price)} · ${c.mileage != null ? c.mileage.toLocaleString() + " mi" : "miles ?"}</div>
        <div class="mt-1">${mpgLine(c, { compact: true })}</div>
        <div class="small mt-1"><span class="rel-dots text-${REL_COLORS[n]}">${relDots(n)}</span> ${REL_LABELS[n]}</div>
      </div>
      <div class="card-footer bg-transparent d-flex gap-1">
        <a class="btn btn-sm btn-primary" href="${API}/api/cars/${c.id}/plan/${c.pdf_names?.plan || "plan.pdf"}" target="_blank" rel="noopener"><i class="fa-solid fa-file-lines"></i> Car Plan</a>
        <button class="btn btn-sm btn-outline-secondary" data-home-car="${c.id}">Use in table</button>
      </div></div></div>`;
  }).join("") || `<div class="col-12"><div class="alert alert-secondary mb-0">No cars on the shortlist yet.</div></div>`;

  const ways = [
    ["1. Bridge car", "Help with a cheap car plus a repair fund", "None", "Lowest cost to you; I'm on the road fast", "Not truly reliable; a high-mileage car is a gamble"],
    ["2. Share the cost", "Gift part of a reliable car; I repay the rest", `Starts once I'm at ${o.step1_at}+ deliveries/week`, "Smaller payment that fits my budget; we both have a stake", "Bigger contribution from you"],
    ["3. Buy it, I repay", "Buy a reliable car; I pay you back with no interest", `$0 at first, ${money(o.step1)} at ${o.step1_at}+ and ${money(o.step2)} at ${o.step2_at}+ deliveries/week`, "You get all your money back; I own it in the end", "Takes several years; nothing until my volume recovers"],
    ["4. Co-sign a loan", "Co-sign a credit union auto loan in my name", "Loan payment to the bank", "Builds my credit; no cash from you", "Your credit is on the line if I miss payments"],
    ["5. Gift the car", "Buy a reliable car outright", "None", "Most stable for me; no payment pressure", "Largest cost to you"],
  ];
  $("#home-ways").innerHTML = ways.map(([a, b, c, d, e]) => `<tr><th class="text-nowrap">${a}</th><td>${b}</td><td>${c}</td><td>${d}</td><td>${e}</td></tr>`).join("");

  $("#home-stepup").innerHTML = `If you'd like me to repay part or all of it, I'd suggest a step-up plan: no payment while my deliveries recover, then <b>${money(o.step1)} a month</b> after four straight weeks of
    <b>${o.step1_at}+</b> deliveries, rising to <b>${money(o.step2)} a month</b> after four straight weeks of <b>${o.step2_at}+</b>. I can show you my ${o.app} earnings each month so you can see the progress.`;
  $("#home-foot").textContent = `Estimates use my most recent ${o.app} week, about 10 miles per delivery plus 40 miles a week, gas at $${o.gas_price}/gallon, and child support at ${o.child_support_pct}% of my earnings. Actual numbers will vary. Change these in the Car Plan tab.`;
}
$("#home-car").addEventListener("change", (e) => {
  homeCarId = +e.target.value;
  try { localStorage.setItem("homeCar", homeCarId); } catch {}
  renderHome();
});
$("#tab-home").addEventListener("click", (e) => {
  const use = e.target.closest("[data-home-car]");
  if (use) { $("#home-car").value = use.dataset.homeCar; $("#home-car").dispatchEvent(new Event("change")); $("#home-afford").scrollIntoView({ behavior: "smooth", block: "center" }); }
  const go = e.target.closest("[data-goto]");
  if (go) goTab(go.dataset.goto);
});

/* ---------------- Budget (the Car Plan PDF's numbers on screen) ---------------- */
let budgetCarId = null, budgetData = null;
try { budgetCarId = +localStorage.getItem("budgetCar") || null; } catch {}

async function renderBudget() {
  const active = cars.filter((c) => !["passed", "sold"].includes(c.status)).sort(homeRank);
  if (budgetCarId && !active.some((c) => c.id === budgetCarId)) budgetCarId = null;
  const q = new URLSearchParams();
  if (budgetCarId) q.set("car_id", budgetCarId);
  const extra = parseInt($("#budget-extra").value, 10);
  if (extra > 0) q.set("extra", extra);
  try { budgetData = await api(`/api/budget?${q}`); }
  catch (e) { $("#budget-stats").innerHTML = `<div class="col-12"><div class="alert alert-secondary mb-0">${esc(e.message)}</div></div>`; return; }
  const d = budgetData;
  budgetCarId = d.car_id;
  $("#budget-car").innerHTML = active.map((c) => `<option value="${c.id}" ${c.id === d.car_id ? "selected" : ""}>${esc(carTitle(c))}</option>`).join("");
  $("#budget-plan-pdf").href = API + d.plan_pdf;
  // data-report makes the Cost Calculator listener keep this link's settings current too
  $("#budget-report-pdf").dataset.report = d.car_id;
  $("#budget-report-pdf").href = reportUrl(d.car_id);
  $$(".budget-owner").forEach((el) => { el.textContent = d.owner; });

  const stat = (label, value, sub) => `<div class="col"><div class="card h-100 shadow-sm text-center"><div class="card-body py-3">
    <div class="small text-body-secondary text-uppercase">${label}</div><div class="fs-4 fw-bold">${value}</div><div class="small text-body-secondary">${sub}</div></div></div></div>`;
  const now = d.columns[0];
  $("#budget-stats").innerHTML =
    stat(`I repay ${esc(d.owner)}`, money(d.totals.target), `at the ${money(d.target)} target, no interest`) +
    stat("Paid off around", `month ${d.payoff_month.target}`, `~${(d.payoff_month.target / 12).toFixed(1)} years (${d.payoff_month.asking} at asking)`) +
    stat("Insurance", `${money(d.insurance)}/mo`, `my ${money(d.prepay)} up front covers ~${d.prepay_months} months`) +
    stat("Each week right now", `<span class="${now.left < 0 ? "text-danger" : "text-success"}">${signed(now.left)}</span>`, `at ${d.recent} deliveries, insurance prepaid`);

  const same = d.target >= d.price;
  const cell = (a, b) => `<td class="text-end">${a}</td>${same ? "" : `<td class="text-end">${b}</td>`}`;
  $("#budget-cost").innerHTML = `<thead class="table-light"><tr><th></th>${same ? '<th class="text-end">Asking price</th>' : '<th class="text-end">Target price</th><th class="text-end">Full asking</th>'}</tr></thead><tbody>
    <tr><td>Purchase price</td>${cell(money(d.target), money(d.price))}</tr>
    <tr><td>Sales tax (${d.tax_rate}%)</td>${cell(money(d.totals.target - d.target), money(d.totals.asking - d.price))}</tr>
    <tr class="table-active fw-bold"><td>Total cost (what I repay)</td>${cell(money(d.totals.target), money(d.totals.asking))}</tr>
    <tr><td>Paid off around</td>${cell(`month ${d.payoff_month.target}`, `month ${d.payoff_month.asking}`)}</tr>
    <tr class="fw-semibold"><td>${esc(d.owner)} gets back</td>${cell(`All ${money(d.totals.target)}`, `All ${money(d.totals.asking)}`)}</tr></tbody>`;
  $("#budget-cost-note").textContent = `I'll also pay ${d.extras ? d.extras + ", " : ""}DMV transfer and registration (about ${money(d.dmv_once)}), and all maintenance, repairs, gas and registration renewals.`;

  const st = d.steps, th = d.thresholds;
  const step = (badge, color, title, body) => `<div class="d-flex gap-3 mb-3"><span class="badge text-bg-${color} fs-6 align-self-start" style="min-width:4.5rem">${badge}</span><div><div class="fw-semibold">${title}</div><div class="small text-body-secondary">${body}</div></div></div>`;
  $("#budget-steps").innerHTML =
    step("$0", "secondary", "While my deliveries recover", `I pay the insurance (${money(d.insurance)}/mo) from my ${money(d.prepay)} up-front payment. I can cover insurance myself at about <b>${th.insurance}</b> deliveries a week.`) +
    step(`${money(st.step1)}/mo`, "warning", `After four straight weeks of ${th.step1}+ deliveries`, `Car payment starts, plus insurance.`) +
    step(`${money(st.step2)}/mo`, "success", `After four straight weeks of ${th.step2}+ deliveries`, `Full payment until it's paid off. I can pay extra in good weeks.`) +
    `<div class="form-text">Example used for payoff: $0 for ${st.zero_months} months, ${money(st.step1)} for ${st.step1_months}, then ${money(st.step2)}.</div>`;

  renderBudgetTable();
  renderBudgetSchedule();
  renderWhatIf();
}

// The "What if I make…" answer, shown right under the box (its column is also added to the table).
function renderWhatIf() {
  const d = budgetData, box = $("#budget-whatif");
  const col = d?.columns.find((c) => c.label.startsWith("What if"));
  box.classList.toggle("d-none", !col);
  if (!col) { box.innerHTML = ""; return; }
  const n = col.deliveries, pay = col.monthly_payment;
  const leftMonth = Math.round((col.left * 52) / 12);
  const st = d.steps, th = d.thresholds;
  const payoff = pay ? Math.ceil(d.totals.target / pay) : null;
  let step;
  if (pay >= st.step2) step = `covers the full <b>${money(st.step2)}/month</b> payment`;
  else if (pay >= st.step1) step = `covers the <b>${money(st.step1)}/month</b> step — the full ${money(st.step2)} needs about ${th.step2} deliveries`;
  else if (n >= th.insurance) step = `covers insurance, but not a car payment yet — the ${money(st.step1)} step needs about ${th.step1} deliveries`;
  else step = `doesn't cover insurance yet — that needs about ${th.insurance} deliveries`;
  const good = col.left >= 0;
  box.innerHTML = `<div class="alert ${good ? "alert-success" : "alert-danger"} d-flex flex-wrap align-items-start gap-3 mb-0 shadow-sm">
    <i class="fa-solid fa-calculator fs-3"></i>
    <div class="flex-grow-1">
      <div class="fw-semibold mb-1">What if I make ${n} deliveries a week with the ${esc(d.car)}?</div>
      <div>Earnings about <b>${money(col.earnings)}/week</b>. After gas, upkeep, child support, taxes, insurance${pay ? `, a ${money(pay)}/month car payment` : ""} and food & utilities,
        I'd have <b class="${good ? "" : "text-danger"}">${signed(col.left)}/week</b> (${signed(leftMonth)}/month) left. It ${step}.</div>
      ${payoff ? `<div class="mt-1">Paying ${money(pay)}/month from now, the ${money(d.totals.target)} would be paid off in about <b>${payoff} months</b> (~${(payoff / 12).toFixed(1)} years).</div>` : ""}
      <a href="#budget-table" class="small alert-link" id="whatif-jump">See the full column in the budget table ↓</a>
    </div>
    <button type="button" class="btn-close" aria-label="Clear what-if" id="whatif-clear"></button>
  </div>`;
  $("#whatif-clear").onclick = () => { $("#budget-extra").value = ""; renderBudget(); };
  $("#whatif-jump").onclick = (e) => { e.preventDefault(); $("#budget-table").scrollIntoView({ behavior: "smooth", block: "center" }); };
}

function renderBudgetTable() {
  const d = budgetData;
  if (!d) return;
  const monthly = $("#budget-monthly").checked;
  const k = monthly ? 52 / 12 : 1;
  const v = (n) => signed(Math.round(n * k));
  const neg = (n) => (n ? `-${money(Math.round(n * k))}` : "$0");
  const cols = d.columns;
  const hi = (c) => (c.label.startsWith("What if") ? " table-primary" : "");
  const row = (label, f, cls = "") => `<tr class="${cls}"><th class="fw-normal text-body-secondary">${label}</th>${cols.map((c) => `<td class="text-end${hi(c)}">${f(c)}</td>`).join("")}</tr>`;
  const per = monthly ? "month" : "week";
  $("#budget-table").innerHTML = `<thead class="table-light"><tr><th>${monthly ? "Monthly" : "Weekly"}</th>${cols.map((c) =>
      `<th class="text-end ${c.label.startsWith("What if") ? "table-primary text-primary-emphasis" : ""}">${esc(c.label)}<div class="small fw-normal text-body-secondary">${c.deliveries} deliveries/wk</div></th>`).join("")}</tr></thead><tbody>
    ${row(`${esc(d.app)} earnings`, (c) => money(Math.round(c.earnings * k)))}
    ${row("Miles driven (estimate)", (c) => Math.round(c.miles * k).toLocaleString())}
    ${row(`Gas ($${d.gas_price}/gal, ${d.mpg_city} MPG)`, (c) => neg(c.gas))}
    ${row("Maintenance and tires", (c) => neg(c.maintenance))}
    ${row(`Child support (${d.child_support_pct}%)`, (c) => neg(c.child_support))}
    ${cols.some((c) => c.repair_fund) ? row("Repair fund", (c) => neg(c.repair_fund)) : ""}
    ${row("Phone and registration", (c) => neg(c.phone_registration))}
    ${row("Tax set-aside", (c) => neg(c.tax))}
    ${row(`Available before paying ${esc(d.owner)}`, (c) => `<b>${v(c.available)}</b>`, "table-active")}
    ${row(`Insurance to ${esc(d.owner)} (~${money(d.insurance)}/mo)`, (c) => (c.insurance_prepaid ? '<span class="badge text-bg-secondary">prepaid</span>' : neg(c.insurance)))}
    ${row(`Car payment to ${esc(d.owner)}`, (c) => neg(c.car_payment))}
    ${row(`Food and utilities (${money(d.food_utilities_monthly)}/mo)`, (c) => neg(c.food_utilities))}
    ${row(`Left over each ${per}`, (c) => `<b class="${c.left < 0 ? "text-danger" : "text-success"}">${v(c.left)}</b>`, "table-active")}
  </tbody>`;
  $("#budget-table-note").textContent = `Each payment step keeps about a third of what's left as a cushion for repairs and slow weeks.${monthly ? " Monthly figures are weekly × 52 ÷ 12." : ""} Change the personal numbers in the Car Plan tab.`;
}

function renderBudgetSchedule() {
  const d = budgetData;
  if (!d) return;
  const basis = $("#budget-basis-asking").checked ? "asking" : "target";
  const rows = d.schedule[basis];
  $("#budget-sched-sum").textContent = `paid off in month ${d.payoff_month[basis]} at the ${basis} price`;
  $("#budget-sched-table").innerHTML = `<thead class="table-light sticky-top"><tr><th>Month</th><th class="text-end">Car payment</th><th class="text-end">Balance after</th><th style="width:40%">Paid off</th></tr></thead><tbody>${rows.map((r) => {
    const pct = Math.round((1 - r.balance / d.totals[basis]) * 100);
    return `<tr><td>${r.month}</td><td class="text-end">${money(r.payment)}</td><td class="text-end">${money(r.balance)}</td>
      <td><div class="progress" style="height:8px"><div class="progress-bar bg-success" style="width:${pct}%"></div></div></td></tr>`;
  }).join("")}</tbody>`;
}

$("#budget-car").addEventListener("change", (e) => {
  budgetCarId = +e.target.value;
  try { localStorage.setItem("budgetCar", budgetCarId); } catch {}
  renderBudget();
});
let budgetExtraTimer;
$("#budget-extra").addEventListener("input", () => { clearTimeout(budgetExtraTimer); budgetExtraTimer = setTimeout(renderBudget, 350); });
$("#budget-extra").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(budgetExtraTimer); renderBudget(); } });
$$('[name="budget-period"]').forEach((r) => r.addEventListener("change", renderBudgetTable));
$$('[name="budget-basis"]').forEach((r) => r.addEventListener("change", renderBudgetSchedule));

/* ---------------- GoFundMe ---------------- */
// GoFundMe personal fundraisers (US): no platform fee; 2.9% + $0.30 comes out of each donation.
const GFM_PCT = 0.029;
const GFM_FIXED = 0.30;
let gfmData = null;
let gfmCarId = null;
(function restoreGoFundMe() {
  try {
    const saved = JSON.parse(localStorage.getItem("gofundme") || "{}");
    for (const [k, v] of Object.entries(saved)) {
      const el = $("#gfm-form").elements[k];
      if (el) el.type === "checkbox" ? (el.checked = v) : (el.value = v);
    }
    gfmCarId = +saved.car || null;
  } catch {}
})();

function gfmInputs() {
  const f = $("#gfm-form").elements;
  const n = (name, d = 0) => { const v = parseFloat(f[name].value); return isFinite(v) && v >= 0 ? v : d; };
  return { basis: f.basis.value, dmv: f.dmv.checked, inspect: n("inspect"), insMonths: Math.round(n("insMonths")),
    cushion: n("cushion"), have: n("have"), avg: Math.max(5, n("avg", 50)) };
}
// Fees on `goal` raised in gifts of about `avg`: 2.9% of everything plus $0.30 per donation.
function gfmFees(goal, avg) {
  const donations = Math.ceil(goal / avg);
  return { donations, pctFee: goal * GFM_PCT, fixedFee: donations * GFM_FIXED, fees: goal * GFM_PCT + donations * GFM_FIXED };
}
// Smallest goal (rounded up to $50) whose take-home after fees still covers `need`.
function gfmGoal(need, avg) {
  if (need <= 0) return { goal: 0, donations: 0, pctFee: 0, fixedFee: 0, fees: 0, net: 0 };
  let goal = Math.ceil(need / (1 - GFM_PCT - GFM_FIXED / avg) / 50) * 50;
  let f = gfmFees(goal, avg);
  while (goal - f.fees < need) f = gfmFees((goal += 50), avg);
  return { goal, ...f, net: goal - f.fees };
}
function gfmRow(c, inp, taxRate) {
  const price = inp.basis === "asking" ? c.price : c.target;
  const items = [[`Car (${inp.basis === "asking" ? "asking" : "target"} price)`, price], [`Sales tax (${taxRate}%)`, price * taxRate / 100]];
  if (inp.dmv) items.push(["DMV transfer & registration", c.dmv_once]);
  const extras = [];
  if (inp.inspect) extras.push(["Pre-purchase inspection", inp.inspect]);
  if (inp.insMonths) extras.push([`Insurance, ${inp.insMonths} month${inp.insMonths === 1 ? "" : "s"} × ${money(c.insurance_monthly)}`, inp.insMonths * c.insurance_monthly]);
  if (inp.cushion) extras.push(["Repair cushion", inp.cushion]);
  const sum = (xs) => xs.reduce((t, [, v]) => t + v, 0);
  const buy = sum(items);
  const extra = sum(extras);
  const need = Math.max(0, Math.round(buy + extra - inp.have));
  return { c, items, extras, buy, extra, need, ...gfmGoal(need, inp.avg) };
}

async function renderGoFundMe() {
  try { gfmData = await api("/api/gofundme"); }
  catch (e) { $("#gfm-table").innerHTML = `<tr><td colspan="7" class="text-danger">${esc(e.message)}</td></tr>`; return; }
  drawGoFundMe();
}
function drawGoFundMe() {
  if (!gfmData) return;
  const inp = gfmInputs();
  const rows = gfmData.cars.map((c) => gfmRow(c, inp, gfmData.tax_rate)).sort((a, b) => a.goal - b.goal);
  if (!rows.some((r) => r.c.id === gfmCarId)) gfmCarId = rows[0]?.c.id ?? null;
  $("#gfm-table").innerHTML = rows.length ? rows.map((r) => `<tr role="button" data-gfm-car="${r.c.id}" class="${r.c.id === gfmCarId ? "table-primary" : ""}">
      <td>${esc(r.c.name)}</td><td class="text-end">${money(r.buy)}</td><td class="text-end">${r.extra ? money(r.extra) : "–"}</td>
      <td class="text-end">${money(r.need)}</td><td class="text-end fw-bold">${money(r.goal)}</td>
      <td class="text-end text-danger">${r.fees ? money2(-r.fees) : "–"}</td><td class="text-end">${r.donations || "–"}</td></tr>`).join("")
    : `<tr><td colspan="7" class="text-body-secondary">No available cars. Mark a car as anything other than Passed or Sold to see it here.</td></tr>`;
  $("#gfm-car").innerHTML = rows.map((r) => `<option value="${r.c.id}" ${r.c.id === gfmCarId ? "selected" : ""}>${esc(r.c.name)}</option>`).join("");
  const r = rows.find((x) => x.c.id === gfmCarId);
  if (!r) { $("#gfm-detail").innerHTML = ""; return; }
  const line = (label, v, cls = "") => `<tr class="${cls}"><td>${esc(label)}</td><td class="text-end">${money(v)}</td></tr>`;
  const perGift = inp.avg * (1 - GFM_PCT) - GFM_FIXED;
  $("#gfm-detail").innerHTML = `<div class="row g-4">
    <div class="col-md-6"><table class="table table-sm mb-0"><tbody>
      ${r.items.map(([l, v]) => line(l, v)).join("")}
      ${r.extras.map(([l, v]) => line(l, v)).join("")}
      ${inp.have ? line("Already covered", -inp.have) : ""}
      ${line("Amount needed", r.need, "fw-bold table-light")}
    </tbody></table></div>
    <div class="col-md-6">${r.need ? `
      <div class="text-body-secondary small text-uppercase">Set the GoFundMe goal to</div>
      <div class="display-6 fw-bold text-primary mb-2">${money(r.goal)}</div>
      <table class="table table-sm mb-2"><tbody>
        <tr><td>2.9% of ${money(r.goal)}</td><td class="text-end text-danger">${money2(-r.pctFee)}</td></tr>
        <tr><td>$0.30 × about ${r.donations} donations of ${money(inp.avg)}</td><td class="text-end text-danger">${money2(-r.fixedFee)}</td></tr>
        <tr class="fw-bold"><td>You'd receive about</td><td class="text-end">${money(Math.floor(r.net))}</td></tr>
      </tbody></table>
      <div class="small text-body-secondary">That covers the ${money(r.need)} needed with about ${money(Math.floor(r.net - r.need))} to spare.
        Each ${money(inp.avg)} donation brings in ${money2(perGift)} after fees. If gifts run smaller, more of the total goes to the $0.30 fee.</div>`
      : `<div class="alert alert-success mb-0">Already covered. No fundraiser needed for this car.</div>`}
    </div></div>`;
}
function saveGoFundMe() {
  const f = $("#gfm-form").elements;
  const saved = { car: gfmCarId };
  for (const el of f) if (el.name) saved[el.name] = el.type === "checkbox" ? el.checked : el.value;
  try { localStorage.setItem("gofundme", JSON.stringify(saved)); } catch {}
}
$("#gfm-form").addEventListener("input", () => { drawGoFundMe(); saveGoFundMe(); });
$("#gfm-form").addEventListener("submit", (e) => e.preventDefault());
$("#gfm-car").addEventListener("change", (e) => { gfmCarId = +e.target.value; drawGoFundMe(); saveGoFundMe(); });
$("#gfm-table").addEventListener("click", (e) => {
  const id = e.target.closest("[data-gfm-car]")?.dataset.gfmCar;
  if (id) { gfmCarId = +id; drawGoFundMe(); saveGoFundMe(); }
});

/* ---------------- Marketing ---------------- */
// Files come from the server's /marketing/ folder (tools/gofundme_materials.py). ?download=1 makes the
// server send them as attachments, so Download works even from the WordPress site's other origin.
const mktUrl = (name, download = false) => abs(`/marketing/${encodeURIComponent(name)}`) + (download ? "?download=1" : "");
const fileSize = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

async function renderMarketing() {
  let m;
  try { m = await api("/api/marketing"); }
  catch (e) { $("#mkt-files").innerHTML = `<div class="col-12"><div class="alert alert-secondary mb-0">${esc(e.message)}</div></div>`; return; }
  $("#mkt-title").textContent = `${m.title} · ${money(m.goal)} goal`;
  $("#mkt-link-group").classList.toggle("d-none", !m.link);
  $("#mkt-link").value = m.link || "";
  $("#mkt-open").href = m.link || "#";
  $("#mkt-zip").href = mktUrl(m.zip, true);
  $("#mkt-zip").setAttribute("download", m.zip);
  $("#mkt-story").value = m.story;
  $("#mkt-fb").value = m.share.facebook;
  $("#mkt-ig").value = m.share.instagram;
  $("#mkt-files").innerHTML = m.files.map((f) => {
    const isPdf = f.file.endsWith(".pdf");
    const thumb = mktUrl(f.preview || f.file);
    const meta = [f.width && `${f.width}×${f.height}`, isPdf ? "PDF, letter size" : "PNG", fileSize(f.bytes)].filter(Boolean).join(" · ");
    return `<div class="col"><div class="card h-100 shadow-sm">
      <a href="${thumb}" target="_blank" rel="noopener" class="d-block bg-body-secondary text-center p-2" style="height:15rem">
        <img src="${thumb}" alt="${esc(f.label)}" loading="lazy" class="h-100 mw-100 rounded shadow-sm" style="object-fit:contain"></a>
      <div class="card-body d-flex flex-column gap-1">
        <div class="fw-semibold">${esc(f.label)}</div>
        <div class="small text-body-secondary">${esc(meta)}</div>
        <div class="small">${esc(f.use)}</div>
        <div class="d-flex gap-2 mt-auto pt-2">
          <a class="btn btn-sm btn-primary" href="${mktUrl(f.file, true)}" download="${esc(f.file)}"><i class="fa-solid fa-download me-1"></i>Download</a>
          ${isPdf ? `<a class="btn btn-sm btn-outline-primary" href="${mktUrl(f.file)}" target="_blank" rel="noopener"><i class="fa-solid fa-print me-1"></i>Open to print</a>` : ""}
        </div>
      </div></div></div>`;
  }).join("");
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { // http:// on another device: no Clipboard API, fall back to a hidden textarea
    const t = Object.assign(document.createElement("textarea"), { value: text });
    t.style.position = "fixed"; t.style.opacity = "0";
    document.body.append(t); t.select();
    const ok = document.execCommand("copy");
    t.remove();
    return ok;
  }
}
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  const field = $(btn.dataset.copy);
  const ok = await copyText(field.value);
  if (!ok) { field.focus(); field.select(); } // leave it selected so Ctrl+C / long-press Copy works
  toast(ok ? "Copied." : "Couldn't copy automatically. The text is selected, so press Ctrl+C (or long-press → Copy).", ok ? "success" : "warning");
});

/* ---------------- Notebook (NotebookLM audio) ---------------- */
const nbUrl = (name, download = false) => abs(`/notebook/${encodeURIComponent(name)}`) + (download ? "?download=1" : "");
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
let nbLoaded = false;

async function renderNotebook() {
  if (nbLoaded) return; // don't interrupt something that's playing when the shortlist reloads
  let m;
  try { m = await api("/api/notebook"); }
  catch (e) { $("#nb-episodes").innerHTML = `<div class="alert alert-secondary mb-0">${esc(e.message)}</div>`; return; }
  nbLoaded = true;
  $("#nb-title").textContent = m.title || "Notebook";
  $("#nb-intro").textContent = m.intro || "";
  $("#nb-episodes").innerHTML = m.episodes.map((ep, i) => `<div class="card shadow-sm"><div class="card-body">
      <div class="d-flex flex-wrap align-items-start gap-2 mb-2">
        <div class="me-auto">
          <h3 class="h6 mb-1"><span class="badge text-bg-primary me-2">${i + 1}</span>${esc(ep.title)}</h3>
          <div class="small text-body-secondary">${esc(ep.summary || "")}${ep.seconds ? ` · ${clock(ep.seconds)}` : ""} · ${fileSize(ep.bytes)}</div>
        </div>
        <select class="form-select form-select-sm w-auto" data-nb-speed="${i}" aria-label="Playback speed">
          ${[1, 1.25, 1.5, 1.75, 2].map((r) => `<option value="${r}">${r}×</option>`).join("")}</select>
        <a class="btn btn-sm btn-outline-primary" href="${nbUrl(ep.file, true)}" download="${esc(ep.file)}"><i class="fa-solid fa-download me-1"></i>Download</a>
      </div>
      <audio class="w-100" controls preload="metadata" data-nb="${esc(ep.file)}" src="${nbUrl(ep.file)}"></audio>
    </div></div>`).join("");

  const audios = $$("#nb-episodes audio");
  audios.forEach((a, i) => {
    const key = `nbPos:${a.dataset.nb}`;
    // Pick up where you left off (on this device), and only one episode plays at a time.
    a.addEventListener("loadedmetadata", () => {
      let pos = 0;
      try { pos = +localStorage.getItem(key) || 0; } catch {}
      if (pos > 5 && pos < a.duration - 10) a.currentTime = pos;
    }, { once: true });
    a.addEventListener("timeupdate", () => { try { localStorage.setItem(key, a.ended ? 0 : a.currentTime); } catch {} });
    a.addEventListener("ended", () => { try { localStorage.removeItem(key); } catch {} });
    a.addEventListener("play", () => audios.forEach((o) => o !== a && o.pause()));
    const speed = $(`[data-nb-speed="${i}"]`);
    try { speed.value = localStorage.getItem("nbSpeed") || "1"; } catch {}
    a.playbackRate = +speed.value;
    speed.addEventListener("change", () => {
      audios.forEach((o) => (o.playbackRate = +speed.value));
      $$("[data-nb-speed]").forEach((s) => (s.value = speed.value));
      try { localStorage.setItem("nbSpeed", speed.value); } catch {}
    });
  });
}

/* ---------------- Offline (PWA) ---------------- */
function setOffline(off) {
  $("#offline-badge")?.classList.toggle("d-none", !off);
}
addEventListener("online", () => { setOffline(false); toast("Back online.", "success"); loadCars(); });
addEventListener("offline", () => setOffline(true));
if (!navigator.onLine) setOffline(true);

// Standalone app: /sw.js. WordPress: the plugin passes its own service worker URL.
const SW_URL = CFG.sw || (CFG.embedded ? null : "/sw.js");
if ("serviceWorker" in navigator && SW_URL) {
  navigator.serviceWorker.register(SW_URL, { scope: CFG.swScope || "/" }).catch((e) => console.warn("Service worker not registered:", e));
}

// Offline needs a service worker, which browsers only allow on secure pages (https, or localhost).
// iPad/iPhone reach this computer over the network, so they must use the https address (port 8443).
const OFFLINE_CAPABLE = "serviceWorker" in navigator && window.isSecureContext && Boolean(SW_URL);
const SECURE_URL = `https://${location.hostname}:8443/`;
const SAVE_EVERY_MS = 12 * 60 * 60 * 1000;

let staleTimer;
function markOfflineStale() {
  try { localStorage.setItem("offlineStale", "1"); } catch {}
  clearTimeout(staleTimer);
  staleTimer = setTimeout(autoSaveForOffline, 15000); // refresh the offline copy shortly after edits
}

// Fetch everything once so the service worker stores it: data for every car and tab, photos, and PDFs.
// quiet: the automatic refresh on launch — no toasts unless something fails.
let savingOffline = null;
function saveForOffline(opts = {}) {
  // One save at a time: pressing the button during the automatic save joins it.
  savingOffline ??= doSaveForOffline(opts).finally(() => { savingOffline = null; });
  return savingOffline;
}
async function doSaveForOffline({ quiet = false } = {}) {
  if (!OFFLINE_CAPABLE) {
    throw new Error(location.protocol === "http:" && !["localhost", "127.0.0.1"].includes(location.hostname)
      ? `Offline mode needs the secure address. Open ${SECURE_URL} (see “Set up on iPad”).`
      : "This browser can't save the app for offline use.");
  }
  requireOnline();
  await navigator.serviceWorker.ready;
  navigator.storage?.persist?.().catch(() => {}); // ask the browser not to clear the saved copy
  const btn = $("#save-offline");
  const label = $("span", btn);
  btn.disabled = true;
  const urls = new Set([
    ...Object.values(CFG.pages || {}),
    `${API}/api/cars`, `${API}/api/dash-metrics`, `${API}/api/settings/plan`, `${API}/api/options`, `${API}/api/budget`, `${API}/api/gofundme`, `${API}/api/marketing`,
  ]);
  for (const c of cars) {
    urls.add(`${API}/api/options?car_id=${c.id}`);
    urls.add(`${API}/api/budget?car_id=${c.id}`);
    if (c.year && c.make && c.model) urls.add(`${API}/api/model-stats?${new URLSearchParams({ make: c.make, model: c.model, year: c.year })}`);
    urls.add(`${API}/api/cars/${c.id}/plan/${c.pdf_names?.plan || "plan.pdf"}`);
    urls.add(reportUrl(c.id));
    (c.images || []).forEach((u) => urls.add(u));
  }
  const list = [...urls];
  let done = 0, failed = 0;
  const worker = async () => {
    while (list.length) {
      const u = list.shift();
      try { const r = await fetch(u); if (!r.ok) throw new Error(r.status); await r.arrayBuffer(); }
      catch (e) { failed++; console.warn("Not saved for offline:", u, e); }
      done++;
      label.textContent = `${quiet ? "Updating offline copy" : "Saving"}… ${done}/${urls.size}`;
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  btn.disabled = false;
  label.textContent = failed ? "Save for offline" : "Saved for offline";
  try {
    localStorage.setItem("savedOfflineAt", new Date().toISOString());
    if (!failed) localStorage.removeItem("offlineStale");
  } catch {}
  btn.title = `Save every car, photo, budget and PDF for offline use (last saved ${new Date().toLocaleString()})`;
  if (failed) toast(`Saved ${done - failed} of ${done} items for offline use (${failed} failed).`, "warning");
  else if (!quiet) toast(`Saved ${done} items — the app now works offline.`, "success");
  setTimeout(() => { label.textContent = "Save for offline"; }, 4000);
}

// Keep the offline copy current without having to remember: on launch when online, if it's never been
// saved, is over 12 hours old, or something changed since. (A Home Screen app on iPad has its own
// storage, so this is what fills it.)
async function autoSaveForOffline() {
  if (!OFFLINE_CAPABLE || !navigator.onLine || !cars.length) return;
  let last = 0, stale = false;
  try { last = Date.parse(localStorage.getItem("savedOfflineAt") || "") || 0; stale = !!localStorage.getItem("offlineStale"); } catch {}
  if (!stale && Date.now() - last < SAVE_EVERY_MS) return;
  try { await saveForOffline({ quiet: true }); } catch (e) { console.warn("Automatic offline save skipped:", e); }
}

// On plain-http network addresses (an iPad using http://<computer>:8095), point to the secure address.
if (!OFFLINE_CAPABLE && location.protocol === "http:" && !["localhost", "127.0.0.1"].includes(location.hostname) && !CFG.embedded) {
  const bar = document.createElement("div");
  bar.className = "alert alert-warning alert-dismissible rounded-0 mb-0 small";
  bar.innerHTML = `<i class="fa-solid fa-plug-circle-xmark me-1"></i><b>Offline mode isn't available on this address.</b>
    Use <a class="alert-link" href="${SECURE_URL}">${SECURE_URL}</a> — <a class="alert-link" href="/ipad">set up on iPad</a>.
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
  document.body.prepend(bar);
}

$("#save-offline")?.addEventListener("click", () => saveForOffline().catch((e) => toast(e.message, "warning")));
if (!OFFLINE_CAPABLE) $("#save-offline")?.classList.add("d-none");
try {
  const at = localStorage.getItem("savedOfflineAt");
  if (at) $("#save-offline").title += ` (last saved ${new Date(at).toLocaleString()})`;
} catch {}

// "Install app" button where the browser supports installing (Chrome, Edge, Android).
let installPrompt = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("#install-app")?.classList.remove("d-none");
});
$("#install-app")?.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("#install-app").classList.add("d-none");
});
addEventListener("appinstalled", () => toast("Installed — find Car Finder with your other apps."));

/* ---------------- Guide ---------------- */
const GUIDE = [
  {
    t: "1 · Plan", icon: "fa-solid fa-clipboard",
    items: [
      "Set an out-the-door budget, not a sticker budget — in Ridgecrest add ~9.25% tax plus ~1–2% DMV fees.",
      "Get loan pre-approval from a credit union first so you can compare dealer financing.",
      "Think about how you'll use it here: long highway runs on US-395 / CA-14 / CA-178, summer heat over 105°F, dirt roads — favor reliable cooling, strong A/C, and good highway MPG.",
      "Insurance quotes before you buy — trucks and sporty cars can surprise you.",
    ],
  },
  {
    t: "2 · Desert-specific things to check", icon: "fa-solid fa-sun",
    items: [
      "A/C: let it run 15+ minutes at idle — it should stay ice cold. A/C repairs are expensive.",
      "Cooling system: watch the temp gauge on a long uphill; look for crusty residue around the radiator and hoses.",
      "Tires dry-rot in the sun even with good tread — check sidewalls for cracks and the 4-digit DOT date (older than ~6 years → budget for tires).",
      "Batteries die fast in heat — ask how old it is.",
      "Sun damage: cracked dash, faded/peeling clear coat, brittle rubber seals, cloudy headlights.",
      "Dust: a filthy engine air filter or cabin filter hints at off-road use and skipped maintenance.",
      "Off-road wear on trucks/SUVs: check under the car for skid-plate scrapes, bent tie rods, leaking shocks, and mismatched tires.",
    ],
  },
  {
    t: "3 · Vetting a specific car", icon: "fa-solid fa-magnifying-glass",
    items: [
      "Decode the VIN (VIN & Recalls tab) — confirm it matches the listing and the title.",
      "Run a history report (Carfax, AutoCheck, or a cheap NMVTIS check) for salvage/flood/odometer issues.",
      "Ask for maintenance records. No records on a high-mileage car = negotiate harder.",
      "Test drive: cold start (ask the seller not to warm it up), highway speed, braking, a hill climb, and a sharp turn in a parking lot.",
      "Always get a pre-purchase inspection (~$100–200) at an independent shop you choose, not one the seller recommends.",
    ],
  },
  {
    t: "4 · Buying from a dealer", icon: "fa-solid fa-shop",
    items: [
      "Negotiate the out-the-door price by email/text before you drive 2 hours to Bakersfield or Lancaster.",
      "Question large doc fees and decline add-ons (nitrogen, VIN etching, paint protection). Under California's CARS Act (in effect Oct 1, 2026), dealers must show the full price up front and can't charge for add-ons that give you no benefit.",
      "Used cars $50k or less from a dealer: since Oct 1, 2026, the CARS Act gives you 3 days to return the car for any reason (mileage limits apply, plus a restocking fee of about $200–$600). Use those days for an inspection if you didn't get one first.",
      "Read the contract — confirm the price, APR, and term match what you agreed to. Don't sign blank lines.",
      "The dealer handles tax, title, and registration paperwork.",
    ],
  },
  {
    t: "5 · Buying from a private seller", icon: "fa-solid fa-user",
    items: [
      "Seller must provide a valid smog certificate (within 90 days) for most gas cars older than 8 model years — don't accept 'it'll pass, you do it.'",
      "Get the California title (pink slip) signed by the seller(s) on line 1, with odometer reading. Make sure the name matches their ID and there's no lienholder listed (or get a lien release).",
      "Write a bill of sale (DMV form REG 135) with price, date, VIN, and both signatures.",
      "Seller files a Notice of Transfer and Release of Liability (REG 138) within 5 days.",
      "You have 10 days to transfer the title at DMV and pay use tax (same rate as sales tax). Ridgecrest DMV: 540 Perdew Ave (check hours — it isn't open every weekday).",
      "Meet in a public place — the Ridgecrest Police Department lobby is a good safe-exchange spot. Pay with a cashier's check, not cash in a parking lot.",
      "Never wire money or pay a deposit on a car you haven't seen. 'I'm deployed, the car is in a shipping depot' = scam.",
    ],
  },
  {
    t: "6 · After you buy", icon: "fa-solid fa-circle-check",
    items: [
      "Add it to your insurance before driving away.",
      "Check that any open recalls get done (free at any brand dealer — Toyota and Ford are in town).",
      "Change the oil and air filters if records were thin; check coolant and tire pressure before summer.",
      "Mark it 'Bought 🎉' in your shortlist.",
    ],
  },
];
$("#guide").innerHTML = GUIDE.map((s) => `<div class="col"><div class="card shadow-sm h-100">
    <div class="card-header fw-semibold"><i class="${s.icon} me-2 text-primary"></i>${esc(s.t)}</div>
    <ul class="list-group list-group-flush">${s.items.map((i) => `<li class="list-group-item small">${esc(i)}</li>`).join("")}</ul>
  </div></div>`).join("") +
  `<div class="col-12"><div class="form-text">General info, not legal advice. Confirm current rules at <a href="https://www.dmv.ca.gov" target="_blank" rel="noopener">dmv.ca.gov</a>.</div></div>`;

// Arriving from another WordPress page with e.g. #vin=... or #price=...&seller=...
(function applyHashParams() {
  if (!CFG.embedded || !location.hash) return;
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("vin")) { $('#vin-form [name="vin"]').value = h.get("vin"); lookupVin(h.get("vin")); }
  if (h.get("price") || h.get("seller")) {
    if (h.get("price")) $('#cost-form [name="price"]').value = h.get("price");
    if (h.get("seller")) $('#cost-form [name="sellerType"]').value = h.get("seller");
    calcCost();
  }
})();

loadCars();
