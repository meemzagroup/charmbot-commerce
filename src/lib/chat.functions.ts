import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const InputSchema = z.object({
  sessionId: z.string().min(3),
  messages: z.array(MessageSchema).min(1),
});

export type ChatMessage = z.infer<typeof MessageSchema>;

const SYSTEM_PROMPT = `You are the Meemza Chemicals support assistant on the company's e-commerce site.
You help visitors with: live order tracking, product availability and pricing, delivery times,
return/refund policy, and Cash on Delivery (COD) questions.

Rules:
- To check an order, call lookup_order with the order number (e.g. "1042") or the customer's phone.
- If the visitor wants a human agent, has a complaint, or asks about bulk/wholesale pricing,
  collect their name and phone, then call create_support_ticket.
- Delivery is 2-4 working days nationwide. COD is available on orders up to Rs 50,000.
- Returns accepted within 7 days for damaged or incorrect goods.
- Be concise, factual and friendly. Never invent tracking numbers or stock levels.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "lookup_order",
      description: "Look up a live order status by order number or customer phone number.",
      parameters: {
        type: "object",
        properties: {
          order_number: { type: "string", description: "Order number, digits only e.g. 1042" },
          phone: { type: "string", description: "Customer phone number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lookup_products",
      description: "Search the product catalogue for availability and price.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_support_ticket",
      description:
        "Create a support ticket / lead when the visitor needs a human agent, has a complaint, or wants bulk pricing.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          message: { type: "string" },
          inquiry_type: {
            type: "string",
            enum: [
              "Order Tracking",
              "Product Inquiry",
              "Return/Refund",
              "Wholesale/Bulk",
              "General",
            ],
          },
        },
        required: ["name", "phone", "message", "inquiry_type"],
      },
    },
  },
];

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function lookupOrder(admin: any, args: { order_number?: string | undefined; phone?: string | undefined }) {
  let query = admin
    .from("orders")
    .select("order_number, order_status, payment_status, total_amount, tracking_number, courier_name, created_at, customers(full_name, phone)")
    .order("created_at", { ascending: false })
    .limit(3);

  if (args.order_number) {
    query = query.eq("order_number", args.order_number.replace(/[^0-9]/g, ""));
  } else if (args.phone) {
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .ilike("phone", `%${args.phone.slice(-7)}%`)
      .limit(1)
      .maybeSingle();
    if (!customer) return { found: false };
    query = query.eq("customer_id", customer.id);
  } else {
    return { found: false, reason: "no identifier supplied" };
  }

  const { data } = await query;
  if (!data || data.length === 0) return { found: false };
  return { found: true, orders: data };
}

async function lookupProducts(admin: any, args: { query: string }) {
  const { data } = await admin
    .from("products")
    .select("title, sku, price, stock_quantity, category, is_active")
    .ilike("title", `%${args.query}%`)
    .limit(5);
  if (!data || data.length === 0) {
    const { data: all } = await admin
      .from("products")
      .select("title, sku, price, stock_quantity, is_active")
      .eq("is_active", true)
      .limit(5);
    return { matched: false, suggestions: all ?? [] };
  }
  return { matched: true, products: data };
}

async function createTicket(admin: any, args: Record<string, string | undefined>) {
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .ilike("phone", `%${(args["phone"] ?? "").slice(-7)}%`)
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("leads_inquiries").insert({
    customer_id: customer?.id ?? null,
    name: args["name"] ?? null,
    phone: args["phone"] ?? null,
    email: args["email"] ?? null,
    message: args["message"] ?? null,
    inquiry_type: args["inquiry_type"] ?? "General",
    status: "Open",
    source: "Chatbot",
  });
  if (error) return { created: false, error: error.message };
  return { created: true };
}

/** Deterministic answers used when no AI provider is reachable. */
async function mockReply(admin: any, text: string) {
  const lower = text.toLowerCase();
  const orderMatch = text.match(/#?\b(\d{4})\b/);
  if (orderMatch || lower.includes("track") || lower.includes("order")) {
    if (orderMatch) {
      const result = await lookupOrder(admin, { order_number: orderMatch[1] ?? "" });
      if (result.found) {
        const o = result.orders[0];
        return `Order #${o.order_number} is currently **${o.order_status}**${
          o.courier_name ? ` via ${o.courier_name}` : ""
        }${o.tracking_number ? `. Tracking ID: ${o.tracking_number}` : ""}. Payment: ${o.payment_status}.`;
      }
      return `I couldn't find an order with that number. Please double-check it, or share your phone number and I'll pass this to an agent.`;
    }
    return "Sure — please share your order number (for example #1042) or the phone number used at checkout.";
  }
  if (lower.includes("cod") || lower.includes("cash on delivery")) {
    return "Yes, Cash on Delivery is available on orders up to Rs 50,000. Larger orders require bank transfer or advance payment.";
  }
  if (lower.includes("return") || lower.includes("refund") || lower.includes("damage")) {
    return "Returns are accepted within 7 days for damaged or incorrect goods. Share your order number and phone and I'll open a return ticket for you.";
  }
  if (lower.includes("deliver") || lower.includes("shipping")) {
    return "Standard delivery is 2-4 working days nationwide. Bulk drum shipments to remote areas may take up to 6 days.";
  }
  if (lower.includes("bulk") || lower.includes("wholesale") || lower.includes("agent")) {
    return "Happy to help — please send your name and phone number and I'll log a bulk/wholesale request for our sales team.";
  }
  if (lower.includes("stock") || lower.includes("price") || lower.includes("available")) {
    const result = await lookupProducts(admin, { query: text.split(" ").slice(-1)[0] ?? "" });
    const list = (result.matched ? result.products : result.suggestions) as any[];
    if (list?.length) {
      return `Here's what I have:\n${list
        .map(
          (p) =>
            `• ${p.title} — Rs ${Number(p.price).toLocaleString()} (${
              p.stock_quantity > 0 ? `${p.stock_quantity} in stock` : "out of stock"
            })`,
        )
        .join("\n")}`;
    }
  }
  return "I can track orders, check product stock and pricing, explain delivery/COD/returns, or connect you to a human agent. What do you need?";
}

async function saveTranscript(
  admin: any,
  sessionId: string,
  transcript: ChatMessage[],
  topic: string,
  resolvedByBot: boolean,
) {
  await admin.from("chatbot_conversations").upsert(
    {
      session_id: sessionId,
      inquiry_topic: topic,
      full_transcript: transcript,
      is_resolved_by_bot: resolvedByBot,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id" },
  );
}

export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const lastUser = [...data.messages].reverse().find((m) => m.role === "user");
    const userText = lastUser?.content ?? "";

    // Provider selection: custom key from settings first, then the built-in AI gateway.
    const { data: settings } = await admin.from("app_settings").select("key, value");
    const settingsMap = new Map<string, string>(
      (settings ?? []).map((s: { key: string; value: string | null }) => [s.key, s.value ?? ""]),
    );
    const openaiKey = settingsMap.get("openai_api_key")?.trim();
    const gatewayKey = process.env["LOVABLE_API_KEY"];

    const endpoint = openaiKey
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const apiKey = openaiKey || gatewayKey;
    const model = openaiKey ? "gpt-4o-mini" : "google/gemini-3.6-flash";

    let ticketCreated = false;
    let reply = "";

    if (apiKey) {
      try {
        const convo: any[] = [
          { role: "system", content: SYSTEM_PROMPT },
          ...data.messages.map((m) => ({ role: m.role, content: m.content })),
        ];

        for (let round = 0; round < 3; round++) {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model, messages: convo, tools: TOOLS }),
          });
          if (!res.ok) throw new Error(`AI provider ${res.status}`);
          const json = await res.json();
          const message = json.choices?.[0]?.message;
          if (!message) throw new Error("empty completion");
          convo.push(message);

          const calls = message.tool_calls ?? [];
          if (calls.length === 0) {
            reply = message.content ?? "";
            break;
          }

          for (const call of calls) {
            const args = JSON.parse(call.function?.arguments || "{}");
            let result: unknown = {};
            if (call.function?.name === "lookup_order") result = await lookupOrder(admin, args);
            else if (call.function?.name === "lookup_products")
              result = await lookupProducts(admin, args);
            else if (call.function?.name === "create_support_ticket") {
              result = await createTicket(admin, args);
              ticketCreated = true;
            }
            convo.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(result),
            });
          }
        }
      } catch (error) {
        console.error("AI chat fallback:", error);
        reply = "";
      }
    }

    if (!reply) {
      reply = await mockReply(admin, userText);
    }

    const transcript: ChatMessage[] = [...data.messages, { role: "assistant", content: reply }];
    const topic = /\d{4}/.test(userText)
      ? "Order Tracking"
      : /bulk|wholesale/i.test(userText)
        ? "Wholesale/Bulk"
        : /refund|return/i.test(userText)
          ? "Return/Refund"
          : "General";

    await saveTranscript(admin, data.sessionId, transcript, topic, !ticketCreated);

    return { reply, ticketCreated };
  });
