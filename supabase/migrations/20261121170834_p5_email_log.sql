-- Krok 5 (P5): evidencia transakčných emailov. Kľúč = idempotencia (napr. order-confirm:<order_id>), aby webhook,
-- cron ani notifikácia FHB nikdy neposlali ten istý email dvakrát (idempotency key v Resend platí iba 24 h).
create table email_log (
  key text primary key,
  kind text not null,
  to_email text not null,
  order_id uuid references orders(id) on delete set null,
  status text not null check (status in ('sent', 'skipped')),
  provider_id text,
  sent_at timestamptz not null default now()
);
create index email_log_order_id_idx on email_log (order_id);

alter table email_log enable row level security;
revoke all on email_log from anon, authenticated;

-- rýchle vyhľadanie FHB notifikácií a eventov podľa objednávky
create index if not exists fhb_events_order_id_received_idx on fhb_events (order_id, received_at desc);
