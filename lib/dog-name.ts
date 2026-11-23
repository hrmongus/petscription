/*
 * Meno psa v 1., 3. a 4. páde pre emaily („granule pre Bodku“, „vystačí Bodke“). Heuristika pre bežné slovenské
 * a cudzie mená podľa pohlavia z dotazníka (`pes` / `fenka`). Kde si nie je istá (viac slov, pohyblivé -e- ako
 * Šmolek → Šmolka, neznáme koncovky), použije bezpečný tvar „tvojho psa / tvojmu psovi“ (fenka: „tvoju fenku /
 * tvojej fenke“), ktorý je vždy gramaticky správny. Pády sa neukladajú, počítajú sa pri odoslaní emailu.
 */
export type DogCases = { nom: string; acc: string; dat: string; poss: 'jeho' | 'jej'; declined: boolean };

const VOWEL_END = /[aeiouyáéíóúýäô]$/i;

function generic(female: boolean, name: string | null): DogCases {
  return female
    ? { nom: name || 'tvoja fenka', acc: 'tvoju fenku', dat: 'tvojej fenke', poss: 'jej', declined: false }
    : { nom: name || 'tvoj pes', acc: 'tvojho psa', dat: 'tvojmu psovi', poss: 'jeho', declined: false };
}

export function dogCases(rawName: string | null | undefined, sex?: string | null): DogCases {
  // veľké začiatočné písmeno každého slova („gut“ → „Gut“, „bruno-max“ → „Bruno-Max“); zvyšok mena nemeníme
  const name = (rawName ?? '').trim().replace(/\s+/g, ' ').replace(/(^|[\s-])(\p{Ll})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('sk'));
  const female = sex ? sex === 'fenka' : /a$/i.test(name);
  if (!name || !/^\p{L}[\p{L}'-]*$/u.test(name) || name.length > 20) return generic(female, name || null);
  const ok = (acc: string, dat: string): DogCases => ({ nom: name, acc, dat, poss: female ? 'jej' : 'jeho', declined: true });
  const stem = name.slice(0, -1);
  const last = name.slice(-1).toLowerCase();

  if (female) {
    if (/ia$/i.test(name)) return ok(`${stem}u`, `${stem}i`); // Mia → Miu, Mii
    if (last === 'a') return ok(`${stem}u`, `${stem}e`); // Bodka → Bodku, Bodke; Luna → Lunu, Lune
    if (/[^aeiouyáéíóúýäô]$/i.test(name) || /[iyeé]$/i.test(name)) return ok(name, name); // Daisy, Ruby, Bell: nesklonné
    return generic(true, name);
  }
  // pes
  if (last === 'o') return ok(`${stem}a`, `${stem}ovi`); // Bruno → Bruna, Brunovi; Pajko → Pajka, Pajkovi
  if (last === 'a') return ok(`${stem}u`, `${stem}ovi`); // Kuba → Kubu, Kubovi
  if (/[iy]$/i.test(name)) return ok(`${name}ho`, `${name}mu`); // Lucky → Luckyho, Luckymu; Teddy
  if (/ie$/i.test(name)) return ok(`${name}ho`, `${name}mu`); // Charlie → Charlieho, Charliemu
  if (VOWEL_END.test(name)) return generic(false, name);
  if (/(ek|ec|ok|el)$/i.test(name) && name.length > 3) return generic(false, name); // Šmolek → Šmolka (pohyblivé e), radšej nie
  return ok(`${name}a`, `${name}ovi`); // Rex → Rexa, Rexovi; Bobík → Bobíka, Bobíkovi
}
