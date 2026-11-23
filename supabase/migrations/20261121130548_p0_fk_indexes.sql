-- Indexy pre cudzie kľúče, ktoré nemali krycí index (Supabase performance advisor 0001_unindexed_foreign_keys).
create index subscriptions_address_idx on subscriptions (address_id);
create index subscriptions_dog_idx on subscriptions (dog_id);
create index withdrawals_order_idx on withdrawals (order_id) where order_id is not null;
create index withdrawals_subscription_idx on withdrawals (subscription_id) where subscription_id is not null;
