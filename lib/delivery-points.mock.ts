import type { DeliveryPoint, PointService } from './delivery-points';

/*
 * TESTOVACIE výdajné miesta, keď nie sú FHB kľúče (lokálny vývoj, testy). Nie sú to skutočné miesta: kódy
 * začínajú TEST- a FHB ich neprijme.
 */
const p = (id: string, name: string, street: string, city: string, zip: string, kind: DeliveryPoint['kind'] = 'shop'): DeliveryPoint => ({ id, name, street, city, zip, country: 'SK', kind });

export const MOCK_POINTS: Record<PointService, DeliveryPoint[]> = {
  packeta: [
    p('TEST-PK01', 'TEST Packeta Staré Mesto', 'Obchodná 1', 'Bratislava', '81106'),
    p('TEST-PK02', 'TEST Z-BOX Ružinov', 'Ružinovská 10', 'Bratislava', '82101', 'box'),
    p('TEST-PK03', 'TEST Packeta Žilina', 'Národná 3', 'Žilina', '01001'),
    p('TEST-PK04', 'TEST Z-BOX Košice', 'Hlavná 30', 'Košice', '04001', 'box'),
    p('TEST-PK05', 'TEST Packeta Banská Bystrica', 'Námestie SNP 2', 'Banská Bystrica', '97401'),
  ],
  dpd: [
    p('TEST-DPD01', 'TEST DPD Pickup Staré Mesto', 'Obchodná 2', 'Bratislava', '81106'),
    p('TEST-DPD02', 'TEST DPD Pickup Box Petržalka', 'Panónska cesta 1', 'Bratislava', '85101', 'box'),
    p('TEST-DPD03', 'TEST DPD Pickup Žilina', 'Národná 5', 'Žilina', '01001'),
    p('TEST-DPD04', 'TEST AlzaBox Košice', 'Moldavská cesta 2', 'Košice', '04011', 'box'),
    p('TEST-DPD05', 'TEST DPD Pickup Prešov', 'Hlavná 50', 'Prešov', '08001'),
  ],
};
