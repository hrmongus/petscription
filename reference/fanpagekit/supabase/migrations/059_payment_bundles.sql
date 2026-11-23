-- Aesthetic bundles: one Checkout Session can unlock several aesthetics
-- (the store's "buy 4, get the 5th free" — lib/billing/catalog.ts).
--
-- Each unlock stays its own `payments` row, so every entitlement read keeps
-- working unchanged. A session now writes one row per aesthetic, numbered by
-- `line` (its position in the order). Free bundle lines are rows with
-- amount_cents = 0.
--
-- Idempotency moves from the session id alone to (session, line): the webhook
-- and the confirm route can still both fulfil the same session, and the second
-- write is still a no-op. Deploy this before the code that writes `line`.

alter table payments
  add column if not exists line smallint not null default 0;

alter table payments
  drop constraint if exists payments_checkout_session_key;

alter table payments
  drop constraint if exists payments_checkout_session_line_key;

alter table payments
  add constraint payments_checkout_session_line_key
  unique (stripe_checkout_session_id, line);
