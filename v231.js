(() => {
  "use strict";

  // V2.3.1 hotfix:
  // V2.3 observes #v2Hierarchy child changes and then rewrites elements
  // inside the same subtree. Switching sites/rooms therefore causes a
  // MutationObserver feedback loop. Rename/reclassify those rewrite targets
  // so the legacy observer becomes read-only after this file loads.
  const hierarchy = document.getElementById("v2Hierarchy");
  const manage = document.getElementById("v22ManageLocations");
  const badge = hierarchy?.querySelector(".badge");

  if (manage) manage.id = "v23ManageLocations";
  if (badge) {
    badge.classList.remove("badge");
    badge.classList.add("v231-version-badge");
  }

  const style = document.createElement("style");
  style.textContent = `
    .v231-version-badge{
      display:inline-flex;align-items:center;justify-content:center;
      min-height:20px;padding:2px 7px;border-radius:999px;
      background:#e2e8f0;color:#475569;font-size:10px;
      font-weight:800;line-height:1;white-space:nowrap;
    }
  `;
  document.head.appendChild(style);

  if (manage) {
    if (manage.textContent !== "據點管理") manage.textContent = "據點管理";
    manage.style.flex = "1";
  }
  if (badge) badge.textContent = "V2.3.1";
})();
