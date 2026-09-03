# Live Tenant CRM and CRUD

## User-visible outcome
- The CRM shows only live records for the signed-in company/tenant; empty accounts show clean zero/empty states.
- Inventory supports add, edit, stock adjustment, low-stock thresholds, and delete.
- Orders, customers, inquiries, and WhatsApp channels support the requested create/edit/delete actions with immediate UI refresh.
- External product/inventory synchronization is available through a secured backend endpoint.

## Implementation
1. Inspect the current schema/RLS and add a tenant/company ownership model with safe defaults for existing rows, then scope CRM reads and writes at the database level.
2. Remove demo fallback assumptions from queries and dashboard calculations; preserve empty-safe rendering and live database-derived metrics.
3. Add product schema support for low-stock thresholds and implement inventory CRUD UI plus authenticated product sync handling.
4. Add CRUD dialogs/actions for orders, customers, inquiries, and WhatsApp channels, invalidating affected queries after mutations.
5. Verify metadata, type generation, migration application, and the main authenticated flows.

## Technical details
- Use the Lovable Database migration tool for schema/RLS changes.
- Use authenticated client queries for normal tenant-scoped reads/writes and a server route for external sync with signature/API-key validation and tenant resolution.
- Do not expose service credentials or rely on UI-only tenant filtering.
