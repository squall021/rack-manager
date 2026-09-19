(() => {
  "use strict";

  const STORAGE_KEY="rack-manager-v1-state";
  const RESTORE_KEY="rack-manager-v13-restore";
  const BASE_ROW_HEIGHT=32;
  const $=id=>document.getElementById(id);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

  const style=document.createElement("style");
  style.textContent=`
    .drag-ghost{display:none!important}
    .v13-live-preview{position:fixed!important;z-index:10000!important;pointer-events:none!important;opacity:.78!important;transition:none!important;transform:none!important;overflow:hidden!important;box-shadow:0 12px 30px rgba(15,23,42,.28)!important}
    .v13-live-preview.v13-ok{outline:3px solid #22c55e!important;outline-offset:1px}
    .v13-live-preview.v13-bad{outline:3px solid #ef4444!important;outline-offset:1px;opacity:.58!important}
    .v13-float-label{position:fixed;z-index:10001;pointer-events:none;background:#0f172a;color:#fff;border-radius:7px;padding:5px 8px;font-size:10px;font-weight:800;box-shadow:0 5px 15px rgba(15,23,42,.22);white-space:nowrap}
    .v13-float-label.bad{background:#991b1b}
    .v13-resize-handle{position:absolute;z-index:30;width:10px;height:10px;background:#fff;border:2px solid #2563eb;border-radius:50%;box-shadow:0 1px 4px rgba(15,23,42,.28);touch-action:none;pointer-events:auto}
    .v13-resize-n{left:50%;top:-6px;transform:translateX(-50%);cursor:ns-resize}
    .v13-resize-s{left:50%;bottom:-6px;transform:translateX(-50%);cursor:ns-resize}
    .v13-resize-e{right:-6px;top:50%;transform:translateY(-50%);cursor:ew-resize}
    .v13-resize-w{left:-6px;top:50%;transform:translateY(-50%);cursor:ew-resize}
    .v13-resize-ne{right:-6px;top:-6px;cursor:nesw-resize}
    .v13-resize-nw{left:-6px;top:-6px;cursor:nwse-resize}
    .v13-resize-se{right:-6px;bottom:-6px;cursor:nwse-resize}
    .v13-resize-sw{left:-6px;bottom:-6px;cursor:nesw-resize}
    .rack-device.v13-resizing{transition:none!important;transform:none!important}
    .rack-device.v13-resize-ok{outline:3px solid #22c55e!important;outline-offset:1px}
    .rack-device.v13-resize-bad{outline:3px solid #ef4444!important;outline-offset:1px}
  `;
  document.head.appendChild(style);

  function readState(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");}catch{return null;}
  }
  function writeState(state){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
  function activeRack(state){return state?.racks?.find(r=>r.id===state.activeRackId)||state?.racks?.[0]||null;}
  function rowHeight(state){return BASE_ROW_HEIGHT*(Number(state?.zoom)||1);}
  function defaultWidth(installation){return installation==="shelf"?58:installation==="tower"?36:100;}
  function hRange(widthPct,xPct){
    const width=clamp(Number(widthPct)||100,20,100),pos=clamp(Number(xPct)||0,0,100);
    const start=(100-width)*(pos/100);return{start,end:start+width};
  }
  function overlap(a,b){return Math.max(a.start,b.start)<Math.min(a.end,b.end)-.15;}
  function canPlace(rack,topU,height,side,ignoreId,candidate){
    const bottom=topU-height+1;if(topU>rack.units||bottom<1)return false;
    const installation=candidate.installation||"rack";
    const cr=hRange(installation==="rack"?100:(candidate.widthPct||defaultWidth(installation)),installation==="rack"?50:(candidate.xPct??50));
    return !rack.devices.some(d=>{
      if(d.id===ignoreId||d.installation==="external"||d.side!==side)return false;
      const db=d.u-d.height+1;
      if(topU<db||bottom>d.u)return false;
      if(installation==="rack"||d.installation==="rack")return true;
      return overlap(cr,hRange(d.widthPct||defaultWidth(d.installation),d.xPct??50));
    });
  }
  function layoutPx(device,gridWidth){
    if(device.installation==="rack")return{left:48,width:Math.max(80,gridWidth-96)};
    const innerLeft=48,innerWidth=Math.max(120,gridWidth-96);
    const widthPct=clamp(Number(device.widthPct)||defaultWidth(device.installation),20,100);
    const width=innerWidth*widthPct/100,travel=Math.max(0,innerWidth-width);
    const xPct=clamp(Number(device.xPct)||0,0,100);
    return{left:innerLeft+travel*xPct/100,width};
  }
  function xPctFromClient(clientX,widthPct,offsetX,gridRect){
    const innerLeft=48,innerWidth=Math.max(120,gridRect.width-96);
    const width=innerWidth*clamp(Number(widthPct)||40,20,100)/100,travel=Math.max(0,innerWidth-width);
    if(travel<=0)return 50;
    const grab=offsetX==null?width/2:clamp(offsetX,0,width);
    const left=clamp(clientX-gridRect.left-grab,innerLeft,innerLeft+travel);
    return clamp((left-innerLeft)/travel*100,0,100);
  }
  function positionLabel(xPct){return xPct<=15?"靠左":xPct>=85?"靠右":xPct<40?"偏左":xPct>60?"偏右":"中央";}
  function makeLabel(){const el=document.createElement("div");el.className="v13-float-label";document.body.appendChild(el);return el;}
  function setLabel(el,text,x,y,ok=true){if(!el)return;el.textContent=text;el.classList.toggle("bad",!ok);el.style.left=`${x+12}px`;el.style.top=`${y-34}px`;}

  // ----- 即時拖曳預覽 -----
  let dragView=null;
  function dragPayloadFromSource(source,state){
    const rack=activeRack(state);
    if(source.classList.contains("rack-device")){
      const d=rack?.devices?.find(x=>x.id===source.dataset.id);if(!d)return null;
      return{kind:"existing",id:d.id,name:d.name,type:d.type,installation:d.installation,height:d.height,widthPct:d.widthPct||defaultWidth(d.installation),xPct:d.xPct??50,side:d.side};
    }
    if(source.classList.contains("palette-item")){
      const installation=source.dataset.installation||"rack";
      return{kind:"palette",name:source.dataset.name||"設備",type:source.dataset.type||"other",installation,height:parseInt(source.dataset.height)||1,widthPct:defaultWidth(installation),xPct:50,side:state?.activeFace||"front"};
    }
    return null;
  }
  function makePreview(source,payload){
    let el;
    if(source.classList.contains("rack-device")){
      el=source.cloneNode(true);el.querySelectorAll(".v13-resize-handle").forEach(n=>n.remove());
      el.classList.remove("selected","locked");
    }else{
      el=document.createElement("div");
      const mount=payload.installation==="shelf"?" mount-shelf":payload.installation==="tower"?" mount-tower":"";
      el.className=`rack-device dev-${payload.type}${mount}`;
      el.innerHTML=`<div class="device-main"><strong>${payload.name}</strong><span>${payload.installation==="rack"?"機架式":payload.installation==="shelf"?"層板式":"桌上型 / 塔式"}</span></div><span class="device-u">${payload.height}U</span>`;
    }
    el.classList.add("v13-live-preview");el.removeAttribute("data-id");el.draggable=false;document.body.appendChild(el);return el;
  }
  function cleanupDragView(){
    dragView?.preview?.remove();dragView?.label?.remove();dragView=null;
  }
  document.addEventListener("pointerdown",e=>{
    if(e.button!==0||e.target.closest?.(".v13-resize-handle"))return;
    const source=e.target.closest?.(".rack-device,.palette-item");if(!source)return;
    const state=readState(),payload=dragPayloadFromSource(source,state);if(!payload||payload.installation==="external")return;
    const rect=source.getBoundingClientRect();
    dragView={pointerId:e.pointerId,source,payload,state,startX:e.clientX,startY:e.clientY,moved:false,preview:null,label:null,grabOffsetX:source.classList.contains("rack-device")?e.clientX-rect.left:null};
  });
  document.addEventListener("pointermove",e=>{
    const dv=dragView;if(!dv||e.pointerId!==dv.pointerId)return;
    if(!dv.moved&&Math.hypot(e.clientX-dv.startX,e.clientY-dv.startY)<5)return;
    if(!dv.moved){dv.moved=true;dv.preview=makePreview(dv.source,dv.payload);dv.label=makeLabel();}
    const state=readState()||dv.state,rack=activeRack(state),grid=$("rackGrid");if(!rack||!grid)return;
    const gr=grid.getBoundingClientRect(),rh=rowHeight(state);
    const inside=e.clientX>=gr.left&&e.clientX<=gr.right&&e.clientY>=gr.top&&e.clientY<=gr.bottom;
    if(!inside){
      const sr=dv.source.getBoundingClientRect();dv.preview.style.left=`${e.clientX+14}px`;dv.preview.style.top=`${e.clientY+14}px`;dv.preview.style.width=`${Math.max(120,sr.width)}px`;dv.preview.style.height=`${Math.max(28,sr.height)}px`;dv.preview.classList.remove("v13-ok","v13-bad");setLabel(dv.label,"拖到機櫃內放置",e.clientX,e.clientY,true);return;
    }
    const h=dv.payload.height,w=dv.payload.installation==="rack"?100:dv.payload.widthPct;
    const topU=clamp(rack.units-Math.floor(clamp(e.clientY-gr.top,0,gr.height-1)/rh),h,rack.units);
    const xp=dv.payload.installation==="rack"?50:xPctFromClient(e.clientX,w,dv.grabOffsetX,gr);
    const candidate={installation:dv.payload.installation,widthPct:w,xPct:xp};
    const ok=canPlace(rack,topU,h,state.activeFace,dv.payload.kind==="existing"?dv.payload.id:null,candidate);
    const lo=layoutPx(candidate,gr.width);
    dv.preview.style.left=`${gr.left+lo.left}px`;dv.preview.style.top=`${gr.top+(rack.units-topU)*rh+1}px`;dv.preview.style.width=`${lo.width}px`;dv.preview.style.height=`${h*rh-2}px`;
    dv.preview.classList.toggle("v13-ok",ok);dv.preview.classList.toggle("v13-bad",!ok);
    const bottom=topU-h+1,xtext=dv.payload.installation==="rack"?"":` · ${positionLabel(xp)}`;
    setLabel(dv.label,`${h>1?`U${bottom}–U${topU}`:`U${topU}`} · ${h}U${xtext}${ok?"":" · 位置衝突"}`,e.clientX,e.clientY,ok);
  });
  document.addEventListener("pointerup",cleanupDragView);
  document.addEventListener("pointercancel",cleanupDragView);
  document.addEventListener("keydown",e=>{if(e.key==="Escape")cleanupDragView();});

  // ----- Resize handles -----
  let resize=null;
  function addHandles(){
    const selected=document.querySelector("#rackGrid .rack-device.selected");if(!selected||selected.querySelector(".v13-resize-handle")||selected.classList.contains("locked"))return;
    const state=readState(),rack=activeRack(state),d=rack?.devices?.find(x=>x.id===selected.dataset.id);if(!d||d.installation==="external")return;
    const dirs=d.installation==="rack"?["n","s"]:["n","s","e","w","ne","nw","se","sw"];
    dirs.forEach(dir=>{const h=document.createElement("span");h.className=`v13-resize-handle v13-resize-${dir}`;h.dataset.dir=dir;h.dataset.id=d.id;h.title="拖曳調整設備尺寸";selected.appendChild(h);});
  }
  const observer=new MutationObserver(()=>queueMicrotask(addHandles));
  const grid=$("rackGrid");if(grid)observer.observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
  addHandles();

  function startResize(e,handle){
    const state=readState(),rack=activeRack(state);if(!state||!rack)return;
    const d=rack.devices.find(x=>x.id===handle.dataset.id);if(!d||d.locked||d.installation==="external")return;
    const el=handle.closest(".rack-device"),gr=$("rackGrid").getBoundingClientRect(),lo=layoutPx(d,gr.width);
    resize={pointerId:e.pointerId,handle,el,state,rackId:rack.id,deviceId:d.id,dir:handle.dataset.dir,startX:e.clientX,startY:e.clientY,orig:{u:d.u,height:d.height,widthPct:d.widthPct||defaultWidth(d.installation),xPct:d.xPct??50,side:d.side},bottom:d.u-d.height+1,left:lo.left,right:lo.left+lo.width,gridRect:gr,cssText:el.style.cssText,valid:true,preview:null,label:makeLabel()};
    el.classList.add("v13-resizing");try{handle.setPointerCapture(e.pointerId);}catch{}
  }
  function vertical(rs,e,rack){
    const rh=rowHeight(rs.state);let top=rs.orig.u,bottom=rs.bottom;
    if(rs.dir.includes("n"))top=clamp(rs.orig.u+Math.round((rs.startY-e.clientY)/rh),bottom,rack.units);
    if(rs.dir.includes("s"))bottom=clamp(rs.bottom-Math.round((e.clientY-rs.startY)/rh),1,top);
    return{u:top,height:top-bottom+1};
  }
  function horizontal(rs,e,d){
    if(d.installation==="rack")return{widthPct:100,xPct:50};
    const innerLeft=48,innerWidth=Math.max(120,rs.gridRect.width-96),innerRight=innerLeft+innerWidth,minW=innerWidth*.20,dx=e.clientX-rs.startX;
    let left=rs.left,right=rs.right;
    if(rs.dir.includes("w"))left=clamp(rs.left+dx,innerLeft,right-minW);
    if(rs.dir.includes("e"))right=clamp(rs.right+dx,left+minW,innerRight);
    const width=Math.max(minW,right-left),widthPct=clamp(width/innerWidth*100,20,100),travel=Math.max(0,innerWidth-width),xPct=travel<=0?50:clamp((left-innerLeft)/travel*100,0,100);
    return{widthPct,xPct};
  }
  function moveResize(e){
    const rs=resize;if(!rs||e.pointerId!==rs.pointerId)return;
    e.preventDefault();e.stopImmediatePropagation();
    const rack=rs.state.racks.find(r=>r.id===rs.rackId),d=rack?.devices.find(x=>x.id===rs.deviceId);if(!rack||!d)return;
    const v=vertical(rs,e,rack),h=horizontal(rs,e,d),candidate={installation:d.installation,widthPct:h.widthPct,xPct:h.xPct};
    const ok=canPlace(rack,v.u,v.height,d.side,d.id,candidate);rs.valid=ok;rs.preview={...v,...h};
    const lo=layoutPx({...d,...h},rs.gridRect.width),rh=rowHeight(rs.state);
    rs.el.style.top=`${(rack.units-v.u)*rh+1}px`;rs.el.style.height=`${v.height*rh-2}px`;rs.el.style.left=`${lo.left}px`;rs.el.style.width=`${lo.width}px`;
    rs.el.classList.toggle("v13-resize-ok",ok);rs.el.classList.toggle("v13-resize-bad",!ok);
    const bottom=v.u-v.height+1,wtext=d.installation==="rack"?"":` · ${Math.round(h.widthPct)}%`;
    setLabel(rs.label,`${v.height>1?`U${bottom}–U${v.u}`:`U${v.u}`} · ${v.height}U${wtext}${ok?"":" · 位置衝突"}`,e.clientX,e.clientY,ok);
  }
  function endResize(e,cancel=false){
    const rs=resize;if(!rs||(e&&e.pointerId!==rs.pointerId))return;
    if(e){e.preventDefault();e.stopImmediatePropagation();}
    resize=null;rs.label?.remove();try{if(e)rs.handle.releasePointerCapture(e.pointerId);}catch{}
    const rack=rs.state.racks.find(r=>r.id===rs.rackId),d=rack?.devices.find(x=>x.id===rs.deviceId);
    if(!d||cancel||!rs.valid||!rs.preview){rs.el.style.cssText=rs.cssText;rs.el.classList.remove("v13-resizing","v13-resize-ok","v13-resize-bad");return;}
    const p=rs.preview,changed=d.u!==p.u||d.height!==p.height||Math.abs((d.widthPct||100)-p.widthPct)>.1||Math.abs((d.xPct||50)-p.xPct)>.1;
    if(!changed){rs.el.style.cssText=rs.cssText;return;}
    d.u=p.u;d.height=p.height;if(d.installation!=="rack"){d.widthPct=p.widthPct;d.xPct=p.xPct;}rack.updatedAt=new Date().toISOString();rs.state.version=1.3;writeState(rs.state);
    sessionStorage.setItem(RESTORE_KEY,JSON.stringify({y:window.scrollY,id:d.id}));
    location.reload();
  }
  document.addEventListener("pointerdown",e=>{
    const h=e.target.closest?.(".v13-resize-handle");if(!h)return;
    e.preventDefault();e.stopImmediatePropagation();startResize(e,h);
  },true);
  document.addEventListener("pointermove",e=>{if(resize)moveResize(e);},true);
  document.addEventListener("pointerup",e=>{if(resize)endResize(e);},true);
  document.addEventListener("pointercancel",e=>{if(resize)endResize(e,true);},true);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&resize){endResize(null,true);e.preventDefault();}});

  // Resize 後回到原本卷動位置並重新選取設備。
  try{
    const restore=JSON.parse(sessionStorage.getItem(RESTORE_KEY)||"null");
    if(restore){sessionStorage.removeItem(RESTORE_KEY);setTimeout(()=>{window.scrollTo(0,Number(restore.y)||0);const el=document.querySelector(`#rackGrid .rack-device[data-id="${CSS.escape(restore.id)}"]`);el?.click();},80);}
  }catch{}
})();
