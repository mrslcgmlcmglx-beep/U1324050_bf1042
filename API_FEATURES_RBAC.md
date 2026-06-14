# 目標功能設計


在期末專案中，我希望新增的三個功能：

1. `auth/me` 與使用者個人檔案
2. 菜單搜尋 / 分類 / 分頁 / 單品細節
3. 管理者專用 API + 角色權限

---

## 1. `auth/me` 與使用者個人檔案

### 目的

目前 `auth/better-auth.ts` 已經提供了 `getCurrentUser(request)`，可從請求取回 session user。這是建立個人資料功能的基礎。

目標是：

- 前端可以直接查詢已登入使用者
- 顯示個人資訊、暱稱、電子郵件
- 後續可擴充更新個人資訊
- 讓前端在初始化時不必猜測登入狀態

### 建議 API

- `GET /api/auth/me`
  - 回傳目前登入使用者的基本資料
  - 若未登入則回 401

- `PATCH /api/users/me`
  - 更新使用者可編輯的欄位，例如：`name`、`avatar`、`phone`、`preferences`
  - 可保留 `email` 為只讀

### 與現有架構的對應

- 第 1 層事實：`shared/contracts.ts` 中的 `SessionUser` / `User`
- 第 2 層事實：新增 `MeResponseSchema`、`UpdateUserProfileBodySchema` 等 route schema
- 後端實作：`backend.ts` 新增路由，`auth/better-auth.ts` 提供可擴充的 use session helper

### 具體建議

在 `shared/contracts.ts` 補充：

```ts
export const userProfileSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  avatar: z.string().url().optional(),
  role: z.string().optional(),
});
```

在 `shared/route-schemas.ts` 補充：

```ts
export const getCurrentUserResponseSchema = z.object({
  data: userProfileSchema.nullable(),
});

export const updateUserProfileBodySchema = z.object({
  name: z.string().min(1).optional(),
  avatar: z.string().url().optional(),
});
```

在 `auth/better-auth.ts` 可擴充 `getCurrentUser`，讓它回傳角色資訊：

```ts
return {
  id: session.user.id,
  email: session.user.email,
  name: session.user.name,
  role: session.user.role ?? "customer",
};
```

---

## 2. 菜單搜尋 / 分類 / 分頁 / 單品細節

### 目的

目前 `GET /api/menu` 只回傳整個菜單列表。為了支援更實用的前端 UI，應該把菜單查詢拆成：

- 搜尋文字
- 分類篩選
- 分頁 / 分段載入
- 單品明細

### 建議 API

- `GET /api/menu`
  - 支援 query parameters：`search`、`category`、`page`、`pageSize`
  - 回傳分頁結果和總筆數

- `GET /api/menu/categories`
  - 回傳可用分類集合

- `GET /api/menu/:id`
  - 回傳單一菜單項目的完整細節

### 與現有架構的對應

- 第 1 層事實：`menuItemSchema` 保持不變
- 第 2 層事實：新增 menu query schema 與 page response schema
- 後端實作：`backend.ts` 新增查詢邏輯並將參數帶入 `store` 層

### 具體建議

在 `shared/route-schemas.ts` 補充：

```ts
export const menuQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  page: z.preprocess((value) => Number(value), z.number().int().min(1).default(1)),
  pageSize: z.preprocess((value) => Number(value), z.number().int().min(1).max(100).default(20)),
});

export const menuCategoriesResponseSchema = z.object({
  data: z.array(z.string()),
});

export const menuListPaginatedResponseSchema = z.object({
  data: z.array(menuItemSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  }),
});
```

建議前端使用方式：

- `GET /api/menu?category=早餐&search=蛋&page=1&pageSize=12`
- `GET /api/menu/:id` 取得菜單細節
- `GET /api/menu/categories` 取得分類清單

### 進階建議

如果未來需要更強的搜尋體驗，可以加入：

- `sort=price_asc|price_desc|popular`
- `tags` 或 `dietary` 條件
- `minPrice` / `maxPrice`

---

## 3. 管理者專用 API + 角色權限

### 目的

目前你的菜單 CRUD 和 `GET /api/orders` 路由缺少清晰的角色分層，這會導致：

- 普通顧客可能直接看到管理資料
- API 權限控制分散、不一致

需求是：

