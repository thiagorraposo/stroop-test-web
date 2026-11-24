import { analyticsSection } from '../support/analytics'
/** WEB-055: Jornadas prioritárias reais UX7-J1, UX7-J2 e UX7-J3 em HTTPS/API/PG reais. */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, request, test } from '@playwright/test'
import { selectMulti } from '../support/multiselect'
import { finishPractice, manage } from './fixtures'

const python = fileURLToPath(new URL('../../../.venv/bin/python', import.meta.url))
const dashboardScript = fileURLToPath(new URL('./dashboard-manage.py', import.meta.url))
const completeScript = fileURLToPath(new URL('./complete-results-manage.py', import.meta.url))
const manageScript = fileURLToPath(new URL('./manage.py', import.meta.url))

test('UX7-J1 — pesquisador consulta, aprofunda e exporta multi-granularidade com negativo de 409 e RT nulo', async ({ page, context }) => {
  const prepared = JSON.parse(execFileSync(python, [completeScript], {
    input: '{}', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  })) as {
    cookie_name: string; token: string; csrf: string;
    projects: string[]; no_hits_id: string; repeated_ids: string[];
  }
  const denied = JSON.parse(execFileSync(python, [dashboardScript], {
    input: JSON.stringify({ role: 'consulta' }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  })) as { project_id: string }

  await context.addCookies([{
    name: prepared.cookie_name,
    value: prepared.token,
    domain: '127.0.0.1',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  }])

  await page.goto('/equipe')
  await page.locator('.query-controls > summary').click()
  const form = page.getByRole('form', { name: 'Filtros da consulta' })
  // Terceiro projeto nao autorizado nao aparece e POST cruzado falha fechado com 404
  const projectsGroup = form.getByRole('group', { name: 'Projetos da consulta', exact: true })
  await expect(projectsGroup).not.toContainText(denied.project_id)
  const deniedStatus = await page.evaluate(async ({ deniedId, csrf }) => {
    const res = await fetch('/api/v1/analysis/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({
        query: { projects: [deniedId], filters: {} },
        grouping: { level: 'assessment', dimension: 'project' },
        page: {},
      }),
    })
    return res.status
  }, { deniedId: denied.project_id, csrf: prepared.csrf })
  expect(deniedStatus).toBe(404)

  // Selecionar os 2 projetos autorizados + filtro por instrumento + preservar RT nulo
  await selectMulti(projectsGroup, prepared.projects)
  await selectMulti(form.getByRole('group', { name: 'Instrumento da consulta', exact: true }), 'stroop_go_nogo_ptbr')
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()

  await analyticsSection(page, 'Avaliações e tentativas')
  const table = page.getByRole('table', { name: 'Avaliações filtradas' })
  await expect(table.locator('tbody tr')).toHaveCount(4)
  await expect(table).toContainText('P_SINTETICO_SEM_HITS')

  // Aprofundamento em detalhe preserva recorte ao voltar
  await page.getByRole('button', { name: 'Ver avaliação P_SINTETICO_SEM_HITS, visita V_ZERO' }).click()
  const detail = page.getByRole('region', { name: 'Detalhe da avaliação' })
  await expect(detail).toBeVisible()
  await expect(detail).toContainText('—')
  await detail.getByRole('button', { name: 'Fechar detalhe' }).click()
  await expect(table.locator('tbody tr')).toHaveCount(4)

  // Analise exploratoria: trocar agrupamento (ex: visita) e manter tabela equivalente
  await analyticsSection(page, 'Exploração de resultados')
  await expect(page.getByRole('heading', { name: 'Explorar o conjunto completo', exact: true })).toBeVisible()
  await page.getByLabel('Agrupar por', { exact: true }).selectOption('visit')
  await expect(page.getByRole('table', { name: 'Grupos analíticos e população' })).toContainText('V_ZERO')

  // Exportacoes: testar projecoes padrao + bloqueio de stroop_21_colunas com filtro por tentativa
  await page.getByRole('tab', { name: 'Exportações', exact: true }).click()
  for (const granularity of ['avaliacoes', 'tentativas', 'metricas'] as const) {
    await page.locator(`input[name="granularity"][value="${granularity}"]`).check()
    const previewResp = page.waitForResponse(r => r.url().endsWith('/exports/preview'))
    await page.getByRole('button', { name: 'Pré-visualizar contagem e amostra' }).click()
    const previewRes = await previewResp
    expect(previewRes.status()).toBe(200)
    const previewJson = await previewRes.json() as { total_rows: number }
    const dlWait = page.waitForEvent('download')
    await page.getByRole('button', { name: `Baixar arquivo CSV (${previewJson.total_rows} registros)` }).click()
    const dl = await dlWait
    const csvText = await readFile((await dl.path())!, 'utf8')
    expect(csvText.trim().split(/\r?\n/).length).toBe(previewJson.total_rows + 1)
    expect(csvText).not.toContain('NOME_SINTETICO_RESTRITO')
  }

  // Aplicar filtro de tentativa (condicao=congruent) e confirmar recusa de CSV21; depois remover e baixar CSV21
  await form.getByText('Filtros avançados e ordenação', { exact: true }).click()
  const condGroup = form.getByRole('group', { name: 'Condição experimental', exact: true })
  await selectMulti(condGroup, 'congruent')
  const q1Wait = page.waitForResponse(r => r.url().endsWith('/api/v1/analysis/query') && r.request().method() === 'POST')
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  expect((await q1Wait).status()).toBe(200)
  await page.locator('input[name="granularity"][value="stroop_21_colunas"]').check()
  const blockedPreview = page.waitForResponse(r => r.url().endsWith('/exports/preview'))
  await page.getByRole('button', { name: 'Pré-visualizar contagem e amostra' }).click()
  expect((await blockedPreview).status()).toBe(422)

  await form.getByRole('button', { name: 'Remover filtro Condição: congruent' }).click()
  const q2Wait = page.waitForResponse(r => r.url().endsWith('/api/v1/analysis/query') && r.request().method() === 'POST')
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  expect((await q2Wait).status()).toBe(200)
  const okCsv21Preview = page.waitForResponse(r => r.url().endsWith('/exports/preview'))
  await page.getByRole('button', { name: 'Pré-visualizar contagem e amostra' }).click()
  const okCsv21 = await okCsv21Preview
  expect(okCsv21.status()).toBe(200)
  const okCsv21Json = await okCsv21.json() as { total_rows: number }
  const dl21Wait = page.waitForEvent('download')
  await page.getByRole('button', { name: `Baixar arquivo CSV (${okCsv21Json.total_rows} registros)` }).click()
  const dl21 = await dl21Wait
  const csv21Header = (await readFile((await dl21.path())!, 'utf8')).split(/\r?\n/)[0]!.replace(/^\uFEFF/, '').split(',')
  expect(csv21Header).toHaveLength(21)
  expect(csv21Header).toContain('reaction_time')
  expect(csv21Header).toContain('error_type')
})

