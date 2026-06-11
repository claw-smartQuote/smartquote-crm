# 保險客戶管理系統 (Web版)

基於 FastAPI + Bootstrap 5 的網頁版保險客戶與保單管理系統。

## 功能特色

- 📊 **首頁儀表板** - 客戶/保單數量、30日內到期保單、最近新增客戶
- 👤 **客戶管理** - 新增/編輯/刪除/搜尋客戶
- 📋 **保單管理** - 新增/編輯/刪除保單，按狀態/車牌篩選
- 🛡️ **保障管理** - 為保單添加保障項目
- 📈 **統計報告** - 按月份/險種/狀態統計
- 📤 **匯出備份** - Excel/CSV 匯出，iCloud 自動同步

## 快速啟動

```bash
cd ~/.openclaw/workspace/insurance-crm-web

# 安裝依賴
pip install -r requirements.txt

# 啟動服務
uvicorn main:app --reload --port 5000
```

然後打開瀏覽器訪問：http://localhost:5000

## iCloud 自動備份

系統會每 6 小時自動將資料庫同步至：
```
~/Library/Mobile Documents/com~apple~CloudDocs/InsuranceCRM/insurance.db
```

## 技術棧

- **後端**: FastAPI (Python)
- **前端**: Bootstrap 5 + Jinja2 模板
- **資料庫**: SQLite
- **備份**: iCloud Drive
