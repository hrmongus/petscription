-- FHB 24. 11. 2026: dopravcovia chcú skutočnú adresu zákazníka aj pri výdajnom mieste (recipient.address);
-- výdajné miesto ostáva v delivery_point. street/city/zip = vždy adresa zákazníka, point_* = adresa výdajného miesta.
alter table public.addresses
  add column if not exists point_street text,
  add column if not exists point_city text,
  add column if not exists point_zip text;

-- doterajšie riadky výdajných miest mali v street/city/zip adresu miesta → presunúť do point_*
update public.addresses
set point_street = street, point_city = city, point_zip = zip, street = null, city = null, zip = null
where delivery_method <> 'sps_courier' and point_street is null and street is not null;
