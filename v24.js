(() => {
  "use strict";

  const STORAGE_KEY = "rack-manager-v1-state";
  const HISTORY_KEY = "rack-manager-v24-history";
  const MAX_HISTORY = 20;
  const MAX_HISTORY_BYTES = 2200000;
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? "").trim();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const TYPE_LABELS = {
    switch:"網路交換器", router:"路由器 / 防火牆", patch:"Patch Panel", cable:"理線架",
    server:"伺服器", nas:"NAS", ups:"UPS", pdu:"PDU", shelf:"層板 / 其他", other:"其他"
  };

  const style=document.createElement("style");
  style.textContent=`
    .v24-dialog{border:0;border-radius:16px;padding:0;box-shadow:0 26px 90px rgba(15,23,42,.35);max-height:calc(100vh - 28px);overflow:hidden;background:#fff}
    .v24-dialog::backdrop{background:rgba(15,23,42,.58);backdrop-filter:blur(2px)}
    .v24-overview-dialog{width:min(1180px,calc(100vw - 28px))}.v24-history-dialog{width:min(760px,calc(100vw - 28px))}
    .v24-inner{padding:20px;display:flex;flex-direction:column;max-height:calc(100vh - 28px);box-sizing:border-box}
    .v24-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.v24-head h2{margin:2px 0 0;font-size:20px;color:#172033}.v24-kicker{font-size:9px;font-weight:900;letter-spacing:.12em;color:#94a3b8}
    .v24-close{border:0;background:#f1f5f9;width:32px;height:32px;border-radius:8px;font-size:20px;line-height:1;color:#64748b;cursor:pointer}
    .v24-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.v24-summary-card{border:1px solid #e2e8f0;border-radius:10px;padding:9px 10px;background:#f8fafc}.v24-summary-card span{display:block;font-size:9px;color:#7c899a;font-weight:800}.v24-summary-card strong{display:block;font-size:16px;color:#1e293b;margin-top:3px}
    .v24-filters{display:grid;grid-template-columns:minmax(220px,2fr) repeat(4,minmax(120px,1fr));gap:8px;margin-bottom:10px}.v24-filters .field{width:100%}
    .v24-table-wrap{border:1px solid #e2e8f0;border-radius:11px;overflow:auto;min-height:260px;max-height:62vh}.v24-table{width:100%;border-collapse:collapse;font-size:11px}.v24-table th{position:sticky;top:0;z-index:2;background:#f8fafc;color:#64748b;font-size:9px;text-align:left;padding:9px 8px;border-bottom:1px solid #dbe3ed;white-space:nowrap}.v24-table td{padding:8px;border-bottom:1px solid #edf1f5;color:#334155;vertical-align:middle}.v24-table tbody tr{cursor:pointer}.v24-table tbody tr:hover{background:#f8fbff}.v24-table .name strong{display:block;color:#1e293b;font-size:11px}.v24-table .name span{display:block;color:#94a3b8;font-size:9px;margin-top:2px}.v24-path{font-size:9px;color:#64748b;white-space:nowrap}.v24-u{display:inline-block;background:#0f172a;color:#fff;border-radius:6px;padding:3px 6px;font-size:9px;font-weight:800;white-space:nowrap}.v24-status{font-size:9px;font-weight:800;padding:3px 6px;border-radius:999px;background:#e2e8f0;color:#475569;white-space:nowrap}
    .v24-empty{padding:34px 12px;text-align:center;color:#94a3b8;font-size:12px}
    .v24-history-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:10px}.v24-history-toolbar .spacer{flex:1}.v24-note{font-size:10px;color:#7a8798;line-height:1.55}
    .v24-history-list{display:flex;flex-direction:column;gap:7px;overflow:auto;max-height:58vh;padding-right:2px}.v24-history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid #e2e8f0;border-radius:10px;padding:10px 11px;background:#fff}.v24-history-row:hover{border-color:#cbd5e1}.v24-history-main strong{display:block;font-size:12px;color:#1e293b}.v24-history-main span{display:block;font-size:9px;color:#7a8798;margin-top:3px}.v24-history-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:5px;font-size:9px;color:#64748b}.v24-history-actions{display:flex;gap:5px}.v24-history-actions button{min-height:30px;padding:5px 8px;font-size:10px}
    .v24-manual{display:inline-block;background:#dbeafe;color:#1d4ed8;border-radius:999px;padding:2px 6px;font-size:8px;font-weight:900;margin-left:5px}.v24-auto{display:inline-block;background:#f1f5f9;color:#64748b;border-radius:999px;padding:2px 6px;font-size:8px;font-weight:900;margin-left:5px}
    .v24-top-btn{white-space:nowrap}
    @media(max-width:900px){.v24-filters{grid-template-columns:1fr 1fr}.v24-filters input{grid-column:1/-1}.v24-summary{grid-template-columns:1fr 1fr}.v24-table-wrap{max-height:55vh}}
  `;
  document.head.appendChild(style);

  function readState(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");}catch{return null;}}
  function siteOf(r){return norm(r?.siteName)||DEFAULT_SITE;}
  function roomOf(r){return norm(r?.roomName)||norm(r?.location)||DEFAULT_ROOM;}
  function counts(state){
    const racks=(state?.racks||[]).length;
    const devices=(state?.racks||[]).reduce((n,r)=>n+(r.devices||[]).length,0);
    const sites=new Set((state?.racks||[]).map(siteOf)).size;
    const rooms=new Set((state?.racks||[]).map(r=>`${siteOf(r)}\u241f${roomOf(r)}`)).size;
    return {racks,devices,sites,rooms};
  }
  function fmt(ts){return new Date(ts).toLocaleString("zh-TW",{hour12:false});}
  function toast(message,type="success"){
    const stack=$("toastStack");if(!stack)return;const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;stack.appendChild(el);setTimeout(()=>el.remove(),2800);
  }
  function significantState(state){
    if(!state)return null;
    const x=JSON.parse(JSON.stringify(state));
    delete x.activeRackId;delete x.activeFace;delete x.zoom;delete x.version;
    (x.racks||[]).forEach(r=>delete r.updatedAt);
    return x;
  }
  function fingerprint(state){try{return JSON.stringify(significantState(state));}catch{return "";}}
  function readHistory(){try{const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");return Array.isArray(h)?h:[];}catch{return [];}}
  function trimHistory(items){
    items=items.slice().sort((a,b)=>b.ts-a.ts).slice(0,MAX_HISTORY);
    while(items.length>1 && JSON.stringify(items).length>MAX_HISTORY_BYTES)items.pop();
    return items;
  }
  function saveHistory(items){
    items=trimHistory(items);
    try{localStorage.setItem(HISTORY_KEY,JSON.stringify(items));return true;}
    catch(err){
      console.warn("V2.4 history quota",err);
      try{localStorage.setItem(HISTORY_KEY,JSON.stringify(items.slice(0,5)));return true;}catch{return false;}
    }
  }
  function snapshotLabel(state,previous){
    if(!previous)return "資料版本";
    const a=counts(previous),b=counts(state);
    if(a.racks!==b.racks)return `機櫃數 ${a.racks} → ${b.racks}`;
    if(a.devices!==b.devices)return `設備數 ${a.devices} → ${b.devices}`;
    return "機櫃 / 設備資料更新";
  }
  function addSnapshot(label="",manual=false,stateOverride=null){
    const state=stateOverride||readState();if(!state?.racks?.length)return false;
    const history=readHistory(),previous=history[0]?.state||null;
    const fp=fingerprint(state);
    if(!manual && history[0]?.fingerprint===fp)return false;
    const item={id:`h-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,ts:Date.now(),label:label||snapshotLabel(state,previous),manual:!!manual,fingerprint:fp,state:JSON.parse(JSON.stringify(state))};
    history.unshift(item);const ok=saveHistory(history);
    if(ok){backedFingerprint=fp;observedFingerprint=fp;refreshHistoryIfOpen();}
    return ok;
  }
  function deleteSnapshot(id){const h=readHistory().filter(x=>x.id!==id);saveHistory(h);refreshHistoryIfOpen();}

  let suspendWatcherUntil=0, observedFingerprint="", backedFingerprint="", backupTimer=null;
  function startHistoryWatcher(){
    const state=readState();if(!state)return;
    const fp=fingerprint(state);observedFingerprint=fp;
    const history=readHistory();
    if(!history.length){addSnapshot("V2.4 初始備份",true,state);backedFingerprint=fp;}
    else backedFingerprint=history[0]?.fingerprint||"";
    setInterval(()=>{
      if(Date.now()<suspendWatcherUntil)return;
      const current=readState();if(!current)return;const currentFp=fingerprint(current);
      if(currentFp===observedFingerprint)return;
      observedFingerprint=currentFp;clearTimeout(backupTimer);
      backupTimer=setTimeout(()=>{
        if(Date.now()<suspendWatcherUntil)return;
        const latest=readState();if(!latest)return;const latestFp=fingerprint(latest);
        if(latestFp!==observedFingerprint||latestFp===backedFingerprint)return;
        addSnapshot("",false,latest);
      },1800);
    },1000);
  }

  function syncStateIntoCore(nextState,message,callback){
    const input=$("jsonImport");
    if(!input){localStorage.setItem(STORAGE_KEY,JSON.stringify(nextState));toast(message);callback?.();return;}
    try{
      const file=new File([JSON.stringify(nextState)],"rack-manager-v24-restore.json",{type:"application/json"}),dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
      const originalConfirm=window.confirm;let approve=true;
      window.confirm=function(text){if(approve&&String(text||"").includes("將匯入")){approve=false;window.confirm=originalConfirm;return true;}return originalConfirm.apply(this,arguments);};
      input.dispatchEvent(new Event("change",{bubbles:true}));
      setTimeout(()=>{if(window.confirm!==originalConfirm)window.confirm=originalConfirm;document.querySelectorAll("#toastStack .toast").forEach(t=>{if(t.textContent.includes("JSON 備份已匯入"))t.textContent=message;});callback?.();},220);
    }catch(err){console.error("V2.4 restore failed",err);localStorage.setItem(STORAGE_KEY,JSON.stringify(nextState));toast("資料已還原，請重新整理頁面","error");callback?.();}
  }

  function installTopButtons(){
    const actions=document.querySelector(".top-actions");if(!actions)return;
    if(!$("v24OverviewBtn")){
      const b=document.createElement("button");b.className="btn v24-top-btn";b.id="v24OverviewBtn";b.textContent="設備總覽";b.addEventListener("click",openOverview);actions.insertBefore(b,actions.firstChild);
    }
    if(!$("v24HistoryBtn")){
      const b=document.createElement("button");b.className="btn v24-top-btn";b.id="v24HistoryBtn";b.textContent="版本紀錄";b.addEventListener("click",openHistory);actions.insertBefore(b,$("v24OverviewBtn").nextSibling);
    }
  }

  let overviewDialog=null,ovSearch=null,ovSite=null,ovRoom=null,ovType=null,ovStatus=null,ovBody=null,ovCount=null;
  function buildOverview(){
    if($("v24Overview")){overviewDialog=$("v24Overview");return;}
    overviewDialog=document.createElement("dialog");overviewDialog.className="v24-dialog v24-overview-dialog";overviewDialog.id="v24Overview";
    overviewDialog.innerHTML=`<div class="v24-inner">
      <div class="v24-head"><div><span class="v24-kicker">DEVICE INVENTORY</span><h2>設備總覽</h2></div><button class="v24-close" id="v24OverviewClose">×</button></div>
      <div class="v24-summary" id="v24OverviewSummary"></div>
      <div class="v24-filters">
        <input class="field" id="v24Search" placeholder="搜尋設備名稱、IP、Hostname、型號、序號、資產編號…">
        <select class="field" id="v24Site"><option value="">全部據點</option></select>
        <select class="field" id="v24Room"><option value="">全部機房</option></select>
        <select class="field" id="v24Type"><option value="">全部類型</option></select>
        <select class="field" id="v24Status"><option value="">全部狀態</option></select>
      </div>
      <div class="v24-note" id="v24Count"></div>
      <div class="v24-table-wrap"><table class="v24-table"><thead><tr><th>設備</th><th>類型</th><th>IP / Hostname</th><th>位置</th><th>U 位</th><th>狀態</th></tr></thead><tbody id="v24OverviewBody"></tbody></table></div>
    </div>`;
    document.body.appendChild(overviewDialog);
    $("v24OverviewClose").onclick=()=>overviewDialog.close();
    ovSearch=$("v24Search");ovSite=$("v24Site");ovRoom=$("v24Room");ovType=$("v24Type");ovStatus=$("v24Status");ovBody=$("v24OverviewBody");ovCount=$("v24Count");
    ovSearch.addEventListener("input",renderOverview);ovSite.addEventListener("change",()=>{fillOverviewRooms();renderOverview();});ovRoom.addEventListener("change",renderOverview);ovType.addEventListener("change",renderOverview);ovStatus.addEventListener("change",renderOverview);
  }
  function allDevices(state){
    const rows=[];(state?.racks||[]).forEach(r=>(r.devices||[]).forEach(d=>rows.push({r,d,site:siteOf(r),room:roomOf(r)})));return rows;
  }
  function openOverview(){
    buildOverview();const state=readState();if(!state)return;const c=counts(state);
    $("v24OverviewSummary").innerHTML=`<div class="v24-summary-card"><span>據點</span><strong>${c.sites}</strong></div><div class="v24-summary-card"><span>機房</span><strong>${c.rooms}</strong></div><div class="v24-summary-card"><span>機櫃</span><strong>${c.racks}</strong></div><div class="v24-summary-card"><span>設備</span><strong>${c.devices}</strong></div>`;
    const rows=allDevices(state),sites=[...new Set(rows.map(x=>x.site))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
    ovSite.innerHTML=`<option value="">全部據點</option>`+sites.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
    ovType.innerHTML=`<option value="">全部類型</option>`+Object.entries(TYPE_LABELS).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join("");
    const statuses=[...new Set(rows.map(x=>norm(x.d.status)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
    ovStatus.innerHTML=`<option value="">全部狀態</option>`+statuses.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
    ovSearch.value="";ovSite.value="";ovType.value="";ovStatus.value="";fillOverviewRooms();renderOverview();overviewDialog.showModal();setTimeout(()=>ovSearch.focus(),30);
  }
  function fillOverviewRooms(){
    const state=readState(),site=ovSite?.value||"";if(!state||!ovRoom)return;
    const rooms=[...new Set(allDevices(state).filter(x=>!site||x.site===site).map(x=>x.room))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
    ovRoom.innerHTML=`<option value="">全部機房</option>`+rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join("");
  }
  function uLabel(d){if(d.installation==="external")return "周邊";const top=Number(d.u)||1,h=Math.max(1,Number(d.height)||1),bottom=top-h+1;return h>1?`U${bottom}–U${top}`:`U${top}`;}
  function renderOverview(){
    const state=readState();if(!state||!ovBody)return;const q=norm(ovSearch.value).toLowerCase(),site=ovSite.value,room=ovRoom.value,type=ovType.value,status=ovStatus.value;
    let rows=allDevices(state).filter(x=>{
      if(site&&x.site!==site)return false;if(room&&x.room!==room)return false;if(type&&x.d.type!==type)return false;if(status&&norm(x.d.status)!==status)return false;
      if(!q)return true;const hay=[x.d.name,x.d.ip,x.d.hostname,x.d.model,x.d.serial,x.d.asset,x.d.brand,x.d.mac,x.d.vlan,x.d.owner,x.d.note,x.d.status,TYPE_LABELS[x.d.type],x.site,x.room,x.r.name].map(v=>norm(v).toLowerCase()).join(" ");return hay.includes(q);
    });
    rows.sort((a,b)=>a.site.localeCompare(b.site,"zh-Hant")||a.room.localeCompare(b.room,"zh-Hant")||String(a.r.name).localeCompare(String(b.r.name),"zh-Hant")||((b.d.u||0)-(a.d.u||0)));
    ovCount.textContent=`顯示 ${rows.length} / ${allDevices(state).length} 台設備 · 點選資料列可直接跳到設備位置`;
    if(!rows.length){ovBody.innerHTML=`<tr><td colspan="6"><div class="v24-empty">沒有符合條件的設備</div></td></tr>`;return;}
    ovBody.innerHTML="";rows.forEach(x=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`<td class="name"><strong>${esc(x.d.name||"未命名設備")}</strong><span>${esc([x.d.brand,x.d.model].filter(Boolean).join(" · ")||"—")}</span></td><td>${esc(TYPE_LABELS[x.d.type]||x.d.type||"其他")}</td><td>${esc(x.d.ip||"—")}<div class="v24-path">${esc(x.d.hostname||"")}</div></td><td><strong>${esc(x.r.name||"機櫃")}</strong><div class="v24-path">${esc(x.site)} › ${esc(x.room)}${x.d.side?` › ${x.d.side==="rear"?"REAR":"FRONT"}`:""}</div></td><td><span class="v24-u">${esc(uLabel(x.d))}</span></td><td><span class="v24-status">${esc(x.d.status||"正常")}</span></td>`;
      tr.addEventListener("click",()=>locateDevice(x.r.id,x.d));ovBody.appendChild(tr);
    });
  }
  function locateDevice(rackId,d){
    overviewDialog.close();const rackSelect=$("rackSelect");if(!rackSelect)return;
    if(rackSelect.value!==rackId){rackSelect.value=rackId;rackSelect.dispatchEvent(new Event("change",{bubbles:true}));}
    setTimeout(()=>{
      if(d.installation!=="external"){
        const face=document.querySelector(`.face-toggle button[data-face="${d.side||"front"}"]`);if(face&&!face.classList.contains("active"))face.click();
      }
      setTimeout(()=>{
        const id=String(d.id);let target=null;
        try{target=document.querySelector(`#rackGrid .rack-device[data-id="${CSS.escape(id)}"]`);}catch{}
        if(!target){try{target=document.querySelector(`#deviceList [data-v2-id="${CSS.escape(id)}"]`);}catch{}}
        if(!target)target=[...document.querySelectorAll("#deviceList > *")].find(el=>el.textContent.includes(d.name||""));
        target?.click();target?.scrollIntoView({behavior:"smooth",block:"center"});
      },120);
    },100);
  }

  let historyDialog=null,historyList=null,historySummary=null;
  function buildHistory(){
    if($("v24History")){historyDialog=$("v24History");return;}
    historyDialog=document.createElement("dialog");historyDialog.className="v24-dialog v24-history-dialog";historyDialog.id="v24History";
    historyDialog.innerHTML=`<div class="v24-inner">
      <div class="v24-head"><div><span class="v24-kicker">LOCAL VERSION HISTORY</span><h2>版本紀錄</h2></div><button class="v24-close" id="v24HistoryClose">×</button></div>
      <div class="v24-summary" id="v24HistorySummary"></div>
      <div class="v24-history-toolbar"><button class="btn primary" id="v24ManualBackup">＋ 建立手動備份</button><span class="spacer"></span><span class="v24-note">最多保留 ${MAX_HISTORY} 個版本，超過會自動移除最舊版本。</span></div>
      <div class="v24-history-list" id="v24HistoryList"></div>
      <p class="v24-note" style="margin:10px 0 0">版本紀錄只存在目前瀏覽器。跨電腦或重大變更前，仍建議使用「匯出 → JSON 備份」。</p>
    </div>`;
    document.body.appendChild(historyDialog);historyList=$("v24HistoryList");historySummary=$("v24HistorySummary");
    $("v24HistoryClose").onclick=()=>historyDialog.close();$("v24ManualBackup").onclick=()=>{if(addSnapshot("手動備份",true)){toast("已建立手動備份");refreshHistory();}else toast("無法建立備份","error");};
  }
  function openHistory(){buildHistory();refreshHistory();historyDialog.showModal();}
  function refreshHistoryIfOpen(){if(historyDialog?.open)refreshHistory();}
  function refreshHistory(){
    const state=readState(),c=counts(state),h=readHistory();
    historySummary.innerHTML=`<div class="v24-summary-card"><span>目前機櫃</span><strong>${c.racks}</strong></div><div class="v24-summary-card"><span>目前設備</span><strong>${c.devices}</strong></div><div class="v24-summary-card"><span>保存版本</span><strong>${h.length}</strong></div><div class="v24-summary-card"><span>最新版本</span><strong style="font-size:11px">${h[0]?esc(fmt(h[0].ts)):"—"}</strong></div>`;
    historyList.innerHTML="";if(!h.length){historyList.innerHTML=`<div class="v24-empty">尚無版本紀錄</div>`;return;}
    h.forEach(item=>{
      const c2=counts(item.state),row=document.createElement("div");row.className="v24-history-row";
      row.innerHTML=`<div class="v24-history-main"><strong>${esc(item.label||"資料版本")}<span class="${item.manual?"v24-manual":"v24-auto"}">${item.manual?"手動":"自動"}</span></strong><span>${esc(fmt(item.ts))}</span><div class="v24-history-meta"><span>${c2.racks} 個機櫃</span><span>${c2.devices} 台設備</span></div></div><div class="v24-history-actions"><button class="btn restore">還原</button><button class="btn danger delete">刪除</button></div>`;
      row.querySelector(".restore").onclick=()=>restoreSnapshot(item);row.querySelector(".delete").onclick=()=>{if(confirm(`確定刪除 ${fmt(item.ts)} 的版本紀錄？`))deleteSnapshot(item.id);};historyList.appendChild(row);
    });
  }
  function restoreSnapshot(item){
    if(!confirm(`確定將目前資料還原到 ${fmt(item.ts)}？\n\n系統會先建立一份「還原前備份」。`))return;
    addSnapshot("還原前備份",true);suspendWatcherUntil=Date.now()+5000;
    const restored=JSON.parse(JSON.stringify(item.state));observedFingerprint=fingerprint(restored);backedFingerprint=observedFingerprint;
    syncStateIntoCore(restored,`已還原至 ${fmt(item.ts)}`,()=>{historyDialog.close();setTimeout(()=>toast("版本還原完成"),250);});
  }

  function updateVersionBadge(){
    const badge=document.querySelector("#v2Hierarchy .v231-version-badge")||document.querySelector("#v2Hierarchy .badge");if(badge)badge.textContent="V2.4";
  }
  function init(){installTopButtons();updateVersionBadge();startHistoryWatcher();}
  init();
})();