ALTER TABLE "bf_v9"."user" ADD COLUMN "role" text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
COMMENT ON COLUMN "bf_v9"."user"."role" IS 'V10: 用戶角色 (customer, staff, admin)';
