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
