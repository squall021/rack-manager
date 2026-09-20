(() => {
  "use strict";

  const STORAGE_KEY = "rack-manager-v1-state";
  const DEFAULT_SITE = "未分類據點";
  const DEFAULT_ROOM = "未分類機房";
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? "").trim();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));

  const TYPE_LABELS = {
    switch:"網路交換器", router:"路由器 / 防火牆", patch:"Patch Panel", cable:"理線架",
    server:"伺服器", nas:"NAS", ups:"UPS", pdu:"PDU", shelf:"層板 / 其他", other:"其他"
  };

  const style=document.createElement("style");
  style.textContent=`
    .v23-export-dialog{width:min(980px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto}
    .v23-export-grid{display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px}
    .v23-box{border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;overflow:hidden}
    .v23-box-head{padding:10px 12px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .v23-box-head strong{font-size:12px}.v23-box-body{padding:11px}
    .v23-fields{display:grid;gap:9px}.v23-fields label{font-size:10px;font-weight:800;color:#64748b;display:grid;gap:5px}
    .v23-inline{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v23-checks{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:4px}
    .v23-checks label{display:flex;align-items:center;gap:6px;font-size:11px;color:#475569;font-weight:600}.v23-checks input{width:15px;height:15px}
    .v23-rack-tools{display:flex;gap:6px;flex-wrap:wrap}.v23-rack-tools .btn{min-height:30px;padding:5px 8px;font-size:10px}
    .v23-order-list{padding:8px;display:flex;flex-direction:column;gap:6px;max-height:430px;overflow:auto}
    .v23-rack-row{display:grid;grid-template-columns:22px 24px minmax(0,1fr) auto 26px 26px;gap:6px;align-items:center;background:#fff;border:1px solid #dfe6ef;border-radius:9px;padding:6px 7px;user-select:none}
    .v23-rack-row:hover{border-color:#93c5fd}.v23-rack-row input{width:15px;height:15px;margin:0}
    .v23-order-handle{border:0;background:transparent;color:#64748b;font-weight:900;font-size:16px;cursor:grab;padding:0;touch-action:none;-webkit-user-drag:none}.v23-order-handle:active{cursor:grabbing}
    .v23-rack-name{min-width:0}.v23-rack-name strong,.v23-rack-name span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v23-rack-name strong{font-size:12px}.v23-rack-name span{font-size:9px;color:#8492a6;margin-top:2px}
    .v23-rack-u{font-size:9px;font-weight:800;color:#475569;background:#f1f5f9;border-radius:6px;padding:4px 6px;white-space:nowrap}
    .v23-order-btn{width:26px;height:26px;border:1px solid #dbe3ed;background:#fff;border-radius:6px;color:#526176;padding:0}.v23-order-btn:hover{border-color:#93c5fd;color:#2563eb}
    .v23-order-placeholder{height:48px;border:2px dashed #60a5fa;border-radius:9px;background:#eff6ff}
    .v23-order-ghost{position:fixed;z-index:20000;pointer-events:none;opacity:.9;background:#fff;border:2px solid #60a5fa;border-radius:9px;box-shadow:0 16px 40px rgba(15,23,42,.24);padding:6px 8px;display:flex;align-items:center;gap:8px;color:#334155;font-size:12px;font-weight:800}
    .v23-empty{padding:32px 12px;text-align:center;color:#94a3b8;font-size:12px}
    .v23-note{font-size:10px;line-height:1.55;color:#7a8798;margin:9px 0 0}
    .v23-export-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid #e5e7eb;padding-top:14px;margin-top:16px}.v23-export-actions .spacer{flex:1}
    .v23-export-progress{font-size:10px;color:#64748b;min-height:16px}
    .v23-stage{position:absolute;left:-20000px;top:0;background:#eef2f7;padding:0;z-index:-1}
    .v23-stage.png-stack{display:flex;flex-direction:column;gap:24px;padding:24px;background:#e5e7eb}
    .v23-sheet{background:#fff;box-sizing:border-box;overflow:hidden;position:relative;padding:28px 30px 24px;display:flex;flex-direction:column;gap:14px}
    .v23-sheet-head{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;border-bottom:1px solid #dfe5ec;padding-bottom:10px}
    .v23-sheet-title span{display:block;font-size:9px;letter-spacing:.15em;color:#94a3b8;font-weight:900}.v23-sheet-title h2{font-size:20px;margin:3px 0 0;color:#172033}.v23-sheet-meta{text-align:right;font-size:10px;color:#64748b;line-height:1.55}
    .v23-sheet-grid{flex:1;display:grid;gap:14px;min-height:0;align-items:start}
    .v23-export-rack{border:1px solid #cbd5e1;border-radius:10px;padding:9px;background:#fff;min-width:0;overflow:hidden;display:flex;flex-direction:column;gap:7px}
    .v23-export-rack-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.v23-export-rack-head strong{font-size:12px;color:#1e293b}.v23-export-rack-head span{display:block;font-size:8px;color:#7a8798;margin-top:2px}.v23-rack-badge{font-size:8px;font-weight:900;background:#0f172a;color:#fff;border-radius:5px;padding:4px 5px;white-space:nowrap}
    .v23-face-pair{display:grid;grid-template-columns:1fr 1fr;gap:7px;min-width:0}.v23-face-block{min-width:0}.v23-face-title{font-size:8px;font-weight:900;color:#475569;text-align:center;margin:0 0 3px;letter-spacing:.08em}
    .v23-rack-face{position:relative;border:2px solid #475569;background-color:#fff;overflow:hidden;min-width:0;background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--v23-u) - 1px),#dce3ec calc(var(--v23-u) - 1px),#dce3ec var(--v23-u))}
    .v23-rack-face::before,.v23-rack-face::after{content:"";position:absolute;top:0;bottom:0;width:20px;background:rgba(241,245,249,.9);z-index:0}.v23-rack-face::before{left:0;border-right:1px solid #d9e0e8}.v23-rack-face::after{right:0;border-left:1px solid #d9e0e8}
    .v23-u-num{position:absolute;left:0;width:20px;text-align:center;font-size:5px;font-weight:800;color:#64748b;z-index:1;line-height:var(--v23-u)}
    .v23-export-device{position:absolute;z-index:3;border:1px solid rgba(15,23,42,.25);border-radius:3px;overflow:hidden;padding:1px 3px;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box;color:#0f172a;line-height:1.05}
    .v23-export-device strong{display:block;font-size:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v23-export-device span{display:block;font-size:5px;opacity:.78;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
    .v23-dev-switch,.v23-dev-router{background:#bfdbfe}.v23-dev-patch,.v23-dev-cable{background:#ddd6fe}.v23-dev-server{background:#bbf7d0}.v23-dev-nas{background:#a7f3d0}.v23-dev-ups,.v23-dev-pdu{background:#fde68a}.v23-dev-shelf,.v23-dev-other{background:#e2e8f0}
    .v23-rack-footer{display:flex;justify-content:space-between;gap:6px;font-size:7px;color:#7a8798;white-space:nowrap;overflow:hidden}.v23-rack-footer span{overflow:hidden;text-overflow:ellipsis}
    .v23-sheet-foot{display:flex;justify-content:space-between;font-size:8px;color:#94a3b8;border-top:1px solid #edf1f5;padding-top:7px}
    @media(max-width:820px){.v23-export-grid{grid-template-columns:1fr}.v23-order-list{max-height:300px}.v23-inline{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function readState(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");}catch{return null;}
  }
  function siteOf(r){return norm(r?.siteName)||DEFAULT_SITE;}
  function roomOf(r){return norm(r?.roomName)||norm(r?.location)||DEFAULT_ROOM;}
  function activeRack(state){return state?.racks?.find(r=>r.id===state.activeRackId)||state?.racks?.[0]||null;}
  function safeName(s){return norm(s).replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g,"-")||"rack-room";}
  function roomKey(site,room){return `${site}\u241f${room}`;}
  function getDirectory(state){
    const map=new Map();
    (state?.locationDirectory?.sites||[]).forEach(s=>{
      const name=norm(s?.name);if(!name||name===DEFAULT_SITE)return;
      map.set(name,new Set((s.rooms||[]).map(norm).filter(Boolean)));
    });
    (state?.racks||[]).forEach(r=>{
      const s=siteOf(r),room=roomOf(r);if(s===DEFAULT_SITE)return;
      if(!map.has(s))map.set(s,new Set());if(room!==DEFAULT_ROOM)map.get(s).add(room);
    });
    return map;
  }
  function siteNames(state){return [...getDirectory(state).keys()].sort((a,b)=>a.localeCompare(b,"zh-Hant"));}
  function roomNames(state,site){return [...(getDirectory(state).get(site)||[])].sort((a,b)=>a.localeCompare(b,"zh-Hant"));}
  function racksInRoom(state,site,room){return (state?.racks||[]).filter(r=>siteOf(r)===site&&roomOf(r)===room);}
  function savedLayout(state,site,room){return state?.roomExportLayouts?.[roomKey(site,room)]||{};}
  function orderedRacks(state,site,room){
    const racks=racksInRoom(state,site,room),saved=savedLayout(state,site,room).order||[];
    const map=new Map(racks.map(r=>[r.id,r]));
    const out=[];saved.forEach(id=>{const r=map.get(id);if(r){out.push(r);map.delete(id);}});
    [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),"zh-Hant")).forEach(r=>out.push(r));return out;
  }
  function toast(message,type="success"){
    const stack=$("toastStack");if(!stack)return;const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;stack.appendChild(el);setTimeout(()=>el.remove(),2800);
  }
  function syncStateIntoCore(nextState,message,callback){
    const input=$("jsonImport");
    if(!input){localStorage.setItem(STORAGE_KEY,JSON.stringify(nextState));toast(message);callback?.();return;}
    try{
      const file=new File([JSON.stringify(nextState)],"rack-manager-v23-sync.json",{type:"application/json"}),dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
      const originalConfirm=window.confirm;let approve=true;
      window.confirm=function(text){if(approve&&String(text||"").includes("將匯入")){approve=false;window.confirm=originalConfirm;return true;}return originalConfirm.apply(this,arguments);};
      input.dispatchEvent(new Event("change",{bubbles:true}));
      setTimeout(()=>{if(window.confirm!==originalConfirm)window.confirm=originalConfirm;document.querySelectorAll("#toastStack .toast").forEach(t=>{if(t.textContent.includes("JSON 備份已匯入"))t.textContent=message;});callback?.();},180);
    }catch(err){console.error("Rack Manager V2.3 sync failed",err);localStorage.setItem(STORAGE_KEY,JSON.stringify(nextState));toast(message);callback?.();}
  }

  function simplifyLeftPanel(){
    const move=$("v2EditLocation");if(move)move.remove();
    const manage=$("v22ManageLocations");if(manage){manage.textContent="據點管理";manage.style.flex="1";}
    const badge=document.querySelector("#v2Hierarchy .badge");if(badge)badge.textContent="V2.3";
  }

  let dialog,siteSelect,roomSelect,orderList,progress;
  function buildExportMenu(){
    const menu=$("exportMenu");if(!menu||$("v23RoomExport"))return;
    const btn=document.createElement("button");btn.id="v23RoomExport";btn.type="button";btn.textContent="機房配置圖…";menu.appendChild(btn);btn.addEventListener("click",openExportDialog);
  }
  function buildDialog(){
    if($("v23ExportDialog")){dialog=$("v23ExportDialog");return;}
    dialog=document.createElement("dialog");dialog.className="v2-dialog v23-export-dialog";dialog.id="v23ExportDialog";
    dialog.innerHTML=`<div class="v2-dialog-inner">
      <div class="v2-dialog-head"><div><span class="eyebrow">ROOM RACK EXPORT</span><h2>機房配置匯出</h2></div><button class="icon-btn" id="v23Close">×</button></div>
      <div class="v23-export-grid">
        <div class="v23-box"><div class="v23-box-head"><strong>匯出設定</strong></div><div class="v23-box-body v23-fields">
          <label>據點<select class="field" id="v23Site"></select></label>
          <label>機房<select class="field" id="v23Room"></select></label>
          <div class="v23-inline">
            <label>顯示面<select class="field" id="v23Face"><option value="front">FRONT 正面</option><option value="rear">REAR 背面</option><option value="both">FRONT + REAR</option></select></label>
            <label>每頁機櫃<select class="field" id="v23PerPage"><option value="2">2 個</option><option value="3" selected>3 個</option><option value="4">4 個</option></select></label>
          </div>
          <div class="v23-inline">
            <label>紙張<select class="field" id="v23Paper"><option value="a4">A4</option><option value="a3">A3</option></select></label>
            <label>方向<select class="field" id="v23Orientation"><option value="landscape">橫式</option><option value="portrait">直式</option></select></label>
          </div>
          <div class="v23-checks">
            <label><input type="checkbox" id="v23ShowLocation" checked>機櫃位置</label>
            <label><input type="checkbox" id="v23ShowModel" checked>設備型號</label>
            <label><input type="checkbox" id="v23ShowIp" checked>設備 IP</label>
            <label><input type="checkbox" id="v23SaveOnExport">儲存此排序</label>
          </div>
          <p class="v23-note">PDF 會依「每頁機櫃」自動分頁；PNG 若超過一頁，會將各頁縱向排列在同一張圖片中。</p>
        </div></div>
        <div class="v23-box"><div class="v23-box-head"><strong>機櫃選擇與排序</strong><div class="v23-rack-tools"><button class="btn" id="v23All">全部選取</button><button class="btn" id="v23None">全部取消</button><button class="btn" id="v23NameSort">依名稱</button><button class="btn" id="v23SaveOrder">儲存預設順序</button></div></div><div class="v23-order-list" id="v23OrderList"></div></div>
      </div>
      <div class="v23-export-actions"><span class="v23-export-progress" id="v23Progress"></span><span class="spacer"></span><button class="btn" id="v23Cancel">取消</button><button class="btn" id="v23Png">匯出 PNG</button><button class="btn primary" id="v23Pdf">匯出 PDF</button></div>
    </div>`;
    document.body.appendChild(dialog);
    siteSelect=$("v23Site");roomSelect=$("v23Room");orderList=$("v23OrderList");progress=$("v23Progress");
    $("v23Close").onclick=()=>dialog.close();$("v23Cancel").onclick=()=>dialog.close();
    siteSelect.onchange=()=>{fillRooms();renderOrderList();};roomSelect.onchange=renderOrderList;
    $("v23All").onclick=()=>orderList.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=true);
    $("v23None").onclick=()=>orderList.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false);
    $("v23NameSort").onclick=sortRowsByName;$("v23SaveOrder").onclick=()=>saveCurrentOrder(true);
    $("v23Png").onclick=()=>exportRoom("png");$("v23Pdf").onclick=()=>exportRoom("pdf");
    installPointerSort();
  }
  function openExportDialog(){
    buildDialog();const state=readState();if(!state)return;
    const sites=siteNames(state);if(!sites.length){toast("目前沒有可匯出的據點","error");return;}
    const rack=activeRack(state),currentSite=siteOf(rack);
    siteSelect.innerHTML=sites.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");siteSelect.value=sites.includes(currentSite)?currentSite:sites[0];fillRooms(roomOf(rack));renderOrderList();progress.textContent="";dialog.showModal();
  }
  function fillRooms(preferred=""){
    const state=readState(),site=siteSelect.value,rooms=roomNames(state,site);
    roomSelect.innerHTML=rooms.length?rooms.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join(""):`<option value="">此據點尚無機房</option>`;
    roomSelect.disabled=!rooms.length;if(preferred&&rooms.includes(preferred))roomSelect.value=preferred;
  }
  function renderOrderList(){
    const state=readState(),site=siteSelect.value,room=roomSelect.value;if(!state||!site||!room){orderList.innerHTML=`<div class="v23-empty">請先選擇據點與機房</div>`;return;}
    const racks=orderedRacks(state,site,room);orderList.innerHTML="";
    if(!racks.length){orderList.innerHTML=`<div class="v23-empty">此機房目前沒有機櫃</div>`;return;}
    racks.forEach(r=>{
      const row=document.createElement("div");row.className="v23-rack-row";row.dataset.id=r.id;row.dataset.name=r.name||"";
      row.innerHTML=`<input type="checkbox" checked aria-label="選取 ${esc(r.name)}"><button class="v23-order-handle" title="拖曳排序">≡</button><div class="v23-rack-name"><strong>${esc(r.name)}</strong><span>${esc(r.location||"位置未設定")} · ${(r.devices||[]).length} 台設備</span></div><span class="v23-rack-u">${Number(r.units)||42}U</span><button class="v23-order-btn up" title="上移">↑</button><button class="v23-order-btn down" title="下移">↓</button>`;
      row.querySelector(".up").onclick=()=>{const prev=row.previousElementSibling;if(prev)orderList.insertBefore(row,prev);};
      row.querySelector(".down").onclick=()=>{const next=row.nextElementSibling;if(next)orderList.insertBefore(next,row);};
      orderList.appendChild(row);
    });
    loadSavedPreferences(state,site,room);
  }
  function sortRowsByName(){
    [...orderList.querySelectorAll(".v23-rack-row")].sort((a,b)=>a.dataset.name.localeCompare(b.dataset.name,"zh-Hant")).forEach(r=>orderList.appendChild(r));
  }
  function currentOrderIds(){return [...orderList.querySelectorAll(".v23-rack-row")].map(r=>r.dataset.id);}
  function selectedIds(){return [...orderList.querySelectorAll(".v23-rack-row")].filter(r=>r.querySelector('input[type="checkbox"]').checked).map(r=>r.dataset.id);}
  function currentOptions(){return {face:$("v23Face").value,perPage:Number($("v23PerPage").value)||3,paper:$("v23Paper").value,orientation:$("v23Orientation").value,showLocation:$("v23ShowLocation").checked,showModel:$("v23ShowModel").checked,showIp:$("v23ShowIp").checked};}
  function loadSavedPreferences(state,site,room){
    const x=savedLayout(state,site,room);if(x.face)$("v23Face").value=x.face;if(x.perPage)$("v23PerPage").value=String(x.perPage);if(x.paper)$("v23Paper").value=x.paper;if(x.orientation)$("v23Orientation").value=x.orientation;
    if(typeof x.showLocation==="boolean")$("v23ShowLocation").checked=x.showLocation;if(typeof x.showModel==="boolean")$("v23ShowModel").checked=x.showModel;if(typeof x.showIp==="boolean")$("v23ShowIp").checked=x.showIp;
  }
  function saveCurrentOrder(showToast=false){
    const state=readState(),site=siteSelect.value,room=roomSelect.value;if(!state||!site||!room)return Promise.resolve(false);
    state.roomExportLayouts ||= {};state.roomExportLayouts[roomKey(site,room)]={...(state.roomExportLayouts[roomKey(site,room)]||{}),order:currentOrderIds(),...currentOptions()};
    return new Promise(resolve=>syncStateIntoCore(state,showToast?"已儲存此機房的預設機櫃順序":"匯出排序已儲存",()=>resolve(true)));
  }

  let reorder=null;
  function installPointerSort(){
    orderList.addEventListener("pointerdown",e=>{
      const handle=e.target.closest(".v23-order-handle");if(!handle||e.button!==0)return;const row=handle.closest(".v23-rack-row");if(!row)return;e.preventDefault();
      const rect=row.getBoundingClientRect(),placeholder=document.createElement("div"),ghost=document.createElement("div");placeholder.className="v23-order-placeholder";placeholder.style.height=`${rect.height}px`;row.after(placeholder);
      ghost.className="v23-order-ghost";ghost.style.width=`${rect.width}px`;ghost.style.left=`${rect.left}px`;ghost.style.top=`${rect.top}px`;ghost.innerHTML=`<span>≡</span><span>${esc(row.dataset.name)}</span>`;document.body.appendChild(ghost);row.style.display="none";
      reorder={pointerId:e.pointerId,row,placeholder,ghost,dy:e.clientY-rect.top};try{handle.setPointerCapture(e.pointerId);}catch{}
    });
    document.addEventListener("pointermove",e=>{
      if(!reorder||e.pointerId!==reorder.pointerId)return;e.preventDefault();reorder.ghost.style.top=`${e.clientY-reorder.dy}px`;
      const el=document.elementFromPoint(e.clientX,e.clientY),target=el?.closest?.(".v23-rack-row");if(!target||target===reorder.row||!orderList.contains(target))return;const r=target.getBoundingClientRect();if(e.clientY<r.top+r.height/2)orderList.insertBefore(reorder.placeholder,target);else orderList.insertBefore(reorder.placeholder,target.nextSibling);
    },{passive:false});
    const finish=e=>{if(!reorder||e.pointerId!==reorder.pointerId)return;reorder.placeholder.replaceWith(reorder.row);reorder.row.style.display="";reorder.ghost.remove();reorder=null;};
    document.addEventListener("pointerup",finish);document.addEventListener("pointercancel",finish);
  }

  function sheetSize(paper,orientation){
    const sizes={a4:{portrait:[794,1123],landscape:[1123,794]},a3:{portrait:[1123,1587],landscape:[1587,1123]}};return sizes[paper]?.[orientation]||sizes.a4.landscape;
  }
  function calcGrid(opts,count,maxUnits){
    let cols=opts.orientation==="portrait"?Math.min(2,opts.perPage):opts.perPage;if(opts.face==="both")cols=Math.min(cols,2);cols=Math.max(1,Math.min(cols,count||1));const rows=Math.ceil((count||1)/cols);
    const [w,h]=sheetSize(opts.paper,opts.orientation),availableH=h-138,gap=14,cellH=(availableH-gap*(rows-1))/rows,u=clamp(Math.floor((cellH-66)/Math.max(6,maxUnits)),5,14);return{cols,rows,u,w,h};
  }
  function deviceStyle(d){
    const widthPct=d.installation==="rack"?100:clamp(Number(d.widthPct)||40,20,100),xPct=d.installation==="rack"?50:clamp(Number(d.xPct)||50,0,100),innerStart=8,innerWidth=84,w=innerWidth*widthPct/100,travel=innerWidth-w,left=d.installation==="rack"?innerStart:innerStart+travel*xPct/100;return{left,w};
  }
  function renderFace(rack,face,opts,u){
    const body=document.createElement("div"),units=Number(rack.units)||42;body.className="v23-face-block";body.innerHTML=`<div class="v23-face-title">${face.toUpperCase()}</div>`;const rf=document.createElement("div");rf.className="v23-rack-face";rf.style.setProperty("--v23-u",`${u}px`);rf.style.height=`${units*u}px`;
    for(let n=units;n>=1;n--){const lab=document.createElement("span");lab.className="v23-u-num";lab.style.top=`${(units-n)*u}px`;lab.textContent=`${n}`;rf.appendChild(lab);}
    (rack.devices||[]).filter(d=>d.installation!=="external"&&d.side===face).sort((a,b)=>(b.u||0)-(a.u||0)).forEach(d=>{
      const el=document.createElement("div"),hs=deviceStyle(d),height=Math.max(u-1,(Number(d.height)||1)*u-1),top=(units-(Number(d.u)||1))*u;el.className=`v23-export-device v23-dev-${d.type||"other"}`;el.style.left=`${hs.left}%`;el.style.width=`${hs.w}%`;el.style.top=`${top}px`;el.style.height=`${height}px`;
      const details=[];if(opts.showModel&&d.model)details.push(d.model);if(opts.showIp&&d.ip)details.push(d.ip);el.innerHTML=`<strong>${esc(d.name||TYPE_LABELS[d.type]||"設備")}</strong>${details.length?`<span>${esc(details.join(" · "))}</span>`:""}`;rf.appendChild(el);
    });body.appendChild(rf);return body;
  }
  function renderRackCard(rack,opts,u){
    const card=document.createElement("div");card.className="v23-export-rack";const loc=opts.showLocation?(rack.location||roomOf(rack)):"";card.innerHTML=`<div class="v23-export-rack-head"><div><strong>${esc(rack.name)}</strong>${loc?`<span>${esc(loc)}</span>`:""}</div><div class="v23-rack-badge">${Number(rack.units)||42}U</div></div>`;
    if(opts.face==="both"){const pair=document.createElement("div");pair.className="v23-face-pair";pair.appendChild(renderFace(rack,"front",opts,u));pair.appendChild(renderFace(rack,"rear",opts,u));card.appendChild(pair);}else card.appendChild(renderFace(rack,opts.face,opts,u));
    const ext=(rack.devices||[]).filter(d=>d.installation==="external").length,foot=document.createElement("div");foot.className="v23-rack-footer";foot.innerHTML=`<span>${(rack.devices||[]).length} 台設備${ext?` · 周邊 ${ext}`:""}</span><span>${opts.face==="both"?"FRONT / REAR":opts.face.toUpperCase()}</span>`;card.appendChild(foot);return card;
  }
  function makeSheet(racks,site,room,opts,pageNo,totalPages){
    const maxUnits=Math.max(...racks.map(r=>Number(r.units)||42),42),layout=calcGrid(opts,racks.length,maxUnits),sheet=document.createElement("section");sheet.className="v23-sheet";sheet.style.width=`${layout.w}px`;sheet.style.height=`${layout.h}px`;
    sheet.innerHTML=`<div class="v23-sheet-head"><div class="v23-sheet-title"><span>ROOM RACK LAYOUT</span><h2>${esc(site)} / ${esc(room)}</h2></div><div class="v23-sheet-meta">${opts.face==="both"?"FRONT + REAR":opts.face.toUpperCase()}<br>${racks.length} 個機櫃 · 第 ${pageNo}/${totalPages} 頁</div></div>`;
    const grid=document.createElement("div");grid.className="v23-sheet-grid";grid.style.gridTemplateColumns=`repeat(${layout.cols},minmax(0,1fr))`;racks.forEach(r=>grid.appendChild(renderRackCard(r,opts,layout.u)));sheet.appendChild(grid);
    const foot=document.createElement("div");foot.className="v23-sheet-foot";foot.innerHTML=`<span>Rack Manager V2.3</span><span>${new Date().toLocaleString("zh-TW",{hour12:false})}</span>`;sheet.appendChild(foot);return sheet;
  }
  function buildStage(racks,site,room,opts,forPng=false){
    document.querySelectorAll(".v23-stage").forEach(x=>x.remove());const stage=document.createElement("div");stage.className=`v23-stage${forPng?" png-stack":""}`;const chunks=[];for(let i=0;i<racks.length;i+=opts.perPage)chunks.push(racks.slice(i,i+opts.perPage));chunks.forEach((chunk,i)=>stage.appendChild(makeSheet(chunk,site,room,opts,i+1,chunks.length)));document.body.appendChild(stage);return{stage,sheets:[...stage.querySelectorAll(".v23-sheet")]};
  }
  function downloadUrl(url,name){const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();}
  async function exportRoom(kind){
    const state=readState(),site=siteSelect.value,room=roomSelect.value,ids=selectedIds();if(!state||!site||!room)return;if(!ids.length){toast("請至少選擇一個機櫃","error");return;}if(typeof html2canvas==="undefined"){toast("圖片匯出元件載入失敗","error");return;}
    const opts=currentOptions(),map=new Map((state.racks||[]).map(r=>[r.id,r])),racks=ids.map(id=>map.get(id)).filter(Boolean);if(!racks.length)return;
    [$("v23Png"),$("v23Pdf")].forEach(b=>b.disabled=true);progress.textContent="正在建立機房配置圖…";
    try{
      if($("v23SaveOnExport").checked)await saveCurrentOrder(false);
      if(kind==="png"){
        const {stage}=buildStage(racks,site,room,opts,true);progress.textContent="正在產生 PNG…";await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const canvas=await html2canvas(stage,{scale:1.5,backgroundColor:"#e5e7eb",useCORS:true,logging:false});const url=canvas.toDataURL("image/png");downloadUrl(url,`${safeName(site)}-${safeName(room)}-機房配置.png`);stage.remove();toast("機房配置 PNG 已匯出");
      }else{
        if(!window.jspdf?.jsPDF){toast("PDF 元件載入失敗","error");return;}const {stage,sheets}=buildStage(racks,site,room,opts,false),{jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:opts.orientation,unit:"mm",format:opts.paper});
        for(let i=0;i<sheets.length;i++){progress.textContent=`正在產生 PDF ${i+1}/${sheets.length}…`;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const canvas=await html2canvas(sheets[i],{scale:1.6,backgroundColor:"#ffffff",useCORS:true,logging:false});const data=canvas.toDataURL("image/jpeg",0.94);if(i>0)pdf.addPage(opts.paper,opts.orientation);const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();pdf.addImage(data,"JPEG",0,0,pw,ph,undefined,"FAST");}
        pdf.save(`${safeName(site)}-${safeName(room)}-機房配置.pdf`);stage.remove();toast("機房配置 PDF 已匯出");
      }
      progress.textContent="匯出完成";
    }catch(err){console.error("Room export failed",err);toast("匯出失敗，請再試一次","error");progress.textContent="匯出失敗";}finally{[$("v23Png"),$("v23Pdf")].forEach(b=>b.disabled=false);}
  }

  function init(){simplifyLeftPanel();buildExportMenu();const obs=new MutationObserver(()=>simplifyLeftPanel());const hierarchy=$("v2Hierarchy");if(hierarchy)obs.observe(hierarchy,{childList:true,subtree:true});}
  init();
})();