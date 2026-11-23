-- P3 (admin): opätovné odoslanie vrátenej zásielky = nová objednávka bez platby, ktorá odkazuje na pôvodnú.
-- stripe_ref takej objednávky je `reship:<pôvodná>:<n>` (unikátny), amount_cents 0, kind a subscription_id ako pôvodná.
alter table orders add column reship_of uuid references orders (id) on delete set null;
create index orders_reship_of_idx on orders (reship_of) where reship_of is not null;
comment on column orders.reship_of is 'admin: opätovné odoslanie (vrátená zásielka) → pôvodná objednávka';
