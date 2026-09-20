(() => {
  "use strict";

  const STORAGE_KEY = "rack-manager-v1-state";
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";
  const TYPE_LABELS = {
    switch:"網路交換器", router:"路由器 / 防火牆", patch:"Patch Panel", cable:"理線架",
    server:"伺服器", nas:"NAS", ups:"UPS", pdu:"PDU", shelf:"層板 / 其他", other:"其他"
  };
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? "").trim();
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const siteOf = rack => norm(rack?.siteName) || DEFAULT_SITE;
  const roomOf = rack => norm(rack?.roomName) || norm(rack?.location) || DEFAULT_ROOM;

  const style=document.createElement("style");
  style.textContent=`
    #v24OverviewBtn{display:none!important}
    #v25DispatchBtn{white-space:nowrap}
    #v25Dispatch.v251-ready .v25-summary{grid-template-columns:repeat(6,minmax(0,1fr))}
    #v25Dispatch.v251-ready .v25-toolbar{grid-template-columns:minmax(220px,2fr) repeat(4,minmax(115px,1fr)) auto}
    #v25Dispatch.v251-ready #v25Kind{display:none}
    .v251-tabs{display:flex;align-items:center;gap:6px;margin:0 0 10px;flex-wrap:wrap}
    .v251-tab{border:1px solid #dbe3ed;background:#fff;color:#526176;border-radius:999px;padding:6px 11px;font-size:10px;font-weight:800;cursor:pointer}
    .v251-tab.active{background:#0f172a;border-color:#0f172a;color:#fff}
    .v251-tab span{opacity:.72;margin-left:4px}
    .v251-menu-trigger{width:30px;height:28px;border:1px solid #dbe3ed;background:#fff;border-radius:7px;color:#475569;font-weight:900;cursor:pointer;font-size:15px;line-height:1}
    .v251-menu-trigger:hover{border-color:#93c5fd;color:#2563eb}
    .v251-action-popup{position:fixed;z-index:30000;min-width:150px;background:#fff;border:1px solid #dbe3ed;border-radius:10px;box-shadow:0 16px 44px rgba(15,23,42,.24);padding:5px;display:grid;gap:2px}
    .v251-action-popup button{border:0;background:transparent;border-radius:7px;padding:8px 9px;text-align:left;font-size:10px;color:#334155;cursor:pointer;white-space:nowrap}
    .v251-action-popup button:hover{background:#f1f5f9}.v251-action-popup button.danger{color:#b91c1c}
    .v251-zero-note{color:#94a3b8}
    @media(max-width:1050px){#v25Dispatch.v251-ready .v25-summary{grid-template-columns:repeat(3,1fr)}#v25Dispatch.v251-ready .v25-toolbar{grid-template-columns:1fr 1fr 1fr}.v25-toolbar #v25Search{grid-column:1/-1}.v25-toolbar #v25NewUnassigned{grid-column:1/-1}}
    @media(max-width:680px){#v25Dispatch.v251-ready .v25-summary,#v25Dispatch.v251-ready .v25-toolbar{grid-template-columns:1fr}.v25-toolbar #v25Search,.v25-toolbar #v25NewUnassigned{grid-column:auto}}
  `;
  document.head.appendChild(style);

  function readState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");}catch{return null;}}
  function allSites(state){
    const set=new Set();
    (state?.locationDirectory?.sites||[]).forEach(s=>{const n=norm(s?.name);if(n)set.add(n);});
    (state?.racks||[]).forEach(r=>set.add(siteOf(r)));
    return [...set].filter(Boolean).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  }
  function allRooms(state,site=""){
    const set=new Set();
    (state?.locationDirectory?.sites||[]).forEach(s=>{
      const sn=norm(s?.name);if(site&&sn!==site)return;
      (s?.rooms||[]).forEach(r=>{const n=norm(r);if(n)set.add(n);});
    });
    (state?.racks||[]).forEach(r=>{if(site&&siteOf(r)!==site)return;set.add(roomOf(r));});
    return [...set].filter(Boolean).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  }
  function allDevices(state){
    const mounted=[];(state?.racks||[]).forEach(r=>(r.devices||[]).forEach(d=>mounted.push({d,r,site:siteOf(r),room:roomOf(r)})));
    const pool=Array.isArray(state?.unassignedDevices)?state.unassignedDevices:[];
    return {mounted,pool,all:[...mounted.map(x=>x.d),...pool]};
  }

  let roomFilter=null,typeFilter=null,statusFilter=null,tabs=null,tbodyObserver=null,postScheduled=false,popup=null;

  function installTop(){
    const overview=$("v24OverviewBtn");if(overview)overview.style.display="none";
    const dispatch=$("v25DispatchBtn");
    if(dispatch){dispatch.textContent="設備管理";dispatch.title="搜尋、篩選、定位、移動、上架與管理設備";}
    const badge=document.querySelector("#v2Hierarchy .v231-version-badge")||document.querySelector("#v2Hierarchy .badge");
    if(badge)badge.textContent="V2.5.1";
  }

  function buildTabs(dialog){
    if($("v251Tabs"))return;
    tabs=document.createElement("div");tabs.id="v251Tabs";tabs.className="v251-tabs";
    tabs.innerHTML=`<button class="v251-tab active" data-kind="">全部設備 <span>0</span></button><button class="v251-tab" data-kind="mounted">已上架 <span>0</span></button><button class="v251-tab" data-kind="unassigned">未上架 <span>0</span></button>`;
    const toolbar=dialog.querySelector(".v25-toolbar");toolbar?.before(tabs);
    tabs.addEventListener("click",e=>{
      const btn=e.target.closest(".v251-tab");if(!btn)return;
      const kind=$("v25Kind");if(!kind)return;
      kind.value=btn.dataset.kind||"";
      kind.dispatchEvent(new Event("change",{bubbles:true}));
      updateTabs();
      schedulePostProcess();
    });
  }

  function buildExtraFilters(dialog){
    const toolbar=dialog.querySelector(".v25-toolbar");if(!toolbar||$("v251Room"))return;
    toolbar.classList.add("v251-toolbar");
    roomFilter=document.createElement("select");roomFilter.className="field";roomFilter.id="v251Room";
    typeFilter=document.createElement("select");typeFilter.className="field";typeFilter.id="v251Type";
    statusFilter=document.createElement("select");statusFilter.className="field";statusFilter.id="v251Status";
    const add=$("v25NewUnassigned");
    toolbar.insertBefore(roomFilter,add);toolbar.insertBefore(typeFilter,add);toolbar.insertBefore(statusFilter,add);
    roomFilter.addEventListener("change",schedulePostProcess);typeFilter.addEventListener("change",schedulePostProcess);statusFilter.addEventListener("change",schedulePostProcess);
    $("v25Site")?.addEventListener("change",()=>setTimeout(()=>{fillFilterOptions(true);schedulePostProcess();},0));
  }

  function fillFilterOptions(preserve=true){
    const state=readState();if(!state)return;
    const site=$("v25Site"),previousSite=preserve?site?.value:"",sites=allSites(state);
    if(site){site.innerHTML=`<option value="">全部據點</option>`+sites.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");if(previousSite&&sites.includes(previousSite))site.value=previousSite;}
    if(roomFilter){const old=preserve?roomFilter.value:"",rooms=allRooms(state,site?.value||"");roomFilter.innerHTML=`<option value="">全部機房</option>`+rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("");if(old&&rooms.includes(old))roomFilter.value=old;}
    const data=allDevices(state),types=[...new Set(data.all.map(d=>d.type).filter(Boolean))].sort();
    if(typeFilter){const old=preserve?typeFilter.value:"";typeFilter.innerHTML=`<option value="">全部類型</option>`+types.map(t=>`<option value="${esc(t)}">${esc(TYPE_LABELS[t]||t)}</option>`).join("");if(old&&types.includes(old))typeFilter.value=old;}
    const statuses=[...new Set(data.all.map(d=>norm(d.status)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
    if(statusFilter){const old=preserve?statusFilter.value:"";statusFilter.innerHTML=`<option value="">全部狀態</option>`+statuses.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");if(old&&statuses.includes(old))statusFilter.value=old;}
  }

  function updateTabs(){
    const state=readState();if(!state||!tabs)return;const data=allDevices(state),kind=$("v25Kind")?.value||"";
    const counts={"":data.all.length,mounted:data.mounted.length,unassigned:data.pool.length};
    tabs.querySelectorAll(".v251-tab").forEach(b=>{b.classList.toggle("active",(b.dataset.kind||"")===kind);const s=b.querySelector("span");if(s)s.textContent=String(counts[b.dataset.kind||""]||0);});
  }

  function updateSummary(){
    const state=readState(),summary=$("v25Summary");if(!state||!summary)return;const data=allDevices(state);
    const sites=new Set((state.racks||[]).map(siteOf)).size,rooms=new Set((state.racks||[]).map(r=>`${siteOf(r)}\u241f${roomOf(r)}`)).size,racks=(state.racks||[]).length;
    summary.innerHTML=`<div class="v25-card"><span>據點</span><strong>${sites}</strong></div><div class="v25-card"><span>機房</span><strong>${rooms}</strong></div><div class="v25-card"><span>機櫃</span><strong>${racks}</strong></div><div class="v25-card"><span>全部設備</span><strong>${data.all.length}</strong></div><div class="v25-card"><span>已上架</span><strong>${data.mounted.length}</strong></div><div class="v25-card"><span>未上架</span><strong>${data.pool.length}</strong></div>`;
  }

  function firstCellLabel(td){
    if(!td)return"";for(const n of td.childNodes){if(n.nodeType===Node.TEXT_NODE&&norm(n.textContent))return norm(n.textContent);if(n.nodeType===Node.ELEMENT_NODE&&n.tagName!=="DIV")return norm(n.textContent);}return norm(td.textContent);
  }

  function applyExtraFilters(){
    const body=$("v25Body");if(!body)return;const room=roomFilter?.value||"",type=typeFilter?.value||"",status=statusFilter?.value||"";
    let visible=0;
    body.querySelectorAll("tr").forEach(tr=>{
      if(tr.querySelector(".v25-empty")){tr.style.display="";return;}
      const cells=tr.cells;if(cells.length<6)return;
      const path=norm(cells[3].querySelector(".v25-path")?.textContent),typeLabel=firstCellLabel(cells[1]),statusLabel=norm(cells[4].textContent);
      let show=true;
      if(room&&!path.split("›").map(norm).includes(room))show=false;
      if(type&&(TYPE_LABELS[type]||type)!==typeLabel)show=false;
      if(status&&status!==statusLabel)show=false;
      tr.style.display=show?"":"none";if(show)visible++;
    });
    const state=readState(),total=state?allDevices(state).all.length:0,count=$("v25Count");
    if(count)count.innerHTML=`顯示 <strong>${visible}</strong> / ${total} 台設備${visible===0?` <span class="v251-zero-note">· 沒有符合目前篩選條件的設備</span>`:""}`;
  }

  function closePopup(){popup?.remove();popup=null;}
  function openPopup(trigger,originals){
    closePopup();popup=document.createElement("div");popup.className="v251-action-popup";
    originals.forEach(original=>{const b=document.createElement("button");b.type="button";b.textContent=norm(original.textContent)||"操作";if(original.classList.contains("danger")||original.classList.contains("unmount"))b.classList.add("danger");b.onclick=()=>{closePopup();original.click();};popup.appendChild(b);});
    document.body.appendChild(popup);const r=trigger.getBoundingClientRect(),pr=popup.getBoundingClientRect();let left=Math.max(8,Math.min(window.innerWidth-pr.width-8,r.right-pr.width)),top=r.bottom+5;if(top+pr.height>window.innerHeight-8)top=Math.max(8,r.top-pr.height-5);popup.style.left=`${left}px`;popup.style.top=`${top}px`;
  }
  function enhanceMenus(){
    $("v25Body")?.querySelectorAll(".v25-actions").forEach(actions=>{
      if(actions.dataset.v251)return;const originals=[...actions.querySelectorAll(":scope > button")];if(!originals.length)return;actions.dataset.v251="1";originals.forEach(b=>b.style.display="none");const more=document.createElement("button");more.type="button";more.className="v251-menu-trigger";more.textContent="⋯";more.title="設備操作";more.onclick=e=>{e.stopPropagation();openPopup(more,originals);};actions.appendChild(more);
    });
  }

  function schedulePostProcess(){if(postScheduled)return;postScheduled=true;requestAnimationFrame(()=>{postScheduled=false;updateSummary();updateTabs();enhanceMenus();applyExtraFilters();});}

  function enhanceDialog(){
    const dialog=$("v25Dispatch");if(!dialog)return;
    dialog.classList.add("v251-ready");
    const kicker=dialog.querySelector(".v25-kicker"),title=dialog.querySelector(".v25-head h2");if(kicker)kicker.textContent="DEVICE MANAGEMENT";if(title)title.textContent="設備管理";
    buildTabs(dialog);buildExtraFilters(dialog);fillFilterOptions(true);updateTabs();
    const body=$("v25Body");if(body&&!tbodyObserver){tbodyObserver=new MutationObserver(schedulePostProcess);tbodyObserver.observe(body,{childList:true,subtree:true});}
    schedulePostProcess();
  }

  document.addEventListener("click",e=>{
    if(e.target.closest?.("#v25DispatchBtn"))setTimeout(enhanceDialog,0);
    if(popup&&!e.target.closest?.(".v251-action-popup")&&!e.target.closest?.(".v251-menu-trigger"))closePopup();
  });
  window.addEventListener("resize",closePopup);document.addEventListener("scroll",closePopup,true);

  installTop();
})();
