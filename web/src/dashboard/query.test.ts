import { expect, test } from 'vitest'
import { defaultQuery, normalizeQuery, queryKey, supportsLegacyExport, assessmentQueryFilters, analysisQueryBody } from './query'

test('QUERY7: normaliza seleções equivalentes, vazios e transporte sem perder dimensões', () => {
  const first = { projects: ['b', 'a', 'b'], filters: { participant_id: ['B', 'A', 'A'], visit: [], limit: 1, test_code: '' } }
  const second = { projects: ['a', 'b'], filters: { participant_id: ['A', 'B'] } }
  expect(queryKey(first)).toBe(queryKey(second))
  expect(normalizeQuery(first).filters).toEqual({ participant_id: ['A', 'B'] })
  const key = queryKey(second)
  expect(queryKey({ ...second, filters: { ...second.filters, platform: ['web'] } })).not.toBe(key)
  expect(queryKey({ ...second, filters: { ...second.filters, test_version: ['2'] } })).not.toBe(key)
  expect(queryKey({ ...second, filters: { ...second.filters, test_code: 'other' } })).not.toBe(key)
  expect(queryKey({ projects: ['a'], filters: { test_code: ['b', 'a', 'b'] } }))
    .toBe(queryKey({ projects: ['a'], filters: { test_code: ['a', 'b'] } }))
  expect(queryKey({ projects: ['a'], filters: { test_code: 'a' } }))
    .toBe(queryKey({ projects: ['a'], filters: { test_code: ['a'] } }))
})

test('QUERY7: qualquer recorte avançado não suportado bloqueia exportação agregada', () => {
  const query = defaultQuery('a')
  expect(supportsLegacyExport(query)).toBe(true)
  for (const changes of [{ searchText: 'PAT-1' }, { status: 'all' as const }, { accuracyRange: 'under50' as const },
    { goAccuracyRange: '80plus' as const }, { noGoAccuracyRange: 'under50' as const }, { hasCommissionErrors: 'no' as const }, { hasOmissionErrors: 'yes' as const },
    { rtRange: 'under500ms' as const }, { includeNullRt: false }, { condition: ['congruent'] as import('./query').Condition[] }, { responseType: ['hit'] as import('./query').ResponseType[] }]) {
    expect(supportsLegacyExport({ ...query, advanced: { ...query.advanced!, ...changes } })).toBe(false)
  }
  expect(supportsLegacyExport({ ...query, advanced: { ...query.advanced!, sortBy: 'participant', sortOrder: 'asc' } })).toBe(true)
})

test('QUERY7: faixas Go/No-Go e ausência de erros não se perdem em falsy/defaults', () => {
  const query = defaultQuery('a')
  Object.assign(query.advanced!, { goAccuracyRange: 'under50', noGoAccuracyRange: '50to80', hasCommissionErrors: 'no', hasOmissionErrors: 'yes' })
  expect(analysisQueryBody(query).query.filters).toMatchObject({ go_accuracy_max: 50, no_go_accuracy_min: 50, no_go_accuracy_max: 80,
    has_commission_errors: false, has_omission_errors: true })
  expect(queryKey(query)).not.toBe(queryKey(defaultQuery('a')))
  expect(supportsLegacyExport(query)).toBe(false)
})

test('QUERY7: tipo Go/No-Go tem identidade canônica e não perde recorte no POST', () => {
  const query = defaultQuery('a')
  query.advanced!.goNogo = ['no_go', 'go', 'go']
  const canonical = structuredClone(query)
  canonical.advanced!.goNogo = ['go', 'no_go']
  expect(queryKey(query)).toBe(queryKey(canonical))
  expect(analysisQueryBody(query).query.filters.go_nogo).toEqual(['go', 'no_go'])
  expect(supportsLegacyExport(query)).toBe(false)
  expect(queryKey(query)).not.toBe(queryKey(defaultQuery('a')))
  expect(() => assessmentQueryFilters(query)).toThrow('Go/No-Go exige a consulta POST normalizada.')
})

