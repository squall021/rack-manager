(() => {
  "use strict";
  if (window.__rackManagerV266Loaded) return;
  window.__rackManagerV266Loaded = true;

  const STORAGE_KEY = "rack-manager-v1-state";
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? "").trim();
  const siteOf = r => norm(r?.siteName) || "未分類據點";
  const roomOf = r => norm(r?.roomName) || norm(r?.location) || "未分類機房";
  let suppressActiveSyncUntil = 0;
  let observer = null;
  let scheduled = false;

  function readState(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }

  function esc(s){
    return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }

  function roomsFor(state, site){
    const names = new Set();
    (state?.locationDirectory?.sites || []).forEach(s => {
      if (norm(s?.name) !== site) return;
      (s?.rooms || []).forEach(room => {
        const name = norm(typeof room === "string" ? room : room?.name || room?.roomName || room?.label);
        if (name) names.add(name);
      });
    });
    (state?.racks || []).forEach(r => {
      if (siteOf(r) === site) names.add(roomOf(r));
    });
    return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  }

  function setRoomOptions(state, site, preferred){
    const select = $("v2RoomSelect");
    if (!select) return;
    const rooms = roomsFor(state, site);
    const sig = rooms.join("\u241f");
    if (select.dataset.v266Rooms !== sig) {
      select.innerHTML = rooms.map(room => `<option value="${esc(room)}">${esc(room)}</option>`).join("");
      select.dataset.v266Rooms = sig;
    }
    if (rooms.includes(preferred)) select.value = preferred;
    else if (rooms.length && !rooms.includes(select.value)) select.value = rooms[0];
  }

  function updateBreadcrumb(site, room, rack){
    const crumb = $("v2Breadcrumb");
    if (!crumb) return;
    crumb.innerHTML = `<b>${esc(site)}</b><span>›</span><b>${esc(room)}</b><span>›</span><span>${esc(rack?.name || "尚無機櫃")}</span>`;
  }

  function syncHierarchyToActive(state){
    if (Date.now() < suppressActiveSyncUntil) return false;
    const active = (state?.racks || []).find(r => String(r.id) === String(state.activeRackId));
    if (!active) return false;
    const site = siteOf(active), room = roomOf(active);
    const siteSelect = $("v2SiteSelect"), roomSelect = $("v2RoomSelect");
    if (!siteSelect || !roomSelect) return false;

    const activeDiffers = siteSelect.value !== site || roomSelect.value !== room;
    if (!activeDiffers) return false;

    if (![...siteSelect.options].some(o => o.value === site)) {
      const o = document.createElement("option"); o.value = site; o.textContent = site; siteSelect.appendChild(o);
    }
    siteSelect.value = site;
    setRoomOptions(state, site, room);
    roomSelect.value = room;
    $("v263EmptyLocationNote")?.remove();
    $("v265EmptyWorkspace")?.classList.remove("show");
    document.querySelector(".workspace .stats-row")?.classList.remove("hidden");
    document.querySelector(".workspace .canvas-scroll")?.classList.remove("hidden");
    document.querySelector(".workspace .workspace-controls")?.classList.remove("hidden");
    updateBreadcrumb(site, room, active);
    return true;
  }

  function connectObserver(){
    const select = $("rackSelect");
    if (!select || !observer) return;
    observer.observe(select,{childList:true});
  }

  function filterRackSelect({syncFromActive=false, selectFirst=false}={}){
    const state = readState();
    const select = $("rackSelect");
    const siteSelect = $("v2SiteSelect");
    const roomSelect = $("v2RoomSelect");
    if (!state || !select || !siteSelect || !roomSelect) return;

    if (syncFromActive) syncHierarchyToActive(state);

    const site = siteSelect.value;
    const room = roomSelect.value;
    const racks = (state.racks || []).filter(r => siteOf(r) === site && roomOf(r) === room);
    const activeInScope = racks.find(r => String(r.id) === String(state.activeRackId));
    const current = racks.find(r => String(r.id) === String(select.value));
    const chosen = activeInScope || current || racks[0] || null;

    observer?.disconnect();
    select.innerHTML = "";
    if (!racks.length) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = "此機房尚無機櫃";
      select.appendChild(o);
      select.value = "";
      select.disabled = true;
      updateBreadcrumb(site, room, null);
    } else {
      racks.forEach(r => {
        const o = document.createElement("option");
        o.value = r.id;
        o.textContent = `${r.name} · ${Number(r.units) || 42}U`;
        select.appendChild(o);
      });
      select.disabled = false;
      select.value = chosen?.id || racks[0].id;
      updateBreadcrumb(site, room, chosen || racks[0]);
    }
    connectObserver();

    if (selectFirst && chosen && String(state.activeRackId) !== String(chosen.id)) {
      select.dispatchEvent(new Event("change",{bubbles:true}));
    }
  }

  function scheduleFilter(opts={}){
    if (scheduled) return;
    scheduled = true;
    setTimeout(()=>{ scheduled=false; filterRackSelect(opts); },0);
  }

  function install(){
    const rackSelect = $("rackSelect");
    if (!rackSelect) return;

    observer = new MutationObserver(() => scheduleFilter({syncFromActive:true}));
    connectObserver();

    document.addEventListener("change", event => {
      if (event.target?.id === "v2SiteSelect" || event.target?.id === "v2RoomSelect") {
        suppressActiveSyncUntil = Date.now() + 500;
        setTimeout(()=>filterRackSelect({syncFromActive:false,selectFirst:true}),0);
      } else if (event.target?.id === "rackSelect") {
        setTimeout(()=>filterRackSelect({syncFromActive:true}),20);
      }
    });

    // JSON import is also used by the device-move engine. After the import has
    // replaced activeRackId, renderAll rebuilds rackSelect; the observer above
    // synchronizes Site / Room to the destination rack and scopes the list.
    $("jsonImport")?.addEventListener("change",()=>{
      setTimeout(()=>filterRackSelect({syncFromActive:true}),320);
    });

    // Keep the selector scoped after rack create/edit or location management.
    document.addEventListener("click", event => {
      if (event.target.closest?.("#btnNewRack,#btnRackSettings,#v23ManageLocations")) {
        setTimeout(()=>filterRackSelect({syncFromActive:true}),360);
      }
    });

    filterRackSelect({syncFromActive:true});
  }

  function setVersion(){
    document.title = "Rack Manager｜機櫃管理工具 V2.6.6";
    const brand = document.querySelector(".brand p");
    if (brand) brand.textContent = "機櫃管理工具 V2.6.6";
    const badge = document.querySelector("#v2Hierarchy .v231-version-badge") || document.querySelector("#v2Hierarchy .badge");
    if (badge) badge.textContent = "V2.6.6";
  }

  setTimeout(()=>{ setVersion(); install(); },0);
  setTimeout(setVersion,500);
})();
