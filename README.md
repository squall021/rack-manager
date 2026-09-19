# Rack Manager V1.1

機房機櫃視覺化管理工具，純前端版本，可直接部署在 GitHub Pages。

## V1.1 功能

- 多機櫃管理
- 6U～60U 自訂機櫃高度
- FRONT / REAR 切換
- 機櫃顯示縮放（100% / 90% / 80% / 70%）
- 右側設備資訊固定顯示，長機櫃操作不用捲回頁首
- 雙擊設備直接開啟編輯視窗
- 安裝形式：機架式 / 層板式 / 桌上型或塔式 / 外部設備
- 桌上型 NAS、桌上型電腦專用圖面樣式
- 機櫃周邊設備區（外部設備不占用 U 位）
- 設備庫拖曳放置
- 1U～20U 多 U 設備
- U 位自動吸附
- 防止設備重疊
- 設備拖曳移動
- 設備位置鎖定
- 設備詳細資料編輯
- 自動儲存到 LocalStorage
- Undo / Redo
- JSON 備份 / 還原
- PNG / PDF 匯出
- Excel 設備清單匯出
- 響應式版面

## 使用方式

直接開啟 `index.html` 即可使用。

若瀏覽器阻擋本機檔案載入 CDN，建議使用 VS Code Live Server，或部署到 GitHub Pages。

## GitHub Pages

1. 建立 repository：`rack-manager`
2. 將 `index.html`、`styles.css`、`app.js` 上傳到 repository 根目錄
3. GitHub → Settings → Pages
4. Source 選擇 `Deploy from a branch`
5. Branch 選擇 `main` / `(root)`
6. 儲存後即可使用

## 資料保存

V1.1 使用瀏覽器 LocalStorage，並沿用 V1 的儲存鍵值，因此既有機櫃資料會自動相容。資料只存在目前瀏覽器，因此正式使用前請定期從「匯出 → JSON 備份」下載備份。

未來 V2 可改接 Google Sheets / Apps Script，支援多使用者共用資料。

## 外部套件

透過 CDN 載入：

- html2canvas：PNG 匯出
- jsPDF：PDF 匯出
- SheetJS：Excel 匯出
