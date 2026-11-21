-- Buyers, what they paid, and which packs each payment unlocked. Written only by the server
-- (lib/db.ts, with the secret key) from Stripe fulfillment; nothing here is readable from the browser.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text,
  -- Latest Stripe customer for this email. One-time checkouts create a new customer each time, so a buyer can
  -- have several; each transaction keeps its own.
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  kind text not null check (kind in ('order', 'upsell', 'renewal')),
  -- Idempotency key: the Checkout Session (order), PaymentIntent (upsell) or Invoice (renewal) id.
  -- Stripe redelivers webhooks, so recording the same payment twice is a no-op.
  stripe_ref text not null unique,
  -- The order's Checkout Session; for an upsell, the order it was added to.
  checkout_session_id text,
  payment_intent_id text,
  invoice_id text,
  subscription_id text,
  stripe_customer_id text,
  plan text check (plan in ('once', 'monthly')),
  description text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'usd',
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_checkout_session_id_idx on public.transactions (checkout_session_id);
create index transactions_subscription_id_idx on public.transactions (subscription_id);

create table public.purchased_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  pack_slug text not null check (pack_slug in ('golden-hour', 'midnight-city', 'coastal-drive', 'forest-trail')),
  created_at timestamptz not null default now(),
  unique (transaction_id, pack_slug)
);

create index purchased_kits_user_id_idx on public.purchased_kits (user_id);

-- Server-only: RLS on with no policies, and no grants to the browser roles. The secret key (service_role) bypasses RLS.
alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.purchased_kits enable row level security;
revoke all on public.users, public.transactions, public.purchased_kits from anon, authenticated;

/*
 * Records one paid Stripe payment in a single database transaction: upserts the buyer by email, inserts the
 * payment (once per stripe_ref) and the packs it unlocked. Safe to call again for the same payment.
 * Returns the transaction id.
 */
create function public.record_purchase(
  p_email text,
  p_kind text,
  p_stripe_ref text,
  p_description text,
  p_amount_cents integer,
  p_currency text,
  p_packs text[],
  p_name text default null,
  p_stripe_customer_id text default null,
  p_checkout_session_id text default null,
  p_payment_intent_id text default null,
  p_invoice_id text default null,
  p_subscription_id text default null,
  p_plan text default null,
  p_paid_at timestamptz default null
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_tx_id uuid;
begin
  insert into public.users (email, name, stripe_customer_id)
  values (lower(trim(p_email)), nullif(trim(p_name), ''), p_stripe_customer_id)
  on conflict (email) do update set
    name = coalesce(excluded.name, public.users.name),
    stripe_customer_id = coalesce(excluded.stripe_customer_id, public.users.stripe_customer_id),
    updated_at = now()
  returning id into v_user_id;

  insert into public.transactions (
    user_id, kind, stripe_ref, checkout_session_id, payment_intent_id, invoice_id, subscription_id,
    stripe_customer_id, plan, description, amount_cents, currency, paid_at
  ) values (
    v_user_id, p_kind, p_stripe_ref, p_checkout_session_id, p_payment_intent_id, p_invoice_id, p_subscription_id,
    p_stripe_customer_id, p_plan, p_description, p_amount_cents, lower(p_currency), coalesce(p_paid_at, now())
  )
  on conflict (stripe_ref) do nothing
  returning id into v_tx_id;

  if v_tx_id is null then
    select id into v_tx_id from public.transactions where stripe_ref = p_stripe_ref;
  end if;

  insert into public.purchased_kits (user_id, transaction_id, pack_slug)
  select v_user_id, v_tx_id, slug from unnest(coalesce(p_packs, '{}')) as slug
  on conflict (transaction_id, pack_slug) do nothing;

  return v_tx_id;
end;
$$;

revoke execute on function public.record_purchase from public, anon, authenticated;
grant execute on function public.record_purchase to service_role;
