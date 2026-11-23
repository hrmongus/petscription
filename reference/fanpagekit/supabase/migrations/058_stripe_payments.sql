-- Stripe payments: premium aesthetics.
--
-- Every curated aesthetic is visible and previewable by everyone. Exporting a
-- video that uses one needs either:
--
--   * an aesthetic unlock ($5, one collection, forever), or
--   * an export pass ($2, one video, any collection).
--
-- Both are one-off Stripe Checkout payments recorded here, one row per paid
-- Checkout Session. Writes happen from the service role only (the Stripe
-- webhook and the post-checkout confirm route), so there is no insert/update
-- policy. Users can read their own rows.

-- Which collections cost money: every one, except to the user who owns it (a
-- group they created is always free to them — lib/billing/entitlements.ts).
-- Set to false to give a collection away.
alter table aesthetics
  add column if not exists premium boolean not null default true;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- aesthetic_unlock | export_pass
  kind text not null,
  -- Set for aesthetic_unlock.
  aesthetic_id uuid references aesthetics (id) on delete set null,
  -- The track the pass was bought from. A pass is spent on any export, this
  -- track's first.
  track_id uuid references tracks (id) on delete set null,
  -- paid | refunded
  status text not null default 'paid',
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_checkout_session_id text not null,
  stripe_payment_intent_id text,
  customer_email text,
  livemode boolean not null default false,
  -- Export passes only. `consumed_at` null = unspent. A failed render hands
  -- the pass back (trigger below). Deleting a finished video does not: the
  -- render id goes null, the pass stays spent.
  consumed_render_id uuid references renders (id) on delete set null,
  consumed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint payments_kind_check
    check (kind in ('aesthetic_unlock', 'export_pass')),
  constraint payments_status_check
    check (status in ('paid', 'refunded')),
  constraint payments_aesthetic_unlock_has_aesthetic
    check (kind <> 'aesthetic_unlock' or aesthetic_id is not null),
  -- Webhook and confirm route can both fulfil the same session; this makes
  -- the second one a no-op.
  constraint payments_checkout_session_key unique (stripe_checkout_session_id)
);

create index if not exists payments_user_idx
  on payments (user_id, created_at desc);

create index if not exists payments_payment_intent_idx
  on payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists payments_unspent_pass_idx
  on payments (user_id)
  where kind = 'export_pass' and status = 'paid' and consumed_at is null;

create index if not exists payments_consumed_render_idx
  on payments (consumed_render_id)
  where consumed_render_id is not null;

alter table payments enable row level security;

drop policy if exists "Users can view own payments" on payments;
create policy "Users can view own payments"
  on payments for select
  to authenticated
  using (auth.uid () = user_id);

-- Spend one unspent export pass on a render. Prefers a pass bought from this
-- track. Returns the payment id, or null when the user has none left.
-- `skip locked` keeps two exports racing for the last pass from both winning.
create or replace function consume_export_pass(
  p_user uuid,
  p_render uuid,
  p_track uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pass_id uuid;
begin
  select id into pass_id
  from payments
  where user_id = p_user
    and kind = 'export_pass'
    and status = 'paid'
    and consumed_at is null
  order by (track_id is not distinct from p_track) desc, created_at asc
  limit 1
  for update skip locked;

  if pass_id is null then
    return null;
  end if;

  update payments
  set consumed_render_id = p_render,
      consumed_at = now()
  where id = pass_id;

  return pass_id;
end;
$$;

revoke all on function consume_export_pass (uuid, uuid, uuid) from public, anon, authenticated;

-- A render that fails never delivered the video it was paid for: put the pass
-- back so the retry is free.
create or replace function release_export_pass_on_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'failed' and old.status is distinct from 'failed' then
    update payments
    set consumed_render_id = null,
        consumed_at = null
    where consumed_render_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists renders_release_export_pass on renders;
create trigger renders_release_export_pass
  after update of status on renders
  for each row
  execute function release_export_pass_on_failure();
