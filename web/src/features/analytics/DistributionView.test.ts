import { expect, test } from 'vitest'
import { quartiles } from './DistributionView'

test('quartis interpolados preservam zero, empates e conjunto vazio', () => {
  expect(quartiles([])).toBeNull()
  expect(quartiles([0])).toEqual([0,0,0,0,0])
  expect(quartiles([100,0,50,50])).toEqual([0,37.5,50,62.5,100])
})
