import { expect, test } from '@playwright/test'
import { analysisFixture } from '../src/test/analysis-fixture'

const project = { id: '00000000-0000-4000-8000-000000000001', code: 'SYNTHETIC_NAV', name: 'Projeto sintético', active: true, created_at: '2026-11-15T12:00:00Z' }
test('NAV7: três eixos, histórico, teclado, drawer e cinco larguras sem perder consulta', async ({ page }) => {
  let queries = 0
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { user_id: 'synthetic', role: 'administracao', csrf_token: 'c'.repeat(43), expires_at: new Date(Date.now()+900000).toISOString() } }))
  await page.route('**/api/v1/projects?*', route => route.fulfill({ json: { items: [project], next_cursor: null } }))
  await page.route('**/api/v1/analysis/query', route => { queries++; return route.fulfill({ json: analysisFixture(route.request().postDataJSON(), []) }) })
  await page.route('**/assessments/options*', route => route.fulfill({ json: { participant_id: [], visit: [], evaluator_id: [], test_code: ['stroop_go_nogo_ptbr'], test_version: [], platform: ['web'] } }))
  for (const resource of ['patients', 'evaluators']) await page.route(`**/api/v1/${resource}?*`, route => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 20 } }))
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/equipe')
  const axes = page.getByRole('navigation', { name: 'Eixos profissionais' })
  await expect(axes.getByRole('button')).toHaveCount(3)
  await expect(page.getByRole('status').filter({ hasText: 'Consulta aplicada 1. Consulta carregada.' })).toBeVisible()
  expect(queries).toBe(1)
  const initial = queries
  await axes.getByRole('button', { name: 'Gestão', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Pacientes', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Pacientes', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Avaliadores', exact: true })).toBeFocused()
  await page.goBack()
  await expect(page.getByRole('tab', { name: 'Pacientes', exact: true })).toHaveAttribute('aria-selected', 'true')
  await axes.getByRole('button', { name: 'Resultados e Análise Unificada', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Visão geral (Dashboard)' })).toHaveAttribute('aria-selected', 'true')
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
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0,0])
  expect(new URL(page.url()).search).toBe('')
})
