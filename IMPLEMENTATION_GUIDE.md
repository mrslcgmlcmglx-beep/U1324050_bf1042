# V10 RBAC 實施完成清單

## ✅ 已完成的工作

### 1. 程式碼實作
- [x] `shared/contracts.ts` - 加入 `userProfileSchema` 與 `role` 欄位
- [x] `shared/route-schemas.ts` - 新增所有新 API 的 schema 定義
- [x] `auth/better-auth.ts` - 擴充 `getCurrentUser` 回傳 role
- [x] `store/Store.ts` - 加入菜單查詢方法介面
- [x] `store/pg/PgStore.ts` & `store/json/JsonFileStore.ts` - 實作查詢邏輯
- [x] `backend.ts` - 實作所有新路由（auth/me, 菜單查詢, admin 路由）

### 2. 資料庫 Schema
- [x] `db/auth-schema.ts` - 在 user 表加入 `role` 欄位
- [x] `drizzle/0003_add_user_role.sql` - Migration 檔案
- [x] `drizzle/meta/0003_snapshot.json` - 更新 snapshot
- [x] `drizzle/meta/_journal.json` - 記錄新 migration

---

## 🚀 後續執行步驟

### 第一步：執行 Database Migration

在專案根目錄執行以下命令，將 role 欄位實際應用到資料庫：

```bash
bun run db:migrate
```

**預期結果**：
- ✅ 成功執行 migration 0003
- ✅ PostgreSQL 資料庫 `bf_v9.user` 表中新增 `role` text 欄位（預設值 'customer'）

### 第二步：啟動後端測試

```bash
bun run dev:backend
```

### 第三步：測試新 API

#### A. 測試 GET /api/auth/me
```bash
# 先登入，然後測試
curl -X GET http://localhost:3000/api/auth/me \
  -H "Cookie: <你的_session_cookie>"
```

#### B. 測試菜單查詢
```bash
# 查詢全部菜單
curl http://localhost:3000/api/menu

# 搜尋 + 分類 + 分頁
curl "http://localhost:3000/api/menu?search=蛋&category=餐點&page=1&pageSize=10"

# 取得分類清單
curl http://localhost:3000/api/menu/categories

# 取得單品細節
curl http://localhost:3000/api/menu/1
```

#### C. 測試管理員路由

需要先在資料庫設置用戶的 role 為 `admin`：

```sql
UPDATE bf_v9.user 
SET role = 'admin' 
WHERE email = 'your-admin@example.com';
```

然後測試：
```bash
# 查詢所有訂單（admin only）
curl -X GET "http://localhost:3000/api/admin/orders?page=1&pageSize=10" \
  -H "Cookie: <admin_session_cookie>"

# 檢視統計
curl -X GET http://localhost:3000/api/admin/stats \
  -H "Cookie: <admin_session_cookie>"
```

### 第四步：使用 Swagger UI 測試

1. 啟動後端後訪問 `http://localhost:3000/openapi`
2. 你會看到所有新的 API 端點（auth, menu, admin 標籤）
3. 可以直接在 Swagger UI 中測試每個端點

---

## 📋 新增的 API 端點總覽

### Auth 相關
- `GET /api/auth/me` - 取得目前登入使用者
- `PATCH /api/users/me` - 更新使用者資料

### 菜單查詢
- `GET /api/menu` - 查詢菜單（支援搜尋、分類、分頁）
- `GET /api/menu/categories` - 取得分類清單
- `GET /api/menu/:id` - 取得單一菜單項目

### 菜單管理（Admin Only）
- `POST /api/admin/menu` - 新增菜單
- `PATCH /api/admin/menu/:id` - 修改菜單
- `DELETE /api/admin/menu/:id` - 刪除菜單

### 訂單管理（Admin Only）
- `GET /api/admin/orders` - 查詢全部訂單
- `GET /api/admin/orders/:id` - 查詢單一訂單
- `PATCH /api/admin/orders/:id/status` - 更新訂單狀態
- `GET /api/admin/stats` - 統計資訊

---

## ⚠️ 重要提醒

1. **Migration 必須執行**：`bun run db:migrate` 是必要的，這樣才能在資料庫中建立 `role` 欄位

2. **測試 Admin 路由前**：需要手動設置至少一個用戶的 role 為 `admin`

3. **預設角色**：所有新建用戶預設為 `customer` 角色

4. **前端整合**：前端應該在初始化時呼叫 `GET /api/auth/me` 來檢查登入狀態和用戶角色

---

## 💡 後續可擴充的功能

1. 添加更多角色類型（staff, manager 等）
2. 實作用戶角色管理 API（`POST /api/admin/users/:id/role`）
3. 訂單狀態擴展（preparing, done, cancelled 等）
4. 菜單銷量排行（based on order history）
5. 用戶搜尋與過濾

---

## 🎯 確認清單

在開始使用前，請確認以下項目：

- [ ] 執行過 `bun run db:migrate`
- [ ] 後端能正常啟動（`bun run dev:backend`）
- [ ] 能訪問 Swagger UI (`http://localhost:3000/openapi`)
- [ ] 至少測試過一個新 API 端點
- [ ] 在資料庫中設置了至少一個 admin 用戶
