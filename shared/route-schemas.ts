import { z } from "zod";
import type { Order } from "./contracts.ts";
import { menuItemSchema, orderSchema, sessionUserSchema, userProfileSchema } from "./contracts.ts";
import toTaipeiDateTime from "../util.ts";

export type { Order };

// ─── API Layer Error Response（API 層錯誤格式定義）────────────────────────

export const apiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

// ─── API Layer Order Response（Order 的 API 層呈現）──────────────────────

export const orderResponseSchema = orderSchema.extend({
  createdAtTaipei: z.string().min(1),
});

export type OrderResponse = z.infer<typeof orderResponseSchema>;

/**
 * 將數據庫/內部 Order 轉換為 API 響應格式
 * 添加台北時區時間戳
 */
export function toOrderResponse(order: Order): OrderResponse {
  return {
    ...order,
    createdAtTaipei: toTaipeiDateTime(order.createdAt),
  };
}

// ─── Request Schemas（按 route 分組）────────────────────────────────────

/** POST /api/menu */
export const createMenuItemBodySchema = z.object({
  name: z.string().min(1),
  price: z.number().int().min(0),
  category: z.string().min(1),
  description: z.string().min(1),
  image_url: z.string().min(1),
});

/** PATCH /api/menu/:id */
export const updateMenuItemParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateMenuItemBodySchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().int().min(0).optional(),
  category: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  image_url: z.string().min(1).optional(),
});

/** DELETE /api/menu/:id */
export const deleteMenuItemParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** GET /api/orders/:id */
export const getOrderByIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

/** PATCH /api/orders/:id */
export const updateOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const updateOrderBodySchema = z.object({
  itemId: z.number().int().min(1),
  qty: z.number().min(0),
});

/** POST /api/orders/:id/submit */
export const submitOrderParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

// ─── Response Schemas（API envelope 層）─────────────────────────────────

export const menuListResponseSchema = z.object({
  data: z.array(menuItemSchema),
});

export const menuItemResponseSchema = z.object({
  data: menuItemSchema,
});

export const orderListResponseSchema = z.object({
  data: z.array(orderResponseSchema),
});

export const orderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema,
});

export const nullableOrderResponseEnvelopeSchema = z.object({
  data: orderResponseSchema.nullable(),
});

export const healthResponseSchema = z.object({
  status: z.string(),
});

// ─── Auth 相關 Schema（GET /api/auth/me, PATCH /api/users/me）──────────────

export const getCurrentUserResponseSchema = z.object({
  data: userProfileSchema.nullable(),
});

export const updateUserProfileBodySchema = z.object({
  name: z.string().min(1).optional(),
  avatar: z.string().url().optional(),
});

// ─── Menu 搜尋、分類、分頁 Schema──────────────────────────────────────────

export const menuQuerySchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
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

export const getMenuByIdParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

// ─── 管理者 API Schema──────────────────────────────────────────────────────

export const adminOrdersQuerySchema = z.object({
  status: z.enum(["pending", "submitted"]).optional(),
  userId: z.string().optional(),
  page: z.preprocess((value) => Number(value), z.number().int().min(1).default(1)),
  pageSize: z.preprocess((value) => Number(value), z.number().int().min(1).max(100).default(20)),
});

export const adminOrdersListResponseSchema = z.object({
  data: z.array(orderResponseSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  }),
});

export const adminUpdateOrderStatusParamsSchema = z.object({
  id: z.string().regex(/^[0-9]+$/),
});

export const adminUpdateOrderStatusBodySchema = z.object({
  status: z.enum(["pending", "submitted"]),
});

export const adminStatsResponseSchema = z.object({
  data: z.object({
    totalOrders: z.number(),
    totalRevenue: z.number(),
    pendingOrders: z.number(),
    submittedOrders: z.number(),
  }),
});

export const adminUsersListResponseSchema = z.object({
  data: z.array(userProfileSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
  }),
});
