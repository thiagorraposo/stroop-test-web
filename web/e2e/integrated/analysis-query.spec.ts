import { selectMulti } from '../support/multiselect'
/** QUERY7: POST normalizado em HTTPS/API/PG reais, sem interceptação HTTP. */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { AnalysisBody } from '../../src/api/analysis'
const python = fileURLToPath(new URL('../../../.venv/bin/python', import.meta.url))
const script = fileURLToPath(new URL('./dashboard-manage.py', import.meta.url))

test('POST vincula consulta normalizada, população A/T e revogação sem nominal em URL', async ({ page, context }) => {
  const prepared = JSON.parse(execFileSync(python, [script], { input: JSON.stringify({ role: 'consulta' }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }))
  await context.addCookies([{ name: prepared.cookie_name, value: prepared.token, domain: '127.0.0.1', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }])
  await page.goto('/equipe')
  await expect(page.getByRole('form', { name: 'Filtros da consulta' })).toBeVisible()
  const responses = await page.evaluate(async ({ project, csrf, assessment }) => {
    const query = async (filters: Record<string, unknown>, token = csrf) => {
      const response = await fetch('/api/v1/analysis/query', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ query: { projects: [project], filters },
          grouping: { level: 'assessment', dimension: 'project' }, page: { size: 1 } }) })
      return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') }
    }
    const detail = await (await fetch(`/api/v1/projects/${project}/assessments/${assessment}`)).json()
    return { first: await query({ platform: ['psychopy'] }),
      canonical: await query({ platform: ['psychopy_local'] }),
      trials: await query({ test_code: ['stroop_go_nogo_ptbr'], condition: ['congruent'], response_type: ['hit', 'omission'] }),
      unsupported: await query({ patient_id: 'NOME_SINTETICO_RESTRITO' }),
      codeOnly: await query({ patient_search: 'NOME_SINTETICO_RESTRITO' }),
      csrf: await query({}, 'invalid'), detail }
  }, { project: prepared.project_id as string, csrf: prepared.csrf as string, assessment: prepared.assessment_id as string })
  expect(responses.first.status).toBe(200)
  expect(responses.first.cache).toBe('no-store')
  expect(responses.first.body.normalized_query).toEqual(responses.canonical.body.normalized_query)
  expect(responses.first.body.query_fingerprint).toBe(responses.canonical.body.query_fingerprint)
  expect(responses.first.body.counts.assessments).toBe(1)
  expect(responses.first.body.items[0].summary).toEqual(responses.detail.summary)
  expect(responses.first.body.capabilities.exports).toBe(true)
  expect(responses.trials.status).toBe(200)
  const selected = responses.detail.trials.filter((trial: { condition: string; error_type: string }) =>
    trial.condition === 'congruent' && ['hit', 'omission'].includes(trial.error_type))
  expect(responses.trials.body.counts.trials).toBe(selected.length)
  expect(responses.trials.body.items[0].summary).toEqual(responses.detail.summary)
  expect(responses.unsupported.status).toBe(422)
  expect(responses.codeOnly.status).toBe(200)
  expect(responses.codeOnly.body.counts.assessments).toBe(0)
  expect(responses.csrf.status).toBe(403)
  expect(JSON.stringify(responses.first.body)).not.toContain('NOME_SINTETICO_RESTRITO')
  execFileSync(python, [script], { input: JSON.stringify({ action: 'revoke', project_id: prepared.project_id, subject: prepared.subject }), stdio: ['pipe', 'pipe', 'pipe'] })
  const revoked = await page.evaluate(async ({ project, csrf }) => {
    const response = await fetch('/api/v1/analysis/query', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ query: { projects: [project], filters: {} },
        grouping: { level: 'assessment', dimension: 'project' }, page: {} }) })
    return response.status
  }, { project: prepared.project_id as string, csrf: prepared.csrf as string })
  expect(revoked).toBe(404)
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
  expect(page.url()).not.toContain('SINTETICO')
})

