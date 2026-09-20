(() => {
  "use strict";
  if (window.__rackManagerV264Loaded) return;
  window.__rackManagerV264Loaded = true;

  const STORAGE_KEY = "rack-manager-v1-state";
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";
  const ADD_RACK = "__ADD_RACK__";
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

  function ensureCreateRackButton(show) {
    const preview = $("v26Preview");
    if (!preview) return;
    let button = $("v265CreateRackFromMove");
    if (!show) {
      button?.remove();
      return;
    }
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "btn";
      button.id = "v265CreateRackFromMove";
      button.style.cssText = "margin-top:10px;width:100%";
      preview.appendChild(button);
      button.addEventListener("click", openNewRackForMove);
    }
    const site = $("v26TargetSite")?.value || "";
    const room = $("v26TargetRoom")?.value || "";
    button.textContent = `＋ 在 ${site}${room ? ` / ${room}` : ""} 新增機櫃`;
  }

  function showNeedRackPreview() {
    const preview = $("v26Preview");
    const submit = $("v26MoveSubmit");
    if (preview) {
      preview.innerHTML = `<h4>配置預覽</h4><div class="bad">此機房目前沒有可用機櫃，請先新增機櫃後再移動設備。</div>`;
    }
    if (submit) submit.disabled = true;
    ensureCreateRackButton(true);
  }

  function fillMoveRacks(preferred="") {
    const state = readState();
    const site = $("v26TargetSite")?.value || "";
    const room = $("v26TargetRoom")?.value || "";
    const rackSelect = $("v26TargetRack");
    if (!state || !rackSelect) return;

    const racks = (state.racks || [])
      .filter(r => siteOf(r) === site && roomOf(r) === room)
      .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"zh-Hant"));

    rackSelect.innerHTML = "";
    racks.forEach(rack => {
      const option = document.createElement("option");
      option.value = rack.id;
      option.textContent = `${rack.name} · ${Number(rack.units) || 42}U`;
      rackSelect.appendChild(option);
    });

    if (site && room) {
      const add = document.createElement("option");
      add.value = ADD_RACK;
      add.textContent = "＋ 新增機櫃";
      rackSelect.appendChild(add);
    }

    rackSelect.disabled = !(site && room);
    if (racks.some(r => String(r.id) === String(preferred))) {
      rackSelect.value = preferred;
    } else if (racks.length) {
      rackSelect.value = racks[0].id;
    } else if (site && room) {
      rackSelect.value = ADD_RACK;
    } else {
      rackSelect.value = "";
    }

    if (rackSelect.value === ADD_RACK || !rackSelect.value) {
      showNeedRackPreview();
    } else {
      ensureCreateRackButton(false);
      rackSelect.dispatchEvent(new Event("change", {bubbles:true}));
    }
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
    const previousRack = preserve && rackSelect.value !== ADD_RACK ? rackSelect.value : "";
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

  function prefillRackModal(site, room) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const siteSelect = $("v22RackSiteSelect");
      const roomSelect = $("v22RackRoomSelect");
      const modal = $("rackModal");
      if (modal?.open && siteSelect && roomSelect) {
        if ([...siteSelect.options].some(o => o.value === site)) {
          siteSelect.value = site;
          siteSelect.dispatchEvent(new Event("change", {bubbles:true}));
        }
        setTimeout(() => {
          const rs = $("v22RackRoomSelect");
          if (rs && [...rs.options].some(o => o.value === room)) {
            rs.value = room;
            rs.dispatchEvent(new Event("change", {bubbles:true}));
          }
        }, 0);
        clearInterval(timer);
      } else if (tries >= 25) {
        clearInterval(timer);
      }
    }, 40);
  }

  function waitForNewRack(oldIds, site, room) {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const state = readState();
      const created = (state?.racks || []).find(r => !oldIds.has(String(r.id)) && siteOf(r) === site && roomOf(r) === room);
      if (created) {
        clearInterval(timer);
        const siteSelect = $("v26TargetSite");
        const roomSelect = $("v26TargetRoom");
        if (siteSelect) siteSelect.value = site;
        if (roomSelect) roomSelect.value = room;
        fillMoveRacks(created.id);
        const rackSelect = $("v26TargetRack");
        if (rackSelect) {
          rackSelect.value = created.id;
          ensureCreateRackButton(false);
          rackSelect.dispatchEvent(new Event("change", {bubbles:true}));
        }
      } else if (tries >= 40) {
        clearInterval(timer);
        patchMoveDialog({preserve:true});
      }
    }, 100);
  }

  function openNewRackForMove() {
    const site = $("v26TargetSite")?.value || "";
    const room = $("v26TargetRoom")?.value || "";
    if (!site || !room) return;
    const state = readState();
    const oldIds = new Set((state?.racks || []).map(r => String(r.id)));
    const modal = $("rackModal");
    const form = $("rackForm");
    let submitted = false;

    const onSubmit = () => { submitted = true; };
    const onClose = () => {
      form?.removeEventListener("submit", onSubmit, true);
      modal?.removeEventListener("close", onClose);
      if (submitted) waitForNewRack(oldIds, site, room);
    };
    form?.addEventListener("submit", onSubmit, true);
    modal?.addEventListener("close", onClose);

    $("btnNewRack")?.click();
    prefillRackModal(site, room);
  }

  function installMoveHandlers() {
    const dialog = $("v26Move");
    const siteSelect = $("v26TargetSite");
    const roomSelect = $("v26TargetRoom");
    const rackSelect = $("v26TargetRack");
    if (!dialog || !siteSelect || !roomSelect || !rackSelect || dialog.dataset.v265Installed) return;
    dialog.dataset.v265Installed = "1";

    siteSelect.addEventListener("change", event => {
      event.stopImmediatePropagation();
      fillMoveRooms("", "");
    }, true);

    roomSelect.addEventListener("change", event => {
      event.stopImmediatePropagation();
      fillMoveRacks("");
    }, true);

    rackSelect.addEventListener("change", event => {
      if (rackSelect.value !== ADD_RACK) {
        ensureCreateRackButton(false);
        return;
      }
      event.stopImmediatePropagation();
      showNeedRackPreview();
      openNewRackForMove();
    }, true);

    new MutationObserver(() => {
      if (dialog.open) setTimeout(() => patchMoveDialog({preserve:true}), 0);
    }).observe(dialog, {attributes:true, attributeFilter:["open"]});

    if (dialog.open) patchMoveDialog({preserve:true});
  }

  function updateVersion() {
    document.title = "Rack Manager｜機櫃管理工具 V2.6.5";
    const brand = document.querySelector(".brand p");
    if (brand) brand.textContent = "機櫃管理工具 V2.6.5";
    const badge = document.querySelector("#v2Hierarchy .v231-version-badge") ||
                  document.querySelector("#v2Hierarchy .badge");
    if (badge) badge.textContent = "V2.6.5";
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
