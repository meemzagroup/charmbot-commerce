# Repair live WhatsApp inbox pipeline

## Scope
- Preserve the existing QR/connection flow and all unrelated CRM behavior.
- Repair only Evolution API live messaging, secure tenant routing, persistence, and inbox updates.

## Implementation
1. Register the CRM's public webhook on each connected Evolution instance using its immutable `instance_key`, with incoming-message, delivery-update, and connection events enabled.
2. Accept current Evolution payload variants, reject unknown/inactive instances, and map each event to exactly one company and WhatsApp channel before any write.
3. Normalize sender numbers, create or link a tenant-scoped customer, create/reuse the channel-specific thread, and store incoming messages with provider IDs for retry-safe deduplication.
4. Keep privileged webhook writes server-side while preserving existing RLS and cross-company isolation.
5. Add scoped live database subscriptions for threads and messages so the inbox refreshes automatically; keep “All WhatsApp numbers” as the union of the company's channels.
6. Improve webhook error logging and responses so failed deliveries identify the stage without exposing credentials or customer data.

## Verification
- Confirm the public endpoint rejects unsigned calls and accepts a correctly signed Evolution-shaped event.
- Verify one new-contact event creates the customer, channel-specific thread, and message; replaying it creates no duplicate.
- Verify events for two distinct channel instance keys stay separated and both appear under “All WhatsApp numbers.”
- Verify a channel filter shows only its own conversations and outgoing replies still use that channel's `instance_key`.
- Run security checks and application tests.

## External test boundary
A genuine phone-to-phone round trip requires live messages sent to two connected WhatsApp numbers. I will verify every controllable stage and report the real-device steps as unverified unless those messages arrive during testing.
