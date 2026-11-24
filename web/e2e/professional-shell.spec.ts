import { expect, test } from '@playwright/test'
import { analysisFixture } from '../src/test/analysis-fixture'
import type { Assessment } from '../src/api/assessments'

const project = { id: '00000000-0000-4000-8000-000000000001', code: 'SYNTHETIC_NAV', name: 'Projeto sintético', active: true, created_at: '2026-11-15T12:00:00Z' }
const assessmentRow = (id: string, visit: string): Assessment & { project_id: string } => ({
  project_id: project.id,
  assessment_id: id,
  participant_id: 'PAT-20261116-000001',
  visit,
  evaluator_id: 'EVA-000001',
  created_at: '2026-11-16T10:00:00Z',
  started_at: '2026-11-16T10:00:00Z',
  platform: 'web',
  test_code: 'stroop_go_nogo_ptbr',
  test_version: '0.2.2-web.1',
  protocol_id: 'stroop_go_nogo_ptbr/0.2.2-web.1',
  app_version: 'web-0.1.0+visual.1.0.0',
  summary: {
    accuracy: 75, accuracy_go_trials: 100, accuracy_no_go_trials: 50,
    total_go_trials: 8, total_no_go_trials: 8, response_time_seconds: 0.5,
    total_trials: 16, hits: 8, correct_rejections: 4, omission_errors: 0, commission_errors: 4,
  },
})

test('NAV7: três eixos, histórico, detalhe, teclado, drawer e cinco larguras sem perder consulta', async ({ page }) => {
  let queries = 0
  const rows = [assessmentRow('ASSESS_NAV_1', 'V1'), assessmentRow('ASSESS_NAV_2', 'V2')]
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { user_id: 'synthetic', role: 'administracao', csrf_token: 'c'.repeat(43), expires_at: new Date(Date.now() + 900000).toISOString() } }))
  await page.route('**/api/v1/projects?*', route => route.fulfill({ json: { items: [project], next_cursor: null } }))
  await page.route('**/api/v1/analysis/query', route => { queries++; return route.fulfill({ json: analysisFixture(route.request().postDataJSON(), rows) }) })
  await page.route('**/api/v1/projects/*/assessments/ASSESS_NAV_1', route => route.fulfill({
    json: {
      ...rows[0], session_id: null, completed_at: '2026-11-16T10:02:00Z', frame_period_ms: 16.6,
      metrics: [{ metric_code: 'accuracy', metric_label: 'Precisão (%)', metric_value: 75, unit: 'percent' }],
      trials: [],
    },
  }))
  await page.route('**/assessments/options*', route => route.fulfill({ json: { participant_id: ['PAT-20261116-000001'], visit: ['V1', 'V2'], evaluator_id: ['EVA-000001'], test_code: ['stroop_go_nogo_ptbr'], test_version: ['0.2.2-web.1'], platform: ['web'] } }))
  for (const resource of ['patients', 'evaluators']) await page.route(`**/api/v1/${resource}?*`, route => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 20 } }))
  await page.route('**/api/v1/administration/users', route => route.fulfill({ json: { items: [], next_cursor: null } }))
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/equipe')
  const axes = page.getByRole('navigation', { name: 'Eixos profissionais' })
  await expect(axes.getByRole('button')).toHaveCount(3)
  await expect(page.getByRole('status').filter({ hasText: 'Consulta aplicada 1. Consulta carregada.' })).toBeVisible()
  expect(queries).toBe(1)
  const initial = queries

  await page.getByRole('tab', {name:'Avaliações e tentativas'}).click()
  await page.getByLabel('Buscar na tabela (código, visita ou instrumento)').fill('V1')
  await expect(page.getByRole('table', { name: 'Avaliações filtradas' }).locator('tbody tr')).toHaveCount(1)
  await page.getByRole('button', { name: /Ver avaliação PAT-20261116-000001, visita V1/ }).click()
  await expect(page.getByRole('region', { name: 'Detalhe da avaliação' })).toBeVisible()
  await page.getByRole('button', { name: 'Fechar detalhe' }).click()
  await expect(page.getByLabel('Buscar na tabela (código, visita ou instrumento)')).toHaveValue('V1')

  await axes.getByRole('button', { name: 'Gestão', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Pacientes', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Pacientes', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Avaliadores', exact: true })).toBeFocused()
  await page.goBack()
  await expect(page.getByRole('tab', { name: 'Pacientes', exact: true })).toHaveAttribute('aria-selected', 'true')
  await axes.getByRole('button', { name: 'Resultados e Análise Unificada', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Avaliações e tentativas' }).click()
  await expect(page.getByLabel('Buscar na tabela (código, visita ou instrumento)')).toHaveValue('V1')
  expect(queries).toBe(initial)

  await page.getByRole('button', { name: 'Recolher navegação' }).click()
  await expect(axes.getByRole('button', { name: 'Gestão', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Expandir navegação' }).click()
  for (const width of [360, 768, 1024, 1366, 1920, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width < 1024) {
      const opener = page.getByRole('button', { name: 'Abrir navegação profissional' })
      await opener.click()
      await expect(page.getByRole('dialog', { name: 'Navegação profissional' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).not.toBeVisible()
      await expect(opener).toBeFocused()
    }
  }
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  expect(new URL(page.url()).search).toBe('')
})

test('NAV7: perfis restringem destinos e logout/403 limpam dados sem ressuscitar no histórico', async ({ page }) => {
  let active = true
  await page.route('**/api/v1/auth/me', route => active
    ? route.fulfill({ json: { user_id: 'consulta_sint', role: 'consulta', csrf_token: 'c'.repeat(43), expires_at: new Date(Date.now() + 900000).toISOString() } })
    : route.fulfill({ status: 401, json: { error: { code: 'authentication_required' } } }))
  await page.route('**/api/v1/projects?*', route => route.fulfill({ json: { items: [project], next_cursor: null } }))
  await page.route('**/api/v1/analysis/query', route => route.fulfill({ json: analysisFixture(route.request().postDataJSON(), [assessmentRow('ASSESS_C1', 'V1')]) }))
  await page.route('**/assessments/options*', route => route.fulfill({ json: { participant_id: [], visit: [], evaluator_id: [], test_code: ['stroop_go_nogo_ptbr'], test_version: [], platform: ['web'] } }))
  await page.route('**/api/v1/patients*', route => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 20 } }))
  await page.route('**/api/v1/auth/logout', route => { active = false; return route.fulfill({ status: 204, body: '' }) })

  await page.goto('/equipe')
  const axes = page.getByRole('navigation', { name: 'Eixos profissionais' })
  await expect(axes.getByRole('button')).toHaveCount(2)
  await expect(axes.getByRole('button', { name: 'Nova Avaliação' })).toHaveCount(0)
  await axes.getByRole('button', { name: 'Gestão', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Administração' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Encerrar sessão', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
})
