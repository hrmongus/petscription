-- P7: všetky odpovede z dotazníka (SPEC P7). Záznam vzniká pri prvej odpovedi (POST /api/quiz) a priebežne sa
-- dopĺňa po každom kroku, aj keď človek nezaplatí. Bez emailu je anonymný (id z prehliadača, žiadne osobné údaje
-- okrem mena psa v answers). Pri checkoute sa spáruje so zákazníkom (email, customer_id), po platbe s objednávkou.
-- Retencia (cron retention): zákazník bez objednávky po 90 dňoch zmizne, jeho sessions sa anonymizujú.
create table quiz_sessions (
  id uuid primary key,                       -- crypto.randomUUID() v prehliadači
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_step text,                            -- krok-1 … krok-7, vysledok, objednavka, platba, hotovo
  max_step smallint not null default 0 check (max_step between 0 and 7),
  completed boolean not null default false,  -- dotazník dokončený (výsledok)
  answers jsonb not null default '{}'::jsonb,
  result jsonb,                              -- zo servera (engine): recept, balenie, gramy, D, cena
  plan text check (plan in ('mesiac', 'raz')),
  bag_id text check (bag_id in ('4', '9', '18')),
  delivery_method text,
  utm jsonb,                                 -- utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid/gclid (iba príznak)
  referrer text,                             -- iba doména
  landing_path text,
  email text,
  customer_id uuid references customers (id) on delete set null,
  dog_id uuid references dogs (id) on delete set null,
  checkout_started_at timestamptz,
  order_id uuid references orders (id) on delete set null,
  paid_at timestamptz
);
create index quiz_sessions_started_at_idx on quiz_sessions (started_at desc);
create index quiz_sessions_customer_id_idx on quiz_sessions (customer_id) where customer_id is not null;
create index quiz_sessions_order_id_idx on quiz_sessions (order_id) where order_id is not null;
create index quiz_sessions_dog_id_idx on quiz_sessions (dog_id) where dog_id is not null;
create index quiz_sessions_email_idx on quiz_sessions (lower(email)) where email is not null;

create trigger quiz_sessions_updated_at before update on quiz_sessions for each row execute function set_updated_at();

alter table quiz_sessions enable row level security;
revoke all on quiz_sessions from anon, authenticated;