test('React aplica busca/faixas/RT ausente no POST compartilhado entre módulos', async ({ page, context }) => {
  const complete = fileURLToPath(new URL('./complete-results-manage.py', import.meta.url))
  const prepared = JSON.parse(execFileSync(python, [complete], { input: '{}', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }))
  await context.addCookies([{ name: prepared.cookie_name, value: prepared.token, domain: '127.0.0.1', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }])
  const queries: Record<string, unknown>[] = [], listingGets: string[] = []
  page.on('request', request => {
    if (request.url().endsWith('/api/v1/analysis/query')) {
      expect(request.method()).toBe('POST')
      expect(request.headers()['x-csrf-token']).toMatch(/^[A-Za-z0-9_-]{43}$/)
      queries.push(request.postDataJSON())
    }
    if (/\/assessments\?/.test(request.url())) listingGets.push(request.url())
  })
  await page.goto('/equipe')
  const form = page.getByRole('form', { name: 'Filtros da consulta' })
  await selectMulti(form.getByRole('group', { name: 'Projetos da consulta', exact: true }), prepared.projects)
  await selectMulti(form.getByRole('group', { name: 'Instrumento da consulta', exact: true }), 'stroop_go_nogo_ptbr')
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  const table = page.getByRole('table', { name: 'Avaliações filtradas' })
  await expect(table.locator('tbody tr')).toHaveCount(4)
  await form.getByText('Filtros avançados e ordenação', { exact: true }).click()
  const search = form.getByRole('searchbox', { name: 'Busca por código do participante', exact: true })
  await search.fill('SEM_HITS')
  await form.getByRole('combobox', { name: 'Faixa de tempo de reação (RT)', exact: true }).selectOption('under500ms')
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table).toContainText('P_SINTETICO_SEM_HITS')
  await form.getByRole('checkbox', { name: /Tratamento explícito de RT ausente/ }).uncheck()
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await expect(page.getByText('Nenhuma avaliação corresponde aos filtros.', { exact: true })).toBeVisible()
  await search.fill('')
  await form.getByRole('combobox', { name: 'Faixa de tempo de reação (RT)', exact: true }).selectOption('all')
  await form.getByRole('combobox', { name: 'Faixa de precisão', exact: true }).selectOption('50to80')
  await form.getByRole('combobox', { name: 'Critério de ordenação', exact: true }).selectOption('response_time')
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await expect(table.locator('tbody tr')).toHaveCount(3)
  const count = queries.length
  await page.getByRole('tab', { name: 'Resultados e análises', exact: true }).click()
  await expect(page.locator('.dashboard-cards > div').filter({ has: page.getByText('Avaliações analisadas', { exact: true }) }).locator('dd')).toHaveText('3')
  await page.getByRole('tab', { name: 'Avaliações e histórico', exact: true }).click()
  await expect(table.locator('tbody tr')).toHaveCount(3)
  expect(queries.length).toBe(count)
  expect(queries.at(-1)).toMatchObject({ query: { filters: { accuracy_min: 50, accuracy_max: 80, include_null_rt: false } },
    page: { sort: 'response_time_desc' } })
  expect(listingGets).toEqual([])
  await page.getByRole('tab', { name: 'Visão geral (Dashboard)', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Exportar visão filtrada', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0])
})

test('precisão Go/No-Go e erros selecionam avaliação completa e bloqueiam CSV incompatível', async ({ page, context }) => {
  const complete = fileURLToPath(new URL('./complete-results-manage.py', import.meta.url))
  const prepared = JSON.parse(execFileSync(python, [complete], { input: '{}', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }))
  await context.addCookies([{ name: prepared.cookie_name, value: prepared.token, domain: '127.0.0.1', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }])
  const queries: AnalysisBody[] = []
  page.on('request', request => { if (request.url().endsWith('/api/v1/analysis/query')) queries.push(request.postDataJSON()) })
  await page.goto('/equipe')
  const form = page.getByRole('form', { name: 'Filtros da consulta' })
  await selectMulti(form.getByRole('group', { name: 'Projetos da consulta', exact: true }), prepared.projects)
  await selectMulti(form.getByRole('group', { name: 'Instrumento da consulta', exact: true }), 'stroop_go_nogo_ptbr')
  await form.getByText('Filtros avançados e ordenação', { exact: true }).click()
  await form.getByRole('combobox', { name: 'Faixa de precisão Go', exact: true }).selectOption('under50')
  await form.getByRole('combobox', { name: 'Faixa de precisão No-Go', exact: true }).selectOption('80plus')
  await form.getByRole('combobox', { name: 'Presença de erros de comissão', exact: true }).selectOption('no')
  await form.getByRole('combobox', { name: 'Presença de erros de omissão', exact: true }).selectOption('yes')
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  const table = page.getByRole('table', { name: 'Avaliações filtradas' })
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table).toContainText('P_SINTETICO_SEM_HITS')
  expect(queries.at(-1)!.query.filters).toMatchObject({ go_accuracy_max: 50, no_go_accuracy_min: 80, has_commission_errors: false, has_omission_errors: true })
  await expect(page.getByRole('status').filter({ hasText: 'Filtros aplicados:' })).toContainText('erros de comissão: sem')
  await expect(page.getByRole('status').filter({ hasText: 'Para exportar os filtros avançados, use Exportações' })).toBeVisible()
  const before = queries.length
  await page.getByRole('tab', { name: 'Resultados e análises', exact: true }).click()
  await expect(page.locator('.dashboard-cards > div').filter({ has: page.getByText('Avaliações analisadas', { exact: true }) }).locator('dd')).toHaveText('1')
  expect(queries.length).toBe(before)
  await page.getByRole('tab', { name: 'Avaliações e histórico', exact: true }).click()
  await form.getByRole('button', { name: /Remover filtro Precisão Go/ }).click()
  await expect(form.getByRole('status').filter({ hasText: 'Alterações não aplicadas' })).toBeVisible()
  await form.getByRole('button', { name: 'Descartar alterações', exact: true }).click()
  await expect(form.getByRole('combobox', { name: 'Faixa de precisão Go', exact: true })).toHaveValue('under50')
  await form.getByRole('combobox', { name: 'Presença de erros de comissão', exact: true }).selectOption('yes')
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  await expect(page.getByText('Nenhuma avaliação corresponde aos filtros.', { exact: true })).toBeVisible()
  expect(page.url()).not.toContain('go_accuracy')
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 })
})