- 顧客只能讀自己的訂單、建立/更新自己的 pending 訂單
- 管理者才能管理菜單與檢視所有訂單
- 角色可擴充為 `customer` / `staff` / `admin`

### 建議角色設計

根據講義內容，角色應該是業務事實的一部分：

- `customer`：一般消費者
- `staff`：店員、廚師、櫃台
- `admin`：店長、老闆、系統管理員

這些角色與權限不是純技術中介，而是「業務流程」的一部分。

### 建議資料庫/身份設計

在 `Better Auth` 的 user schema 補充 `role` 欄位，或建立 `user_roles` 相關表：

- `user.role`：單一角色模式
- 或 `user_roles`：多角色模式

目前 `auth/better-auth.ts` 使用 `better-auth/adapters/drizzle`，可以將 `role` 一併放入 session user 回傳。

### 建議 API 路由

#### 管理者專用路由

- `GET /api/admin/orders`
  - 查詢全部訂單
  - 可依狀態、日期、使用者過濾

- `GET /api/admin/orders/:id`
  - 查看任一訂單明細

- `PATCH /api/admin/orders/:id/status`
  - 更新訂單狀態（例如 `pending` → `submitted` 或未來新增 `preparing`、`done`）

- `GET /api/admin/stats`
  - 回傳營收統計、訂單數、熱門菜品等

- `GET /api/admin/users`
  - 查詢使用者清單與角色

- `POST /api/admin/menu/import`
  - 匯入菜單資料，方便管理員批次更新

#### 一般 API 與管理 API 分離

- `GET /api/menu`、`GET /api/menu/:id`：公開
- `POST /api/menu`、`PATCH /api/menu/:id`、`DELETE /api/menu/:id`：應該改成 `POST /api/admin/menu`、`PATCH /api/admin/menu/:id`、`DELETE /api/admin/menu/:id`
- `GET /api/orders/history`、`GET /api/orders/current`：屬於用戶自己的訂單
- `GET /api/orders`：如果要保留，應該改成管理員專用，或改名為 `GET /api/admin/orders`

### 權限檢查建議

在 `backend.ts` 提供 helper：

```ts
async function requireUser(request: Request) { ... }
async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (user.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}
```

若採多角色：

```ts
function requireRoles(request: Request, allowedRoles: string[]) {
  const user = await requireUser(request);
  if (!allowedRoles.includes(user.role)) throw forbidden;
  return user;
}
```

### 與講義架構對應

講義強調：「角色是業務設計的一部分，不是純粹技術中介」。

因此：

- `shared/contracts.ts` 應該把 `role` 當成 user 的一部分
- `shared/route-schemas.ts` 應該把 `admin` 路由的 request/response schema 也納入 API 規格
- `backend.ts` 應該在 route level 做授權檢查，而不是只靠全域 middleware

---

## 建議實作路徑

### 1. 先補齊 contracts

- `UserProfile` / `SessionUser` 加上 role
- `MenuItem` 保持現有定義
- `Order` / `OrderItem` 保持現有定義

### 2. 再擴充 route schema

- `GET /api/auth/me` 回傳 `userProfileSchema`
- `PATCH /api/users/me` 接收 `updateUserProfileBodySchema`
- `GET /api/menu` 支援 `menuQuerySchema`
- `GET /api/menu/:id` 回傳 `menuItemSchema`
- `GET /api/menu/categories` 回傳分類清單
- `GET /api/admin/orders` 及 `PATCH /api/admin/orders/:id/status` 加入 admin schema

### 3. 最後實作後端路由與授權

- `auth/better-auth.ts` 保留現有 `getCurrentUser`，並擴充 `role`
- `backend.ts` 改成：
  - 一般使用者路由使用 `requireUser`
  - 管理員路由使用 `requireAdmin`
  - 主管理員路由與一般路由清楚分開

---

## 你現在最適合的方向

這個專案最適合的優先順序是：

1. 先把 `auth/me` / 個人檔案做好，因為它是所有前端登入初始化的基礎
2. 再把菜單查詢補成「搜尋 / 分類 / 分頁 / 單品細節」，讓前端 UX 更完整
3. 最後補上「管理員專用 API + RBAC」，讓菜單與訂單管理變得安全且可維護

如果你要，我也可以幫你把這份設計轉成 `shared/route-schemas.ts` 實作草案，甚至直接寫出 `backend.ts` 的 route skeleton。