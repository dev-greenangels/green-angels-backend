export const UKRAINIAN_ALPHABET = [
  'А',
  'Б',
  'В',
  'Г',
  'Ґ',
  'Д',
  'Е',
  'Є',
  'Ж',
  'З',
  'И',
  'І',
  'Ї',
  'Й',
  'К',
  'Л',
  'М',
  'Н',
  'О',
  'П',
  'Р',
  'С',
  'Т',
  'У',
  'Ф',
  'Х',
  'Ц',
  'Ч',
  'Ш',
  'Щ',
  'Ь',
  'Ю',
  'Я',
] as const

const letterOrder = new Map<string, number>(
  UKRAINIAN_ALPHABET.map((letter, index) => [letter, index]),
)

export function sortUkrainianAlphabetLetters(letters: string[]): string[] {
  return [...letters].sort((a, b) => (letterOrder.get(a) ?? 999) - (letterOrder.get(b) ?? 999))
}
