(() => {
  "use strict";
  if (window.__rackManagerV264Loaded) return;
  window.__rackManagerV264Loaded = true;

  const STORAGE_KEY = "rack-manager-v1-state";
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? "").trim();
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

  function allRooms(state, selectedSite) {
    const names = new Set();
    (state?.locationDirectory?.sites || []).forEach(site => {
      const siteName = norm(site?.name);
      if (siteName !== selectedSite) return;
      (site?.rooms || []).forEach(room => {
        const name = roomName(room);
        if (name) names.add(name);
      });
    });
    (state?.racks || []).forEach(rack => {
      if (siteOf(rack) !== selectedSite) return;
      names.add(roomOf(rack));
    });
    return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  }

  function fillSelect(select, values, preferred="") {
    if (!select) return "";
    select.innerHTML = "";
    values.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    const next = values.includes(preferred) ? preferred : (values[0] || "");
    select.value = next;
    return next;
  }

  function fillMoveRacks(preferred="") {
    const state = readState();
    const site = $("v26TargetSite")?.value || "";
    const room = $("v26TargetRoom")?.value || "";
    const rackSelect = $("v26TargetRack");
    if (!state || !rackSelect) return;

    const racks = (state.racks || []).filter(r => siteOf(r) === site && roomOf(r) === room);
    rackSelect.innerHTML = "";

    if (!racks.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "此機房尚無機櫃";
      rackSelect.appendChild(option);
      rackSelect.value = "";
      rackSelect.disabled = true;
    } else {
      racks.forEach(rack => {
        const option = document.createElement("option");
        option.value = rack.id;
        option.textContent = `${rack.name} · ${Number(rack.units) || 42}U`;
        rackSelect.appendChild(option);
      });
      rackSelect.disabled = false;
      rackSelect.value = racks.some(r => String(r.id) === String(preferred))
        ? preferred
        : racks[0].id;
    }

    rackSelect.dispatchEvent(new Event("change", {bubbles:true}));
  }

  function fillMoveRooms(preferred="", preferredRack="") {
    const state = readState();
    const site = $("v26TargetSite")?.value || "";
    const roomSelect = $("v26TargetRoom");
    if (!state || !roomSelect) return;

    const rooms = allRooms(state, site);
    const chosen = fillSelect(roomSelect, rooms, preferred);

    if (!rooms.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "此據點尚無機房";
      roomSelect.appendChild(option);
      roomSelect.value = "";
      roomSelect.disabled = true;
    } else {
      roomSelect.disabled = false;
      roomSelect.value = chosen;
    }
    fillMoveRacks(preferredRack);
  }

  function patchMoveDialog({preserve=true}={}) {
    const state = readState();
    const dialog = $("v26Move");
    const siteSelect = $("v26TargetSite");
    const roomSelect = $("v26TargetRoom");
    const rackSelect = $("v26TargetRack");
    if (!state || !dialog || !siteSelect || !roomSelect || !rackSelect) return;

    const previousSite = preserve ? siteSelect.value : "";
    const previousRoom = preserve ? roomSelect.value : "";
    const previousRack = preserve ? rackSelect.value : "";
    const sites = allSites(state);

    const chosenSite = fillSelect(siteSelect, sites, previousSite);
    if (!sites.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "尚未建立據點";
      siteSelect.appendChild(option);
      siteSelect.value = "";
      siteSelect.disabled = true;
    } else {
      siteSelect.disabled = false;
      siteSelect.value = chosenSite;
    }

    fillMoveRooms(previousRoom, previousRack);
  }

  function installMoveHandlers() {
    const dialog = $("v26Move");
    const siteSelect = $("v26TargetSite");
    const roomSelect = $("v26TargetRoom");
    if (!dialog || !siteSelect || !roomSelect || dialog.dataset.v264Installed) return;
    dialog.dataset.v264Installed = "1";

    siteSelect.addEventListener("change", event => {
      event.stopImmediatePropagation();
      fillMoveRooms("", "");
    }, true);

    roomSelect.addEventListener("change", event => {
      event.stopImmediatePropagation();
      fillMoveRacks("");
    }, true);

    new MutationObserver(() => {
      if (dialog.open) setTimeout(() => patchMoveDialog({preserve:true}), 0);
    }).observe(dialog, {attributes:true, attributeFilter:["open"]});

    if (dialog.open) patchMoveDialog({preserve:true});
  }

  function updateVersion() {
    document.title = "Rack Manager｜機櫃管理工具 V2.6.4";
    const brand = document.querySelector(".brand p");
    if (brand) brand.textContent = "機櫃管理工具 V2.6.4";
    const badge = document.querySelector("#v2Hierarchy .v231-version-badge") ||
                  document.querySelector("#v2Hierarchy .badge");
    if (badge) badge.textContent = "V2.6.4";
  }

  document.addEventListener("click", event => {
    if (!event.target.closest?.("#v26InspectorMove,#v26MoveSelected")) return;
    setTimeout(() => {
      installMoveHandlers();
      patchMoveDialog({preserve:true});
    }, 0);
  }, true);

  new MutationObserver(() => installMoveHandlers()).observe(document.body, {
    childList:true,
    subtree:true
  });

  setTimeout(() => {
    updateVersion();
    installMoveHandlers();
    if ($("v26Move")?.open) patchMoveDialog({preserve:true});
  }, 0);
})();
