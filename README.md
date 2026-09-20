# Rack Manager V2.3

機房機櫃視覺化管理工具，純前端版本，可直接部署在 GitHub Pages。

## 主要功能

- 多據點 / 多機房 / 多機櫃管理
- 6U～60U 自訂機櫃高度
- FRONT / REAR 切換
- 機架式、層板式、桌上型 / 塔式、外部設備
- Pointer Events 自訂拖曳與即時位置預覽
- 設備直接拉伸調整 U 高度與非機架式設備寬度
- U 位吸附與設備碰撞檢查
- 設備位置鎖定、複製、刪除、Undo / Redo
- 全域設備搜尋與目前機櫃設備篩選
- 據點與機房新增、重新命名、刪除
- 新增 / 編輯機櫃時可直接指定據點與機房
- JSON 備份 / 還原
- Excel 設備清單匯出
- 單一機櫃 PNG / PDF 匯出
- 機房多機櫃配置 PNG / PDF 匯出

## V2.3 機房配置匯出

從「匯出 → 機房配置圖…」可建立同一機房的多機櫃配置圖：

- 選擇據點與機房
- 勾選要輸出的機櫃
- 以滑鼠拖曳自訂機櫃順序
- 上移 / 下移按鈕作為排序備用操作
- 可將目前順序儲存為該機房的預設排列
- FRONT、REAR 或 FRONT + REAR
- 每頁 2 / 3 / 4 個機櫃
- A4 / A3
- 橫式 / 直式
- 可選擇是否顯示機櫃位置、設備型號、設備 IP
- PDF 自動分頁
- PNG 若超過一頁，會將頁面縱向排列成一張圖片

V2.3 已移除左側「移動機櫃」按鈕。機櫃若要轉移據點或機房，統一從「機櫃設定」修改歸屬；「據點管理」則負責據點與機房本身的新增、重新命名與刪除。

## 使用方式

直接開啟 `index.html` 即可使用。

若瀏覽器阻擋本機檔案載入 CDN，建議使用 VS Code Live Server，或部署到 GitHub Pages。

## GitHub Pages

1. Repository：`rack-manager`
2. GitHub → Settings → Pages
3. Source 選擇 `Deploy from a branch`
4. Branch 選擇 `main` / `(root)`
5. 儲存後即可使用

## 資料保存

目前資料主要儲存在瀏覽器 LocalStorage。正式使用前建議定期從「匯出 → JSON 備份」下載完整備份。

後續可改接 Google Sheets / Apps Script，支援多人共用與跨電腦使用。

## 外部套件

透過 CDN 載入：

- html2canvas：PNG / PDF 圖面擷取
- jsPDF：PDF 匯出
- SheetJS：Excel 匯出
