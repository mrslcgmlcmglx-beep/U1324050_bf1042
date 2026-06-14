import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import type {
  ApiDataResponse,
  MenuItem,
  Order,
  SessionUser,
} from "../../shared/contracts.ts";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const MENU_PAGE_SIZE = 12;
const ADMIN_ORDERS_PAGE_SIZE = 10;

type PaginatedMeta = { page: number; pageSize: number; total: number };

type PaginatedResponse<T> = {
  data: T[];
  meta: PaginatedMeta;
};

type AdminStats = {
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  submittedOrders: number;
};

type AppView = "menu" | "profile" | "admin";
type AdminTab = "stats" | "orders" | "menu";

type MenuFormState = {
  name: string;
  price: string;
  category: string;
  description: string;
  image_url: string;
};

const emptyMenuForm = (): MenuFormState => ({
  name: "",
  price: "",
  category: "",
  description: "",
  image_url: "",
});

function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

function buildQueryUrl(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${buildApiUrl(path)}?${query}` : buildApiUrl(path);
}

function roleBadgeClass(role: string) {
  if (role === "admin") return "badge-error";
  if (role === "staff") return "badge-warning";
  return "badge-outline";
}

function roleLabel(role: string) {
  if (role === "admin") return "管理員";
  if (role === "staff") return "店員";
  return "顧客";
}

function orderStatusLabel(status: Order["status"]) {
  return status === "submitted" ? "已送出" : "進行中";
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [itemCache, setItemCache] = useState<Record<number, MenuItem>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuSearchInput, setMenuSearchInput] = useState("");
  const [menuCategory, setMenuCategory] = useState("");
  const [menuPage, setMenuPage] = useState(1);
  const [menuMeta, setMenuMeta] = useState<PaginatedMeta>({
    page: 1,
    pageSize: MENU_PAGE_SIZE,
    total: 0,
  });
  const [menuLoading, setMenuLoading] = useState(true);
  const [initLoading, setInitLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cartQtyByItemId, setCartQtyByItemId] = useState<
    Record<number, number>
  >({});
  const [cartTotal, setCartTotal] = useState(0);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isClearingCart, setIsClearingCart] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("menu");
  const [profileName, setProfileName] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("stats");
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminStatsLoading, setAdminStatsLoading] = useState(false);
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminOrdersMeta, setAdminOrdersMeta] = useState<PaginatedMeta>({
    page: 1,
    pageSize: ADMIN_ORDERS_PAGE_SIZE,
    total: 0,
  });
  const [adminOrdersPage, setAdminOrdersPage] = useState(1);
  const [adminOrdersStatus, setAdminOrdersStatus] = useState<
    "" | Order["status"]
  >("");
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);
  const [adminMenuItems, setAdminMenuItems] = useState<MenuItem[]>([]);
  const [adminMenuLoading, setAdminMenuLoading] = useState(false);
  const [adminMenuForm, setAdminMenuForm] = useState<MenuFormState>(
    emptyMenuForm(),
  );
  const [editingMenuId, setEditingMenuId] = useState<number | null>(null);
  const [isSavingMenu, setIsSavingMenu] = useState(false);

  const isAdmin = user?.role === "admin";

  const mergeItemsIntoCache = useCallback((newItems: MenuItem[]) => {
    if (newItems.length === 0) return;
    setItemCache((prev) => {
      const next = { ...prev };
      for (const item of newItems) {
        next[item.id] = item;
      }
      return next;
    });
  }, []);

  function syncCartFromOrder(order: Order) {
    const nextQtyByItemId = order.items.reduce(
      (acc, orderItem) => {
        acc[orderItem.item.id] = orderItem.qty;
        return acc;
      },
      {} as Record<number, number>,
    );

    setCartQtyByItemId(nextQtyByItemId);
    setCartTotal(order.total);
    mergeItemsIntoCache(order.items.map((orderItem) => orderItem.item));
  }

  function resetCartState() {
    setOrderId(null);
    setCartQtyByItemId({});
    setCartTotal(0);
    setIsCartOpen(false);
  }

  async function loadCurrentOrder(): Promise<Order | null> {
    const response = await fetch(buildApiUrl("/api/orders/current"), {
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Load current order failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order | null>;
    const currentOrder = payload?.data;

    if (!currentOrder) {
      resetCartState();
      return null;
    }

    setOrderId(currentOrder.id);
    syncCartFromOrder(currentOrder);
    return currentOrder;
  }

  async function loadOrderHistory(): Promise<void> {
    setHistoryLoading(true);

    try {
      const response = await fetch(buildApiUrl("/api/orders/history"), {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Load history failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<Order[]>;
      const orders = Array.isArray(payload?.data) ? payload.data : [];
      setHistoryOrders(orders);
      mergeItemsIntoCache(
        orders.flatMap((order) => order.items.map((orderItem) => orderItem.item)),
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshUserOrders(): Promise<void> {
    await Promise.all([loadCurrentOrder(), loadOrderHistory()]);
  }

  const loadMenu = useCallback(async () => {
    setMenuLoading(true);
    setError("");

    try {
      const response = await fetch(
        buildQueryUrl("/api/menu", {
          search: menuSearch || undefined,
          category: menuCategory || undefined,
          page: menuPage,
          pageSize: MENU_PAGE_SIZE,
        }),
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as PaginatedResponse<MenuItem>;
      const fetchedItems = Array.isArray(payload?.data) ? payload.data : [];
      setItems(fetchedItems);
      mergeItemsIntoCache(fetchedItems);
      if (payload?.meta) {
        setMenuMeta(payload.meta);
      }
    } catch (fetchError) {
      setError("無法取得菜單資料，請稍後再試。");
      console.error(fetchError);
    } finally {
      setMenuLoading(false);
    }
  }, [menuSearch, menuCategory, menuPage, mergeItemsIntoCache]);

  const loadCategories = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl("/api/menu/categories"));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as ApiDataResponse<string[]>;
      setCategories(Array.isArray(payload?.data) ? payload.data : []);
    } catch (categoryError) {
      console.error(categoryError);
    }
  }, []);

  const loadAdminStats = useCallback(async () => {
    setAdminStatsLoading(true);
    try {
      const response = await fetch(buildApiUrl("/api/admin/stats"), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as ApiDataResponse<AdminStats>;
      setAdminStats(payload.data ?? null);
    } catch (statsError) {
      setActionError("載入統計資料失敗。");
      console.error(statsError);
    } finally {
      setAdminStatsLoading(false);
    }
  }, []);

  const loadAdminOrders = useCallback(async () => {
    setAdminOrdersLoading(true);
    try {
      const response = await fetch(
        buildQueryUrl("/api/admin/orders", {
          page: adminOrdersPage,
          pageSize: ADMIN_ORDERS_PAGE_SIZE,
          status: adminOrdersStatus || undefined,
        }),
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as PaginatedResponse<Order>;
      setAdminOrders(Array.isArray(payload?.data) ? payload.data : []);
      if (payload?.meta) {
        setAdminOrdersMeta(payload.meta);
      }
    } catch (ordersError) {
      setActionError("載入管理訂單失敗。");
      console.error(ordersError);
    } finally {
      setAdminOrdersLoading(false);
    }
  }, [adminOrdersPage, adminOrdersStatus]);

  const loadAdminMenu = useCallback(async () => {
    setAdminMenuLoading(true);
    try {
      const response = await fetch(
        buildQueryUrl("/api/menu", { page: 1, pageSize: 100 }),
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as PaginatedResponse<MenuItem>;
      const fetchedItems = Array.isArray(payload?.data) ? payload.data : [];
      setAdminMenuItems(fetchedItems);
      mergeItemsIntoCache(fetchedItems);
    } catch (menuError) {
      setActionError("載入管理菜單失敗。");
      console.error(menuError);
    } finally {
      setAdminMenuLoading(false);
    }
  }, [mergeItemsIntoCache]);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const res = await fetch(buildApiUrl("/api/auth/me"), {
          credentials: "include",
        });
        if (res.ok) {
          const data = (await res.json()) as { data?: SessionUser | null };
          if (data?.data && mounted) {
            setUser(data.data);
            setProfileName(data.data.name);
          }
        }
      } catch {
        // session 無法取得，維持未登入狀態
      }
    }

    async function bootstrap() {
      await Promise.all([restoreSession(), loadCategories()]);
      if (mounted) {
        setInitLoading(false);
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [loadCategories]);

  useEffect(() => {
    if (initLoading) return;
    void loadMenu();
  }, [initLoading, loadMenu]);

  useEffect(() => {
    if (!user) {
      setHistoryOrders([]);
      setIsCartOpen(false);
      resetCartState();
      setActiveView("menu");
      return;
    }

    void refreshUserOrders().catch((refreshError) => {
      setActionError("載入使用者訂單資料失敗，請稍後再試。");
      console.error(refreshError);
    });
  }, [user]);

  useEffect(() => {
    if (!isAdmin || activeView !== "admin") return;

    if (adminTab === "stats") {
      void loadAdminStats();
    } else if (adminTab === "orders") {
      void loadAdminOrders();
    } else if (adminTab === "menu") {
      void loadAdminMenu();
    }
  }, [
    isAdmin,
    activeView,
    adminTab,
    loadAdminStats,
    loadAdminOrders,
    loadAdminMenu,
  ]);

  const menuTotalPages = Math.max(
    1,
    Math.ceil(menuMeta.total / menuMeta.pageSize),
  );

  const adminOrdersTotalPages = Math.max(
    1,
    Math.ceil(adminOrdersMeta.total / adminOrdersMeta.pageSize),
  );

  const cartItemCount = useMemo(
    () => Object.values(cartQtyByItemId).reduce((sum, qty) => sum + qty, 0),
    [cartQtyByItemId],
  );

  const cartDetails = useMemo(() => {
    return Object.entries(cartQtyByItemId)
      .map(([itemIdText, qty]) => {
        const itemId = Number(itemIdText);
        const item = itemCache[itemId] ?? items.find((entry) => entry.id === itemId);
        if (!item || qty <= 0) {
          return null;
        }

        return {
          itemId,
          qty,
          item,
          subtotal: item.price * qty,
        };
      })
      .filter((entry) => entry !== null);
  }, [cartQtyByItemId, itemCache, items]);

  async function ensureOrder(): Promise<number> {
    if (!user) {
      throw new Error("Please login first");
    }

    if (orderId !== null) {
      return orderId;
    }

    const response = await fetch(buildApiUrl("/api/orders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      if ([401, 403].includes(response.status)) {
        setUser(null);
        setAuthError("登入狀態已失效，請重新登入。");
        setActionError("登入狀態已失效，請重新登入。");
        setHistoryOrders([]);
        resetCartState();
        throw new Error(`Auth expired: HTTP ${response.status}`);
      }

      throw new Error(`Create order failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order>;
    const createdOrderId = payload?.data?.id;

    if (!createdOrderId) {
      throw new Error("Create order failed: invalid payload");
    }

    setOrderId(createdOrderId);
    return createdOrderId;
  }

  async function handleGoogleSignIn(): Promise<void> {
    setAuthError("");
    setIsGoogleSigningIn(true);
    try {
      const callbackURL = window.location.origin;
      const response = await fetch(buildApiUrl("/api/auth/sign-in/social"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: "google", callbackURL }),
      });

      if (!response.ok) {
        throw new Error(`Google sign-in failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as { url?: string };
      if (!payload?.url) {
        throw new Error("Google sign-in failed: missing redirect URL");
      }

      window.location.href = payload.url;
    } catch {
      setAuthError("Google 登入啟動失敗，請稍後再試。");
      setIsGoogleSigningIn(false);
    }
  }

  async function handleLogout(): Promise<void> {
    try {
      const res = await fetch(buildApiUrl("/api/sign-out"), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setActionError(
          `登出失敗（HTTP ${res.status}），請重試或手動清除瀏覽器 Cookie。`,
        );
        return;
      }
    } catch {
      setActionError("登出時發生網路錯誤，請重試。");
      return;
    }
    setUser(null);
    setAuthError("");
    setActionError("");
    setActionSuccess("");
    resetCartState();
  }

  async function handleUpdateProfile(): Promise<void> {
    if (!user || !profileName.trim()) return;

    setIsUpdatingProfile(true);
    setActionError("");
    setActionSuccess("");

    try {
      const response = await fetch(buildApiUrl("/api/users/me"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: profileName.trim() }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<SessionUser>;
      if (payload?.data) {
        setUser(payload.data);
        setProfileName(payload.data.name);
        setActionSuccess("個人檔案已更新。");
      }
    } catch {
      setActionError("更新個人檔案失敗，請稍後再試。");
    } finally {
      setIsUpdatingProfile(false);
    }
  }

  async function openItemDetail(itemId: number): Promise<void> {
    setDetailLoading(true);
    setDetailItem(null);

    try {
      const response = await fetch(buildApiUrl(`/api/menu/${itemId}`));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as ApiDataResponse<MenuItem>;
      if (payload?.data) {
        setDetailItem(payload.data);
        mergeItemsIntoCache([payload.data]);
      }
    } catch {
      setActionError("無法載入品項詳情。");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleMenuSearchSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setMenuPage(1);
    setMenuSearch(menuSearchInput.trim());
  }

  async function addToCart(item: MenuItem): Promise<void> {
    setActionError("");
    setActiveItemId(item.id);

    try {
      if (!user) {
        throw new Error("Please login first");
      }

      const patchOrderItem = async (
        targetOrderId: number,
        qty: number,
      ): Promise<Order> => {
        const response = await fetch(
          buildApiUrl(`/api/orders/${targetOrderId}`),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              itemId: item.id,
              qty,
            }),
          },
        );

        if (!response.ok) {
          throw new Error(`Update order failed: HTTP ${response.status}`);
        }

        const payload = (await response.json()) as ApiDataResponse<Order>;
        const updatedOrder = payload?.data;

        if (!updatedOrder) {
          throw new Error("Update order failed: invalid payload");
        }

        return updatedOrder;
      };

      const targetOrderId = await ensureOrder();
      const currentQty = cartQtyByItemId[item.id] ?? 0;
      const nextQty = currentQty + 1;

      try {
        const updatedOrder = await patchOrderItem(targetOrderId, nextQty);
        syncCartFromOrder(updatedOrder);
      } catch (firstTryError) {
        const firstTryMessage =
          firstTryError instanceof Error ? firstTryError.message : "";

        if (
          firstTryMessage.includes("HTTP 403") ||
          firstTryMessage.includes("HTTP 404")
        ) {
          setOrderId(null);

          const recoveredOrder = await loadCurrentOrder();
          const retryOrderId = recoveredOrder?.id ?? (await ensureOrder());
          const recoveredQty =
            recoveredOrder?.items.find(
              (orderItem) => orderItem.item.id === item.id,
            )?.qty ?? 0;
          const retryQty = recoveredQty + 1;

          const retriedOrder = await patchOrderItem(retryOrderId, retryQty);
          syncCartFromOrder(retriedOrder);
          return;
        }

        throw firstTryError;
      }
    } catch (cartError) {
      if (
        cartError instanceof Error &&
        cartError.message.startsWith("Auth expired:")
      ) {
        return;
      }

      if (user) {
        try {
          const recoveredOrder = await loadCurrentOrder();
          const recoveredQty = recoveredOrder?.items.find(
            (orderItem) => orderItem.item.id === item.id,
          )?.qty;

          if (typeof recoveredQty === "number" && recoveredQty > 0) {
            return;
          }
        } catch (recoveryError) {
          console.error(recoveryError);
        }
      }

      setActionError("加入購物車失敗，請稍後再試。");
      console.error(cartError);
    } finally {
      setActiveItemId(null);
    }
  }

  async function clearCart(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) {
      return;
    }

    setActionError("");
    setIsClearingCart(true);

    try {
      for (const detail of cartDetails) {
        const response = await fetch(buildApiUrl(`/api/orders/${orderId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            itemId: detail.itemId,
            qty: 0,
          }),
        });

        if (!response.ok) {
          throw new Error(`Clear cart failed: HTTP ${response.status}`);
        }
      }

      setCartQtyByItemId({});
      setCartTotal(0);
    } catch (clearError) {
      setActionError("清空購物車失敗，請稍後再試。");
      console.error(clearError);
    } finally {
      setIsClearingCart(false);
    }
  }

  async function submitOrder(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) {
      return;
    }

    setActionError("");
    setIsSubmittingOrder(true);

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${orderId}/submit`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        throw new Error(`Submit order failed: HTTP ${response.status}`);
      }

      resetCartState();
      setIsCartOpen(false);
      await loadOrderHistory();
      setActionSuccess("訂單已送出！");
    } catch (submitError) {
      setActionError("送出訂單失敗，請稍後再試。");
      console.error(submitError);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function handleAdminOrderStatusChange(
    order: Order,
    nextStatus: Order["status"],
  ): Promise<void> {
    setActionError("");
    try {
      const response = await fetch(
        buildApiUrl(`/api/admin/orders/${order.id}/status`),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await loadAdminOrders();
      if (adminTab === "stats") {
        await loadAdminStats();
      }
      setActionSuccess(`訂單 #${order.id} 狀態已更新。`);
    } catch {
      setActionError("更新訂單狀態失敗。");
    }
  }

  function startEditMenuItem(item: MenuItem) {
    setEditingMenuId(item.id);
    setAdminMenuForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      description: item.description,
      image_url: item.image_url,
    });
  }

  function resetAdminMenuForm() {
    setEditingMenuId(null);
    setAdminMenuForm(emptyMenuForm());
  }

  async function handleSaveAdminMenuItem(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setIsSavingMenu(true);
    setActionError("");
    setActionSuccess("");

    const body = {
      name: adminMenuForm.name.trim(),
      price: Number(adminMenuForm.price),
      category: adminMenuForm.category.trim(),
      description: adminMenuForm.description.trim(),
      image_url: adminMenuForm.image_url.trim(),
    };

    try {
      const response = await fetch(
        editingMenuId
          ? buildApiUrl(`/api/admin/menu/${editingMenuId}`)
          : buildApiUrl("/api/admin/menu"),
        {
          method: editingMenuId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      resetAdminMenuForm();
      await Promise.all([loadAdminMenu(), loadMenu(), loadCategories()]);
      setActionSuccess(editingMenuId ? "菜單品項已更新。" : "菜單品項已新增。");
    } catch {
      setActionError("儲存菜單品項失敗。");
    } finally {
      setIsSavingMenu(false);
    }
  }

  async function handleDeleteAdminMenuItem(itemId: number): Promise<void> {
    if (!window.confirm(`確定要刪除品項 #${itemId} 嗎？`)) return;

    setActionError("");
    try {
      const response = await fetch(buildApiUrl(`/api/admin/menu/${itemId}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await Promise.all([loadAdminMenu(), loadMenu(), loadCategories()]);
      setActionSuccess(`品項 #${itemId} 已刪除。`);
    } catch {
      setActionError("刪除菜單品項失敗。");
    }
  }

  if (initLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error && items.length === 0 && !menuLoading) {
    return (
      <div className="alert alert-error m-4">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 shadow-lg flex-col items-stretch gap-2 md:flex-row md:items-center">
        <div className="flex-1 w-full md:w-auto">
          <a className="btn btn-ghost normal-case text-2xl">
            🌅 聯大資工早餐菜單
          </a>
        </div>
        <div className="flex-none w-full md:w-auto">
          <div className="flex flex-wrap gap-2 items-center md:justify-end">
            {user ? (
              <>
                <div className="badge badge-outline">{user.name}</div>
                <div className="badge badge-ghost text-xs">{user.email}</div>
                <div className={`badge ${roleBadgeClass(user.role)}`}>
                  {roleLabel(user.role)}
                </div>
              </>
            ) : (
              <div className="badge badge-outline">尚未登入</div>
            )}
            <div className="badge badge-primary">
              {menuMeta.total} 個品項・{categories.length} 類
            </div>
            <div className="badge badge-secondary">
              購物車 {cartItemCount} 件
            </div>
            <div className="badge badge-accent">總計 ${cartTotal}</div>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => {
                setIsCartOpen(true);
              }}
              disabled={!user}
            >
              購物車明細
            </button>
            {user ? (
              <button
                className="btn btn-sm"
                onClick={() => {
                  void handleLogout();
                }}
              >
                登出
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {user ? (
        <div className="bg-base-100 border-b border-base-300">
          <div className="container mx-auto px-6">
            <div className="tabs tabs-boxed py-2">
              <button
                className={`tab ${activeView === "menu" ? "tab-active" : ""}`}
                onClick={() => setActiveView("menu")}
              >
                菜單
              </button>
              <button
                className={`tab ${activeView === "profile" ? "tab-active" : ""}`}
                onClick={() => setActiveView("profile")}
              >
                個人檔案
              </button>
              {isAdmin ? (
                <button
                  className={`tab ${activeView === "admin" ? "tab-active" : ""}`}
                  onClick={() => setActiveView("admin")}
                >
                  管理後台
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <main className="container mx-auto p-6">
        {!user ? (
          <section className="max-w-xl mx-auto card bg-base-100 shadow-md mb-8">
            <div className="card-body">
              <h2 className="card-title">使用 Google 帳號登入</h2>
              <p className="text-sm opacity-70">
                點擊下方按鈕，使用您的 Google 帳號登入後即可開始點餐。
              </p>
              {authError ? (
                <div className="alert alert-error">
                  <span>{authError}</span>
                </div>
              ) : null}
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  void handleGoogleSignIn();
                }}
                disabled={isGoogleSigningIn}
              >
                {isGoogleSigningIn ? "導向 Google 中..." : "使用 Google 登入"}
              </button>
            </div>
          </section>
        ) : null}

        {actionError ? (
          <div className="alert alert-warning mb-4">
            <span>{actionError}</span>
          </div>
        ) : null}

        {actionSuccess ? (
          <div className="alert alert-success mb-4">
            <span>{actionSuccess}</span>
          </div>
        ) : null}

        {activeView === "profile" && user ? (
          <section className="max-w-xl card bg-base-100 shadow-md">
            <div className="card-body">
              <h2 className="card-title">個人檔案</h2>
              <div className="space-y-3">
                <label className="form-control w-full">
                  <span className="label-text">電子郵件（唯讀）</span>
                  <input
                    className="input input-bordered w-full"
                    value={user.email}
                    readOnly
                  />
                </label>
                <label className="form-control w-full">
                  <span className="label-text">角色（唯讀）</span>
                  <input
                    className="input input-bordered w-full"
                    value={roleLabel(user.role)}
                    readOnly
                  />
                </label>
                <label className="form-control w-full">
                  <span className="label-text">顯示名稱</span>
                  <input
                    className="input input-bordered w-full"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                  />
                </label>
              </div>
              <div className="card-actions justify-end mt-4">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    void handleUpdateProfile();
                  }}
                  disabled={isUpdatingProfile || !profileName.trim()}
                >
                  {isUpdatingProfile ? "儲存中..." : "儲存變更"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeView === "menu" ? (
          <>
            <section className="card bg-base-100 shadow-md mb-6">
              <div className="card-body gap-4">
                <h2 className="card-title">菜單搜尋</h2>
                <form
                  className="flex flex-col md:flex-row gap-3"
                  onSubmit={(event) => {
                    void handleMenuSearchSubmit(event);
                  }}
                >
                  <input
                    className="input input-bordered flex-1"
                    placeholder="搜尋品項名稱或描述..."
                    value={menuSearchInput}
                    onChange={(event) => setMenuSearchInput(event.target.value)}
                  />
                  <select
                    className="select select-bordered md:w-48"
                    value={menuCategory}
                    onChange={(event) => {
                      setMenuCategory(event.target.value);
                      setMenuPage(1);
                    }}
                  >
                    <option value="">全部分類</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-primary" type="submit">
                    搜尋
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setMenuSearch("");
                      setMenuSearchInput("");
                      setMenuCategory("");
                      setMenuPage(1);
                    }}
                  >
                    清除
                  </button>
                </form>
                <p className="text-sm opacity-70">
                  顯示第 {menuMeta.page} 頁，共 {menuMeta.total} 筆
                  {menuSearch ? `（搜尋：${menuSearch}）` : ""}
                  {menuCategory ? `（分類：${menuCategory}）` : ""}
                </p>
              </div>
            </section>

            {menuLoading ? (
              <div className="flex justify-center py-12">
                <span className="loading loading-spinner loading-lg"></span>
              </div>
            ) : items.length === 0 ? (
              <div className="alert alert-info">
                <span>目前沒有符合條件的菜單資料</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow"
                  >
                    <figure className="h-44 overflow-hidden bg-base-300">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover cursor-pointer"
                        loading="lazy"
                        onClick={() => {
                          void openItemDetail(item.id);
                        }}
                        onError={(event) => {
                          const target = event.currentTarget;
                          target.src =
                            "https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=800&q=80";
                        }}
                      />
                    </figure>
                    <div className="card-body">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="card-title text-lg">{item.name}</h3>
                        <span className="badge badge-outline">{item.category}</span>
                      </div>
                      <p className="text-sm opacity-80 line-clamp-2 min-h-[2.75rem]">
                        {item.description}
                      </p>
                      <div className="card-actions justify-between items-center">
                        <span className="text-xl font-bold text-success">
                          ${item.price}
                        </span>
                        <div className="flex gap-2">
                          <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => {
                              void openItemDetail(item.id);
                            }}
                          >
                            詳情
                          </button>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              void addToCart(item);
                            }}
                            disabled={!user || activeItemId === item.id}
                          >
                            {activeItemId === item.id
                              ? "加入中..."
                              : `加入${cartQtyByItemId[item.id] ? ` (${cartQtyByItemId[item.id]})` : ""}`}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {menuMeta.total > 0 ? (
              <div className="flex justify-center items-center gap-3 mt-8">
                <button
                  className="btn btn-sm"
                  disabled={menuPage <= 1 || menuLoading}
                  onClick={() => setMenuPage((page) => Math.max(1, page - 1))}
                >
                  上一頁
                </button>
                <span className="text-sm">
                  {menuPage} / {menuTotalPages}
                </span>
                <button
                  className="btn btn-sm"
                  disabled={menuPage >= menuTotalPages || menuLoading}
                  onClick={() =>
                    setMenuPage((page) => Math.min(menuTotalPages, page + 1))
                  }
                >
                  下一頁
                </button>
              </div>
            ) : null}

            {user ? (
              <section className="mt-10">
                <h2 className="text-2xl font-bold mb-4">我的訂單歷史</h2>
                {historyLoading ? (
                  <div className="alert">
                    <span>讀取中...</span>
                  </div>
                ) : historyOrders.length === 0 ? (
                  <div className="alert alert-info">
                    <span>目前尚無歷史訂單。</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {historyOrders.map((order) => (
                      <article
                        key={order.id}
                        className="card bg-base-100 shadow-sm border border-base-300"
                      >
                        <div className="card-body p-4">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h3 className="font-semibold">訂單 #{order.id}</h3>
                            <span className="badge badge-success">已送出</span>
                          </div>
                          <p className="text-sm opacity-70">
                            建立時間：{order.createdAt}
                          </p>
                          <ul className="text-sm list-disc pl-5 space-y-1">
                            {order.items.map((detail) => (
                              <li key={`${order.id}-${detail.item.id}`}>
                                {detail.item.name} x {detail.qty}
                              </li>
                            ))}
                          </ul>
                          <p className="font-bold text-right">
                            總額 ${order.total}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {activeView === "admin" && isAdmin ? (
          <section className="space-y-6">
            <div className="tabs tabs-lifted">
              <button
                className={`tab ${adminTab === "stats" ? "tab-active" : ""}`}
                onClick={() => setAdminTab("stats")}
              >
                統計
              </button>
              <button
                className={`tab ${adminTab === "orders" ? "tab-active" : ""}`}
                onClick={() => setAdminTab("orders")}
              >
                訂單管理
              </button>
              <button
                className={`tab ${adminTab === "menu" ? "tab-active" : ""}`}
                onClick={() => setAdminTab("menu")}
              >
                菜單管理
              </button>
            </div>

            {adminTab === "stats" ? (
              adminStatsLoading ? (
                <div className="flex justify-center py-8">
                  <span className="loading loading-spinner loading-lg"></span>
                </div>
              ) : adminStats ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="stat bg-base-100 rounded-box shadow">
                    <div className="stat-title">總訂單數</div>
                    <div className="stat-value text-primary">
                      {adminStats.totalOrders}
                    </div>
                  </div>
                  <div className="stat bg-base-100 rounded-box shadow">
                    <div className="stat-title">總營收</div>
                    <div className="stat-value text-success">
                      ${adminStats.totalRevenue}
                    </div>
                  </div>
                  <div className="stat bg-base-100 rounded-box shadow">
                    <div className="stat-title">進行中</div>
                    <div className="stat-value text-warning">
                      {adminStats.pendingOrders}
                    </div>
                  </div>
                  <div className="stat bg-base-100 rounded-box shadow">
                    <div className="stat-title">已送出</div>
                    <div className="stat-value text-info">
                      {adminStats.submittedOrders}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="alert alert-info">尚無統計資料</div>
              )
            ) : null}

            {adminTab === "orders" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <select
                    className="select select-bordered"
                    value={adminOrdersStatus}
                    onChange={(event) => {
                      setAdminOrdersStatus(
                        event.target.value as "" | Order["status"],
                      );
                      setAdminOrdersPage(1);
                    }}
                  >
                    <option value="">全部狀態</option>
                    <option value="pending">進行中</option>
                    <option value="submitted">已送出</option>
                  </select>
                  <span className="text-sm opacity-70">
                    共 {adminOrdersMeta.total} 筆訂單
                  </span>
                </div>

                {adminOrdersLoading ? (
                  <div className="flex justify-center py-8">
                    <span className="loading loading-spinner loading-lg"></span>
                  </div>
                ) : adminOrders.length === 0 ? (
                  <div className="alert alert-info">目前沒有訂單</div>
                ) : (
                  <div className="space-y-3">
                    {adminOrders.map((order) => (
                      <article
                        key={order.id}
                        className="card bg-base-100 shadow-sm border border-base-300"
                      >
                        <div className="card-body p-4">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h3 className="font-semibold">
                              訂單 #{order.id}（使用者 {order.userId}）
                            </h3>
                            <span
                              className={`badge ${order.status === "submitted" ? "badge-success" : "badge-warning"}`}
                            >
                              {orderStatusLabel(order.status)}
                            </span>
                          </div>
                          <p className="text-sm opacity-70">
                            建立時間：{order.createdAt}
                          </p>
                          <ul className="text-sm list-disc pl-5 space-y-1">
                            {order.items.map((detail) => (
                              <li key={`admin-${order.id}-${detail.item.id}`}>
                                {detail.item.name} x {detail.qty}
                              </li>
                            ))}
                          </ul>
                          <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
                            <p className="font-bold">總額 ${order.total}</p>
                            {order.status === "pending" ? (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  void handleAdminOrderStatusChange(
                                    order,
                                    "submitted",
                                  );
                                }}
                              >
                                標記為已送出
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() => {
                                  void handleAdminOrderStatusChange(
                                    order,
                                    "pending",
                                  );
                                }}
                              >
                                改回進行中
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                <div className="flex justify-center items-center gap-3">
                  <button
                    className="btn btn-sm"
                    disabled={adminOrdersPage <= 1 || adminOrdersLoading}
                    onClick={() =>
                      setAdminOrdersPage((page) => Math.max(1, page - 1))
                    }
                  >
                    上一頁
                  </button>
                  <span className="text-sm">
                    {adminOrdersPage} / {adminOrdersTotalPages}
                  </span>
                  <button
                    className="btn btn-sm"
                    disabled={
                      adminOrdersPage >= adminOrdersTotalPages ||
                      adminOrdersLoading
                    }
                    onClick={() =>
                      setAdminOrdersPage((page) =>
                        Math.min(adminOrdersTotalPages, page + 1),
                      )
                    }
                  >
                    下一頁
                  </button>
                </div>
              </div>
            ) : null}

            {adminTab === "menu" ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <section className="card bg-base-100 shadow-md">
                  <div className="card-body">
                    <h2 className="card-title">
                      {editingMenuId ? `編輯品項 #${editingMenuId}` : "新增品項"}
                    </h2>
                    <form
                      className="space-y-3"
                      onSubmit={(event) => {
                        void handleSaveAdminMenuItem(event);
                      }}
                    >
                      <input
                        className="input input-bordered w-full"
                        placeholder="名稱"
                        value={adminMenuForm.name}
                        onChange={(event) =>
                          setAdminMenuForm((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                        required
                      />
                      <input
                        className="input input-bordered w-full"
                        placeholder="價格"
                        type="number"
                        min="0"
                        value={adminMenuForm.price}
                        onChange={(event) =>
                          setAdminMenuForm((prev) => ({
                            ...prev,
                            price: event.target.value,
                          }))
                        }
                        required
                      />
                      <input
                        className="input input-bordered w-full"
                        placeholder="分類"
                        list="admin-menu-categories"
                        value={adminMenuForm.category}
                        onChange={(event) =>
                          setAdminMenuForm((prev) => ({
                            ...prev,
                            category: event.target.value,
                          }))
                        }
                        required
                      />
                      <datalist id="admin-menu-categories">
                        {categories.map((category) => (
                          <option key={category} value={category} />
                        ))}
                      </datalist>
                      <textarea
                        className="textarea textarea-bordered w-full"
                        placeholder="描述"
                        value={adminMenuForm.description}
                        onChange={(event) =>
                          setAdminMenuForm((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                        required
                      />
                      <input
                        className="input input-bordered w-full"
                        placeholder="圖片 URL"
                        value={adminMenuForm.image_url}
                        onChange={(event) =>
                          setAdminMenuForm((prev) => ({
                            ...prev,
                            image_url: event.target.value,
                          }))
                        }
                        required
                      />
                      <div className="flex gap-2">
                        <button
                          className="btn btn-primary"
                          type="submit"
                          disabled={isSavingMenu}
                        >
                          {isSavingMenu
                            ? "儲存中..."
                            : editingMenuId
                              ? "更新品項"
                              : "新增品項"}
                        </button>
                        {editingMenuId ? (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={resetAdminMenuForm}
                          >
                            取消編輯
                          </button>
                        ) : null}
                      </div>
                    </form>
                  </div>
                </section>

                <section className="card bg-base-100 shadow-md">
                  <div className="card-body">
                    <h2 className="card-title">現有品項</h2>
                    {adminMenuLoading ? (
                      <div className="flex justify-center py-8">
                        <span className="loading loading-spinner loading-lg"></span>
                      </div>
                    ) : adminMenuItems.length === 0 ? (
                      <div className="alert alert-info">尚無菜單品項</div>
                    ) : (
                      <ul className="space-y-3 max-h-[32rem] overflow-auto">
                        {adminMenuItems.map((item) => (
                          <li
                            key={item.id}
                            className="p-3 rounded-lg bg-base-200 flex items-center justify-between gap-3"
                          >
                            <div>
                              <p className="font-semibold">
                                #{item.id} {item.name}
                              </p>
                              <p className="text-sm opacity-70">
                                {item.category}・${item.price}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="btn btn-xs btn-outline"
                                onClick={() => startEditMenuItem(item)}
                              >
                                編輯
                              </button>
                              <button
                                className="btn btn-xs btn-error btn-outline"
                                onClick={() => {
                                  void handleDeleteAdminMenuItem(item.id);
                                }}
                              >
                                刪除
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              </div>
            ) : null}
          </section>
        ) : null}
      </main>

      {detailItem || detailLoading ? (
        <>
          <button
            className="fixed inset-0 bg-black/35 z-20"
            aria-label="close item detail"
            onClick={() => {
              setDetailItem(null);
              setDetailLoading(false);
            }}
          />
          <dialog className="modal modal-open z-30">
            <div className="modal-box max-w-lg">
              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <span className="loading loading-spinner loading-lg"></span>
                </div>
              ) : detailItem ? (
                <>
                  <h3 className="font-bold text-2xl mb-2">{detailItem.name}</h3>
                  <span className="badge badge-outline mb-4">
                    {detailItem.category}
                  </span>
                  <figure className="rounded-lg overflow-hidden mb-4">
                    <img
                      src={detailItem.image_url}
                      alt={detailItem.name}
                      className="w-full h-56 object-cover"
                    />
                  </figure>
                  <p className="mb-4">{detailItem.description}</p>
                  <p className="text-2xl font-bold text-success mb-4">
                    ${detailItem.price}
                  </p>
                  <div className="modal-action">
                    <button
                      className="btn"
                      onClick={() => {
                        setDetailItem(null);
                      }}
                    >
                      關閉
                    </button>
                    {user ? (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          void addToCart(detailItem);
                        }}
                        disabled={activeItemId === detailItem.id}
                      >
                        加入購物車
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </dialog>
        </>
      ) : null}

      {user && isCartOpen ? (
        <>
          <button
            className="fixed inset-0 bg-black/35"
            aria-label="close cart drawer"
            onClick={() => {
              setIsCartOpen(false);
            }}
          />
          <aside className="fixed right-0 top-0 h-full w-full max-w-md bg-base-100 shadow-2xl z-10 flex flex-col">
            <div className="p-4 border-b border-base-300 flex items-center justify-between">
              <h2 className="text-xl font-bold">購物車明細</h2>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setIsCartOpen(false);
                }}
              >
                關閉
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto">
              {cartDetails.length === 0 ? (
                <div className="alert">
                  <span>購物車目前是空的。</span>
                </div>
              ) : (
                <ul className="space-y-3">
                  {cartDetails.map((detail) => (
                    <li
                      key={detail.itemId}
                      className="p-3 rounded-lg bg-base-200 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold">{detail.item.name}</p>
                        <p className="text-sm opacity-70">
                          單價 ${detail.item.price} x {detail.qty}
                        </p>
                      </div>
                      <p className="font-bold">${detail.subtotal}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="p-4 border-t border-base-300 space-y-3">
              <div className="flex items-center justify-between font-semibold">
                <span>總件數</span>
                <span>{cartItemCount}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold">
                <span>總金額</span>
                <span>${cartTotal}</span>
              </div>
              <button
                className="btn btn-error btn-outline w-full"
                onClick={() => {
                  void clearCart();
                }}
                disabled={cartDetails.length === 0 || isClearingCart}
              >
                {isClearingCart ? "清空中..." : "清空購物車"}
              </button>
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  void submitOrder();
                }}
                disabled={cartDetails.length === 0 || isSubmittingOrder}
              >
                {isSubmittingOrder ? "送出中..." : "送出訂單"}
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
