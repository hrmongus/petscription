-- Projekt 3 (SPEC P4): zákaznícky portál /ucet.
--
-- 1) RLS policies: prihlásený zákazník (Supabase Auth, e-mail OTP) číta IBA svoje riadky. Prepojenie
--    customers.auth_user_id = auth.users.id robí server (service role) po overení kódu, nikdy klient.
--    Iba SELECT: všetky zmeny idú cez /api/ucet/* (service role po kontrole vlastníctva). anon nemá nič.
-- 2) subscriptions: zrušenie zákazníkom ku koncu obdobia (dátum, dôvod).
-- 3) ucet_login_attempts: limity na posielanie a overovanie kódov (iba service role).

-- (select auth.uid()) sa vyhodnotí raz na dotaz, nie pre každý riadok
create policy customers_own_select on customers for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy dogs_own_select on dogs for select to authenticated
  using (customer_id in (select id from customers where auth_user_id = (select auth.uid())));
create policy addresses_own_select on addresses for select to authenticated
  using (customer_id in (select id from customers where auth_user_id = (select auth.uid())));
create policy subscriptions_own_select on subscriptions for select to authenticated
  using (customer_id in (select id from customers where auth_user_id = (select auth.uid())));
create policy orders_own_select on orders for select to authenticated
  using (customer_id in (select id from customers where auth_user_id = (select auth.uid())));
create policy withdrawals_own_select on withdrawals for select to authenticated
  using (customer_id in (select id from customers where auth_user_id = (select auth.uid())));

grant select on customers, dogs, addresses, subscriptions, orders, withdrawals to authenticated;

-- zrušenie zákazníkom (Stripe cancel_at_period_end): kedy skončí, kedy a prečo o to požiadal
alter table subscriptions add column cancel_at timestamptz;
alter table subscriptions add column cancel_requested_at timestamptz;
alter table subscriptions add column cancel_reason text;

create table ucet_login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  kind text not null check (kind in ('code_sent', 'code_ignored', 'verify_failed', 'verify_ok')),
  ip text,
  at timestamptz not null default now()
);
create index ucet_login_attempts_email_idx on ucet_login_attempts (lower(email), kind, at desc);
alter table ucet_login_attempts enable row level security;
revoke all on ucet_login_attempts from anon, authenticated;
