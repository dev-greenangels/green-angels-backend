import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isValidPersonName, PERSON_NAME_REGEX, sanitizePersonName } from './person-name'

const ACCEPT = [
  'Martin',
  'Ján Novák',
  'Łukasz Żółć',
  'François Müller',
  "O'Connor",
  'Anna-Maria',
  'Олена',
  'Іван Петренко',
] as const

const REJECT = [
  '---',
  "''",
  '..',
  "-.'",
  '123',
  'Martin123',
  'Martin🙂',
  'Martin<script>',
] as const

describe('common/person-name (review author)', () => {
  for (const name of ACCEPT) {
    it(`ACCEPT ${name}`, () => {
      assert.equal(PERSON_NAME_REGEX.test(name), true)
      assert.equal(isValidPersonName(name), true)
    })
  }

  for (const name of REJECT) {
    it(`REJECT ${JSON.stringify(name)}`, () => {
      assert.equal(PERSON_NAME_REGEX.test(name), false)
      assert.equal(isValidPersonName(name), false)
    })
  }

  it('PERSON_NAME_REGEX and isValidPersonName stay equivalent (incl. trim)', () => {
    for (const name of [...ACCEPT, ...REJECT, '', ' ', 'A', 'Ab']) {
      assert.equal(
        PERSON_NAME_REGEX.test(name.trim()),
        isValidPersonName(name),
        name,
      )
    }
  })

  it('does not sanitize away digits before validation (API must reject raw)', () => {
    assert.equal(sanitizePersonName('Martin123'), 'Martin')
    assert.equal(PERSON_NAME_REGEX.test('Martin123'), false)
  })
})