test('QUERY7: IDs cadastrais normalizam UUIDs, integram POST e bloqueiam transporte/exportação legados', () => {
  const pidA = '11111111-1111-4111-8111-111111111111', pidB = '22222222-2222-4222-8222-222222222222'
  const evalUuid = '33333333-3333-4333-8333-333333333333'
  const query = defaultQuery('a')
  query.filters = { patient_id: [pidB.toUpperCase(), pidA, pidA], evaluator_id: [evalUuid.toUpperCase(), 'EVA-000001'] }
  const canonical = defaultQuery('a')
  canonical.filters = { patient_id: [pidA, pidB], evaluator_id: [evalUuid, 'EVA-000001'] }
  expect(queryKey(query)).toBe(queryKey(canonical))
  expect(analysisQueryBody(query).query.filters).toMatchObject({
    patient_id: [pidA, pidB],
    evaluator_id: [evalUuid, 'EVA-000001'],
  })
  expect(supportsLegacyExport(query)).toBe(false)
  expect(() => assessmentQueryFilters(query)).toThrow('IDs cadastrais exigem a consulta POST normalizada.')
  const evalOnlyUuid = defaultQuery('a')
  evalOnlyUuid.filters = { evaluator_id: [evalUuid] }
  expect(supportsLegacyExport(evalOnlyUuid)).toBe(false)
  expect(() => assessmentQueryFilters(evalOnlyUuid)).toThrow('IDs cadastrais exigem a consulta POST normalizada.')
})

test('QUERY7: status operacionais mapeiam para o contrato POST e bloqueiam transporte/exportação legados', () => {
  for (const [option, expected] of [
    ['invalidated', 'invalidated'],
    ['aborted', 'aborted'],
    ['expired', 'expired'],
    ['in_progress', 'in_progress'],
    ['invalid', ['aborted', 'expired', 'in_progress', 'invalidated']],
    ['all', ['aborted', 'expired', 'in_progress', 'invalidated', 'valid']],
  ] as const) {
    const query = defaultQuery('a')
    query.advanced!.status = option
    expect(analysisQueryBody(query).query.filters.status).toEqual(expected)
    expect(supportsLegacyExport(query)).toBe(false)
    expect(() => assessmentQueryFilters(query)).toThrow('Status operacionais exigem a consulta POST normalizada.')
  }
})

test('QUERY7: condição/resposta são conjuntos canônicos e chegam integralmente ao servidor', () => {
  const query = defaultQuery('a')
  query.filters.test_code = ['stroop_go_nogo_ptbr']
  query.advanced!.condition = ['incongruent', 'congruent', 'congruent']
  query.advanced!.responseType = ['omission', 'hit', 'hit']
  const equivalent = structuredClone(query)
  equivalent.advanced!.condition = ['congruent', 'incongruent']
  equivalent.advanced!.responseType = ['hit', 'omission']
  expect(queryKey(query)).toBe(queryKey(equivalent))
  expect(assessmentQueryFilters(query)).toEqual({ test_code: ['stroop_go_nogo_ptbr'],
    condition: ['congruent', 'incongruent'], response_type: ['hit', 'omission'] })
  equivalent.advanced!.responseType = ['commission']
  expect(queryKey(equivalent)).not.toBe(queryKey(query))
  expect(supportsLegacyExport(query)).toBe(false)
})

test('QUERY7: serializa catálogo aplicado sem perder busca/faixas/RT ausente e ordenação', () => {
  const query = defaultQuery('a')
  query.filters = { start_date: '2026-11-01', participant_id: ['B', 'A'], platform: ['psychopy'], test_code: ['stroop_go_nogo_ptbr'] }
  Object.assign(query.advanced!, { searchText: '  PAT-  ', accuracyRange: '50to80', rtRange: '500to1000ms',
    includeNullRt: false, sortBy: 'response_time', sortOrder: 'asc', condition: ['congruent'], responseType: ['hit'] })
  expect(analysisQueryBody(query, 'next')).toEqual({
    query: { projects: ['a'], filters: { date_from: '2026-11-01', participant_code: ['A', 'B'], platform: ['psychopy_local'],
      test_code: ['stroop_go_nogo_ptbr'], status: 'valid', patient_search: 'pat-', accuracy_min: 50, accuracy_max: 80,
      rt_median_min_ms: 500, rt_median_max_ms: 1000, include_null_rt: false, condition: ['congruent'], response_type: ['hit'] } },
    grouping: { level: 'assessment', dimension: 'project' }, page: { size: 100, sort: 'response_time_asc', cursor: 'next' },
  })
})
