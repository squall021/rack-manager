(() => {
  "use strict";

  const STORAGE_KEY = "rack-manager-v1-state";
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";
  const ADD_SITE = "__ADD_SITE__";
  const ADD_ROOM = "__ADD_ROOM__";
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? "").trim();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));

  const style=document.createElement("style");
  style.textContent=`
    .v22-current{padding:11px 12px;margin:0 0 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;display:flex;flex-direction:column;gap:3px}
    .v22-current strong{font-size:13px;color:#1e293b}.v22-current span{font-size:11px;color:#64748b}
    .v22-manage-dialog{width:min(760px,calc(100vw - 30px))}
    .v22-manage-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .v22-manage-grid section{border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#f8fafc}
    .v22-manage-title{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;background:#fff;border-bottom:1px solid #e2e8f0}
    .v22-manage-title strong{font-size:12px}.v22-manage-title .btn{min-height:30px;padding:5px 8px;font-size:11px}
    .v22-manage-list{padding:7px;display:flex;flex-direction:column;gap:6px;max-height:360px;overflow:auto}
    .v22-manage-row{display:grid;grid-template-columns:minmax(0,1fr) 30px 30px;gap:5px;align-items:center;border:1px solid #e2e8f0;background:#fff;border-radius:9px;padding:5px}
    .v22-manage-row.active{border-color:#60a5fa;box-shadow:0 0 0 2px #dbeafe}
    .v22-pick{border:0;background:transparent;text-align:left;padding:5px 6px;min-width:0;cursor:pointer}.v22-pick.static{cursor:default}
    .v22-pick strong,.v22-pick span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v22-pick strong{font-size:12px;color:#263448}.v22-pick span{font-size:9px;color:#8492a6;margin-top:2px}
    .v22-mini{width:30px;height:30px;border:1px solid #dbe3ed;background:#fff;border-radius:7px;color:#526176}.v22-mini:hover{border-color:#94a3b8}.v22-mini.delete{color:#b91c1c}
    .v22-empty{padding:22px 10px;text-align:center;font-size:11px;color:#94a3b8}
    @media(max-width:760px){.v22-manage-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function readState(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  }
  function activeRack(state){ return state?.racks?.find(r=>r.id===state.activeRackId) || state?.racks?.[0] || null; }
  function siteOf(r){ return norm(r?.siteName) || DEFAULT_SITE; }
  function roomOf(r){ return norm(r?.roomName) || norm(r?.location) || DEFAULT_ROOM; }
  function toast(message,type="success"){
    const stack=$("toastStack"); if(!stack) return;
    const el=document.createElement("div"); el.className=`toast ${type}`; el.textContent=message;
    stack.appendChild(el); setTimeout(()=>el.remove(),2800);
  }

  function ensureDirectory(state){
    if(!state) return {sites:[]};
    const existing = state.locationDirectory && Array.isArray(state.locationDirectory.sites)
      ? state.locationDirectory.sites : [];
    const map = new Map();
    existing.forEach(s=>{
      const name=norm(s?.name); if(!name || name===DEFAULT_SITE) return;
      map.set(name,new Set((Array.isArray(s.rooms)?s.rooms:[]).map(norm).filter(r=>r && r!==DEFAULT_ROOM)));
    });
    (state.racks||[]).forEach(r=>{
      const s=siteOf(r), room=roomOf(r);
      if(s===DEFAULT_SITE) return;
      if(!map.has(s)) map.set(s,new Set());
      if(room!==DEFAULT_ROOM) map.get(s).add(room);
    });
    state.locationDirectory={sites:[...map.entries()]
      .sort((a,b)=>a[0].localeCompare(b[0],"zh-Hant"))
      .map(([name,rooms])=>({name,rooms:[...rooms].sort((a,b)=>a.localeCompare(b,"zh-Hant"))}))};
    return state.locationDirectory;
  }
  function siteNames(state){ return ensureDirectory(state).sites.map(s=>s.name); }
  function roomNames(state,site){ return ensureDirectory(state).sites.find(s=>s.name===site)?.rooms || []; }
  function addSiteToDirectory(state,name){
    name=norm(name); if(!name || name===DEFAULT_SITE) return false;
    const dir=ensureDirectory(state); if(dir.sites.some(s=>s.name===name)) return false;
    dir.sites.push({name,rooms:[]}); dir.sites.sort((a,b)=>a.name.localeCompare(b.name,"zh-Hant")); return true;
  }
  function addRoomToDirectory(state,site,room){
    site=norm(site); room=norm(room); if(!site||!room||room===DEFAULT_ROOM) return false;
    addSiteToDirectory(state,site); const dir=ensureDirectory(state); const s=dir.sites.find(x=>x.name===site);
    if(s.rooms.includes(room)) return false; s.rooms.push(room); s.rooms.sort((a,b)=>a.localeCompare(b,"zh-Hant")); return true;
  }

  function syncStateIntoCore(nextState,message,callback){
    nextState.version=2.2; ensureDirectory(nextState);
    const input=$("jsonImport");
    if(!input){ localStorage.setItem(STORAGE_KEY,JSON.stringify(nextState)); toast(message); callback?.(); return; }
    try{
      const file=new File([JSON.stringify(nextState)],"rack-manager-v22-sync.json",{type:"application/json"});
      const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files;
      const originalConfirm=window.confirm; let approve=true;
      window.confirm=function(text){
        if(approve && String(text||"").includes("將匯入")){
          approve=false; window.confirm=originalConfirm; return true;
        }
        return originalConfirm.apply(this,arguments);
      };
      input.dispatchEvent(new Event("change",{bubbles:true}));
      setTimeout(()=>{
        if(window.confirm!==originalConfirm) window.confirm=originalConfirm;
        document.querySelectorAll("#toastStack .toast").forEach(t=>{
          if(t.textContent.includes("JSON 備份已匯入")) t.textContent=message;
        });
        refreshLocalUI(); callback?.();
      },200);
    }catch(err){
      console.error("Rack Manager V2.2 sync failed",err);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(nextState));
      toast("資料已儲存，請重新整理頁面","error"); callback?.();
    }
  }

  let rackMode="edit";
  let rackSiteSelect=null,rackRoomSelect=null;
  let pendingSite="",pendingRoom="";

  function buildRackDropdowns(){
    const form=$("rackForm"),grid=form?.querySelector(".form-grid");
    if(!form||!grid||$("v22RackSiteSelect")) return;
    document.querySelectorAll("#v21RackSiteInput,#v21RackRoomInput").forEach(el=>el.closest("label")?.remove());
    const siteLabel=document.createElement("label");
    siteLabel.innerHTML=`據點<select class="field" id="v22RackSiteSelect" required></select>`;
    const roomLabel=document.createElement("label");
    roomLabel.innerHTML=`機房<select class="field" id="v22RackRoomSelect" required></select>`;
    const first=grid.querySelector("label"); first?first.after(siteLabel,roomLabel):grid.prepend(siteLabel,roomLabel);
    rackSiteSelect=$("v22RackSiteSelect"); rackRoomSelect=$("v22RackRoomSelect");
    rackSiteSelect.addEventListener("change",onRackSiteChange);
    rackRoomSelect.addEventListener("change",onRackRoomChange);
    form.addEventListener("submit",onRackFormSubmit);
  }

  function populateRackSites(selected=""){
    const state=readState(); if(!rackSiteSelect||!state) return;
    const sites=siteNames(state);
    if(selected && selected!==DEFAULT_SITE && !sites.includes(selected)) sites.push(selected);
    sites.sort((a,b)=>a.localeCompare(b,"zh-Hant"));
    rackSiteSelect.innerHTML=`<option value="">請選擇據點</option>`+
      sites.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("")+
      `<option value="${ADD_SITE}">＋ 新增據點</option>`;
    rackSiteSelect.value=selected && selected!==DEFAULT_SITE ? selected : "";
  }
  function populateRackRooms(site,selected=""){
    const state=readState(); if(!rackRoomSelect||!state) return;
    const rooms=roomNames(state,site).slice();
    if(selected && selected!==DEFAULT_ROOM && !rooms.includes(selected)) rooms.push(selected);
    rooms.sort((a,b)=>a.localeCompare(b,"zh-Hant"));
    rackRoomSelect.innerHTML=`<option value="">請選擇機房</option>`+
      rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("")+
      `<option value="${ADD_ROOM}">＋ 新增機房</option>`;
    rackRoomSelect.value=selected && selected!==DEFAULT_ROOM ? selected : "";
    rackRoomSelect.disabled=!site;
  }
  function onRackSiteChange(){
    if(rackSiteSelect.value===ADD_SITE){
      const name=norm(prompt("請輸入新增據點名稱：",""));
      if(!name){ rackSiteSelect.value=pendingSite||""; return; }
      if(name===DEFAULT_SITE){ toast("此名稱為系統保留名稱","error"); rackSiteSelect.value=pendingSite||""; return; }
      pendingSite=name; pendingRoom=""; populateRackSites(name); populateRackRooms(name,""); return;
    }
    pendingSite=rackSiteSelect.value; pendingRoom=""; populateRackRooms(pendingSite,"");
  }
  function onRackRoomChange(){
    if(rackRoomSelect.value===ADD_ROOM){
      if(!pendingSite){ toast("請先選擇據點","error"); rackRoomSelect.value=""; return; }
      const name=norm(prompt(`請輸入「${pendingSite}」的新機房名稱：`,""));
      if(!name){ rackRoomSelect.value=pendingRoom||""; return; }
      if(name===DEFAULT_ROOM){ toast("此名稱為系統保留名稱","error"); rackRoomSelect.value=pendingRoom||""; return; }
      pendingRoom=name; populateRackRooms(pendingSite,name); return;
    }
    pendingRoom=rackRoomSelect.value;
  }
  function prepareRackModal(mode){
    buildRackDropdowns(); const state=readState(),rack=activeRack(state); if(!state||!rack) return;
    rackMode=mode; ensureDirectory(state);
    if(mode==="new"){
      const sideSite=norm($("v2SiteSelect")?.value),sideRoom=norm($("v2RoomSelect")?.value);
      pendingSite=(sideSite&&sideSite!==DEFAULT_SITE)?sideSite:(siteOf(rack)!==DEFAULT_SITE?siteOf(rack):"");
      pendingRoom=(sideRoom&&sideRoom!==DEFAULT_ROOM)?sideRoom:(roomOf(rack)!==DEFAULT_ROOM?roomOf(rack):"");
    }else{
      pendingSite=siteOf(rack)===DEFAULT_SITE?"":siteOf(rack);
      pendingRoom=roomOf(rack)===DEFAULT_ROOM?"":roomOf(rack);
    }
    populateRackSites(pendingSite); populateRackRooms(pendingSite,pendingRoom);
  }
  function onRackFormSubmit(){
    const site=norm(rackSiteSelect?.value),room=norm(rackRoomSelect?.value);
    if(!site||!room||site===ADD_SITE||room===ADD_ROOM){ toast("請選擇據點與機房","error"); return; }
    pendingSite=site; pendingRoom=room;
    setTimeout(()=>{
      const state=readState(),rack=activeRack(state); if(!state||!rack) return;
      addSiteToDirectory(state,site); addRoomToDirectory(state,site,room);
      rack.siteName=site; rack.roomName=room; rack.updatedAt=new Date().toISOString();
      syncStateIntoCore(state,rackMode==="new"?"機櫃已建立並加入指定據點 / 機房":"機櫃設定已更新");
    },60);
  }

  function buildMoveDialog(){
    if($("v22MoveDialog")) return;
    const dlg=document.createElement("dialog"); dlg.className="v2-dialog"; dlg.id="v22MoveDialog";
    dlg.innerHTML=`<form method="dialog" class="v2-dialog-inner" id="v22MoveForm">
      <div class="v2-dialog-head"><div><span class="eyebrow">MOVE RACK</span><h2>移動機櫃</h2></div><button class="icon-btn" value="cancel" formnovalidate>×</button></div>
      <div class="v22-current" id="v22MoveCurrent"></div>
      <div class="v2-dialog-grid">
        <label>目標據點<select class="field" id="v22MoveSite" required></select></label>
        <label>目標機房<select class="field" id="v22MoveRoom" required></select></label>
      </div>
      <p class="v2-dialog-note">此操作只移動整個機櫃的歸屬，機櫃內設備與 U 位置都會保留。若要建立新據點或機房，請先使用「據點管理」。</p>
      <div class="v2-dialog-actions"><button class="btn" value="cancel" formnovalidate>取消</button><button class="btn primary" value="default">確認移動</button></div>
    </form>`;
    document.body.appendChild(dlg);
    $("v22MoveSite").addEventListener("change",fillMoveRooms);
    $("v22MoveForm").addEventListener("submit",submitMoveRack);
  }
  function openMoveDialog(){
    buildMoveDialog(); const state=readState(),rack=activeRack(state); if(!state||!rack) return;
    const sites=siteNames(state); if(!sites.length){ toast("目前沒有可用據點，請先到據點管理新增","error"); return; }
    $("v22MoveCurrent").innerHTML=`<strong>${esc(rack.name)}</strong><span>目前：${esc(siteOf(rack))} › ${esc(roomOf(rack))}</span>`;
    $("v22MoveSite").innerHTML=sites.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
    const current=siteOf(rack)!==DEFAULT_SITE&&sites.includes(siteOf(rack))?siteOf(rack):sites[0];
    $("v22MoveSite").value=current; fillMoveRooms(roomOf(rack)); $("v22MoveDialog").showModal();
  }
  function fillMoveRooms(preferred=""){
    const state=readState(),site=$("v22MoveSite")?.value; if(!state||!site) return;
    const rooms=roomNames(state,site);
    $("v22MoveRoom").innerHTML=rooms.length?rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join(""):`<option value="">此據點尚無機房</option>`;
    $("v22MoveRoom").disabled=!rooms.length;
    if(preferred&&rooms.includes(preferred)) $("v22MoveRoom").value=preferred;
  }
  function submitMoveRack(e){
    e.preventDefault(); const state=readState(),rack=activeRack(state); if(!state||!rack) return;
    const site=norm($("v22MoveSite").value),room=norm($("v22MoveRoom").value); if(!site||!room){toast("請選擇目標據點與機房","error");return;}
    if(site===siteOf(rack)&&room===roomOf(rack)){ $("v22MoveDialog").close(); toast("機櫃已在這個據點 / 機房"); return; }
    rack.siteName=site; rack.roomName=room; rack.updatedAt=new Date().toISOString(); $("v22MoveDialog").close();
    syncStateIntoCore(state,`已將 ${rack.name} 移動到 ${site} / ${room}`);
  }

  function buildManageDialog(){
    if($("v22ManageDialog")) return;
    const dlg=document.createElement("dialog"); dlg.className="v2-dialog v22-manage-dialog"; dlg.id="v22ManageDialog";
    dlg.innerHTML=`<div class="v2-dialog-inner">
      <div class="v2-dialog-head"><div><span class="eyebrow">LOCATION DIRECTORY</span><h2>據點管理</h2></div><button class="icon-btn" id="v22ManageClose">×</button></div>
      <div class="v22-manage-grid">
        <section><div class="v22-manage-title"><strong>據點</strong><button class="btn" id="v22AddSite">＋ 新增</button></div><div class="v22-manage-list" id="v22SiteList"></div></section>
        <section><div class="v22-manage-title"><strong id="v22RoomTitle">機房</strong><button class="btn" id="v22AddRoom">＋ 新增</button></div><div class="v22-manage-list" id="v22RoomList"></div></section>
      </div>
      <p class="v2-dialog-note">重新命名會同步更新底下所有機櫃。據點或機房仍有機櫃時不能刪除，請先使用「移動機櫃」。</p>
      <div class="v2-dialog-actions"><button class="btn" id="v22ManageDone">關閉</button></div>
    </div>`;
    document.body.appendChild(dlg);
    $("v22ManageClose").onclick=()=>dlg.close(); $("v22ManageDone").onclick=()=>dlg.close();
    $("v22AddSite").onclick=addManagedSite; $("v22AddRoom").onclick=addManagedRoom;
  }
  let managedSite="";
  function openManageDialog(){ buildManageDialog(); refreshManageDialog(); $("v22ManageDialog").showModal(); }
  function refreshManageDialog(){
    const state=readState(); if(!state) return; const sites=siteNames(state); if(!sites.includes(managedSite)) managedSite=sites[0]||"";
    const siteList=$("v22SiteList"),roomList=$("v22RoomList");
    siteList.innerHTML=sites.length?"":`<div class="v22-empty">尚未建立據點</div>`;
    sites.forEach(name=>{
      const count=(state.racks||[]).filter(r=>siteOf(r)===name).length;
      const row=document.createElement("div"); row.className=`v22-manage-row${name===managedSite?" active":""}`;
      row.innerHTML=`<button class="v22-pick"><strong>${esc(name)}</strong><span>${count} 個機櫃</span></button><button class="v22-mini rename" title="重新命名">✎</button><button class="v22-mini delete" title="刪除">×</button>`;
      row.querySelector(".v22-pick").onclick=()=>{managedSite=name;refreshManageDialog();};
      row.querySelector(".rename").onclick=()=>renameSite(name); row.querySelector(".delete").onclick=()=>deleteSite(name); siteList.appendChild(row);
    });
    $("v22RoomTitle").textContent=managedSite?`${managedSite} / 機房`:"機房";
    $("v22AddRoom").disabled=!managedSite; roomList.innerHTML="";
    const rooms=managedSite?roomNames(state,managedSite):[];
    if(!rooms.length) roomList.innerHTML=`<div class="v22-empty">尚未建立機房</div>`;
    rooms.forEach(name=>{
      const count=(state.racks||[]).filter(r=>siteOf(r)===managedSite&&roomOf(r)===name).length;
      const row=document.createElement("div"); row.className="v22-manage-row";
      row.innerHTML=`<div class="v22-pick static"><strong>${esc(name)}</strong><span>${count} 個機櫃</span></div><button class="v22-mini rename" title="重新命名">✎</button><button class="v22-mini delete" title="刪除">×</button>`;
      row.querySelector(".rename").onclick=()=>renameRoom(managedSite,name); row.querySelector(".delete").onclick=()=>deleteRoom(managedSite,name); roomList.appendChild(row);
    });
  }
  function addManagedSite(){
    const state=readState(); if(!state) return; const name=norm(prompt("新增據點名稱：","")); if(!name) return;
    if(name===DEFAULT_SITE){toast("此名稱為系統保留名稱","error");return;}
    if(siteNames(state).includes(name)){toast("此據點已存在","error");return;}
    addSiteToDirectory(state,name); managedSite=name; syncStateIntoCore(state,`已新增據點：${name}`,refreshManageDialog);
  }
  function addManagedRoom(){
    const state=readState(); if(!state||!managedSite) return; const name=norm(prompt(`新增「${managedSite}」的機房：`,"")); if(!name)return;
    if(name===DEFAULT_ROOM){toast("此名稱為系統保留名稱","error");return;}
    if(roomNames(state,managedSite).includes(name)){toast("此機房已存在","error");return;}
    addRoomToDirectory(state,managedSite,name); syncStateIntoCore(state,`已新增機房：${name}`,refreshManageDialog);
  }
  function renameSite(oldName){
    const state=readState(); if(!state)return; const name=norm(prompt("重新命名據點：",oldName)); if(!name||name===oldName)return;
    if(siteNames(state).includes(name)){toast("已有同名據點","error");return;}
    const dir=ensureDirectory(state),s=dir.sites.find(x=>x.name===oldName); if(!s)return; s.name=name;
    (state.racks||[]).forEach(r=>{if(siteOf(r)===oldName)r.siteName=name;}); managedSite=name;
    syncStateIntoCore(state,`據點已重新命名為：${name}`,refreshManageDialog);
  }
  function renameRoom(site,oldName){
    const state=readState(); if(!state)return; const name=norm(prompt(`重新命名「${oldName}」：`,oldName)); if(!name||name===oldName)return;
    if(roomNames(state,site).includes(name)){toast("此據點已有同名機房","error");return;}
    const s=ensureDirectory(state).sites.find(x=>x.name===site); if(!s)return; const i=s.rooms.indexOf(oldName); if(i>=0)s.rooms[i]=name;
    (state.racks||[]).forEach(r=>{if(siteOf(r)===site&&roomOf(r)===oldName)r.roomName=name;});
    syncStateIntoCore(state,`機房已重新命名為：${name}`,refreshManageDialog);
  }
  function deleteSite(name){
    const state=readState(); if(!state)return; const count=(state.racks||[]).filter(r=>siteOf(r)===name).length;
    if(count){toast(`「${name}」仍有 ${count} 個機櫃，請先移動機櫃`,`error`);return;}
    if(!confirm(`確定刪除據點「${name}」？`))return; const dir=ensureDirectory(state); dir.sites=dir.sites.filter(s=>s.name!==name); managedSite="";
    syncStateIntoCore(state,`已刪除據點：${name}`,refreshManageDialog);
  }
  function deleteRoom(site,name){
    const state=readState(); if(!state)return; const count=(state.racks||[]).filter(r=>siteOf(r)===site&&roomOf(r)===name).length;
    if(count){toast(`「${name}」仍有 ${count} 個機櫃，請先移動機櫃`,`error`);return;}
    if(!confirm(`確定刪除機房「${name}」？`))return; const s=ensureDirectory(state).sites.find(x=>x.name===site); if(s)s.rooms=s.rooms.filter(r=>r!==name);
    syncStateIntoCore(state,`已刪除機房：${name}`,refreshManageDialog);
  }

  function refreshLocalUI(){
    const badge=document.querySelector("#v2Hierarchy .badge"); if(badge) badge.textContent="V2.2";
    const moveBtn=$("v2EditLocation"); if(moveBtn) moveBtn.textContent="移動機櫃";
  }

  function installLeftActions(){
    const moveBtn=$("v2EditLocation"); if(moveBtn){
      moveBtn.textContent="移動機櫃";
      moveBtn.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();openMoveDialog();},true);
      const row=moveBtn.parentElement;
      if(row&&!$("v22ManageLocations")){
        const manage=document.createElement("button"); manage.className="btn"; manage.id="v22ManageLocations"; manage.textContent="據點管理";
        row.appendChild(manage); manage.addEventListener("click",openManageDialog);
      }
    }
  }

  function init(){
    buildRackDropdowns(); installLeftActions(); refreshLocalUI();
    $("btnNewRack")?.addEventListener("click",()=>setTimeout(()=>prepareRackModal("new"),0));
    $("btnRackSettings")?.addEventListener("click",()=>setTimeout(()=>prepareRackModal("edit"),0));
    const modal=$("rackModal"); if(modal)new MutationObserver(()=>{
      if(!modal.open)return; const isNew=$("rackModalEyebrow")?.textContent?.includes("NEW"); setTimeout(()=>prepareRackModal(isNew?"new":"edit"),0);
    }).observe(modal,{attributes:true,attributeFilter:["open"]});
    const state=readState(); if(state&&!state.locationDirectory){ ensureDirectory(state); syncStateIntoCore(state,"據點資料已升級至 V2.2"); }
  }
  init();
})();