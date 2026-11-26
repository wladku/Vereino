import assert from 'node:assert/strict'
import { test } from 'node:test'
import { birthYearsOf, fitRuleOf, fitsAgeCategory, fitsAgeRange, fitsRule, referenceYear } from '../age-fit.ts'

const orlik = { uFrom: 10, uTo: 11 }
const senior = { uFrom: 20, uTo: null }
const skrzaty = { ageFrom: 6, ageTo: 7 }

test('referenceYear is the season start year, else the fallback date year', () => {
  assert.equal(referenceYear('2026-09-01', '2027-03-15'), 2026)
  assert.equal(referenceYear(null, '2027-03-15'), 2027)
})

test('birthYearsOf gives the birth years of a closed and an open range', () => {
  assert.deepEqual(birthYearsOf(orlik, 2026), { from: 2016, to: 2017 })
  assert.deepEqual(birthYearsOf(senior, 2026), { from: null, to: 2007 })
})

test('fitsAgeCategory counts by birth year in the reference year', () => {
  assert.deepEqual(
    [2015, 2016, 2017, 2018].map((year) => fitsAgeCategory(year, orlik, 2026)),
    [false, true, true, false],
  )
  assert.deepEqual(
    [1980, 2007, 2008].map((year) => fitsAgeCategory(year, senior, 2026)),
    [true, true, false],
  )
})

test('fitsAgeRange counts completed years on the date with open bounds', () => {
  assert.equal(fitsAgeRange('2020-09-01', '2026-09-01', skrzaty), true)
  assert.equal(fitsAgeRange('2020-09-01', '2026-08-31', skrzaty), false)
  assert.equal(fitsAgeRange('2018-09-01', '2026-09-01', skrzaty), false)
  assert.equal(fitsAgeRange('2015-01-01', '2026-09-01', { ageFrom: 6, ageTo: null }), true)
  assert.equal(fitsAgeRange('2024-01-01', '2026-09-01', { ageFrom: null, ageTo: 7 }), true)
  assert.equal(fitsAgeRange('2010-01-01', '2026-09-01', { ageFrom: null, ageTo: 7 }), false)
  assert.equal(fitsAgeRange('2020-01-01', '2026-09-01', { ageFrom: null, ageTo: null }), null)
  assert.equal(fitsAgeRange(null, '2026-09-01', skrzaty), null)
})

test('fitRuleOf prefers the category range, then the ages, else null', () => {
  assert.deepEqual(fitRuleOf(orlik, 2026, { ageFrom: 9, ageTo: 11 }), {
    kind: 'birth_years',
    uFrom: 10,
    uTo: 11,
    referenceYear: 2026,
    from: 2016,
    to: 2017,
  })
  assert.deepEqual(fitRuleOf(null, 2026, skrzaty), { kind: 'age', ageFrom: 6, ageTo: 7 })
  assert.deepEqual(fitRuleOf(null, 2026, { ageFrom: null, ageTo: 7 }), { kind: 'age', ageFrom: null, ageTo: 7 })
  assert.equal(fitRuleOf(null, 2026, { ageFrom: null, ageTo: null }), null)
})

test('fitsRule applies the birth-year or the age rule', () => {
  const byYear = fitRuleOf(orlik, 2026, { ageFrom: 30, ageTo: 40 })
  assert.equal(fitsRule('2017-12-31', '2026-09-01', byYear), true)
  assert.equal(fitsRule('2015-12-31', '2026-09-01', byYear), false)
  const byAge = fitRuleOf(null, 2026, skrzaty)
  assert.equal(fitsRule('2020-09-01', '2026-09-01', byAge), true)
  assert.equal(fitsRule('2020-09-01', '2026-08-31', byAge), false)
  assert.equal(fitsRule(null, '2026-09-01', byYear), null)
  assert.equal(fitsRule('2017-01-01', '2026-09-01', null), null)
})
