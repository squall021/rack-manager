(() => {
  "use strict";

  // V2.3.1 hotfix:
  // V2.3 observes #v2Hierarchy child changes and then rewrites elements
  // inside the same subtree. Switching sites/rooms therefore causes a
  // MutationObserver feedback loop. Rename/reclassify those rewrite targets
  // so the legacy observer becomes read-only after this file loads.
  const hierarchy = document.getElementById("v2Hierarchy");
  const manage = document.getElementById("v22ManageLocations");
  const badge = hierarchy?.querySelector(".badge");

  if (manage) manage.id = "v23ManageLocations";
  if (badge) {
    badge.classList.remove("badge");
    badge.classList.add("v231-version-badge");
  }

  const style = document.createElement("style");
  style.textContent = `
    .v231-version-badge{
      display:inline-flex;align-items:center;justify-content:center;
      min-height:20px;padding:2px 7px;border-radius:999px;
      background:#e2e8f0;color:#475569;font-size:10px;
      font-weight:800;line-height:1;white-space:nowrap;
    }
  `;
  document.head.appendChild(style);

  if (manage) {
    if (manage.textContent !== "據點管理") manage.textContent = "據點管理";
    manage.style.flex = "1";
  }
  if (badge) badge.textContent = "V2.3.1";

  // V2.4 filter hotfix:
  // Device Inventory originally builds the Site / Room dropdowns only from
  // device rows. A site or room with racks but currently no devices is then
  // missing from the filters. Rebuild those dropdowns from the complete rack
  // hierarchy (plus the V2.2 location directory) whenever Device Inventory opens.
  const STORAGE_KEY = "rack-manager-v1-state";
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";
  const norm = value => String(value ?? "").trim();
  const siteOf = rack => norm(rack?.siteName) || DEFAULT_SITE;
  const roomOf = rack => norm(rack?.roomName) || norm(rack?.location) || DEFAULT_ROOM;

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }

  function allSites(state) {
    const names = new Set();
    (state?.locationDirectory?.sites || []).forEach(site => {
      const name = norm(site?.name);
      if (name) names.add(name);
    });
    (state?.racks || []).forEach(rack => names.add(siteOf(rack)));
    return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  }

  function allRooms(state, selectedSite="") {
    const names = new Set();
    (state?.locationDirectory?.sites || []).forEach(site => {
      const siteName = norm(site?.name);
      if (selectedSite && siteName !== selectedSite) return;
      (site?.rooms || []).forEach(room => {
        const name = norm(typeof room === "string" ? room : room?.name || room?.roomName || room?.label);
        if (name) names.add(name);
      });
    });
    (state?.racks || []).forEach(rack => {
      if (selectedSite && siteOf(rack) !== selectedSite) return;
      names.add(roomOf(rack));
    });
    return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  }

  function fillRoomsFromHierarchy() {
    const state = readState();
    const siteSelect = document.getElementById("v24Site");
    const roomSelect = document.getElementById("v24Room");
    if (!state || !siteSelect || !roomSelect) return;
    const previous = roomSelect.value;
    const rooms = allRooms(state, siteSelect.value);
    roomSelect.innerHTML = '<option value="">全部機房</option>' + rooms.map(room => {
      const option = document.createElement("option");
      option.value = room;
      option.textContent = room;
      return option.outerHTML;
    }).join("");
    if (rooms.includes(previous)) roomSelect.value = previous;
  }

  function patchOverviewFilters() {
    const state = readState();
    const siteSelect = document.getElementById("v24Site");
    if (!state || !siteSelect) return;

    const previous = siteSelect.value;
    const sites = allSites(state);
    siteSelect.innerHTML = '<option value="">全部據點</option>' + sites.map(site => {
      const option = document.createElement("option");
      option.value = site;
      option.textContent = site;
      return option.outerHTML;
    }).join("");
    if (sites.includes(previous)) siteSelect.value = previous;

    fillRoomsFromHierarchy();

    if (!siteSelect.dataset.v24HierarchyFilterFix) {
      siteSelect.dataset.v24HierarchyFilterFix = "1";
      siteSelect.addEventListener("change", () => setTimeout(fillRoomsFromHierarchy, 0));
    }
  }

  document.addEventListener("click", event => {
    if (!event.target.closest?.("#v24OverviewBtn")) return;
    setTimeout(patchOverviewFilters, 0);
  });
})();

// Compatibility loaders. Direct page scripts may already load V2.6; guards prevent duplicates.
window.addEventListener("load", () => {
  if (!document.querySelector('script[data-v251-loader]')) {
    const script = document.createElement("script");
    script.src = "v251.js?v=2.6";
    script.dataset.v251Loader = "1";
    document.body.appendChild(script);
  }
  if (!document.querySelector('script[data-v261-loader]')) {
    const fix = document.createElement("script");
    fix.src = "v261.js?v=2.6.2";
    fix.dataset.v261Loader = "1";
    document.body.appendChild(fix);
  }
}, { once:true });
