-- Projekt 3 (SPEC P4, §10.25): lehota na refund a stav vrátenia tovaru pri odstúpení (zobrazuje admin P3).
-- Refund sa NIKDY nerobí automaticky: admin ho spraví po prijatí vráteného vreca a kontrole stavu.
--
--   refund_due_at        najneskorší refund = koniec dňa prijatia odstúpenia + 14 dní (Europe/Bratislava)
--   return_status        not_needed   tovar neodišiel zo skladu (objednávka zastavená) → refund bez vrátenia
--                        awaiting     tovar odišiel / balí sa → čaká sa na vrátenie vreca
--                        received     vrece prišlo späť (vyplní admin)
--                        not_returned zákazník tovar nevrátil (vyplní admin)
--   return_received_at   kedy vrece prišlo späť (admin)
--   return_condition     stav po kontrole (admin): ok | opened | damaged
--   return_note          poznámka ku kontrole (admin)
--   refunded_at, refund_amount_cents, stripe_refund_id   refund (admin, Stripe)
alter table withdrawals add column refund_due_at timestamptz;
alter table withdrawals add column return_status text not null default 'awaiting';
alter table withdrawals add column return_received_at timestamptz;
alter table withdrawals add column return_condition text;
alter table withdrawals add column return_note text;
alter table withdrawals add column refunded_at timestamptz;
alter table withdrawals add column refund_amount_cents integer;
alter table withdrawals add column stripe_refund_id text;

alter table withdrawals add constraint withdrawals_return_status_check check (return_status in ('not_needed', 'awaiting', 'received', 'not_returned'));
alter table withdrawals add constraint withdrawals_return_condition_check check (return_condition is null or return_condition in ('ok', 'opened', 'damaged'));
alter table withdrawals add constraint withdrawals_refund_amount_check check (refund_amount_cents is null or refund_amount_cents >= 0);

-- doterajšie (testovacie) záznamy
update withdrawals set refund_due_at = submitted_at + interval '14 days' where refund_due_at is null;
update withdrawals set return_status = 'not_needed' where status = 'received';

create index withdrawals_refund_open_idx on withdrawals (refund_due_at) where refunded_at is null;
