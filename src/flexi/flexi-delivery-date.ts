/**
 * ABRA Flexi `objednavka-prijata` — physical customer delivery date.
 *
 * Verified field semantics (ABRA Flexi / ABRA Gen help, 2026-08):
 *
 * | API field   | UI label (SK/CZ)     | Meaning |
 * |-------------|----------------------|---------|
 * | datVyst     | Vystaveno            | Document issue date — NOT delivery |
 * | datObjedn   | Objednáno            | Order placement date — NOT delivery |
 * | datTermin   | Termín               | Requested / promised delivery term — planning only |
 * | datDodani   | Datum dodání (lines) | Requested delivery date on line — informational / SCM |
 * | datReal     | Realizováno          | Full order realization when status → Hotovo — NOT proof of customer receipt |
 *
 * Green Angels sync today updates status/tracking from Flexi but does not record
 * a verified physical delivery timestamp in ABRA. Mapping realization or planned
 * dates to `Order.deliveredAt` would misstate consumer delivery for withdrawal UI.
 *
 * Until operations define and populate a genuine delivery source (manual Backstage,
 * carrier webhook, or a confirmed ABRA custom field), keep `deliveredAt` null.
 */
export function parseFlexiDeliveredAt(_doc: Record<string, unknown>): Date | null {
  return null
}
