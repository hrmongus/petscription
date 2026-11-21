import type { DeliveryPoint } from './delivery-points';

/*
 * TESTOVACIE výdajné miesta SPS, keď nie sú FHB kľúče (lokálny vývoj, testy). Nie sú to skutočné miesta: kódy
 * začínajú TEST- a FHB ich neprijme. Súradnice približne v centrách miest, aby sa dala odskúšať mapa.
 */
const p = (id: string, name: string, street: string, city: string, zip: string, lat: number, lng: number, kind: DeliveryPoint['kind'] = 'parcelshop'): DeliveryPoint => ({
  id, name, street, city, zip, country: 'SK', kind, lat, lng,
});

export const SPS_MOCK_POINTS: DeliveryPoint[] = [
  p('TEST-BA01', 'TEST ParcelShop Staré Mesto', 'Obchodná 1', 'Bratislava', '81106', 48.1466, 17.1077),
  p('TEST-BA02', 'TEST ParcelShop Ružinov', 'Ružinovská 10', 'Bratislava', '82101', 48.1530, 17.1520),
  p('TEST-BA03', 'TEST balíkovo box Petržalka', 'Panónska cesta 1', 'Bratislava', '85101', 48.1110, 17.1090, 'box'),
  p('TEST-TT01', 'TEST ParcelShop Trnava', 'Hlavná 5', 'Trnava', '91701', 48.3774, 17.5872),
  p('TEST-NR01', 'TEST ParcelShop Nitra', 'Štefánikova trieda 20', 'Nitra', '94901', 48.3080, 18.0870),
  p('TEST-ZA01', 'TEST ParcelShop Žilina', 'Národná 3', 'Žilina', '01001', 49.2231, 18.7394),
  p('TEST-ZA02', 'TEST balíkovo box Žilina Vlčince', 'Vlčinská 1', 'Žilina', '01008', 49.2090, 18.7560, 'box'),
  p('TEST-BB01', 'TEST ParcelShop Banská Bystrica', 'Námestie SNP 2', 'Banská Bystrica', '97401', 48.7363, 19.1462),
  p('TEST-PO01', 'TEST ParcelShop Prešov', 'Hlavná 50', 'Prešov', '08001', 48.9984, 21.2339),
  p('TEST-KE01', 'TEST ParcelShop Košice Staré Mesto', 'Hlavná 30', 'Košice', '04001', 48.7164, 21.2611),
  p('TEST-KE02', 'TEST balíkovo box Košice Terasa', 'Moldavská cesta 2', 'Košice', '04011', 48.7120, 21.2310, 'box'),
  p('TEST-TN01', 'TEST ParcelShop Trenčín', 'Mierové námestie 4', 'Trenčín', '91101', 48.8945, 18.0444),
];
