/** Ensaio Linux opt-in de zoom do navegador; não altera CSS nem prefs de escala. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, firefox } from 'playwright'

const display = process.env.STROOP_ZOOM_DISPLAY
assert.match(display ?? '', /^:9[0-9]$/, 'Use um Xephyr dedicado :90..:99')
const port = Number(process.env.WEB_TEST_PORT ?? 4294)
assert(Number.isInteger(port) && port >= 1024 && port <= 65535)
const output = new URL('../../test-results/native-zoom/', import.meta.url)
await mkdir(output, { recursive: true })
const helper = fileURLToPath(new URL('./native-zoom-key.py', import.meta.url))
const key = (...args) => execFileSync('python3', [helper, display, ...args])

for (const [name, engine] of Object.entries({ chromium, firefox })) {
  const browser = await engine.launch({ headless: false, env: { ...process.env, DISPLAY: display } })
  try {
    const context = await browser.newContext({ viewport: null })
    const page = await context.newPage()
    let authenticated = false
    const expires = new Date(Date.now() + 900_000).toISOString()
    const projectId = '11111111-1111-4111-8111-111111111111'
    await page.route('**/api/v1/auth/me', route => authenticated
      ? route.fulfill({ json: { user_id: 'local:synthetic_zoom', role: 'administracao', expires_at: expires, csrf_token: 'csrf-zoom' } })
      : route.fulfill({ status: 401, json: { error: { code: 'authentication_required' } } }))
    await page.route('**/api/v1/projects', route => route.fulfill({ json: { projects: [{ project_id: projectId, code: 'stroop-zoom', name: 'Projeto Sintético Zoom' }] } }))
    await page.route('**/api/v1/projects/*/assessments/options*', route => route.fulfill({ json: { participants: ['PAT-000001'], visits: ['T1'], evaluators: ['EVA-000001'], instruments: [{ test_code: 'stroop_go_nogo_ptbr', name: 'Stroop Go/No-Go', versions: ['0.2.2-web.1'] }] } }))
    await page.route('**/api/v1/patients*', route => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 100 } }))
    await page.route('**/api/v1/evaluators*', route => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 100 } }))
    await page.route('**/api/v1/admin/users', route => route.fulfill({ json: { users: [], projects: [{ project_id: projectId, code: 'stroop-zoom', name: 'Projeto Sintético Zoom', active: true }] } }))
    await page.route('**/api/v1/analysis/query', route => {
      const body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ json: {
        query_id: '33333333-3333-4333-8333-333333333333', normalized_query: body.query,
        query_fingerprint: 'a'.repeat(64), content_fingerprint: 'b'.repeat(64), expires_at: expires,
        completeness: 'complete', counts: { participants: 0, visits: 0, assessments: 0, trials: 0 },
        registry_counts: { visible_patients: 0, project_linked_patients: 0, valid_assessment_participants: 0, filtered_participants: 0 },
        operational: { population: 'segregated_non_official_sessions', counts: { invalidated: 0, aborted: 0, expired: 0, in_progress: 0, total: 0 }, items: [] },
        aggregates: [{ project_id: projectId, assessments: 0, trials: 0 }],
        analytics: { grouping: body.grouping, timezone: 'UTC', week_start: 'monday', population: 'complete_assessment_metrics_and_selected_main_trials', compatibility: 'stratified_by_test_version_protocol_platform', groups: [], indicators: [] },
        items: [], next_cursor: null,
        indicator_definitions: { counts: { kind: 'operational_count', population: 'official_assessments_and_main_trials', timezone: 'UTC', participant_identity: ['project_id', 'participant_code'], visit_identity: ['project_id', 'participant_code', 'visit'] }, summary: { source: 'stroop.domain.stroop.calculate_metrics', population: 'complete_assessment', rt_unit: 'seconds' } },
        capabilities: { filters: ['date_from', 'date_to', 'participant_code', 'patient_id', 'visit', 'evaluator_id', 'test_code', 'test_version', 'platform', 'status', 'patient_search', 'accuracy_min', 'accuracy_max', 'rt_median_min_ms', 'rt_median_max_ms', 'include_null_rt', 'go_accuracy_min', 'go_accuracy_max', 'no_go_accuracy_min', 'no_go_accuracy_max', 'has_commission_errors', 'has_omission_errors'], status: ['valid', 'invalidated', 'aborted', 'expired', 'in_progress'], trial_filters: { stroop_go_nogo_ptbr: ['condition', 'response_type', 'go_nogo'] }, grouping: [body.grouping], sort: ['started_at_desc', 'started_at_asc', 'participant_code_asc', 'participant_code_desc', 'visit_asc', 'accuracy_asc', 'accuracy_desc', 'response_time_asc', 'response_time_desc'], platform: ['web', 'psychopy_local'], max_assessments: 5000, max_projects: 20, exports: true, nominal_search: false },
        legacy_export_context: { filters: {}, projects: [{ project_id: projectId, snapshot: 'synthetic' }] },
      } })
    })
    for (const [surface, path] of [['catalog', '/e2e/fixtures/component-catalog.html'], ['home', '/'], ['login', '/equipe'], ['authenticated', '/equipe']]) {
      authenticated = surface === 'authenticated'
      await page.goto(`http://127.0.0.1:${port}${path}`)
      await page.bringToFront()
      await page.getByRole('main').waitFor()
      if (surface === 'login') await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor()
      if (surface === 'authenticated') await page.getByRole('heading', { name: 'Resultados e análise unificada' }).waitFor()
      await page.waitForTimeout(1000) // Aguarda o título/gerenciador da janela X11.
      for (const [initialWidth, target] of [[1366, 2], [1920, 2], [1280, 4]]) {
        key('resize', String(initialWidth)); key('0')
        await page.waitForTimeout(300)
        const size = () => page.evaluate(() => ({ ratio: devicePixelRatio, width: innerWidth }))
        let base = await size()
        // Firefox inclui decoração na janela X11; conferir a largura CSS real a 100%.
        if (base.width !== initialWidth) {
          key('resize', String(initialWidth + initialWidth - base.width))
          await page.waitForTimeout(300)
          base = await size()
        }
        assert.equal(base.width, initialWidth)
        let actual = 1
        for (let count = 0; count < 24 && actual < target - .01; count++) {
          key('equal')
          await page.waitForTimeout(300)
          actual = (await size()).ratio / base.ratio
        }
        const measured = await page.evaluate(() => ({ viewport: innerWidth,
          clientWidth: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth, ratio: devicePixelRatio,
          cssZoom: document.documentElement.style.zoom }))
        console.log(JSON.stringify({ surface, browser: name, version: browser.version(), initialWidth, target, actual, ...measured }))
        assert(Math.abs(actual - target) < .02, 'Zoom nativo não comprovado')
        assert.equal(measured.cssZoom, '')
        assert(measured.scroll <= measured.clientWidth, 'Scroll horizontal global')
        if (target === 4) assert.equal(measured.viewport, 320)
        if (surface === 'catalog') {
          const trigger = page.getByRole('button', { name: 'Abrir diálogo', exact: true })
          await trigger.focus(); await trigger.press('Enter')
          const dialog = page.getByRole('dialog', { name: 'Conferir dados sintéticos' })
          assert(await dialog.isVisible())
          const box = await dialog.evaluate(el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width }))
          assert(box.x >= 0 && box.x + box.width <= measured.viewport, 'Diálogo excede viewport')
          key('capture', fileURLToPath(new URL(`${surface}-${name}-${initialWidth}-${target}-dialog.png`, output)))
          await page.keyboard.press('Tab')
          assert(await dialog.evaluate(el => el.contains(document.activeElement)))
          await page.keyboard.press('Escape')
          assert(await trigger.evaluate(el => el === document.activeElement))
        } else if (surface === 'login') {
          await page.getByLabel('Usuário', { exact: true }).focus()
          await page.keyboard.insertText('SYNTHETIC_ZOOM')
          assert.equal(await page.getByLabel('Usuário', { exact: true }).inputValue(), 'SYNTHETIC_ZOOM')
          await page.getByLabel('Usuário', { exact: true }).fill('')
        }
        // Captura X11 não muda viewport/zoom nem depende das coordenadas do driver.
        key('capture', fileURLToPath(new URL(`${surface}-${name}-${initialWidth}-${target}.png`, output)))
      }
    }
  } finally {
    await browser.close()
  }
}
