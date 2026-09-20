(() => {
  "use strict";
  if (window.__rackManagerV265EmptyStateLoaded) return;
  window.__rackManagerV265EmptyStateLoaded = true;

  const STORAGE_KEY = "rack-manager-v1-state";
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? "").trim();
  const siteOf = rack => norm(rack?.siteName) || "未分類據點";
  const roomOf = rack => norm(rack?.roomName) || norm(rack?.location) || "未分類機房";

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }

  const style = document.createElement("style");
  style.textContent = `
    #v265EmptyWorkspace{display:none;min-height:520px;align-items:center;justify-content:center;padding:40px 20px;box-sizing:border-box}
    #v265EmptyWorkspace.show{display:flex}
    .v265-empty-card{width:min(520px,100%);border:1px solid #dbe3ed;border-radius:16px;background:#fff;padding:34px;text-align:center;box-shadow:0 12px 35px rgba(15,23,42,.06)}
    .v265-empty-icon{width:58px;height:58px;border-radius:15px;background:#f1f5f9;display:grid;place-items:center;margin:0 auto 16px;font-size:25px;color:#64748b}
    .v265-empty-card h3{margin:0;color:#1e293b;font-size:20px}.v265-empty-card p{margin:8px 0 18px;color:#64748b;font-size:12px;line-height:1.65}
  `;
  document.head.appendChild(style);

  let emptyMode = false;

  function ensureEmptyView() {
    let view = $("v265EmptyWorkspace");
    if (view) return view;
    const workspace = document.querySelector(".workspace");
    if (!workspace) return null;
    view = document.createElement("div");
    view.id = "v265EmptyWorkspace";
    view.innerHTML = `<div class="v265-empty-card"><div class="v265-empty-icon">▥</div><h3 id="v265EmptyTitle">目前尚無機櫃</h3><p id="v265EmptyText"></p><button class="btn primary" id="v265EmptyAddRack">＋ 新增機櫃</button></div>`;
    const stats = workspace.querySelector(".stats-row");
    stats?.before(view);
    $("v265EmptyAddRack")?.addEventListener("click", () => $("btnNewRack")?.click());
    return view;
  }

  function enterEmpty(site, room) {
    const view = ensureEmptyView();
    if (!view) return;
    emptyMode = true;
    view.classList.add("show");
    document.querySelector(".workspace .stats-row")?.classList.add("hidden");
    document.querySelector(".workspace .canvas-scroll")?.classList.add("hidden");
    document.querySelector(".workspace .workspace-controls")?.classList.add("hidden");

    const title = $("rackTitle");
    const subtitle = $("rackSubtitle");
    if (title) title.textContent = room ? `${site} / ${room}` : site;
    if (subtitle) subtitle.textContent = "目前尚無機櫃";
    const et = $("v265EmptyTitle");
    const ep = $("v265EmptyText");
    if (et) et.textContent = "目前尚無機櫃";
    if (ep) ep.textContent = `${site}${room ? ` / ${room}` : ""} 尚未建立任何機櫃，可直接新增第一個機櫃。`;

    const inspector = $("deviceInspector");
    const emptyInspector = $("emptyInspector");
    inspector?.classList.add("hidden");
    emptyInspector?.classList.remove("hidden");
    const strong = emptyInspector?.querySelector("strong");
    const p = emptyInspector?.querySelector("p");
    if (strong) strong.textContent = "目前沒有機櫃";
    if (p) p.textContent = "請先在目前據點 / 機房建立機櫃。";
    if ($("selectedBadge")) $("selectedBadge").textContent = "無機櫃";
    if ($("deviceList")) $("deviceList").innerHTML = '<div class="empty-state" style="padding:18px 8px"><strong>尚無設備</strong><p>此機房目前沒有機櫃。</p></div>';
  }

  function exitEmpty() {
    if (!emptyMode) return;
    emptyMode = false;
    $("v265EmptyWorkspace")?.classList.remove("show");
    document.querySelector(".workspace .stats-row")?.classList.remove("hidden");
    document.querySelector(".workspace .canvas-scroll")?.classList.remove("hidden");
    document.querySelector(".workspace .workspace-controls")?.classList.remove("hidden");

    const emptyInspector = $("emptyInspector");
    const strong = emptyInspector?.querySelector("strong");
    const p = emptyInspector?.querySelector("p");
    if (strong) strong.textContent = "尚未選取設備";
    if (p) p.textContent = "點選機櫃中的設備，即可查看與編輯詳細資料。";
    if ($("selectedBadge")) $("selectedBadge").textContent = "未選取";
  }

  function refresh() {
    const state = readState();
    const site = $("v2SiteSelect")?.value || "";
    const room = $("v2RoomSelect")?.value || "";
    if (!state || !site) return;
    const rack = (state.racks || []).find(r => siteOf(r) === site && (!room || roomOf(r) === room));
    if (!rack) {
      enterEmpty(site, room);
      return;
    }
    const wasEmpty = emptyMode;
    exitEmpty();
    if (wasEmpty) {
      const rackSelect = $("rackSelect");
      if (rackSelect) {
        rackSelect.value = rack.id;
        rackSelect.dispatchEvent(new Event("change", {bubbles:true}));
      }
    }
  }

  function updateVersion() {
    document.title = "Rack Manager｜機櫃管理工具 V2.6.6";
    const brand = document.querySelector(".brand p");
    if (brand) brand.textContent = "機櫃管理工具 V2.6.6";
    const badge = document.querySelector("#v2Hierarchy .v231-version-badge") || document.querySelector("#v2Hierarchy .badge");
    if (badge) badge.textContent = "V2.6.6";
  }

  document.addEventListener("change", event => {
    if (event.target?.id === "v2SiteSelect" || event.target?.id === "v2RoomSelect") {
      setTimeout(refresh, 0);
    }
    if (event.target?.id === "rackSelect") {
      setTimeout(() => { exitEmpty(); }, 0);
    }
  });

  document.addEventListener("click", event => {
    if (event.target.closest?.("#v23ManageLocations,#btnNewRack,#btnRackSettings")) {
      setTimeout(refresh, 300);
    }
  });

  new MutationObserver(() => setTimeout(refresh, 0)).observe(document.body, {childList:true, subtree:false});
  [0,150,600,1500].forEach(ms => setTimeout(updateVersion, ms));
  setTimeout(refresh, 80);
})();

if (!document.querySelector('script[data-v266-loader]')) {
  const script = document.createElement("script");
  script.src = "v266.js?v=2.6.6";
  script.dataset.v266Loader = "1";
  document.body.appendChild(script);
}
