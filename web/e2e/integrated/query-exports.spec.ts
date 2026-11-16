/** EXPORT7: interface, sessão local, SELECT restrito, HTTPS/API/PG reais. */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { selectMulti } from '../support/multiselect'
const python = fileURLToPath(new URL('../../../.venv/bin/python', import.meta.url))
const script = fileURLToPath(new URL('./dashboard-manage.py', import.meta.url))

test('consulta aplicada gera prévia e CSV da mesma avaliação, invalida prévia ao editar', async ({ page, context }) => {
  const prepared = JSON.parse(execFileSync(python, [script], { input: JSON.stringify({ role: 'consulta' }), encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }))
  await context.addCookies([{ name: prepared.cookie_name, value: prepared.token, domain: '127.0.0.1', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }])
  await page.goto('/equipe')
  const form = page.getByRole('form', { name: 'Filtros da consulta' })
  await selectMulti(form.getByRole('group', { name: 'Projetos da consulta', exact: true }), prepared.project_id)
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Avaliações filtradas' }).locator('tbody tr')).toHaveCount(1)
  await page.getByRole('tab', { name: 'Exportações', exact: true }).click()
  const preview = page.waitForResponse(response => response.url().endsWith('/exports/preview'))
  await page.getByRole('button', { name: 'Pré-visualizar contagem e amostra' }).click()
  const response = await preview
  expect(response.status()).toBe(200)
  const value = await response.json()
  expect(value.total_rows).toBe(1)
  expect(value.counts.assessments).toBe(1)
  expect(value.sample_rows[0].assessment_id).toBe(prepared.assessment_id)
  expect(value.sample_rows[0].participant_name).toBe('')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar arquivo CSV (1 registros)' }).click()
  const download = await downloading
  const content = await readFile((await download.path())!, 'utf8')
  expect(content).toContain(prepared.assessment_id)
  expect(content).not.toContain('NOME_SINTETICO_RESTRITO')
  expect(download.suggestedFilename()).toMatch(/^stroop-test-web_avaliacoes_\d{8}T\d{6}Z_[a-f0-9]{8}\.csv$/)
  await page.getByRole('checkbox', { name: 'assessment_id', exact: true }).uncheck()
  await expect(page.getByRole('button', { name: /Baixar arquivo CSV/ })).toBeDisabled()
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0,0])
})
