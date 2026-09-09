# Complete CRM Functional Audit and Repair

## Goal
Make every existing Manuta CRM workflow operational without weakening tenant isolation, role protection, subscriptions, or WhatsApp security. Replace misleading “success” states with real delivery states and clearly identify infrastructure-dependent blockers.

## Repair plan

1. **Secure tenant and role foundations**
   - Replace the unsafe company-admin communication policies with company-scoped admin policies.
   - Audit every CRM table’s grants, RLS commands, `WITH CHECK` rules, and `company_id` assignment trigger.
   - Ensure platform owner, company admin, manager, and agent each receive only intended same-company access.
   - Reject unprovisioned accounts with no company instead of treating them as active.

2. **Repair all core CRUD workflows**
   - Fix customer, order, product, inquiry, team, channel, thread, message, call-log, campaign, and template create/read/update/delete paths.
   - Make company admins able to manage their own inventory and assign their own company’s conversations.
   - Make new calls/conversations default to the current team member when required, while allowing company admins to create genuinely unassigned work.
   - Make multi-step deletes atomic where partial updates could corrupt records.
   - Add clear account/subscription errors instead of exposing database error text.

3. **Enforce subscriptions in the database**
   - Enforce customer, order, WhatsApp channel, campaign-per-month, and user limits using tenant-derived database checks.
   - Keep expired or suspended companies readable but block writes consistently.
   - Disable or explain blocked controls before submission while retaining server/database enforcement.

4. **Make communications truthful and complete**
   - Send WhatsApp replies/templates through the selected company channel and Evolution backend before recording success.
   - Remove false “Email queued” behavior until a real email provider is configured; keep received email records readable.
   - Reject inbound WhatsApp events for unknown channels rather than creating invisible records.
   - Scope delivery updates by the resolved company and channel.
   - Add concurrency protection so the same campaign recipient cannot be sent twice by overlapping dispatch calls.
   - Keep external Evolution connectivity as a reported blocker if the configured server remains an unreachable raw IP/HTTP endpoint.

5. **Harden webhooks and recovery**
   - Bind inbound events to a known tenant/channel and prevent cross-company status or opt-out changes.
   - Tighten login-ID recovery so tenant-identifying information cannot be resolved across companies.
   - Confirm public sign-up remains unavailable and administrator provisioning remains the only onboarding path.

6. **End-to-end verification**
   - Test platform owner, company admin, and agent sessions against the live preview.
   - Exercise create/edit/delete, search/filter, assignment/status, logo upload/remove, authentication/reset/re-login, persistence after refresh, and direct unauthorized attempts.
   - Use two companies to verify cross-company reads and writes fail.
   - Verify subscription limits and suspended-company behavior.
   - Re-run type checks, focused tests, database lints, and security scans.

## Completion report
Provide a concise matrix of verified workflows, repaired defects/RLS rules, role and tenant-isolation evidence, and only genuinely external blockers. No workflow will be called complete from UI presence alone.

## Technical notes
- Schema changes will be additive migrations applied through Lovable Cloud; RLS stays enabled.
- Existing private logo storage, secure company secrets, QR instance keys, routes, and visual design remain intact.
- External systems requiring unavailable infrastructure or credentials will be tested up to the exact request/response boundary and reported accurately.
