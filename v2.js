(() => {
  "use strict";

  const STORAGE_KEY = "rack-manager-v1-state";
  const $ = (id) => document.getElementById(id);
  const TYPE_LABELS = {
    switch:"網路交換器", router:"路由器 / 防火牆", patch:"Patch Panel", cable:"理線架",
    server:"伺服器", nas:"NAS", ups:"UPS", pdu:"PDU", shelf:"層板 / 其他", other:"其他"
  };
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";

  const style = document.createElement("style");
  style.textContent = `
    .v2-hierarchy{background:#f8fafc}
    .v2-hierarchy-grid{display:grid;gap:8px}
    .v2-hierarchy-label{font-size:10px;font-weight:800;color:#7a8798;margin-bottom:4px;display:block}
    .v2-location-row{display:flex;gap:7px;margin-top:9px}
    .v2-location-row .btn{flex:1}
    .v2-breadcrumb{margin-top:5px;font-size:11px;color:#64748b;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
    .v2-breadcrumb b{color:#334155}
    .v2-search-button{white-space:nowrap}
    .v2-search-panel{position:fixed;z-index:70;top:82px;right:18px;width:min(620px,calc(100vw - 36px));max-height:calc(100vh - 100px);background:#fff;border:1px solid #dbe3ed;border-radius:14px;box-shadow:0 24px 70px rgba(15,23,42,.28);display:none;overflow:hidden}
    .v2-search-panel.open{display:flex;flex-direction:column}
    .v2-search-head{padding:14px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:center}
    .v2-search-head input{flex:1}
    .v2-search-meta{padding:8px 14px;background:#f8fafc;border-bottom:1px solid #edf1f5;font-size:10px;color:#64748b}
    .v2-search-results{overflow:auto;padding:10px;display:flex;flex-direction:column;gap:7px}
    .v2-search-empty{text-align:center;padding:28px;color:#94a3b8;font-size:12px}
    .v2-search-item{border:1px solid #e2e8f0;border-radius:10px;padding:10px 11px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;background:#fff;cursor:pointer}
    .v2-search-item:hover{border-color:#93c5fd;background:#f8fbff}
    .v2-search-item strong{display:block;font-size:13px;color:#1e293b}
    .v2-search-item .sub{font-size:10px;color:#64748b;margin-top:3px;line-height:1.45}
    .v2-search-item .path{font-size:10px;color:#2563eb;margin-top:4px;font-weight:700}
    .v2-search-u{align-self:center;background:#0f172a;color:#fff;border-radius:7px;padding:6px 8px;font-size:10px;font-weight:900;white-space:nowrap}
    .v2-list-filter{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:0 0 10px}
    .v2-list-filter .full{grid-column:1/-1}
    .v2-list-count{font-size:10px;color:#64748b;margin:-3px 0 9px}
    .v2-dialog{border:0;border-radius:15px;padding:0;width:min(520px,calc(100vw - 30px));box-shadow:0 24px 80px rgba(15,23,42,.35)}
    .v2-dialog::backdrop{background:rgba(15,23,42,.55);backdrop-filter:blur(2px)}
    .v2-dialog-inner{padding:20px}
    .v2-dialog-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
    .v2-dialog-head h2{font-size:19px;margin:0}
    .v2-dialog-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .v2-dialog-grid label{font-size:11px;font-weight:800;color:#5b687a;display:flex;flex-direction:column;gap:6px}
    .v2-dialog-note{font-size:11px;color:#7a8798;line-height:1.55;margin:10px 0 0}
    .v2-dialog-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #edf1f5;margin-top:18px;padding-top:15px}
    @media(max-width:760px){
      .v2-search-panel{top:12px;right:12px;width:calc(100vw - 24px);max-height:calc(100vh - 24px)}
      .v2-dialog-grid{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(style);

  function readState(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }

  function normalizeText(v){ return String(v ?? "").trim(); }
  function siteOf(r){ return normalizeText(r?.siteName) || DEFAULT_SITE; }
  function roomOf(r){ return normalizeText(r?.roomName) || normalizeText(r?.location) || DEFAULT_ROOM; }
  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }
  function uniq(arr){ return [...new Set(arr)].sort((a,b)=>a.localeCompare(b,"zh-Hant")); }
  function activeRack(state){ return state?.racks?.find(r=>r.id===state.activeRackId) || state?.racks?.[0] || null; }

  function toast(message,type="success"){
    const stack=$("toastStack");
    if(!stack) return;
    const el=document.createElement("div");
    el.className=`toast ${type}`;
    el.textContent=message;
    stack.appendChild(el);
    setTimeout(()=>el.remove(),2600);
  }

  function syncStateIntoCore(nextState, message="資料已更新", callback=null){
    const input=$("jsonImport");
    if(!input){
      localStorage.setItem(STORAGE_KEY,JSON.stringify(nextState));
      toast(message);
      callback?.();
      return;
    }
    try{
      const file=new File([JSON.stringify(nextState)],"rack-manager-v2-sync.json",{type:"application/json"});
      const transfer=new DataTransfer();
      transfer.items.add(file);
      input.files=transfer.files;
      const originalConfirm=window.confirm;
      let autoApprove=true;
      window.confirm=function(msg){
        if(autoApprove && String(msg||"").includes("將匯入")){
          autoApprove=false;
          window.confirm=originalConfirm;
          return true;
        }
        return originalConfirm.apply(this,arguments);
      };
      input.dispatchEvent(new Event("change",{bubbles:true}));
      setTimeout(()=>{
        if(window.confirm!==originalConfirm) window.confirm=originalConfirm;
        document.querySelectorAll("#toastStack .toast").forEach(t=>{
          if(t.textContent.includes("JSON 備份已匯入")) t.textContent=message;
        });
        refreshAllV2();
        callback?.();
      },180);
    }catch(err){
      console.error("Rack Manager V2 state sync failed",err);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(nextState));
      toast("資料已儲存，請重新整理頁面", "error");
    }
  }

  const leftPanel=document.querySelector(".left-panel");
  let hierarchySection=null, siteSelect=null, roomSelect=null, breadcrumb=null;

  function buildHierarchy(){
    if(!leftPanel || $("v2Hierarchy")) return;
    hierarchySection=document.createElement("section");
    hierarchySection.className="panel-section v2-hierarchy";
    hierarchySection.id="v2Hierarchy";
    hierarchySection.innerHTML=`
      <div class="section-title-row"><h2>據點 / 機房</h2><span class="badge">V2</span></div>
      <div class="v2-hierarchy-grid">
        <div><label class="v2-hierarchy-label" for="v2SiteSelect">據點</label><select class="field" id="v2SiteSelect"></select></div>
        <div><label class="v2-hierarchy-label" for="v2RoomSelect">機房</label><select class="field" id="v2RoomSelect"></select></div>
      </div>
      <div class="v2-location-row"><button class="btn" id="v2EditLocation">設定目前機櫃</button></div>
    `;
    leftPanel.insertBefore(hierarchySection,leftPanel.firstElementChild);
    siteSelect=$("v2SiteSelect");roomSelect=$("v2RoomSelect");
    siteSelect.addEventListener("change",()=>{ populateRooms(siteSelect.value,true); selectFirstRack(siteSelect.value,roomSelect.value); });
    roomSelect.addEventListener("change",()=>selectFirstRack(siteSelect.value,roomSelect.value));
    $("v2EditLocation").addEventListener("click",openLocationDialog);

    const titleBox=document.querySelector(".workspace-toolbar > div:first-child");
    if(titleBox){
      breadcrumb=document.createElement("div");breadcrumb.className="v2-breadcrumb";breadcrumb.id="v2Breadcrumb";titleBox.appendChild(breadcrumb);
    }
  }

  function populateSites(){
    const state=readState();if(!state?.racks?.length||!siteSelect)return;
    const rack=activeRack(state),sites=uniq(state.racks.map(siteOf));
    const current=siteOf(rack);
    siteSelect.innerHTML=sites.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
    siteSelect.value=sites.includes(current)?current:sites[0];
    populateRooms(siteSelect.value,false);
  }

  function populateRooms(site,preferFirst=false){
    const state=readState();if(!state?.racks?.length||!roomSelect)return;
    const rack=activeRack(state);
    const rooms=uniq(state.racks.filter(r=>siteOf(r)===site).map(roomOf));
    const current=(!preferFirst && siteOf(rack)===site)?roomOf(rack):rooms[0];
    roomSelect.innerHTML=rooms.map(r=>`<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join("");
    if(current) roomSelect.value=current;
  }

  function selectFirstRack(site,room){
    const state=readState();if(!state?.racks?.length)return;
    const target=state.racks.find(r=>siteOf(r)===site&&roomOf(r)===room);
    if(!target)return;
    const rackSelect=$("rackSelect");
    if(rackSelect && rackSelect.value!==target.id){
      rackSelect.value=target.id;
      rackSelect.dispatchEvent(new Event("change",{bubbles:true}));
    }
    setTimeout(updateHierarchyFromActive,50);
  }

  function updateHierarchyFromActive(){
    const state=readState(),rack=activeRack(state);if(!rack)return;
    if(siteSelect){
      const sites=uniq(state.racks.map(siteOf));
      if(!sites.includes(siteSelect.value)||siteSelect.value!==siteOf(rack)) populateSites();
      else if(roomSelect && roomSelect.value!==roomOf(rack)) populateRooms(siteSelect.value,false);
    }
    if(breadcrumb) breadcrumb.innerHTML=`<b>${escapeHtml(siteOf(rack))}</b><span>›</span><b>${escapeHtml(roomOf(rack))}</b><span>›</span><span>${escapeHtml(rack.name||"機櫃")}</span>`;
  }

  function buildLocationDialog(){
    if($("v2LocationDialog"))return;
    const dlg=document.createElement("dialog");dlg.className="v2-dialog";dlg.id="v2LocationDialog";
    dlg.innerHTML=`
      <form method="dialog" id="v2LocationForm" class="v2-dialog-inner">
        <div class="v2-dialog-head"><div><span class="eyebrow">RACK LOCATION</span><h2>設定據點與機房</h2></div><button class="icon-btn" value="cancel" formnovalidate>×</button></div>
        <div class="v2-dialog-grid">
          <label>據點名稱<input class="field" id="v2SiteInput" list="v2SiteList" required maxlength="80"><datalist id="v2SiteList"></datalist></label>
          <label>機房名稱<input class="field" id="v2RoomInput" list="v2RoomList" required maxlength="80"><datalist id="v2RoomList"></datalist></label>
        </div>
        <p class="v2-dialog-note">輸入新的名稱即可建立新的據點或機房；既有機櫃資料與設備不會被移除。</p>
        <div class="v2-dialog-actions"><button class="btn" value="cancel" formnovalidate>取消</button><button class="btn primary" id="v2SaveLocation" value="default">儲存</button></div>
      </form>`;
    document.body.appendChild(dlg);
    $("v2LocationForm").addEventListener("submit",saveLocation);
  }

  function openLocationDialog(){
    buildLocationDialog();
    const state=readState(),rack=activeRack(state);if(!rack)return;
    $("v2SiteInput").value=siteOf(rack);$("v2RoomInput").value=roomOf(rack);
    $("v2SiteList").innerHTML=uniq(state.racks.map(siteOf)).map(v=>`<option value="${escapeHtml(v)}"></option>`).join("");
    $("v2RoomList").innerHTML=uniq(state.racks.map(roomOf)).map(v=>`<option value="${escapeHtml(v)}"></option>`).join("");
    $("v2LocationDialog").showModal();
  }

  function saveLocation(e){
    e.preventDefault();
    const state=readState(),rack=activeRack(state);if(!rack)return;
    const site=normalizeText($("v2SiteInput").value),room=normalizeText($("v2RoomInput").value);
    if(!site||!room){toast("請輸入據點與機房名稱","error");return;}
    rack.siteName=site;rack.roomName=room;rack.updatedAt=new Date().toISOString();state.version=2;
    $("v2LocationDialog").close();
    syncStateIntoCore(state,"據點 / 機房已更新",()=>updateHierarchyFromActive());
  }

  let searchPanel=null, searchInput=null, searchResults=null, searchMeta=null;
  function buildGlobalSearch(){
    const actions=document.querySelector(".top-actions");if(!actions||$("v2SearchButton"))return;
    const btn=document.createElement("button");btn.className="btn v2-search-button";btn.id="v2SearchButton";btn.textContent="⌕ 全域搜尋";
    actions.insertBefore(btn,actions.firstChild);
    searchPanel=document.createElement("div");searchPanel.className="v2-search-panel";searchPanel.id="v2SearchPanel";
    searchPanel.innerHTML=`
      <div class="v2-search-head"><input class="field" id="v2SearchInput" autocomplete="off" placeholder="搜尋設備名稱、IP、Hostname、型號、序號、資產編號…"><button class="btn" id="v2SearchClose">關閉</button></div>
      <div class="v2-search-meta" id="v2SearchMeta">輸入關鍵字搜尋全部機櫃</div>
      <div class="v2-search-results" id="v2SearchResults"><div class="v2-search-empty">尚未輸入搜尋條件</div></div>`;
    document.body.appendChild(searchPanel);
    searchInput=$("v2SearchInput");searchResults=$("v2SearchResults");searchMeta=$("v2SearchMeta");
    btn.addEventListener("click",()=>toggleSearch(true));$("v2SearchClose").addEventListener("click",()=>toggleSearch(false));
    let timer=null;searchInput.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(runGlobalSearch,120);});
    document.addEventListener("keydown",e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();toggleSearch(true);}
      if(e.key==="Escape"&&searchPanel?.classList.contains("open"))toggleSearch(false);
    });
  }
  function toggleSearch(open){
    if(!searchPanel)return;searchPanel.classList.toggle("open",open);if(open){setTimeout(()=>searchInput?.focus(),30);runGlobalSearch();}
  }
  function deviceSearchText(d,r){
    return [d.name,d.ip,d.hostname,d.model,d.serial,d.asset,d.brand,d.mac,d.vlan,d.owner,d.note,d.status,TYPE_LABELS[d.type],siteOf(r),roomOf(r),r.name,r.location].map(v=>normalizeText(v).toLowerCase()).join(" ");
  }
  function runGlobalSearch(){
    const q=normalizeText(searchInput?.value).toLowerCase();
    if(!q){searchMeta.textContent="輸入關鍵字搜尋全部機櫃";searchResults.innerHTML=`<div class="v2-search-empty">尚未輸入搜尋條件</div>`;return;}
    const state=readState();const matches=[];
    state?.racks?.forEach(r=>r.devices?.forEach(d=>{if(deviceSearchText(d,r).includes(q))matches.push({r,d});}));
    searchMeta.textContent=`找到 ${matches.length} 筆設備 · 搜尋範圍：全部據點 / 機房 / 機櫃`;
    if(!matches.length){searchResults.innerHTML=`<div class="v2-search-empty">找不到符合「${escapeHtml(q)}」的設備</div>`;return;}
    searchResults.innerHTML="";
    matches.slice(0,100).forEach(({r,d})=>{
      const item=document.createElement("div");item.className="v2-search-item";
      const isExternal=d.installation==="external";const bottom=isExternal?null:d.u-d.height+1;
      const upos=isExternal?"周邊":(d.height>1?`U${bottom}–U${d.u}`:`U${d.u}`);
      const detail=[TYPE_LABELS[d.type]||d.type,d.model,d.ip,d.hostname].filter(Boolean).join(" · ")||"設備";
      item.innerHTML=`<div><strong>${escapeHtml(d.name||"未命名設備")}</strong><div class="sub">${escapeHtml(detail)}</div><div class="path">${escapeHtml(siteOf(r))} › ${escapeHtml(roomOf(r))} › ${escapeHtml(r.name)} · ${isExternal?"周邊設備":(d.side==="rear"?"REAR":"FRONT")}</div></div><div class="v2-search-u">${escapeHtml(upos)}</div>`;
      item.addEventListener("click",()=>locateDevice(r.id,d.id,d.side,d.installation));searchResults.appendChild(item);
    });
    if(matches.length>100){const note=document.createElement("div");note.className="v2-search-empty";note.textContent=`僅顯示前 100 筆，請輸入更精確的關鍵字（共 ${matches.length} 筆）`;searchResults.appendChild(note);}
  }
  function locateDevice(rackId,deviceId,side,installation){
    toggleSearch(false);
    const rackSelect=$("rackSelect");if(!rackSelect)return;
    if(rackSelect.value!==rackId){rackSelect.value=rackId;rackSelect.dispatchEvent(new Event("change",{bubbles:true}));}
    setTimeout(()=>{
      if(installation!=="external"){
        const face=document.querySelector(`.face-toggle button[data-face="${side||"front"}"]`);if(face&&!face.classList.contains("active"))face.click();
      }
      setTimeout(()=>{
        let target=document.querySelector(`#rackGrid .rack-device[data-id="${CSS.escape(deviceId)}"]`);
        if(!target){decorateAndFilterDeviceList();target=document.querySelector(`#deviceList .device-list-item[data-v2-id="${CSS.escape(deviceId)}"]`);}
        target?.click();
        if(target){target.scrollIntoView({behavior:"smooth",block:"center"});}
        updateHierarchyFromActive();
      },100);
    },90);
  }

  let listSearch=null,typeFilter=null,statusFilter=null,listCount=null,applyingList=false;
  function buildListFilters(){
    const list=$("deviceList");if(!list||$("v2ListFilter"))return;
    const box=document.createElement("div");box.id="v2ListFilter";box.className="v2-list-filter";
    box.innerHTML=`
      <input class="field full" id="v2ListSearch" placeholder="篩選目前機櫃設備…">
      <select class="field" id="v2TypeFilter"><option value="">全部類型</option>${Object.entries(TYPE_LABELS).map(([k,v])=>`<option value="${k}">${escapeHtml(v)}</option>`).join("")}</select>
      <select class="field" id="v2StatusFilter"><option value="">全部狀態</option><option>正常</option><option>備用</option><option>維修</option><option>停用</option></select>`;
    list.parentElement.insertBefore(box,list);
    listCount=document.createElement("div");listCount.className="v2-list-count";listCount.id="v2ListCount";box.after(listCount);
    listSearch=$("v2ListSearch");typeFilter=$("v2TypeFilter");statusFilter=$("v2StatusFilter");
    [listSearch,typeFilter,statusFilter].forEach(el=>el.addEventListener(el.tagName==="INPUT"?"input":"change",decorateAndFilterDeviceList));
    const obs=new MutationObserver(()=>{if(!applyingList)queueMicrotask(decorateAndFilterDeviceList);});obs.observe(list,{childList:true,subtree:true});
  }
  function currentListDevices(state){
    const rack=activeRack(state);if(!rack)return[];
    return [...(rack.devices||[])].filter(d=>d.installation==="external"||d.side===state.activeFace).sort((a,b)=>{
      if(a.installation==="external"&&b.installation!=="external")return 1;
      if(a.installation!=="external"&&b.installation==="external")return -1;
      return (b.u||0)-(a.u||0);
    });
  }
  function decorateAndFilterDeviceList(){
    const list=$("deviceList");if(!list||!listSearch)return;applyingList=true;
    const state=readState(),devices=currentListDevices(state),items=[...list.querySelectorAll(".device-list-item")];
    const q=normalizeText(listSearch.value).toLowerCase(),type=typeFilter.value,status=statusFilter.value;let shown=0;
    items.forEach((item,i)=>{
      const d=devices[i];if(!d){item.style.display="";return;}
      item.dataset.v2Id=d.id;item.dataset.v2Type=d.type||"other";item.dataset.v2Status=d.status||"正常";
      const searchable=[item.textContent,d.name,d.ip,d.hostname,d.model,d.serial,d.asset,d.brand,d.owner,d.note].map(v=>normalizeText(v).toLowerCase()).join(" ");
      const ok=(!q||searchable.includes(q))&&(!type||d.type===type)&&(!status||(d.status||"正常")===status);
      item.style.display=ok?"":"none";if(ok)shown++;
    });
    if(listCount)listCount.textContent=`顯示 ${shown} / ${devices.length} 台設備`;
    applyingList=false;
  }

  function refreshAllV2(){
    populateSites();updateHierarchyFromActive();decorateAndFilterDeviceList();
  }

  buildHierarchy();buildLocationDialog();buildGlobalSearch();buildListFilters();refreshAllV2();

  const rackMeta=$("rackMeta");
  if(rackMeta)new MutationObserver(()=>queueMicrotask(refreshAllV2)).observe(rackMeta,{childList:true,subtree:true,characterData:true});
  $("rackSelect")?.addEventListener("change",()=>setTimeout(refreshAllV2,40));
})();
