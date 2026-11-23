-- P7: ochrana pred duplicitou serverových udalostí do PostHogu na našej strane. Pred odoslaním sa vloží kľúč
-- (napr. order:<id>:order_completed); ak už existuje, udalosť sa neposiela. Najviac raz (zlyhané odoslanie sa neopakuje).
-- Kľúč s id ostáva iba v našej DB; udalosť bez súhlasu nesie náhodné distinct_id aj uuid.
create table analytics_sent (
  key text primary key,
  event text not null,
  sent_at timestamptz not null default now()
);
alter table analytics_sent enable row level security;
revoke all on analytics_sent from anon, authenticated;
