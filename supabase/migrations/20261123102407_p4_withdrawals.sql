-- Projekt 3 (SPEC P4): odstúpenie od zmluvy cez /odstupenie (§ 20a zák. 108/2024 Z. z.).
-- Iba pridané stĺpce (nullable / s predvolenou hodnotou), existujúci kód ani admin (P3) sa nerozbijú.
--
--   customer_id   zákazník, ak e-mail z formulára sedí s objednávkou (inak null a needs_review)
--   deadline_at   koniec 14-dňovej lehoty (koniec dňa prevzatia prvého tovaru + 14 dní, Europe/Bratislava);
--                 null = tovar ešte nebol doručený (lehota neplynie) alebo objednávka nenájdená
--   in_deadline   odstúpenie prišlo v lehote (null = nevieme, napr. objednávka nenájdená)
--   needs_review  odstúpenie treba posúdiť v admine (po lehote, objednávka nenájdená, e-mail nesedí, zlyhala akcia)
--   review_note   prečo treba posúdiť (čitateľný text pre admin)
--   actions       čo server po potvrdení automaticky urobil (zrušenie predplatného, DELETE vo FHB…), jsonb
alter table withdrawals add column customer_id uuid references customers (id) on delete set null;
alter table withdrawals add column deadline_at timestamptz;
alter table withdrawals add column in_deadline boolean;
alter table withdrawals add column needs_review boolean not null default false;
alter table withdrawals add column review_note text;
alter table withdrawals add column actions jsonb not null default '[]'::jsonb;

-- order_id a subscription_id majú index už z p0_fk_indexes
create index withdrawals_customer_idx on withdrawals (customer_id) where customer_id is not null;
create index withdrawals_review_idx on withdrawals (submitted_at desc) where needs_review;
-- ochrana proti zneužitiu formulára: počet odstúpení z jedného e-mailu za deň
create index withdrawals_email_idx on withdrawals (lower(email), submitted_at desc);

comment on column withdrawals.submitted_at is 'čas prijatia = čas servera (§ 20a), uvádza sa v potvrdzovacom e-maile';
