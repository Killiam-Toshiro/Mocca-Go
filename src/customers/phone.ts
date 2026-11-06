/** Formato E.164 que guarda `customers.phone` (idéntico a su CHECK). */
export const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

const COLOMBIAN_MOBILE = /^3[0-9]{9}$/;
const INTERNATIONAL = /^[1-9][0-9]{7,14}$/;

/**
 * Normaliza un teléfono a E.164 (RN-19). Acepta celulares colombianos con o
 * sin prefijo (`3001234567`, `+57…`, `57…`, `0057…`) y números internacionales
 * con `+` o `00`. Devuelve `null` si no es interpretable; un fijo colombiano
 * (`+57 601…`) tampoco se acepta.
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, '');
  if (!/^\+?[0-9]+$/.test(cleaned)) return null;
  let international: string | null = null;
  if (cleaned.startsWith('+')) international = cleaned.slice(1);
  else if (cleaned.startsWith('00')) international = cleaned.slice(2);
  else if (COLOMBIAN_MOBILE.test(cleaned)) return `+57${cleaned}`;
  else if (/^57[0-9]{10}$/.test(cleaned)) international = cleaned;
  if (international === null) return null;
  if (international.startsWith('57'))
    return COLOMBIAN_MOBILE.test(international.slice(2))
      ? `+${international}`
      : null;
  return INTERNATIONAL.test(international) ? `+${international}` : null;
}
