/**
 * Unicode human person-name rules (Latin + Cyrillic + EU diacritics).
 * Twin of shop `lib/validation/person-name.ts` for charset; this regex also
 * requires ≥1 letter so `@Matches(PERSON_NAME_REGEX)` ≡ `isValidPersonName`.
 */

const PERSON_NAME_LETTER_CLASS =
  'A-Za-zÀ-ÖØ-öø-ÿĀ-žĄąĆćČčĎďĐđĘęĚěĹĺĽľŁłŃńŇňŐőŘřŚśŠšŤťŮůŰűŹźŻżŽžА-Яа-яІіЇїЄєҐґЁё'

const PERSON_NAME_CHAR_CLASS =
  `${PERSON_NAME_LETTER_CLASS}'ʼ\\s.-`

const PERSON_NAME_FILTER = new RegExp(`[^${PERSON_NAME_CHAR_CLASS}]`, 'g')

/**
 * Full-string match after trim: length 2–120, allowed charset only,
 * and at least one letter from the supported Latin/Cyrillic set.
 */
export const PERSON_NAME_REGEX = new RegExp(
  `^(?=.*[${PERSON_NAME_LETTER_CLASS}])[${PERSON_NAME_CHAR_CLASS}]{2,120}$`,
)

export function sanitizePersonName(value: string): string {
  return value.replace(PERSON_NAME_FILTER, '').replace(/\s+/g, ' ').slice(0, 120)
}

export function isValidPersonName(value: string): boolean {
  return PERSON_NAME_REGEX.test(value.trim())
}
