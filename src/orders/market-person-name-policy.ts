/**
 * Deploy-market person-name usability (NOT UI locale).
 *
 * Current SK policy: Latin script only.
 * Current UA policy: Cyrillic script only.
 *
 * To allow Cyrillic on SK later: add `'cyrillic'` to
 * `PERSON_NAME_POLICY_BY_MARKET.sk.allowedScripts` here AND in the shop twin
 * (`green-angels-shop/lib/settings/market-person-name-policy.ts`), then update
 * the matching contract tests. Order / profile-fill call sites must not change.
 */

export type MarketRegionCode = 'ua' | 'sk'

export type PersonNameScript = 'latin' | 'cyrillic'

export type PersonNameMarketPolicy = {
  allowedScripts: readonly PersonNameScript[]
}

/**
 * Single place to flip SK Cyrillic acceptance (API runtime).
 * Keep identical to shop `PERSON_NAME_POLICY_BY_MARKET`.
 */
export const PERSON_NAME_POLICY_BY_MARKET: Record<
  MarketRegionCode,
  PersonNameMarketPolicy
> = {
  sk: { allowedScripts: ['latin'] },
  ua: { allowedScripts: ['cyrillic'] },
}

const LATIN_NAME_REGEX =
  /^[A-Za-zÀ-ÖØ-öø-ÿĀ-žĄąĆćČčĎďĐđĘęĚěĹĺĽľŁłŃńŇňŐőŘřŚśŠšŤťŮůŰűŹźŻżŽž'ʼ\- ]{2,}$/
const LATIN_LETTER_REGEX = /[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/
const CYRILLIC_NAME_REGEX = /^[А-Яа-яІіЇїЄєҐґ'ʼ]{2,}$/

function policyFor(region: MarketRegionCode): PersonNameMarketPolicy {
  return PERSON_NAME_POLICY_BY_MARKET[region] ?? PERSON_NAME_POLICY_BY_MARKET.ua
}

function matchesLatin(trimmed: string): boolean {
  if (!LATIN_NAME_REGEX.test(trimmed)) return false
  return LATIN_LETTER_REGEX.test(trimmed)
}

function matchesCyrillic(trimmed: string): boolean {
  return CYRILLIC_NAME_REGEX.test(trimmed)
}

function matchesScript(trimmed: string, script: PersonNameScript): boolean {
  if (script === 'latin') return matchesLatin(trimmed)
  return matchesCyrillic(trimmed)
}

/** True when the name is usable under the deploy-market person-name policy. */
export function isPersonNameUsableForMarket(
  value: string | null | undefined,
  region: MarketRegionCode,
): boolean {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return false
  const { allowedScripts } = policyFor(region)
  return allowedScripts.some((script) => matchesScript(trimmed, script))
}

export function arePersonNamesUsableForMarket(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  region: MarketRegionCode,
): boolean {
  return (
    isPersonNameUsableForMarket(firstName, region) &&
    isPersonNameUsableForMarket(lastName, region)
  )
}
