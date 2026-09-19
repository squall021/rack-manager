(() => {
  "use strict";

  const STORAGE_KEY = "rack-manager-v1-state";
  const BASE_ROW_HEIGHT = 32;
  const MAX_HISTORY = 50;

  const TYPE_LABELS = {
    switch:"網路交換器", router:"路由器 / 防火牆", patch:"Patch Panel", cable:"理線架",
    server:"伺服器", nas:"NAS", ups:"UPS", pdu:"PDU", shelf:"層板 / 其他", other:"其他"
  };

  const INSTALLATION_LABELS = {
    rack:"機架式", shelf:"層板式", tower:"桌上型 / 塔式", external:"外部設備"
  };

  const state = loadState();
  let selectedDeviceId = null;
  let dragPayload = null;
  let rackModalMode = "new";
  let deviceModalMode = "edit";
  let editingDeviceId = null;
  let undoStack = [];
  let redoStack = [];

  const $ = (id) => document.getElementById(id);
  const rackGrid = $("rackGrid");

  function uid(prefix="id") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
  }

  function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

  function makeDefaultState() {
    const rackId = uid("rack");
    return {
      version: 1.1,
      activeRackId: rackId,
      activeFace: "front",
      zoom: 1,
      racks: [{
        id:rackId, name:"Rack-01", units:42, location:"", note:"",
        devices:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
      }]
    };
  }

  function normalizeState(raw) {
    if (!raw || !Array.isArray(raw.racks) || !raw.racks.length) return makeDefaultState();
    raw.version = 1.1;
    raw.activeFace = raw.activeFace === "rear" ? "rear" : "front";
    const zoom = Number(raw.zoom);
    raw.zoom = [1,0.9,0.8,0.7].includes(zoom) ? zoom : 1;
    raw.racks.forEach((r, i) => {
      r.id ||= uid("rack");
      r.name ||= `Rack-${String(i+1).padStart(2,"0")}`;
      r.units = clamp(parseInt(r.units) || 42, 6, 60);
      r.location ||= "";
      r.note ||= "";
      r.devices = Array.isArray(r.devices) ? r.devices : [];
      r.devices.forEach(d => {
        d.id ||= uid("dev");
        d.name ||= "未命名設備";
        d.type ||= "other";
        d.installation = ["rack","shelf","tower","external"].includes(d.installation) ? d.installation : "rack";
        d.height = clamp(parseInt(d.height)||1,1,20);
        d.u = d.installation === "external" ? null : clamp(parseInt(d.u)||1,1,r.units);
        d.side = d.side === "rear" ? "rear" : "front";
        d.placement ||= "";
        d.locked = !!d.locked;
        d.status ||= "正常";
      });
    });
    if (!raw.racks.some(r => r.id === raw.activeRackId)) raw.activeRackId = raw.racks[0].id;
    return raw;
  }

  function loadState() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    } catch {
      return makeDefaultState();
    }
  }

  function saveState(show=false) {
    const rack = getActiveRack();
    if (rack) rack.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (show) toast("已儲存", "success");
  }

  function pushHistory() {
    undoStack.push(deepClone(state));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoButtons();
  }

  function restoreSnapshot(snap) {
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, normalizeState(deepClone(snap)));
    selectedDeviceId = null;
    saveState();
    renderAll();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(deepClone(state));
    restoreSnapshot(undoStack.pop());
    updateUndoButtons();
    toast("已復原上一個動作");
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(deepClone(state));
    restoreSnapshot(redoStack.pop());
    updateUndoButtons();
    toast("已重做動作");
  }

  function updateUndoButtons() {
    $("btnUndo").disabled = !undoStack.length;
    $("btnRedo").disabled = !redoStack.length;
  }

  function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
  function rowHeight(){ return BASE_ROW_HEIGHT * (Number(state.zoom) || 1); }
  function getActiveRack(){ return state.racks.find(r => r.id === state.activeRackId) || state.racks[0]; }
  function getSelectedDevice(){
    const rack = getActiveRack();
    return rack?.devices.find(d => d.id === selectedDeviceId) || null;
  }

  function sanitizeText(v){ return (v ?? "").toString().trim(); }

  function renderAll() {
    renderRackSelect();
    renderRack();
    renderInspector();
    renderDeviceList();
    renderPeripheralDevices();
    updateUndoButtons();
  }

  function renderRackSelect() {
    const select = $("rackSelect");
    select.innerHTML = "";
    state.racks.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = `${r.name} · ${r.units}U`;
      opt.selected = r.id === state.activeRackId;
      select.appendChild(opt);
    });

    const rack = getActiveRack();
    $("rackMeta").innerHTML = `
      <div><strong>${escapeHtml(rack.location || "位置未設定")}</strong></div>
      <div>${rack.devices.length} 台設備 · 更新 ${formatDateTime(rack.updatedAt)}</div>
    `;
  }

  function renderRack() {
    const rack = getActiveRack();
    if (!rack) return;

    const rh = rowHeight();
    document.documentElement.style.setProperty("--u-height", `${rh}px`);
    $("rackZoom").value = String(state.zoom || 1);
    $("rackTitle").textContent = rack.name;
    $("rackSubtitle").textContent = `${rack.units}U 機櫃${rack.location ? " · "+rack.location : ""}`;
    $("exportRackName").textContent = rack.name;
    $("exportFace").textContent = state.activeFace.toUpperCase();
    $("rackFootLocation").textContent = `位置：${rack.location || "未設定"}`;
    $("rackFootTime").textContent = `更新：${formatDateTime(rack.updatedAt)}`;

    document.querySelectorAll(".face-toggle button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.face === state.activeFace);
    });

    rackGrid.innerHTML = "";
    rackGrid.style.height = `${rack.units * rh}px`;
    rackGrid.style.minHeight = `${rack.units * rh}px`;

    for (let u=rack.units; u>=1; u--) {
      const row = document.createElement("div");
      row.className = "u-row";
      row.dataset.u = u;
      row.innerHTML = `<span class="u-number">U${u}</span><span class="u-number right">U${u}</span>`;
      rackGrid.appendChild(row);
    }

    const devices = rack.devices
      .filter(d => d.installation !== "external" && d.side === state.activeFace)
      .sort((a,b)=>(b.u||0)-(a.u||0));

    devices.forEach(d => {
      const el = document.createElement("div");
      const top = (rack.units - d.u) * rh + 1;
      const height = d.height * rh - 2;
      const mountClass = d.installation === "shelf" ? " mount-shelf" : d.installation === "tower" ? " mount-tower" : "";
      const smallClass = Number(state.zoom) <= 0.8 ? " zoom-small" : "";
      el.className = `rack-device dev-${d.type}${mountClass}${smallClass}${d.id===selectedDeviceId?" selected":""}${d.locked?" locked":""}`;
      el.style.top = `${top}px`;
      el.style.height = `${height}px`;
      el.draggable = !d.locked;
      el.dataset.id = d.id;
      const uBottom = d.u - d.height + 1;
      el.title = `${d.name}｜${INSTALLATION_LABELS[d.installation]}｜U${uBottom}${d.height>1?`–U${d.u}`:""}`;
      el.innerHTML = `
        <div class="device-main">
          <strong>${d.locked?'<span class="lock-mark">🔒</span>':""}${escapeHtml(d.name)}</strong>
          <span>${escapeHtml([INSTALLATION_LABELS[d.installation],d.model,d.ip].filter(Boolean).join(" · ") || TYPE_LABELS[d.type] || "設備")}</span>
        </div>
        <span class="device-u">${d.height}U</span>
      `;
      el.addEventListener("click", e => {
        e.stopPropagation();
        selectedDeviceId = d.id;
        renderRack();
        renderInspector();
        renderDeviceList();
        renderPeripheralDevices();
      });
      el.addEventListener("dblclick", e => {
        e.stopPropagation();
        openDeviceModal(d.id);
      });
      el.addEventListener("dragstart", e => {
        if (d.locked) { e.preventDefault(); return; }
        dragPayload = {kind:"existing", deviceId:d.id};
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", d.id);
        setTimeout(()=>el.style.opacity=".45",0);
      });
      el.addEventListener("dragend", () => {
        el.style.opacity="";
        dragPayload = null;
        clearDropState();
      });
      rackGrid.appendChild(el);
    });

    rackGrid.onclick = () => {
      selectedDeviceId = null;
      renderRack();
      renderInspector();
      renderDeviceList();
      renderPeripheralDevices();
    };

    updateStats();
  }

  function updateStats() {
    const rack = getActiveRack();
    const faceDevices = rack.devices.filter(d => d.installation !== "external" && d.side === state.activeFace);
    const usedUnits = new Set();
    faceDevices.forEach(d => {
      for (let u=d.u; u>=d.u-d.height+1; u--) if (u>=1) usedUnits.add(u);
    });
    const used = usedUnits.size;
    const free = rack.units-used;
    const rate = rack.units ? Math.round(used/rack.units*100) : 0;
    $("statTotal").textContent = `${rack.units}U`;
    $("statUsed").textContent = `${used}U`;
    $("statFree").textContent = `${free}U`;
    $("statRate").textContent = `${rate}%`;
  }

  function renderInspector() {
    const d = getSelectedDevice();
    $("emptyInspector").classList.toggle("hidden", !!d);
    $("deviceInspector").classList.toggle("hidden", !d);
    $("selectedBadge").textContent = d ? "已選取" : "未選取";
    if (!d) return;

    const isExternal = d.installation === "external";
    const bottom = isExternal ? null : d.u-d.height+1;
    $("inspectType").textContent = TYPE_LABELS[d.type] || "其他";
    $("inspectName").textContent = d.name;
    $("inspectU").textContent = isExternal ? "周邊" : (d.height>1 ? `U${bottom}–U${d.u}` : `U${d.u}`);
    const details = [
      ["安裝形式", INSTALLATION_LABELS[d.installation] || "機架式"],
      ["放置位置", d.placement],
      ["安裝面", isExternal ? "—" : (d.side==="front"?"FRONT 正面":"REAR 背面")],
      ["高度", isExternal ? "—" : `${d.height}U`],
      ["廠牌", d.brand],
      ["型號", d.model],
      ["序號", d.serial],
      ["資產編號", d.asset],
      ["Hostname", d.hostname],
      ["管理 IP", d.ip],
      ["MAC", d.mac],
      ["VLAN", d.vlan],
      ["管理 Port", d.port],
      ["購買日期", d.purchaseDate],
      ["保固期限", d.warrantyDate],
      ["負責單位", d.owner],
      ["狀態", d.status],
      ["位置鎖定", isExternal ? "—" : (d.locked ? "是" : "否")],
      ["備註", d.note]
    ].filter(([,v]) => v !== "" && v !== null && v !== undefined);
    $("inspectDetails").innerHTML = details.map(([k,v])=>`<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("");
  }

  function renderDeviceList() {
    const rack = getActiveRack();
    const list = $("deviceList");
    const devices = rack.devices
      .filter(d=>d.installation === "external" || d.side===state.activeFace)
      .sort((a,b)=>{
        if (a.installation === "external" && b.installation !== "external") return 1;
        if (a.installation !== "external" && b.installation === "external") return -1;
        return (b.u||0)-(a.u||0);
      });
    if (!devices.length) {
      list.innerHTML = `<div class="empty-state" style="padding:18px 8px"><p>尚無設備</p></div>`;
      return;
    }
    list.innerHTML = "";
    devices.forEach(d=>{
      const item = document.createElement("div");
      item.className = "device-list-item";
      const location = d.installation === "external" ? (d.placement || "周邊") : `U${d.u}`;
      item.innerHTML = `
        <div><strong>${escapeHtml(d.name)}</strong><span>${escapeHtml(TYPE_LABELS[d.type]||"其他")} · ${escapeHtml(INSTALLATION_LABELS[d.installation]||"機架式")}${d.ip?` · ${escapeHtml(d.ip)}`:""}</span></div>
        <div class="list-u">${escapeHtml(location)}</div>`;
      item.addEventListener("click",()=>{
        selectedDeviceId=d.id;
        renderRack();renderInspector();renderDeviceList();renderPeripheralDevices();
      });
      item.addEventListener("dblclick",()=>openDeviceModal(d.id));
      list.appendChild(item);
    });
  }

  function renderPeripheralDevices() {
    const rack = getActiveRack();
    const section = $("peripheralSection");
    const list = $("peripheralList");
    const devices = rack.devices.filter(d=>d.installation === "external");
    section.classList.toggle("hidden", devices.length === 0);
    $("peripheralCount").textContent = `${devices.length} 台`;
    list.innerHTML = "";
    devices.forEach(d=>{
      const card=document.createElement("div");
      card.className=`peripheral-card${d.id===selectedDeviceId?" selected":""}`;
      card.innerHTML=`
        <div class="peripheral-icon">${escapeHtml((TYPE_LABELS[d.type]||"設備").slice(0,2))}</div>
        <div style="min-width:0;flex:1"><strong>${escapeHtml(d.name)}</strong><span>${escapeHtml([d.placement,d.model,d.ip].filter(Boolean).join(" · ") || "機櫃周邊")}</span></div>
      `;
      card.addEventListener("click",()=>{selectedDeviceId=d.id;renderInspector();renderDeviceList();renderPeripheralDevices();renderRack();});
      card.addEventListener("dblclick",()=>openDeviceModal(d.id));
      list.appendChild(card);
    });
  }

  function canPlace(rack, topU, height, side, ignoreId=null) {
    const bottomU = topU-height+1;
    if (topU>rack.units || bottomU<1) return false;
    return !rack.devices.some(d => {
      if (d.id===ignoreId || d.installation === "external" || d.side!==side) return false;
      const dBottom = d.u-d.height+1;
      return !(topU < dBottom || bottomU > d.u);
    });
  }

  function pointerToTopU(e, height=1) {
    const rack = getActiveRack();
    const rect = rackGrid.getBoundingClientRect();
    const y = clamp(e.clientY - rect.top, 0, rect.height-1);
    let topU = rack.units - Math.floor(y / rowHeight());
    topU = clamp(topU, height, rack.units);
    return topU;
  }

  function findFirstFreeTopU(rack,height,side) {
    for (let topU=rack.units; topU>=height; topU--) {
      if (canPlace(rack,topU,height,side)) return topU;
    }
    return null;
  }

  function addDeviceFromPalette(data, topU=null) {
    const rack = getActiveRack();
    const height = clamp(parseInt(data.height)||1,1,20);
    const installation = ["rack","shelf","tower","external"].includes(data.installation) ? data.installation : "rack";
    if (installation === "external") {
      pushHistory();
      const d={
        id:uid("dev"),name:data.name||"新設備",type:data.type||"other",installation,height,u:null,side:state.activeFace,
        placement:"機櫃周邊",brand:"",model:"",serial:"",asset:"",hostname:"",ip:"",mac:"",vlan:"",port:"",
        purchaseDate:"",warrantyDate:"",owner:"",status:"正常",locked:false,note:""
      };
      rack.devices.push(d);selectedDeviceId=d.id;saveState();renderAll();toast(`${d.name} 已加入周邊設備`,"success");return;
    }
    const targetU = topU ?? findFirstFreeTopU(rack,height,state.activeFace);
    if (!targetU || !canPlace(rack,targetU,height,state.activeFace)) {
      toast("沒有足夠的連續 U 空間可放置此設備","error");
      return;
    }
    pushHistory();
    const d = {
      id:uid("dev"), name:data.name||"新設備", type:data.type||"other", installation, height,
      u:targetU, side:state.activeFace, placement:installation === "shelf" ? "層板" : "", brand:"", model:"", serial:"", asset:"",
      hostname:"", ip:"", mac:"", vlan:"", port:"", purchaseDate:"", warrantyDate:"",
      owner:"", status:"正常", locked:false, note:""
    };
    rack.devices.push(d);
    selectedDeviceId=d.id;
    saveState();renderAll();
    toast(`${d.name} 已加入 U${targetU}`,"success");
  }

  function moveDevice(deviceId, targetU) {
    const rack = getActiveRack();
    const d = rack.devices.find(x=>x.id===deviceId);
    if (!d || d.locked) return;
    if (!canPlace(rack,targetU,d.height,state.activeFace,d.id)) {
      toast("此位置空間不足或與其他設備重疊","error");
      return;
    }
    if (d.u===targetU && d.side===state.activeFace) return;
    pushHistory();
    d.u=targetU; d.side=state.activeFace;
    saveState();renderAll();
  }

  function duplicateSelected() {
    const rack = getActiveRack(), d=getSelectedDevice();
    if(!d)return;
    let topU=null;
    if(d.installation !== "external"){
      topU=findFirstFreeTopU(rack,d.height,d.side);
      if(!topU){toast("沒有足夠空間可複製此設備","error");return;}
    }
    pushHistory();
    const copy=deepClone(d);
    copy.id=uid("dev");copy.name=`${d.name} - 複製`;copy.u=d.installation === "external" ? null : topU;copy.locked=false;
    rack.devices.push(copy);selectedDeviceId=copy.id;
    saveState();renderAll();toast("設備已複製","success");
  }

  function deleteSelected() {
    const rack=getActiveRack(), d=getSelectedDevice();
    if(!d)return;
    if(!confirm(`確定刪除「${d.name}」？`))return;
    pushHistory();
    rack.devices=rack.devices.filter(x=>x.id!==d.id);
    selectedDeviceId=null;saveState();renderAll();toast("設備已刪除");
  }

  function openRackModal(mode) {
    rackModalMode=mode;
    const rack=getActiveRack();
    const isEdit=mode==="edit";
    $("rackModalEyebrow").textContent=isEdit?"RACK SETTINGS":"NEW RACK";
    $("rackModalTitle").textContent=isEdit?"機櫃設定":"新增機櫃";
    $("btnDeleteRack").classList.toggle("hidden",!isEdit || state.racks.length===1);
    $("rackNameInput").value=isEdit?rack.name:`Rack-${String(state.racks.length+1).padStart(2,"0")}`;
    $("rackUInput").value=isEdit?rack.units:42;
    $("rackLocationInput").value=isEdit?rack.location:"";
    $("rackNoteInput").value=isEdit?rack.note:"";
    $("rackModal").showModal();
  }

  function saveRackFromModal(e) {
    e.preventDefault();
    const name=sanitizeText($("rackNameInput").value);
    const units=clamp(parseInt($("rackUInput").value)||42,6,60);
    const location=sanitizeText($("rackLocationInput").value);
    const note=sanitizeText($("rackNoteInput").value);
    if(!name){toast("請輸入機櫃名稱","error");return;}

    if(rackModalMode==="edit"){
      const rack=getActiveRack();
      const invalid=rack.devices.some(d=>d.installation !== "external" && (d.u>units || d.u-d.height+1<1));
      if(invalid){toast("縮小 U 數後會有設備超出範圍，請先移動或刪除設備","error");return;}
      pushHistory();
      rack.name=name;rack.units=units;rack.location=location;rack.note=note;
    }else{
      pushHistory();
      const id=uid("rack");
      state.racks.push({id,name,units,location,note,devices:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
      state.activeRackId=id;selectedDeviceId=null;
    }
    saveState();$("rackModal").close();renderAll();toast("機櫃資料已儲存","success");
  }

  function deleteActiveRack() {
    const rack=getActiveRack();
    if(state.racks.length<=1)return;
    if(!confirm(`確定刪除機櫃「${rack.name}」及其中全部設備？`))return;
    pushHistory();
    state.racks=state.racks.filter(r=>r.id!==rack.id);
    state.activeRackId=state.racks[0].id;selectedDeviceId=null;
    saveState();$("rackModal").close();renderAll();toast("機櫃已刪除");
  }

  function openDeviceModal(id=null, preset=null) {
    const rack=getActiveRack();
    let d=id?rack.devices.find(x=>x.id===id):null;
    deviceModalMode=d?"edit":"custom";
    editingDeviceId=d?.id||null;
    $("deviceModalEyebrow").textContent=d?"EDIT DEVICE":"CUSTOM DEVICE";
    $("deviceModalTitle").textContent=d?"編輯設備":"新增自訂設備";

    const src=d||{
      name:preset?.name||"自訂設備",type:preset?.type||"other",installation:preset?.installation||"rack",height:preset?.height||1,side:state.activeFace,
      placement:preset?.installation==="shelf"?"層板":"",brand:"",model:"",serial:"",asset:"",hostname:"",ip:"",mac:"",vlan:"",port:"",
      purchaseDate:"",warrantyDate:"",owner:"",status:"正常",locked:false,note:""
    };
    $("deviceNameInput").value=src.name||"";
    $("deviceTypeInput").value=src.type||"other";
    $("deviceInstallationInput").value=src.installation||"rack";
    $("deviceHeightInput").value=src.height||1;
    $("deviceSideInput").value=src.side||state.activeFace;
    $("devicePlacementInput").value=src.placement||"";
    $("deviceBrandInput").value=src.brand||"";
    $("deviceModelInput").value=src.model||"";
    $("deviceSerialInput").value=src.serial||"";
    $("deviceAssetInput").value=src.asset||"";
    $("deviceHostInput").value=src.hostname||"";
    $("deviceIpInput").value=src.ip||"";
    $("deviceMacInput").value=src.mac||"";
    $("deviceVlanInput").value=src.vlan||"";
    $("devicePortInput").value=src.port||"";
    $("devicePurchaseInput").value=src.purchaseDate||"";
    $("deviceWarrantyInput").value=src.warrantyDate||"";
    $("deviceOwnerInput").value=src.owner||"";
    $("deviceStatusInput").value=src.status||"正常";
    $("deviceLockedInput").checked=!!src.locked;
    $("deviceNoteInput").value=src.note||"";
    updateDevicePlacementControls();
    $("deviceModal").showModal();
  }

  function updateDevicePlacementControls() {
    const installation = $("deviceInstallationInput").value;
    const external = installation === "external";
    $("deviceHeightInput").disabled = external;
    $("deviceSideInput").disabled = external;
    $("deviceLockedInput").disabled = external;
    if (external && !$("devicePlacementInput").value.trim()) $("devicePlacementInput").value = "機櫃周邊";
    if (installation === "shelf" && !$("devicePlacementInput").value.trim()) $("devicePlacementInput").value = "層板";
  }

  function getDeviceFormData() {
    return {
      name:sanitizeText($("deviceNameInput").value),
      type:$("deviceTypeInput").value,
      installation:$("deviceInstallationInput").value,
      height:clamp(parseInt($("deviceHeightInput").value)||1,1,20),
      side:$("deviceSideInput").value || state.activeFace,
      placement:sanitizeText($("devicePlacementInput").value),
      brand:sanitizeText($("deviceBrandInput").value),
      model:sanitizeText($("deviceModelInput").value),
      serial:sanitizeText($("deviceSerialInput").value),
      asset:sanitizeText($("deviceAssetInput").value),
      hostname:sanitizeText($("deviceHostInput").value),
      ip:sanitizeText($("deviceIpInput").value),
      mac:sanitizeText($("deviceMacInput").value),
      vlan:sanitizeText($("deviceVlanInput").value),
      port:sanitizeText($("devicePortInput").value),
      purchaseDate:$("devicePurchaseInput").value,
      warrantyDate:$("deviceWarrantyInput").value,
      owner:sanitizeText($("deviceOwnerInput").value),
      status:$("deviceStatusInput").value,
      locked:$("deviceInstallationInput").value === "external" ? false : $("deviceLockedInput").checked,
      note:sanitizeText($("deviceNoteInput").value)
    };
  }

  function saveDeviceFromModal(e) {
    e.preventDefault();
    const rack=getActiveRack();
    const data=getDeviceFormData();
    if(!data.name){toast("請輸入設備名稱","error");return;}

    if(deviceModalMode==="edit"){
      const d=rack.devices.find(x=>x.id===editingDeviceId);
      if(!d)return;
      let targetU=null;
      if(data.installation !== "external"){
        targetU = d.installation === "external" ? null : d.u;
        if(!targetU || data.side!==d.side || data.height!==d.height || d.installation === "external" || !canPlace(rack,targetU,data.height,data.side,d.id)){
          targetU=findFirstFreeTopU(rack,data.height,data.side);
        }
        if(!targetU){toast("修改後找不到可放置的連續 U 空間","error");return;}
      }
      pushHistory();
      Object.assign(d,data,{u:data.installation === "external" ? null : targetU});
      selectedDeviceId=d.id;
      if(data.installation !== "external") state.activeFace=d.side;
    }else{
      let topU=null;
      if(data.installation !== "external"){
        topU=findFirstFreeTopU(rack,data.height,data.side);
        if(!topU){toast("沒有足夠的連續 U 空間可新增設備","error");return;}
      }
      pushHistory();
      const d={id:uid("dev"),...data,u:data.installation === "external" ? null : topU};
      rack.devices.push(d);selectedDeviceId=d.id;
      if(data.installation !== "external") state.activeFace=d.side;
    }
    saveState();$("deviceModal").close();renderAll();toast("設備資料已儲存","success");
  }

  async function exportPNG(returnDataUrl=false) {
    if(typeof html2canvas==="undefined"){toast("圖片匯出元件載入失敗，請確認網路連線","error");return null;}
    const canvas=await html2canvas($("exportArea"),{scale:2,backgroundColor:"#ffffff",useCORS:true});
    const dataUrl=canvas.toDataURL("image/png");
    if(returnDataUrl)return dataUrl;
    downloadDataUrl(dataUrl,`${safeFileName(getActiveRack().name)}-${state.activeFace}.png`);
    toast("PNG 已匯出","success");
    return dataUrl;
  }

  async function exportPDF() {
    if(!window.jspdf?.jsPDF){toast("PDF 元件載入失敗，請確認網路連線","error");return;}
    const dataUrl=await exportPNG(true); if(!dataUrl)return;
    const {jsPDF}=window.jspdf;
    const img=new Image();
    img.onload=()=>{
      const orientation=img.width>img.height?"landscape":"portrait";
      const pdf=new jsPDF({orientation,unit:"mm",format:"a4"});
      const pageW=pdf.internal.pageSize.getWidth(),pageH=pdf.internal.pageSize.getHeight(),margin=10;
      const ratio=Math.min((pageW-margin*2)/img.width,(pageH-margin*2)/img.height);
      const w=img.width*ratio,h=img.height*ratio;
      pdf.addImage(dataUrl,"PNG",(pageW-w)/2,(pageH-h)/2,w,h);
      pdf.save(`${safeFileName(getActiveRack().name)}-${state.activeFace}.pdf`);
      toast("PDF 已匯出","success");
    };
    img.src=dataUrl;
  }

  function exportXLSX() {
    if(typeof XLSX==="undefined"){toast("Excel 元件載入失敗，請確認網路連線","error");return;}
    const wb=XLSX.utils.book_new();
    state.racks.forEach(r=>{
      const sorted=[...r.devices].sort((a,b)=>(b.u||0)-(a.u||0));
      const rows=sorted.map(d=>({
        "機櫃":r.name,"機櫃位置":r.location,"安裝形式":INSTALLATION_LABELS[d.installation]||"機架式",
        "放置位置":d.placement,"安裝面":d.installation==="external"?"—":(d.side==="front"?"FRONT":"REAR"),
        "U位置":d.installation==="external"?"—":(d.height>1?`U${d.u-d.height+1}-U${d.u}`:`U${d.u}`),
        "高度(U)":d.installation==="external"?"—":d.height,
        "設備名稱":d.name,"類型":TYPE_LABELS[d.type]||d.type,"廠牌":d.brand,"型號":d.model,
        "序號":d.serial,"資產編號":d.asset,"Hostname":d.hostname,"管理IP":d.ip,"MAC":d.mac,
        "VLAN":d.vlan,"管理Port":d.port,"購買日期":d.purchaseDate,"保固期限":d.warrantyDate,
        "負責單位":d.owner,"狀態":d.status,"鎖定位置":d.installation==="external"?"—":(d.locked?"是":"否"),"備註":d.note
      }));
      const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"機櫃":r.name,"機櫃位置":r.location,"設備名稱":"（尚無設備）"}]);
      ws["!cols"]=[12,16,16,18,10,13,10,22,16,14,18,18,14,16,16,18,10,14,14,14,16,10,10,30].map(w=>({wch:w}));
      const sheetName=safeSheetName(r.name);
      XLSX.utils.book_append_sheet(wb,ws,sheetName);
    });
    XLSX.writeFile(wb,`rack-manager-${dateStamp()}.xlsx`);
    toast("Excel 清單已匯出","success");
  }

  function exportJSON() {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json;charset=utf-8"});
    downloadBlob(blob,`rack-manager-backup-${dateStamp()}.json`);
    toast("JSON 備份已匯出","success");
  }

  function importJSON(file) {
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const parsed=normalizeState(JSON.parse(reader.result));
        if(!confirm(`將匯入 ${parsed.racks.length} 個機櫃並覆蓋目前瀏覽器資料，確定繼續？`))return;
        pushHistory();
        Object.keys(state).forEach(k=>delete state[k]);
        Object.assign(state,parsed);
        selectedDeviceId=null;saveState();renderAll();toast("JSON 備份已匯入","success");
      }catch(err){toast("JSON 格式不正確，無法匯入","error");}
      $("jsonImport").value="";
    };
    reader.readAsText(file,"utf-8");
  }

  function downloadDataUrl(dataUrl,name){
    const a=document.createElement("a");a.href=dataUrl;a.download=name;document.body.appendChild(a);a.click();a.remove();
  }
  function downloadBlob(blob,name){
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function safeFileName(s){return (s||"rack").replace(/[\\/:*?"<>|]/g,"_");}
  function safeSheetName(s){return (s||"Rack").replace(/[\\/?*\[\]:]/g,"_").slice(0,31)||"Rack";}
  function dateStamp(){const d=new Date();return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;}

  function escapeHtml(s){
    return (s??"").toString().replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }
  function formatDateTime(iso){
    if(!iso)return "—";const d=new Date(iso);if(Number.isNaN(d.getTime()))return "—";
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
  function toast(msg,type=""){
    const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=msg;$("toastStack").appendChild(el);
    setTimeout(()=>el.remove(),3200);
  }
  function clearDropState(){rackGrid.classList.remove("drop-ok","drop-bad");}

  document.querySelectorAll(".palette-item").forEach(item=>{
    item.addEventListener("dragstart",e=>{
      dragPayload={kind:"palette",type:item.dataset.type,name:item.dataset.name,height:parseInt(item.dataset.height)||1,installation:item.dataset.installation||"rack"};
      e.dataTransfer.effectAllowed="copy";e.dataTransfer.setData("text/plain",JSON.stringify(dragPayload));
    });
    item.addEventListener("dragend",()=>{dragPayload=null;clearDropState();});
    item.addEventListener("dblclick",()=>addDeviceFromPalette({
      type:item.dataset.type,name:item.dataset.name,height:parseInt(item.dataset.height)||1,installation:item.dataset.installation||"rack"
    }));
  });

  rackGrid.addEventListener("dragover",e=>{
    if(!dragPayload)return;
    e.preventDefault();
    const rack=getActiveRack();
    const draggedDevice=dragPayload.kind==="existing" ? rack.devices.find(d=>d.id===dragPayload.deviceId) : null;
    if(draggedDevice?.installation === "external") return;
    const height=dragPayload.kind==="existing" ? (draggedDevice?.height||1) : dragPayload.height;
    const targetU=pointerToTopU(e,height);
    const ok=canPlace(rack,targetU,height,state.activeFace,dragPayload.kind==="existing"?dragPayload.deviceId:null);
    rackGrid.classList.toggle("drop-ok",ok);rackGrid.classList.toggle("drop-bad",!ok);
    e.dataTransfer.dropEffect=dragPayload.kind==="existing"?"move":"copy";
  });

  rackGrid.addEventListener("dragleave",e=>{
    if(!rackGrid.contains(e.relatedTarget))clearDropState();
  });

  rackGrid.addEventListener("drop",e=>{
    e.preventDefault();clearDropState();if(!dragPayload)return;
    const rack=getActiveRack();
    const draggedDevice=dragPayload.kind==="existing" ? rack.devices.find(d=>d.id===dragPayload.deviceId) : null;
    if(draggedDevice?.installation === "external") return;
    const height=dragPayload.kind==="existing" ? (draggedDevice?.height||1) : dragPayload.height;
    const targetU=pointerToTopU(e,height);
    if(dragPayload.kind==="existing")moveDevice(dragPayload.deviceId,targetU);
    else addDeviceFromPalette(dragPayload,targetU);
    dragPayload=null;
  });

  $("rackSelect").addEventListener("change",e=>{
    state.activeRackId=e.target.value;selectedDeviceId=null;saveState();renderAll();
  });
  $("rackZoom").addEventListener("change",e=>{
    state.zoom=Number(e.target.value)||1;saveState();renderAll();
  });
  document.querySelectorAll(".face-toggle button").forEach(btn=>btn.addEventListener("click",()=>{
    state.activeFace=btn.dataset.face;selectedDeviceId=null;saveState();renderAll();
  }));
  $("btnNewRack").onclick=()=>openRackModal("new");
  $("btnRackSettings").onclick=()=>openRackModal("edit");
  $("btnUndo").onclick=undo;$("btnRedo").onclick=redo;
  $("rackForm").addEventListener("submit",saveRackFromModal);
  $("btnDeleteRack").onclick=deleteActiveRack;

  $("btnCustomDevice").onclick=()=>openDeviceModal();
  $("btnEditDevice").onclick=()=>{if(selectedDeviceId)openDeviceModal(selectedDeviceId);};
  $("btnDeleteDevice").onclick=deleteSelected;
  $("btnDuplicateDevice").onclick=duplicateSelected;
  $("deviceForm").addEventListener("submit",saveDeviceFromModal);
  $("deviceInstallationInput").addEventListener("change",updateDevicePlacementControls);

  $("btnExportMenu").onclick=e=>{
    e.stopPropagation();$("exportMenu").classList.toggle("open");
  };
  document.addEventListener("click",()=>$("exportMenu").classList.remove("open"));
  $("exportMenu").addEventListener("click",e=>{
    const type=e.target.dataset.export;if(!type)return;
    if(type==="png")exportPNG();
    if(type==="pdf")exportPDF();
    if(type==="xlsx")exportXLSX();
    if(type==="json")exportJSON();
  });
  $("jsonImport").addEventListener("change",e=>importJSON(e.target.files?.[0]));

  document.addEventListener("keydown",e=>{
    const tag=document.activeElement?.tagName;
    const typing=["INPUT","TEXTAREA","SELECT"].includes(tag);
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();undo();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redo();}
    if(e.key==="Delete"&&!typing&&selectedDeviceId)deleteSelected();
  });

  window.addEventListener("beforeunload",()=>saveState());
  renderAll();
})();
