/**
 * Hand-written reference types matching supabase/migrations/0001_init.sql.
 *
 * These aren't wired into the Supabase client as a strict generic (joined
 * queries like `sites ( name )` make hand-maintained generics brittle and
 * error-prone to keep in sync). Once the project is connected to a real
 * Supabase instance, prefer regenerating this file with:
 *
 *   npx supabase gen types typescript --project-id <your-project-ref> > src/types/database.ts
 *
 * and then wiring `createClient<Database>()` in lib/supabase/*.ts.
 */

export type SiteRole = "ho1_ordering" | "ho2_receiving" | "ho3_accounts";
export type OrderStatus =
  | "placed"
  | "pending_approval"
  | "completed"
  | "cancelled";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
};

export type Site = {
  id: string;
  name: string;
  location: string | null;
  created_at: string;
};

export type UserSite = {
  id: string;
  user_id: string;
  site_id: string;
  role: SiteRole;
  created_at: string;
};

export type Item = {
  id: string;
  name: string;
  /** The item's usual unit — pre-filled on new orders; each order carries its own (Order.unit). */
  unit: string;
  created_by: string | null;
  created_at: string;
};

export type Shopkeeper = {
  id: string;
  name: string;
  phone: string | null;
  created_by: string | null;
  created_at: string;
};

export type Building = {
  id: string;
  site_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
};

/** Header shared by every line on a PO (0012_purchase_orders.sql). Status is derived from its lines. */
export type PurchaseOrder = {
  id: string;
  site_id: string;
  /** Entered manually by HO1 when placing the order (0008_manual_po_number.sql). */
  po_number: string;
  shopkeeper_id: string;
  placed_by: string;
  placed_date: string;
  created_at: string;
};

/** One line (item) of a purchase order — received and approved on its own. */
export type Order = {
  id: string;
  purchase_order_id: string;
  site_id: string;
  item_id: string;
  quantity_ordered: number;
  /** Fixed when the order is placed; its receiving and approval stay in this unit (0011_unit_per_order.sql). */
  unit: string;
  placed_by: string;
  placed_date: string;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
};

export type OrderEditLog = {
  id: string;
  order_id: string;
  edited_by: string;
  edited_at: string;
  action: "edited" | "cancelled" | "added" | "removed";
  note: string | null;
  previous_values: Record<string, unknown> | null;
};

export type ReceivingLog = {
  id: string;
  order_id: string;
  quantity_received: number;
  condition_notes: string | null;
  /** Entered by HO2 when logging the delivery — null only on rows logged before this field existed. */
  invoice_number: string | null;
  received_by: string;
  received_date: string;
  created_at: string;
};

export type Approval = {
  id: string;
  order_id: string;
  approved_by: string;
  approved_date: string;
  remarks: string | null;
  /** How much this approval covered — a line can be approved in several batches (0014_partial_approvals.sql). */
  quantity_approved: number;
  /** True when HO3 accepted a short delivery as final and closed the line. */
  closes_short: boolean;
  created_at: string;
};

export type InventoryRelease = {
  id: string;
  site_id: string;
  item_id: string;
  /** Which stock line (item + unit) this came out of. */
  unit: string;
  quantity_released: number;
  quality_notes: string | null;
  destination_building_id: string;
  released_by: string;
  released_date: string;
  created_at: string;
};

/** Stock per site, item *and* unit — the same item in two units is two rows. */
export type SiteInventoryRow = {
  site_id: string;
  item_id: string;
  unit: string;
  quantity_available: number;
};