test('UX7-J2 — avaliador faz cadastro com homonimo, modo remoto com QR e handoff presencial com bloqueio de retorno', async ({ page }) => {
  const prepared = JSON.parse(execFileSync(python, [dashboardScript], {
    input: JSON.stringify({ role: 'importacao' }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  })) as { username: string; password: string; project_id: string }

  await page.goto('/equipe')
  await page.getByLabel('Usuário', { exact: true }).fill(prepared.username)
  await page.getByLabel('Senha', { exact: true }).fill(prepared.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByText('Sua sessão está ativa.')).toBeVisible()

  await page.getByRole('button', { name: 'Nova Avaliação', exact: true }).click()
  await page.getByRole('combobox', { name: 'Projeto', exact: true }).selectOption(prepared.project_id)

  // Criar avaliador e primeiro paciente no fluxo inline
  const suffix = randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()
  const fullName = `Ana Lucia Homonimo ${suffix}`
  await page.getByRole('button', { name: 'Cadastrar novo avaliador', exact: true }).click()
  const evaGroup = page.getByRole('group', { name: 'Novo cadastro de avaliador' })
  await evaGroup.getByLabel('Nome completo do avaliador').fill(`Dr. Avaliador J2 ${suffix}`)
  const evaWait = page.waitForResponse(r => r.url().endsWith('/api/v1/evaluators') && r.request().method() === 'POST')
  await evaGroup.getByRole('button', { name: 'Salvar avaliador', exact: true }).click()
  expect((await evaWait).status()).toBe(201)

  await page.getByRole('button', { name: 'Cadastrar novo paciente', exact: true }).click()
  const patGroup = page.getByRole('group', { name: 'Novo cadastro de paciente' })
  await patGroup.getByLabel('Nome completo do paciente').fill(fullName)
  const pat1Wait = page.waitForResponse(r => r.url().endsWith('/api/v1/patients') && r.request().method() === 'POST')
  await patGroup.getByRole('button', { name: 'Salvar paciente', exact: true }).click()
  expect((await pat1Wait).status()).toBe(201)

  // Tentar cadastrar homonimo -> recebe 409 duplicate_candidate_found e exige confirmacao explicita
  await page.getByRole('button', { name: 'Cadastrar novo paciente', exact: true }).click()
  await patGroup.getByLabel('Nome completo do paciente').fill(fullName)
  const homonymWait = page.waitForResponse(r => r.url().endsWith('/api/v1/patients') && r.request().method() === 'POST')
  await patGroup.getByRole('button', { name: 'Salvar paciente', exact: true }).click()
  expect((await homonymWait).status()).toBe(409)
  await expect(patGroup).toContainText('Possível homônimo encontrado')
  const pat2Wait = page.waitForResponse(r => r.url().endsWith('/api/v1/patients') && r.request().method() === 'POST')
  await patGroup.getByRole('button', { name: 'Confirmar homônimo e cadastrar paciente', exact: true }).click()
  expect((await pat2Wait).status()).toBe(201)

  // 1) Emissao Remota com QR em RAM e sem segredo em URL
  await page.getByLabel('Visita da sessão', { exact: true }).fill('V_J2_REMOTE')
  await page.getByRole('button', { name: /Remota/i }).click()
  await page.getByRole('button', { name: 'Revisar preparação', exact: true }).click()
  const remoteRespWait = page.waitForResponse(r => r.url().endsWith(`/projects/${prepared.project_id}/direct-evaluations`))
  await page.getByRole('button', { name: 'Confirmar e emitir convite', exact: true }).click()
  const remoteResp = await remoteRespWait
  expect(remoteResp.status()).toBe(201)
  const remoteIssued = await remoteResp.json() as { code: string }
  await expect(page.getByRole('img', { name: 'QR code do código do convite' })).toBeVisible()
  expect(page.url()).not.toContain(remoteIssued.code)

  // 2) Preparar outra sessao em modo Presencial -> handoff atomico derruba painel e inicia /pratica
  await page.getByRole('button', { name: 'Preparar outra sessão', exact: true }).click()
  await page.getByLabel('Paciente cadastrado', { exact: true }).selectOption({ index: 1 })
  await page.getByLabel('Avaliador responsável', { exact: true }).selectOption({ index: 1 })
  await page.getByLabel('Visita da sessão', { exact: true }).fill('V_J2_ONSITE')
  await page.getByRole('button', { name: /Presencial/i }).click()
  await page.getByRole('button', { name: 'Revisar preparação', exact: true }).click()
  const onsiteRespWait = page.waitForResponse(r => r.url().endsWith(`/projects/${prepared.project_id}/direct-evaluations`))
  await page.getByRole('button', { name: 'Confirmar e emitir convite', exact: true }).click()
  const onsiteResp = await onsiteRespWait
  expect(onsiteResp.status()).toBe(201)
  const onsiteIssued = await onsiteResp.json() as { session_id: string }

  const handoffWait = page.waitForResponse(r => r.url().endsWith('/handoff'))
  await page.getByRole('button', { name: 'Iniciar neste dispositivo', exact: true }).click()
  expect((await handoffWait).status()).toBe(200)
  await expect(page).toHaveURL(/\/pratica$/)
  await expect(page.getByRole('heading', { name: 'Primeiro, vamos praticar.' })).toBeVisible()

  // Verificar no banco/history que painel /equipe exige reautenticacao antes de reexibir dados
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401)
  await finishPractice(page)
  await page.getByRole('button', { name: 'Começar tarefa' }).click()
  await expect(page.getByRole('heading', { name: 'Resumo da execução' })).toBeVisible({ timeout: 70_000 })
  await expect(page.getByRole('status')).toContainText('Resultado recebido pela equipe.', { timeout: 15_000 })

  const stored = manage('state', { session_id: onsiteIssued.session_id })
  expect([stored.state, stored.assessments, stored.trials, stored.metrics]).toEqual(['completed', 1, 16, 12])

  await page.goto('/equipe')
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
})

