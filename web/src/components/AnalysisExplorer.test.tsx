// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AnalysisExplorer } from './AnalysisExplorer'
import { analysisFixture } from '../test/analysis-fixture'
import type { AnalysisBody, AnalysisPage } from '../api/analysis'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

test('ANALYTICS7: renderiza gráfico acessível, tabela equivalente, unidades/ausentes e drill-down', async () => {
  const grouping: AnalysisBody['grouping'] = { level: 'project', dimension: 'date', time_bucket: 'day', metric_code: 'response_time' }
  const body: AnalysisBody = {
    query: { projects: ['00000000-0000-4000-8000-000000000001'], filters: { test_code: ['stroop_go_nogo_ptbr'] } },
    grouping,
    page: { size: 50, sort: 'started_at_desc' },
  }
  const page = analysisFixture(body, [], {
    counts: { participants: 2, visits: 2, assessments: 2, trials: 32 },
    analytics: {
      grouping,
      timezone: 'UTC',
      week_start: 'monday',
      population: 'complete_assessment_metrics_and_selected_main_trials',
      compatibility: 'stratified_by_test_version_protocol_platform',
      groups: [
        { key: ['stroop_go_nogo_ptbr', '0.2.2-web.1', 'stroop/0.2.2-web.1', 'web', '2026-11-16'], label: '16 de novembro', assessments: 2, trials: 32, value: 0.512, present: 1, missing: 1, unit: 'seconds' },
      ],
      indicators: [
        {
          code: 'response_time', label: 'Tempo mediano de resposta', unit: 'seconds',
          source: 'stroop.domain.stroop.calculate_metrics', population: 'complete_assessment',
          aggregation: 'mean_of_assessment_values', missing: 'excluded_from_mean_and_counted',
          denominator: 'assessments_with_value', numerator: 'sum_of_official_assessment_values',
          exclusions: 'invalidated_aborted_expired_and_practice_trials', version: 'stroop_go_nogo_ptbr/0.2.2-web.1',
        },
      ],
    },
  }) as unknown as AnalysisPage

  const onGrouping = vi.fn()
  const onSelect = vi.fn()
  await act(async () => root.render(<AnalysisExplorer context={page} grouping={grouping} onGrouping={onGrouping} onSelect={onSelect} />))

  expect(container.querySelector('figure figcaption')?.textContent).toContain('Tempo mediano de resposta')
  const meter = container.querySelector('meter')
  expect(meter?.getAttribute('aria-label')).toContain('16 de novembro')
  expect(container.textContent).toContain('1 ausente(s)')
  const table = container.querySelector('table')!
  expect(table.caption?.textContent).toBe('Grupos analíticos e população')
  expect(table.textContent).toContain('0,512 seconds')
  expect(table.textContent).toContain('1 / 1')

  const selectBtn = [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Selecionar 16 de novembro'))!
  await act(async () => selectBtn.click())
  expect(onSelect).toHaveBeenCalledWith('date', '2026-11-16')

  const bucketSelect = container.querySelectorAll('select')[2]!
  await act(async () => {
    bucketSelect.value = 'week'
    bucketSelect.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(onGrouping).toHaveBeenCalledWith({ level: 'project', dimension: 'date', time_bucket: 'week', metric_code: 'response_time' })
})
