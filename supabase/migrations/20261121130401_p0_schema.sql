-- P0: dátový model predaja, predplatného a doručenia (SPEC.md, časť P0 → Dátový model).
--
-- Prístup: všetky zápisy a čítania idú zo servera cez service role (Stripe/FHB webhooky, /api/checkout, neskôr
-- admin P3 a /api/ucet P4 s kontrolou vlastníctva na serveri). RLS je zapnuté na každej tabuľke a nie je tu žiadna
-- policy → anon ani authenticated nevidia nič (service role RLS obchádza). Policies pre zákaznícky portál sa
-- pridajú až v P4, ak budú treba.
--
-- Stavy sú text + check (nie Postgres enum), aby sa dali rozšíriť bez prepisu typu.

create table customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  email text not null,
  name text,
  -- medzinárodný formát (+421…), povinný pre FHB
  phone text,
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_email_len check (char_length(email) between 3 and 254)
);
-- jeden zákazník na email (bez ohľadu na veľkosť písmen)
create unique index customers_email_key on customers (lower(email));

create table addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  name text not null,
  street text,
  city text,
  zip text,
  country text not null default 'SK',
  carrier text not null,
  -- spôsob doručenia (SPEC P1b): Packeta výdajné miesto / Z-BOX, SPS ParcelShop, SPS kuriér na adresu
  delivery_method text not null,
  -- výdajné miesto (Packeta aj SPS ParcelShop): kód, ktorý ide do FHB delivery_point, a čitateľný popis
  point_id text,
  point_label text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint addresses_carrier_check check (carrier in ('sps', 'packeta')),
  constraint addresses_method_check check (delivery_method in ('packeta_point', 'sps_parcelshop', 'sps_courier')),
  constraint addresses_method_carrier check (
    (delivery_method = 'packeta_point' and carrier = 'packeta')
    or (delivery_method in ('sps_parcelshop', 'sps_courier') and carrier = 'sps')
  ),
  constraint addresses_point_required check (delivery_method = 'sps_courier' or point_id is not null),
  constraint addresses_courier_address check (
    delivery_method <> 'sps_courier' or (street is not null and city is not null and zip is not null)
  )
);
create index addresses_customer_idx on addresses (customer_id);
create unique index addresses_one_default on addresses (customer_id) where is_default;

create table dogs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  name text not null,
  -- odpovede dotazníka po validácii na serveri (lib/engine-server.ts AnswersSchema)
  answers jsonb not null,
  weight_kg numeric(5, 2),
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dogs_customer_idx on dogs (customer_id);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete restrict,
  dog_id uuid not null references dogs (id) on delete restrict,
  address_id uuid not null references addresses (id) on delete restrict,
  stripe_subscription_id text unique,
  status text not null default 'active',
  -- receptúra = PRODUCTS[].id v engine.js
  product_id text not null,
  bag_id text not null,
  grams_per_day integer not null,
  -- D = interval predplatného v dňoch (SPEC §1)
  days_per_bag integer not null,
  unit_amount_cents integer not null,
  plan text not null default 'mesiac',
  next_charge_at timestamptz,
  last_delivered_at timestamptz,
  -- vstupy a výstup engine pri poslednom prepočte
  engine_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (status in ('active', 'paused', 'past_due', 'cancelled')),
  constraint subscriptions_bag_check check (bag_id in ('4', '9', '18')),
  constraint subscriptions_plan_check check (plan in ('mesiac')),
  constraint subscriptions_days_check check (days_per_bag > 0),
  constraint subscriptions_grams_check check (grams_per_day > 0),
  constraint subscriptions_amount_check check (unit_amount_cents >= 0)
);
create index subscriptions_customer_idx on subscriptions (customer_id);
create index subscriptions_status_idx on subscriptions (status, next_charge_at);

create table orders (
  id uuid primary key default gen_random_uuid(),
  -- FHB variable_symbol: iba číslice, max 10, unikátne
  number bigserial not null unique,
  customer_id uuid not null references customers (id) on delete restrict,
  subscription_id uuid references subscriptions (id) on delete restrict,
  kind text not null,
  -- checkout session / invoice / payment intent id; idempotencia webhookov
  stripe_ref text not null unique,
  amount_cents integer not null,
  -- [{sku, qty}]
  items jsonb not null default '[]'::jsonb,
  -- snapshot adresy a kontaktu v čase objednávky
  ship_to jsonb not null,
  status text not null default 'paid',
  -- štruktúrovaná chyba FHB (400 → violations), SPEC P2
  fhb_error jsonb,
  tracking jsonb,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_kind_check check (kind in ('first', 'renewal', 'one_off')),
  constraint orders_status_check check (status in (
    'paid', 'sent_to_fhb', 'fhb_error', 'confirmed', 'sent', 'delivered', 'returned', 'cancelled', 'refunded'
  )),
  constraint orders_number_check check (number between 1 and 9999999999),
  constraint orders_amount_check check (amount_cents >= 0),
  constraint orders_subscription_kind check ((kind = 'one_off') = (subscription_id is null))
);
create index orders_customer_idx on orders (customer_id, created_at desc);
create index orders_subscription_idx on orders (subscription_id, created_at desc) where subscription_id is not null;
create index orders_status_idx on orders (status, created_at);

-- idempotencia Stripe webhookov: event sa spracuje raz
create table stripe_events (
  event_id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

create table fhb_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete set null,
  type text not null,
  payload jsonb,
  received_at timestamptz not null default now()
);
create index fhb_events_order_idx on fhb_events (order_id, received_at desc);

create table withdrawals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete set null,
  subscription_id uuid references subscriptions (id) on delete set null,
  name text not null,
  email text not null,
  contract_ref text not null,
  reason text,
  -- snapshot formulára
  content jsonb not null,
  -- čas servera (§ 20a zák. 108/2024 Z. z.)
  submitted_at timestamptz not null default now(),
  confirmation_sent_at timestamptz,
  status text not null default 'received',
  constraint withdrawals_status_check check (status in ('received', 'return_pending', 'refunded', 'rejected'))
);
create index withdrawals_status_idx on withdrawals (status, submitted_at);

create table audit_log (
  id bigint generated always as identity primary key,
  -- admin email / 'customer' / 'system'
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity, entity_id, at desc);

-- updated_at
create function set_updated_at() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_updated_at before update on customers for each row execute function set_updated_at();
create trigger dogs_updated_at before update on dogs for each row execute function set_updated_at();
create trigger subscriptions_updated_at before update on subscriptions for each row execute function set_updated_at();
create trigger orders_updated_at before update on orders for each row execute function set_updated_at();

-- RLS všade, bez policies (iba service role)
alter table customers enable row level security;
alter table addresses enable row level security;
alter table dogs enable row level security;
alter table subscriptions enable row level security;
alter table orders enable row level security;
alter table stripe_events enable row level security;
alter table fhb_events enable row level security;
alter table withdrawals enable row level security;
alter table audit_log enable row level security;

-- druhá poistka: klientske roly nemajú na tabuľky ani granty
revoke all on customers, addresses, dogs, subscriptions, orders, stripe_events, fhb_events, withdrawals, audit_log
  from anon, authenticated;
revoke all on sequence orders_number_seq from anon, authenticated;
