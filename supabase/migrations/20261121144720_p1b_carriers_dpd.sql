-- Krok 3 (P1b), zmena 21. 11. 2026: SPS iba ako kuriér na adresu; pribudlo DPD (odberné miesta a boxy).
-- Spôsoby doručenia: packeta_point, dpd_pickup, sps_courier (pravidlá podľa balenia v public/granula/doprava-config.js).
alter table addresses drop constraint addresses_carrier_check;
alter table addresses drop constraint addresses_method_check;
alter table addresses drop constraint addresses_method_carrier;
alter table addresses drop constraint addresses_point_required;
alter table addresses drop constraint addresses_courier_address;

alter table addresses add constraint addresses_carrier_check check (carrier in ('packeta', 'dpd', 'sps'));
alter table addresses add constraint addresses_method_check check (delivery_method in ('packeta_point', 'dpd_pickup', 'sps_courier'));
alter table addresses add constraint addresses_method_carrier check (
  (delivery_method = 'packeta_point' and carrier = 'packeta')
  or (delivery_method = 'dpd_pickup' and carrier = 'dpd')
  or (delivery_method = 'sps_courier' and carrier = 'sps')
);
alter table addresses add constraint addresses_point_required check (delivery_method = 'sps_courier' or point_id is not null);
alter table addresses add constraint addresses_courier_address check (
  delivery_method <> 'sps_courier' or (street is not null and city is not null and zip is not null)
);
comment on column addresses.point_id is 'kód výdajného miesta = FHB delivery_point (Packeta: číslo miesta, DPD: SK…)';
