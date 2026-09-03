import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Customer = Tables<"customers">;
export type Product = Tables<"products">;
export type Order = Tables<"orders">;
export type OrderItem = Tables<"order_items">;
export type Inquiry = Tables<"leads_inquiries">;
export type Conversation = Tables<"chatbot_conversations">;

export type OrderWithCustomer = Order & { customers: Pick<Customer, "id" | "full_name"> | null };

export async function fetchOrders(): Promise<OrderWithCustomer[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*, customers(id, full_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as OrderWithCustomer[];
}

export async function fetchOrderItems(orderId: string) {
  const { data, error } = await supabase
    .from("order_items")
    .select("*, products(title, sku)")
    .eq("order_id", orderId);
  if (error) throw error;
  return (data ?? []) as (OrderItem & { products: { title: string; sku: string | null } | null })[];
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("total_spend", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchInquiries(): Promise<Inquiry[]> {
  const { data, error } = await supabase
    .from("leads_inquiries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from("chatbot_conversations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchSettings() {
  const { data, error } = await supabase.from("app_settings").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function saveSetting(key: string, value: string) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

export function revenueByDay(orders: Order[], days = 14) {
  const buckets: { label: string; total: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    buckets.push({
      label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      total: 0,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.label, i]));
  for (const order of orders) {
    if (order.payment_status === "Refunded" || order.order_status === "Cancelled") continue;
    const label = new Date(order.created_at).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
    const i = index.get(label);
    if (i !== undefined) buckets[i]!.total += Number(order.total_amount ?? 0);
  }
  return buckets;
}

export function revenueByMonth(orders: Order[], months = 6) {
  const buckets: { label: string; total: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ label: d.toLocaleDateString("en-GB", { month: "short" }), total: 0 });
  }
  const index = new Map(buckets.map((b, i) => [b.label, i]));
  for (const order of orders) {
    if (order.payment_status === "Refunded" || order.order_status === "Cancelled") continue;
    const label = new Date(order.created_at).toLocaleDateString("en-GB", { month: "short" });
    const i = index.get(label);
    if (i !== undefined) buckets[i]!.total += Number(order.total_amount ?? 0);
  }
  return buckets;
}

/* ------------------------------------------------------------------ */
/* Product & inventory CRUD                                            */
/* ------------------------------------------------------------------ */

export type ProductInput = {
  title: string;
  sku: string | null;
  category: string | null;
  price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active?: boolean;
};

export async function createProduct(input: ProductInput) {
  const { error } = await supabase.from("products").insert(input);
  if (error) throw error;
}

export async function updateProduct(id: string, patch: Partial<ProductInput>) {
  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

export function isLowStock(product: Pick<Product, "stock_quantity" | "low_stock_threshold">) {
  return product.stock_quantity <= (product.low_stock_threshold ?? 10);
}

/* ------------------------------------------------------------------ */
/* Order CRUD                                                          */
/* ------------------------------------------------------------------ */

export type OrderInput = {
  order_number: string;
  customer_id: string | null;
  order_status: string;
  payment_status: string;
  total_amount: number;
  tracking_number: string | null;
  courier_name: string | null;
  notes: string | null;
};

export async function createOrder(input: OrderInput) {
  const { error } = await supabase.from("orders").insert(input);
  if (error) throw error;
}

export async function updateOrder(id: string, patch: Partial<OrderInput>) {
  const { error } = await supabase.from("orders").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteOrder(id: string) {
  const items = await supabase.from("order_items").delete().eq("order_id", id);
  if (items.error) throw items.error;
  const { error } = await supabase.from("orders").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Customer CRUD                                                       */
/* ------------------------------------------------------------------ */

export type CustomerInput = {
  full_name: string;
  email: string | null;
  phone: string | null;
  shipping_address: string | null;
  customer_tag: string;
  notes: string | null;
};

export async function createCustomer(input: CustomerInput) {
  const { error } = await supabase.from("customers").insert(input);
  if (error) throw error;
}

export async function updateCustomer(id: string, patch: Partial<CustomerInput>) {
  const { error } = await supabase.from("customers").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCustomer(id: string) {
  await supabase.from("communication_threads").update({ contact_id: null }).eq("contact_id", id);
  await supabase.from("orders").update({ customer_id: null }).eq("customer_id", id);
  await supabase.from("leads_inquiries").update({ customer_id: null }).eq("customer_id", id);
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Inquiry CRUD                                                        */
/* ------------------------------------------------------------------ */

export type InquiryInput = {
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  inquiry_type: string;
  status: string;
  source: string;
};

export async function createInquiry(input: InquiryInput) {
  const { error } = await supabase.from("leads_inquiries").insert(input);
  if (error) throw error;
}

export async function updateInquiry(id: string, patch: Partial<InquiryInput>) {
  const { error } = await supabase.from("leads_inquiries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteInquiry(id: string) {
  const { error } = await supabase.from("leads_inquiries").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Company / tenant                                                    */
/* ------------------------------------------------------------------ */

export async function fetchMyCompany() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.company_id) return null;
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, api_key")
    .eq("id", profile.company_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