test('UX7-J3 — administrador corrige vinculo com auditoria e invalida previa anterior (409) sem mutar trials/metricas', async ({ page, context }) => {
  const admin = JSON.parse(execFileSync(python, [manageScript, 'professional'], {
    input: '{}', encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  })) as { cookie_name: string; token: string; csrf: string }
  await context.addCookies([{
    name: admin.cookie_name,
    value: admin.token,
    domain: '127.0.0.1',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  }])

  // Semear projeto com avaliacao e dois pacientes sinteticos via API real no contexto autenticado
  await page.goto('/equipe')
  const setup = await page.evaluate(async csrf => {
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }
    const tag = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
    const projRes = await fetch('/api/v1/projects', {
      method: 'POST', headers,
      body: JSON.stringify({ code: `SYNTH_J3_${tag}`, name: `Projeto J3 ${tag}` }),
    })
    if (!projRes.ok) throw new Error(`project setup failed: ${projRes.status}`)
    const proj = await projRes.json()
    const meRes = await fetch('/api/v1/auth/me')
    if (!meRes.ok) throw new Error(`auth/me failed: ${meRes.status}`)
    const me = await meRes.json()
    const memberRes = await fetch(`/api/v1/projects/${proj.id}/members/${me.user_id}`, {
      method: 'PUT', headers, body: JSON.stringify({ active: true }),
    })
    if (!memberRes.ok) throw new Error(`member setup failed: ${memberRes.status}`)
    const pat1Res = await fetch('/api/v1/patients', {
      method: 'POST', headers, body: JSON.stringify({ full_name: `Paciente Origem J3 ${tag}`, initials: 'POJ' }),
    })
    if (!pat1Res.ok) throw new Error(`pat1 setup failed: ${pat1Res.status}`)
    const pat1 = await pat1Res.json()
    const pat2Res = await fetch('/api/v1/patients', {
      method: 'POST', headers, body: JSON.stringify({ full_name: `Paciente Destino J3 ${tag}`, initials: 'PDJ' }),
    })
    if (!pat2Res.ok) throw new Error(`pat2 setup failed: ${pat2Res.status}`)
    const pat2 = await pat2Res.json()
    const evaRes = await fetch('/api/v1/evaluators', {
      method: 'POST', headers, body: JSON.stringify({ full_name: `Avaliador J3 ${tag}`, initials: 'AJ3' }),
    })
    if (!evaRes.ok) throw new Error(`eva setup failed: ${evaRes.status}`)
    const eva = await evaRes.json()
    const invRes = await fetch(`/api/v1/projects/${proj.id}/invitations`, {
      method: 'POST', headers,
      body: JSON.stringify({ patient_id: pat1.id, evaluator_id: eva.id, test_code: 'stroop_go_nogo_ptbr', visit: 'V_J3' }),
    })
    if (!invRes.ok) throw new Error(`inv setup failed: ${invRes.status}`)
    const inv = await invRes.json()
    return { project_id: proj.id, pat1, pat2, eva, inv }
  }, admin.csrf)

  // Concluir a avaliacao para ter trial_results e assessment_metrics reais
  const origin = new URL(page.url()).origin
  const partReq = await request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Origin: origin },
  })
  try {
    const redeemed = await partReq.post('/api/v1/participant/redeem', {
      data: { code: setup.inv.code },
    })
    expect(redeemed.status()).toBe(201)
    const pCsrf = (await redeemed.json()).csrf_token as string
    const bootstrapRes = await partReq.get('/api/v1/participant/session')
    expect(bootstrapRes.status()).toBe(200)
    const bootstrap = await bootstrapRes.json()
    const startedRes = await partReq.post('/api/v1/participant/start', {
      headers: { 'X-CSRF-Token': pCsrf }, data: { app_version: 'synthetic-j3' },
    })
    expect(startedRes.status()).toBe(200)
    const completeRes = await partReq.post('/api/v1/participant/complete', {
      headers: { 'X-CSRF-Token': pCsrf },
      data: {
        protocol_id: bootstrap.protocol_id, test_version: bootstrap.test_version, platform: 'web',
        app_version: 'synthetic-j3', frame_period_ms: 16,
        trials: bootstrap.main_conditions.map((c: { condition_id: number }, idx: number) => ({
          trial_number: idx + 1, condition_id: c.condition_id,
          key_pressed: c.condition_id % 2 === 0 ? 'space' : null,
          reaction_time_ms: c.condition_id % 2 === 0 ? 500 : null,
          trial_start_ms: idx * 3750, stimulus_onset_ms: idx * 3750 + 300,
          stimulus_offset_ms: idx * 3750 + 2800, trial_end_ms: (idx + 1) * 3750,
          key_at_ms: c.condition_id % 2 === 0 ? idx * 3750 + 800 : null,
        })),
      },
    })
    expect(completeRes.status()).toBe(201)
  } finally {
    await partReq.dispose()
  }

  // Gerar previa de exportacao antes da revinculacao e executar revinculacao auditada
  const outcome = await page.evaluate(async ({ csrf, projectId, pat2Id, sessionId }) => {
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }
    const q1 = await (await fetch('/api/v1/analysis/query', {
      method: 'POST', headers,
      body: JSON.stringify({ query: { projects: [projectId], filters: {} }, grouping: { level: 'assessment', dimension: 'project' }, page: {} }),
    })).json()
    const assessmentId = q1.items[0].assessment_id as string
    const prev = await (await fetch('/api/v1/exports/preview', {
      method: 'POST', headers,
      body: JSON.stringify({
        query_id: q1.query_id, query_fingerprint: q1.query_fingerprint, content_fingerprint: q1.content_fingerprint,
        granularity: 'avaliacoes', columns: ['assessment_id', 'participant_code', 'visit'], identification_mode: 'deidentified',
      }),
    })).json()
    const relinkRes = await fetch(`/api/v1/projects/${projectId}/assessments/${assessmentId}/relink`, {
      method: 'POST', headers,
      body: JSON.stringify({ patient_id: pat2Id, reason_code: 'correcao_j3_auditada' }),
    })
    const staleDl = await fetch('/api/v1/exports/download', {
      method: 'POST', headers,
      body: JSON.stringify({
        query_id: q1.query_id, query_fingerprint: q1.query_fingerprint, content_fingerprint: q1.content_fingerprint,
        granularity: 'avaliacoes', columns: ['assessment_id', 'participant_code', 'visit'],
        identification_mode: 'deidentified', export_token: prev.export_token,
      }),
    })
    const q2 = await (await fetch('/api/v1/analysis/query', {
      method: 'POST', headers,
      body: JSON.stringify({ query: { projects: [projectId], filters: {} }, grouping: { level: 'assessment', dimension: 'project' }, page: {} }),
    })).json()
    return {
      relinkStatus: relinkRes.status,
      staleStatus: staleDl.status,
      beforeFp: q1.content_fingerprint,
      afterFp: q2.content_fingerprint,
      beforeSummary: q1.items[0].summary,
      afterSummary: q2.items[0].summary,
      afterParticipant: q2.items[0].participant_id,
      sessionId,
    }
  }, { csrf: admin.csrf, projectId: setup.project_id, pat2Id: setup.pat2.id, sessionId: setup.inv.session_id })

  expect(outcome.relinkStatus).toBe(200)
  expect(outcome.staleStatus).toBe(409)
  expect(outcome.afterFp).not.toBe(outcome.beforeFp)
  expect(outcome.afterParticipant).toBe(setup.pat2.participant_code)
  expect(outcome.afterSummary).toEqual(outcome.beforeSummary)

  const stored = manage('state', { session_id: setup.inv.session_id })
  expect([stored.assessments, stored.trials, stored.metrics]).toEqual([1, 16, 12])
})
