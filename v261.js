(() => {
  "use strict";
  if (window.__rackManagerV262Loaded) return;
  window.__rackManagerV262Loaded = true;

  const STORAGE_KEY = "rack-manager-v1-state";
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";
  const $ = id => document.getElementById(id);
  const norm = value => String(value ?? "").trim();
  const siteOf = rack => norm(rack?.siteName) || DEFAULT_SITE;
  const roomOf = rack => norm(rack?.roomName) || norm(rack?.location) || DEFAULT_ROOM;

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }

  function roomName(room) {
    if (typeof room === "string") return norm(room);
    return norm(room?.name || room?.roomName || room?.label);
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
        const name = roomName(room);
        if (name) names.add(name);
      });
    });
    (state?.racks || []).forEach(rack => {
      if (selectedSite && siteOf(rack) !== selectedSite) return;
      names.add(roomOf(rack));
    });
    return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  }

  function roomPairs(state) {
    const pairs = new Set();
    (state?.locationDirectory?.sites || []).forEach(site => {
      const siteName = norm(site?.name);
      if (!siteName) return;
      (site?.rooms || []).forEach(room => {
        const name = roomName(room);
        if (name) pairs.add(`${siteName}\u241f${name}`);
      });
    });
    (state?.racks || []).forEach(rack => pairs.add(`${siteOf(rack)}\u241f${roomOf(rack)}`));
    return pairs;
  }

  function siteHasRack(state, site) {
    return !!site && (state?.racks || []).some(rack => siteOf(rack) === site);
  }

  function setOptions(select, values, firstLabel, preferred="") {
    if (!select) return "";
    const options = [];
    if (firstLabel != null) options.push({value:"", label:firstLabel});
    values.forEach(value => options.push({value, label:value}));
    const signature = options.map(o=>`${o.value}\u241e${o.label}`).join("\u241d");
    if (select.dataset.v262Options !== signature) {
      select.innerHTML = "";
      options.forEach(({value,label}) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      });
      select.dataset.v262Options = signature;
    }
    const wanted = options.some(o=>o.value===preferred) ? preferred : (options[0]?.value || "");
    if (select.value !== wanted) select.value = wanted;
    return wanted;
  }

  let pinnedHierarchySite = "";
  let pinnedHierarchyRoom = "";
  let pinnedManagerSite = "";
  let hierarchyPatching = false;

  function patchHierarchy({preserve=true}={}) {
    if (hierarchyPatching) return;
    const state = readState();
    const siteSelect = $("v2SiteSelect");
    const roomSelect = $("v2RoomSelect");
    if (!state || !siteSelect || !roomSelect) return;
    hierarchyPatching = true;
    try {
      const sites = allSites(state);
      if (pinnedHierarchySite && !sites.includes(pinnedHierarchySite)) {
        pinnedHierarchySite = "";
        pinnedHierarchyRoom = "";
      }

      const active = (state.racks || []).find(r=>r.id===state.activeRackId) || state.racks?.[0] || null;
      const oldSite = preserve ? siteSelect.value : "";
      const preferredSite = pinnedHierarchySite || (sites.includes(oldSite) ? oldSite : (active ? siteOf(active) : sites[0] || ""));
      setOptions(siteSelect, sites, null, preferredSite);

      const rooms = allRooms(state, siteSelect.value);
      if (pinnedHierarchyRoom && !rooms.includes(pinnedHierarchyRoom)) pinnedHierarchyRoom = "";
      const oldRoom = preserve ? roomSelect.value : "";
      const activeRoom = active && siteOf(active)===siteSelect.value ? roomOf(active) : "";
      const preferredRoom = pinnedHierarchyRoom || (rooms.includes(oldRoom) ? oldRoom : (rooms.includes(activeRoom) ? activeRoom : rooms[0] || ""));
      setOptions(roomSelect, rooms, null, preferredRoom);
    } finally {
      hierarchyPatching = false;
    }
  }

  let managerPatching = false;
  function patchManagerFilters() {
    if (managerPatching) return;
    const state = readState();
    const manager = $("v26Manager");
    const siteSelect = $("v26Site");
    const roomSelect = $("v26Room");
    if (!state || !manager || !siteSelect || !roomSelect) return;
    managerPatching = true;
    try {
      const sites = allSites(state);
      if (pinnedManagerSite && !sites.includes(pinnedManagerSite)) pinnedManagerSite = "";
      const oldSite = siteSelect.value;
      const preferredSite = pinnedManagerSite || (sites.includes(oldSite) ? oldSite : "");
      setOptions(siteSelect, sites, "全部據點", preferredSite);

      const oldRoom = roomSelect.value;
      const rooms = allRooms(state, siteSelect.value);
      setOptions(roomSelect, rooms, "全部機房", rooms.includes(oldRoom) ? oldRoom : "");

      const summary = $("v26Summary");
      if (summary) {
        const cards = summary.querySelectorAll(".v26-card strong");
        if (cards[0] && cards[0].textContent !== String(sites.length)) cards[0].textContent = String(sites.length);
        if (cards[1] && cards[1].textContent !== String(roomPairs(state).size)) cards[1].textContent = String(roomPairs(state).size);
      }
    } finally {
      managerPatching = false;
    }
  }

  function rerenderManagerWithoutRebuildingFilters() {
    const search = $("v26Search");
    if (search) search.dispatchEvent(new Event("input", {bubbles:true}));
  }

  function updateVersion() {
    document.title = "Rack Manager｜機櫃管理工具 V2.6.2";
    const brand = document.querySelector(".brand p");
    if (brand) brand.textContent = "機櫃管理工具 V2.6.2";
    const badge = document.querySelector("#v2Hierarchy .v231-version-badge") || document.querySelector("#v2Hierarchy .badge");
    if (badge) badge.textContent = "V2.6.2";
  }

  function attachManagerObservers() {
    const manager = $("v26Manager");
    if (!manager || manager.dataset.v262Observed) return;
    manager.dataset.v262Observed = "1";

    const summary = $("v26Summary");
    if (summary) {
      new MutationObserver(() => setTimeout(patchManagerFilters, 0)).observe(summary,{childList:true,subtree:true,characterData:true});
    }

    const siteSelect = $("v26Site");
    if (siteSelect) {
      new MutationObserver(() => setTimeout(patchManagerFilters, 0)).observe(siteSelect,{childList:true});
    }
  }

  // Capture empty-directory site changes before legacy V2/V2.6 handlers rebuild
  // their options only from racks and therefore discard the selected site.
  document.addEventListener("change", event => {
    const id = event.target?.id;
    if (!id) return;
    const state = readState();
    if (!state) return;

    if (id === "v2SiteSelect") {
      const requested = norm(event.target.value);
      if (requested && !siteHasRack(state, requested)) {
        pinnedHierarchySite = requested;
        const rooms = allRooms(state, requested);
        pinnedHierarchyRoom = rooms.includes($("v2RoomSelect")?.value) ? $("v2RoomSelect").value : (rooms[0] || "");
        event.stopPropagation();
        setTimeout(()=>patchHierarchy({preserve:true}),0);
        return;
      }
      pinnedHierarchySite = "";
      pinnedHierarchyRoom = "";
      setTimeout(()=>patchHierarchy({preserve:true}),0);
      return;
    }

    if (id === "v2RoomSelect" && pinnedHierarchySite) {
      pinnedHierarchyRoom = norm(event.target.value);
      event.stopPropagation();
      setTimeout(()=>patchHierarchy({preserve:true}),0);
      return;
    }

    if (id === "v26Site") {
      const requested = norm(event.target.value);
      if (requested && !siteHasRack(state, requested)) {
        pinnedManagerSite = requested;
        event.stopPropagation();
        setTimeout(()=>{
          patchManagerFilters();
          rerenderManagerWithoutRebuildingFilters();
          setTimeout(patchManagerFilters,0);
        },0);
        return;
      }
      pinnedManagerSite = "";
      setTimeout(patchManagerFilters,0);
    }
  }, true);

  document.addEventListener("click", event => {
    if (event.target.closest?.("#v26ManageBtn")) {
      setTimeout(() => { attachManagerObservers(); patchManagerFilters(); }, 40);
    }
    if (event.target.closest?.("#v23ManageLocations")) {
      setTimeout(()=>patchHierarchy({preserve:true}),80);
    }
  });

  const rackSelect = $("rackSelect");
  rackSelect?.addEventListener("change", () => {
    pinnedHierarchySite = "";
    pinnedHierarchyRoom = "";
    setTimeout(()=>patchHierarchy({preserve:false}),90);
  });

  const rackMeta = $("rackMeta");
  if (rackMeta) {
    new MutationObserver(() => setTimeout(()=>patchHierarchy({preserve:true}),0)).observe(rackMeta,{childList:true,subtree:true,characterData:true});
  }

  setTimeout(() => {
    updateVersion();
    patchHierarchy({preserve:true});
    attachManagerObservers();
    patchManagerFilters();
  }, 0);
})();