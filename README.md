# AI Commerce Companion

[23:08, 01/09/2026] Meemza Chemicals PVT-LTD.: Build a production-ready Full-Stack CRM Web Application with an embedded AI Support Chatbot using React, Tailwind CSS, shadcn/ui components, Lucide icons, and Supabase for backend/database.

---

### 1. Database Schema (Supabase PostgreSQL)

Automatically set up the following tables with proper Foreign Key constraints and RLS (Row Level Security) enabled:

1. users (Auth via Supabase Auth)

   - id (uuid, primary key)

   - full_name (text)

   - role (text: 'admin', 'sales_rep', 'support')

   - created_at (timestamp)

2. leads

   - id (uuid, primary key)

   - name (text, required)

   - email (text)

   - phone (text)

   - company (text)

   - status (text: 'New', 'Contacted', 'Qualified', 'Proposal Sent', 'Won', 'Lost')

   - deal_value (numeric, default 0)

   - sourc…

[23:12, 01/09/2026] Meemza Chemicals PVT-LTD.: Build a production-ready Full-Stack E-commerce CRM & AI Support System using React, Tailwind CSS, shadcn/ui components, Lucide icons, and Supabase for the backend/database.

---

### 1. Database Schema (Supabase PostgreSQL)

Set up the following tables with Foreign Key constraints and RLS (Row Level Security) enabled:

1. users (Auth via Supabase Auth)

   - id (uuid, primary key)

   - full_name (text)

   - role (text: 'admin', 'store_manager', 'support_agent')

   - created_at (timestamp)

2. customers

   - id (uuid, primary key)

   - full_name (text, required)

   - email (text)

   - phone (text)

   - shipping_address (text)

   - total_orders (integer, default 0)

   - total_spend (numeric, default 0)

   - customer_tag (text: 'VIP', 'Repeat', 'New', 'At Risk')

   - created_at (timestamp)

3. products

   - id (uuid, primary key)

   - title (text, required)

   - sku (text, unique)

   - price (numeric, required)

   - stock_quantity (integer, default 0)

   - category (text)

   - is_active (boolean, default true)

   - image_url (text)

   - created_at (timestamp)

4. orders

   - id (uuid, primary key)

   - order_number (text, unique)

   - customer_id (uuid, references customers.id)

   - order_status (text: 'Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned')

   - payment_status (text: 'Paid', 'Pending', 'Refunded', 'COD')

   - total_amount (numeric)

   - tracking_number (text)

   - courier_name (text)

   - notes (text)

   - created_at (timestamp)

5. order_items

   - id (uuid, primary key)

   - order_id (uuid, references orders.id)

   - product_id (uuid, references products.id)

   - quantity (integer)

   - unit_price (numeric)

6. leads_inquiries

   - id (uuid, primary key)

   - customer_id (uuid, references customers.id, optional)

   - name (text)

   - phone (text)

   - email (text)

   - inquiry_type (text: 'Order Tracking', 'Product Inquiry', 'Return/Refund', 'Wholesale/Bulk', 'General')

   - status (text: 'Open', 'In Progress', 'Resolved', 'Closed')

   - source (text: 'Chatbot', 'WhatsApp', 'Website')

   - created_at (timestamp)

7. chatbot_conversations

   - id (uuid, primary key)

   - session_id (text)

   - visitor_phone (text)

   - visitor_email (text)

   - inquiry_topic (text)

   - full_transcript (jsonb)

   - is_resolved_by_bot (boolean, default true)

   - created_at (timestamp)

---

### 2. Core E-commerce CRM Pages & Dashboard Features

Design a clean, high-end dashboard with dark/light mode and a responsive collapsible sidebar:

- *E-commerce Analytics Overview:*

  - KPI Cards: Total Revenue, Average Order Value (AOV), Total Orders, Active Support Inquiries.

  - Sales Charts: Daily/Monthly Revenue trends (Area/Bar charts), Top Selling Products list.

  - Real-time Order Status tracker widget.

- *Orders & Fulfillment Management:*

  - Searchable, filterable Orders Table (filter by status: Pending, Shipped, Delivered, COD).

  - Quick action to update order status, assign tracking numbers, or process returns.

  - Detailed Order Invoice & Item breakdown modal.

- *Customer Database (CRM Profiles):*

  - Customer List showing lifetime value (LTV), total orders, and segments (VIP, Regular, Inactive).

  - Customer Profile Detail view with past order history, support logs, and custom notes.

- *Product & Inventory Catalog:*

  - Manage product listings, SKUs, pricing, and live inventory alerts (low stock warning).

- *Settings & API Configuration:*

  - Settings panel to configure OpenAI / Gemini API Keys for the AI chatbot.

---

### 3. E-commerce AI Chatbot Widget (Customer Support & Sales)

Floating interactive chat bubble at the bottom-right of the screen:

- *E-commerce Chatbot Capabilities:*

  - *Live Order Tracking:* Visitor can enter their Order Number or Phone Number and the bot retrieves the live status (e.g., "Your order #1042 has been Shipped via Courier. Tracking ID: TRK-9821").

  - *Product FAQs & Recommendations:* Answers questions about product availability, sizes, delivery times, return policies, and Cash on Delivery (COD).

  - *Auto-Lead & Support Ticket Capture:* If the customer wants human agent help, bulk inquiry, or has a complaint, extract Name, Phone, and Issue and save it directly to leads_inquiries.

  - Save transcripts into chatbot_conversations.

  - Provide realistic fallback/mock answers when API keys are not connected, with instant integration once Gemini/OpenAI API key is supplied.

---

### 4. UI/UX & Quality Requirements

- Clean, fast, modern SaaS UI using shadcn/ui and Tailwind.

- Toast notifications (Sonner) on status changes, order creation, and inquiry updates.

- Pre-populate realistic mock data (orders, products, customers, and chat logs) so the dashboard looks complete immediately.

-

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://charmbot-commerce.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f077406a-ae69-4522-bbc9-5a9fdc67eecd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
