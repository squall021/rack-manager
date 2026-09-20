(() => {
  "use strict";
  if (window.__rackManagerV263Loaded) return;
  window.__rackManagerV263Loaded = true;

  const STORAGE_KEY = "rack-manager-v1-state";
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? "").trim();
  const siteOf = rack => norm(rack?.siteName) || DEFAULT_SITE;
  const roomOf = rack => norm(rack?.roomName) || norm(rack?.location) || DEFAULT_ROOM;

  function readState(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }
  function roomName(room){
    return typeof room === "string" ? norm(room) : norm(room?.name || room?.roomName || room?.label);
  }
  function allSites(state){
    const names=new Set();
    (state?.locationDirectory?.sites||[]).forEach(s=>{ const n=norm(s?.name); if(n) names.add(n); });
    (state?.racks||[]).forEach(r=>names.add(siteOf(r)));
    return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  }
  function allRooms(state,site=""){
    const names=new Set();
    (state?.locationDirectory?.sites||[]).forEach(s=>{
      const sn=norm(s?.name); if(site && sn!==site) return;
      (s?.rooms||[]).forEach(r=>{ const n=roomName(r); if(n) names.add(n); });
    });
    (state?.racks||[]).forEach(r=>{ if(!site || siteOf(r)===site) names.add(roomOf(r)); });
    return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  }
  function roomPairs(state){
    const pairs=new Set();
    allSites(state).forEach(site=>allRooms(state,site).forEach(room=>pairs.add(`${site}\u241f${room}`)));
    return pairs;
  }
  function fillOptions(select,values,placeholder=null,preferred=""){
    if(!select) return "";
    const items=[];
    if(placeholder!==null) items.push({value:"",label:placeholder});
    values.forEach(v=>items.push({value:v,label:v}));
    const sig=items.map(x=>`${x.value}\u241e${x.label}`).join("\u241d");
    if(select.dataset.v263Options!==sig){
      select.innerHTML="";
      items.forEach(x=>{ const o=document.createElement("option"); o.value=x.value; o.textContent=x.label; select.appendChild(o); });
      select.dataset.v263Options=sig;
    }
    const wanted=items.some(x=>x.value===preferred)?preferred:(items[0]?.value||"");
    if(select.value!==wanted) select.value=wanted;
    return wanted;
  }
  function activeRack(state){
    return state?.racks?.find(r=>r.id===state.activeRackId) || state?.racks?.[0] || null;
  }
  function setVersion(){
    document.title="Rack Manager｜機櫃管理工具 V2.6.3";
    const brand=document.querySelector(".brand p"); if(brand) brand.textContent="機櫃管理工具 V2.6.3";
    const badge=document.querySelector("#v2Hierarchy .v231-version-badge")||document.querySelector("#v2Hierarchy .badge");
    if(badge) badge.textContent="V2.6.3";
  }

  // ---- Left hierarchy: replace legacy selects so the old V2 listeners can no longer
  // rebuild them from racks only. The new controls use locationDirectory + racks.
  let hSite=null,hRoom=null;
  function cloneSelect(id){
    const old=$(id); if(!old) return null;
    if(old.dataset.v263Native==="1") return old;
    const fresh=old.cloneNode(true);
    fresh.dataset.v263Native="1";
    old.replaceWith(fresh);
    return fresh;
  }
  function updateEmptyHint(site,room){
    const state=readState(); if(!state) return;
    const hasRack=(state.racks||[]).some(r=>siteOf(r)===site && (!room || roomOf(r)===room));
    let note=$("v263EmptyLocationNote");
    if(hasRack || !site){ note?.remove(); return; }
    if(!note){
      note=document.createElement("div"); note.id="v263EmptyLocationNote";
      note.style.cssText="margin-top:7px;padding:7px 9px;border:1px solid #dbe3ed;border-radius:8px;background:#fff;font-size:10px;color:#64748b;line-height:1.45";
      $("v2Hierarchy")?.querySelector(".v2-hierarchy-grid")?.after(note);
    }
    note.textContent=`${site}${room?` / ${room}`:""} 目前尚無機櫃，可直接按「＋ 新增機櫃」建立。`;
    const crumb=$("v2Breadcrumb");
    if(crumb) crumb.innerHTML=`<b>${escapeHtml(site)}</b>${room?`<span>›</span><b>${escapeHtml(room)}</b>`:""}<span>›</span><span>尚無機櫃</span>`;
  }
  function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
  function fillHierarchy(preferSite="",preferRoom=""){
    const state=readState(); if(!state||!hSite||!hRoom) return;
    const rack=activeRack(state),sites=allSites(state);
    const site=sites.includes(preferSite)?preferSite:(rack&&sites.includes(siteOf(rack))?siteOf(rack):(sites[0]||""));
    fillOptions(hSite,sites,null,site);
    const rooms=allRooms(state,hSite.value);
    const room=rooms.includes(preferRoom)?preferRoom:(rack&&siteOf(rack)===hSite.value&&rooms.includes(roomOf(rack))?roomOf(rack):(rooms[0]||""));
    fillOptions(hRoom,rooms,null,room);
    updateEmptyHint(hSite.value,hRoom.value);
  }
  function selectRackIfAvailable(){
    const state=readState(); if(!state||!hSite||!hRoom) return;
    const target=(state.racks||[]).find(r=>siteOf(r)===hSite.value && roomOf(r)===hRoom.value);
    if(!target){ updateEmptyHint(hSite.value,hRoom.value); return; }
    $("v263EmptyLocationNote")?.remove();
    const rackSelect=$("rackSelect");
    if(rackSelect && rackSelect.value!==target.id){
      rackSelect.value=target.id;
      rackSelect.dispatchEvent(new Event("change",{bubbles:true}));
    }
  }
  function installHierarchy(){
    const oldSite=$("v2SiteSelect"),oldRoom=$("v2RoomSelect"); if(!oldSite||!oldRoom) return;
    const oldSiteValue=oldSite.value,oldRoomValue=oldRoom.value;
    hSite=cloneSelect("v2SiteSelect"); hRoom=cloneSelect("v2RoomSelect");
    fillHierarchy(oldSiteValue,oldRoomValue);
    hSite.addEventListener("change",()=>{
      const state=readState(); if(!state) return;
      const rooms=allRooms(state,hSite.value);
      fillOptions(hRoom,rooms,null,rooms[0]||"");
      selectRackIfAvailable();
    });
    hRoom.addEventListener("change",selectRackIfAvailable);
    $("rackSelect")?.addEventListener("change",()=>{
      setTimeout(()=>{
        const state=readState(),rack=activeRack(state); if(!rack) return;
        fillHierarchy(siteOf(rack),roomOf(rack));
      },30);
    });
  }
  function refreshHierarchyPreserving(){
    if(!hSite||!hRoom) return;
    fillHierarchy(hSite.value,hRoom.value);
  }

  // ---- Device manager: keep the original V2.6 controls (its closures depend on
  // them), but intercept selection of a directory-only site before V2.6 clears it.
  let managerWantedSite="",managerWantedRoom="",managerObserver=null;
  function patchManagerOptions(){
    const state=readState(),siteSel=$("v26Site"),roomSel=$("v26Room");
    if(!state||!siteSel||!roomSel) return;
    const sites=allSites(state);
    const desiredSite=sites.includes(managerWantedSite)?managerWantedSite:(sites.includes(siteSel.value)?siteSel.value:"");
    fillOptions(siteSel,sites,"全部據點",desiredSite);
    managerWantedSite=siteSel.value;
    const rooms=allRooms(state,siteSel.value);
    const desiredRoom=rooms.includes(managerWantedRoom)?managerWantedRoom:(rooms.includes(roomSel.value)?roomSel.value:"");
    fillOptions(roomSel,rooms,"全部機房",desiredRoom);
    managerWantedRoom=roomSel.value;
    patchManagerSummary();
    attachManagerObserver();
  }
  function patchManagerSummary(){
    const state=readState(),summary=$("v26Summary"); if(!state||!summary) return;
    const nums=summary.querySelectorAll(".v26-card strong");
    if(nums[0]) nums[0].textContent=String(allSites(state).length);
    if(nums[1]) nums[1].textContent=String(roomPairs(state).size);
  }
  function renderEmptyManagerSite(){
    const state=readState(); if(!state) return;
    const all=(state.racks||[]).reduce((n,r)=>n+(r.devices||[]).length,0)+(Array.isArray(state.unassignedDevices)?state.unassignedDevices.length:0);
    const body=$("v26Body"),count=$("v26Count");
    if(body) body.innerHTML='<tr><td colspan="7"><div class="v26-empty">此據點目前沒有設備</div></td></tr>';
    if(count) count.textContent=`顯示 0 / ${all} 台設備`;
    const selectAll=$("v26SelectAll"); if(selectAll){ selectAll.checked=false; selectAll.indeterminate=false; }
    $("v26Selection")?.classList.remove("show");
    patchManagerSummary();
  }
  function attachManagerObserver(){
    const siteSel=$("v26Site"); if(!siteSel||siteSel.dataset.v263Observed==="1") return;
    siteSel.dataset.v263Observed="1";
    managerObserver=new MutationObserver(()=>queueMicrotask(patchManagerOptions));
    managerObserver.observe(siteSel,{childList:true});
  }

  document.addEventListener("change",event=>{
    if(event.target?.id==="v26Site"){
      managerWantedSite=event.target.value;
      managerWantedRoom="";
      const state=readState();
      const hasRack=!managerWantedSite || (state?.racks||[]).some(r=>siteOf(r)===managerWantedSite);
      if(managerWantedSite && !hasRack){
        // Capture phase prevents V2.6's racks-only fillManagerFilters() from clearing this site.
        event.stopImmediatePropagation();
        const roomSel=$("v26Room"),rooms=allRooms(state,managerWantedSite);
        fillOptions(roomSel,rooms,"全部機房",rooms[0]||"");
        managerWantedRoom=roomSel?.value||"";
        renderEmptyManagerSite();
        return;
      }
      setTimeout(patchManagerOptions,0);
    } else if(event.target?.id==="v26Room"){
      managerWantedRoom=event.target.value;
      setTimeout(patchManagerSummary,0);
    }
  },true);

  document.addEventListener("click",event=>{
    if(event.target.closest?.("#v26ManageBtn")){
      setTimeout(()=>{
        const s=$("v26Site"),r=$("v26Room");
        managerWantedSite=s?.value||""; managerWantedRoom=r?.value||"";
        patchManagerOptions();
      },40);
    }
    if(event.target.closest?.("#v23ManageLocations") || event.target.closest?.("#v22ManageDialog")){
      setTimeout(()=>{ refreshHierarchyPreserving(); patchManagerOptions(); },320);
    }
  });

  // Keep manager counts correct after V2.6 re-renders cards/tabs.
  document.addEventListener("click",event=>{
    if(event.target.closest?.("#v26Manager")) setTimeout(()=>{ patchManagerOptions(); patchManagerSummary(); },0);
  });

  setVersion();
  installHierarchy();
  setTimeout(()=>{ refreshHierarchyPreserving(); patchManagerOptions(); },0);
})();