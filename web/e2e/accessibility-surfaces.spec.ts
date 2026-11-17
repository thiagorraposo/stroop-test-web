import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { analysisFixture } from '../src/test/analysis-fixture'

const catalog = '/e2e/fixtures/component-catalog.html'
const widths = [360, 768, 1024, 1366, 1920, 320]
async function noOverflow(page: Page) {
  const measured = await page.evaluate(() => {
    const client = document.documentElement.clientWidth, scroll = document.documentElement.scrollWidth
    return { client, scroll, overflow: scroll <= client ? [] : [...document.querySelectorAll('body *')]
      .filter(el => el.getClientRects().length && el.getBoundingClientRect().right > client)
      .map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0, 70), right: el.getBoundingClientRect().right })).slice(0, 12) }
  })
  expect(measured.scroll, JSON.stringify(measured)).toBeLessThanOrEqual(measured.client)
}
async function loginSurface(page: Page) {
  await page.route('**/api/v1/auth/me', route => route.fulfill({ status: 401, json: { error: { code: 'authentication_required' } } }))
  await page.goto('/equipe')
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
}
async function contrast(locator: Locator, part: 'color' | 'borderTopColor' = 'color') {
  return locator.evaluate((element, property) => {
    type Color = [number, number, number, number]
    const parse = (value: string): Color => { const v = value.match(/[\d.]+/g)!.map(Number); return [v[0]!, v[1]!, v[2]!, v[3] ?? 1] }
    const blend = (fg: Color, bg: Color): Color => [...fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i]! * (1 - fg[3])), 1] as Color
    let background: Color = [255, 255, 255, 1]
    const ancestors: Element[] = []
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node)
    for (const node of ancestors) background = blend(parse(getComputedStyle(node).backgroundColor), background)
    const foreground = blend(parse(getComputedStyle(element)[property]), background)
    const luminance = (color: Color) => {
      const c = color.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722
    }
    const a = luminance(foreground), b = luminance(background)
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), text: element.textContent?.slice(0, 80), foreground, background }
  }, part)
}

test('COMP7-AA: tooltip permanece pelo ponteiro, dispensa com Escape e ação permite cancelamento', async ({ page }) => {
  await page.goto(catalog)
  const help = page.getByRole('button', { name: 'Sobre o denominador' }), tooltip = page.getByRole('tooltip')
  await help.hover(); await expect(tooltip).toBeVisible()
  await tooltip.hover(); await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape'); await expect(tooltip).toHaveCount(0)
  await page.mouse.move(0, 0); await help.focus(); await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape')
  const update = page.getByRole('button', { name: 'Atualizar exemplo', exact: true })
  await update.hover(); await page.mouse.down()
  const count = page.getByRole('status').filter({ hasText: 'Atualizações:' })
  await expect(count).toHaveText('Atualizações: 0')
  await page.mouse.move(0, 0); await page.mouse.up(); await expect(count).toHaveText('Atualizações: 0')
  await update.click(); await expect(count).toHaveText('Atualizações: 1')
})

test('COMP7-AA: percurso completo por Tab tem foco visível sem cobertura e alvos suficientes', async ({ page }) => {
  await page.goto(catalog); await page.setViewportSize({ width: 360, height: 800 })
  const expected = await page.locator('button,input,select,textarea,summary,[tabindex]').evaluateAll(elements =>
    elements.filter((el): el is HTMLElement => el instanceof HTMLElement && el.tabIndex >= 0 && el.getClientRects().length > 0
      && (!el.closest('details:not([open])') || !!el.closest('details:not([open])')?.querySelector(':scope > summary')?.contains(el))
      && !el.matches(':disabled') && !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked))
      .map((el, index) => { el.dataset.focusProbe = String(index); return String(index) }))
  await page.getByRole('button', { name: 'Validar exemplo', exact: true }).focus()
  const visited = new Set<string>()
  for (let count = 0; count < 160; count++) {
    const current = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      if (!el || el === document.body) return null
      const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return { key: el.dataset.focusProbe, label: `${el.tagName}:${el.id}:${el.textContent}`, y: r.y, right: r.right, bottom: r.bottom,
        width: r.width, height: r.height, viewport: innerHeight, clientWidth: document.documentElement.clientWidth,
        outline: getComputedStyle(el).outlineStyle, covered: !hit || !(el === hit || el.contains(hit)) }
    })
    if (current?.key) {
      visited.add(current.key)
      expect(current.outline, current.label).not.toBe('none'); expect(current.covered, current.label).toBe(false)
      expect(current.y, current.label).toBeGreaterThanOrEqual(0)
      expect(current.bottom, current.label).toBeLessThanOrEqual(current.viewport)
      expect(current.right, current.label).toBeLessThanOrEqual(current.clientWidth)
      expect(current.width, current.label).toBeGreaterThanOrEqual(24); expect(current.height, current.label).toBeGreaterThanOrEqual(24)
      if (current.key === expected.at(-1)) break
    }
    await page.keyboard.press('Tab')
    if (count === 159) throw new Error(`Percurso não alcançou todos os controles: ${JSON.stringify([...visited])}`)
  }
  expect([...visited].sort()).toEqual(expected.sort())
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Abrir navegação móvel', exact: true })).toBeFocused()
})

test('COMP7-AA: contraste computado cobre variantes hover seleção erro ajuda e campos', async ({ page }) => {
  await page.goto(catalog)
  for (const name of ['Validar exemplo', 'Limpar erro', 'Confirmar inativação', 'Sobre o denominador']) {
    const button = page.getByRole('button', { name, exact: true })
    for (const state of ['normal', 'hover', 'focus']) {
      await page.mouse.move(0, 0)
      if (state === 'hover') await button.hover()
      if (state === 'focus') await button.focus()
      const result = await contrast(button)
      expect(result.ratio, `${name} ${state}: ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(4.5)
    }
  }
  await page.getByRole('button', { name: 'Validar exemplo', exact: true }).click()
  await page.getByRole('tab', { name: 'Resumo' }).focus(); await page.keyboard.press('ArrowRight')
  await page.getByRole('combobox', { name: 'Projeto contextual' }).focus(); await page.keyboard.press('ArrowDown')
  for (const selector of ['.ui-field label', '.ui-hint', '.ui-field-error', '.ui-badge', '[role=tab][aria-selected=true]', '.ui-option-active', '.ui-field input:not(:disabled)', '.ui-field select']) {
    for (const element of await page.locator(selector).all()) {
      if (await element.isVisible()) { const result = await contrast(element); expect(result.ratio, `${selector}: ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(4.5) }
    }
  }
  await page.getByRole('button', { name: 'Sobre o denominador' }).hover()
  expect((await contrast(page.getByRole('tooltip'))).ratio).toBeGreaterThanOrEqual(4.5)
  for (const field of await page.locator('.ui-field input:not(:disabled), .ui-field select').all()) expect((await contrast(field, 'borderTopColor')).ratio).toBeGreaterThanOrEqual(3)
})

test('COMP7-AA: orientação e espaçamento mantêm conteúdo tabelas e estados sem corte', async ({ page }, info) => {
  await page.goto(catalog)
  await page.getByRole('button', { name: 'Validar exemplo', exact: true }).click()
  await page.getByText('Tabela de coletas sintéticas', { exact: true }).click()
  await page.addStyleTag({ content: '.professional-theme, .professional-theme * { line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important; } .professional-theme p { margin-bottom:2em !important; }' })
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow(page)
    const clipped = await page.locator('h1,h2,h3,p,label,legend,button,summary').evaluateAll(elements => elements.filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
      && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)).map(el => el.textContent))
    expect(clipped).toEqual([])
    await expect(page.getByRole('table', { name: 'Avaliações sintéticas por projeto' })).toHaveCount(2)
    if ([360, 1366].includes(width)) await page.screenshot({ path: info.outputPath(`catalog-spacing-${width}.png`), fullPage: true })
  }
  for (const [width, height] of [[360, 800], [800, 360]]) { await page.setViewportSize({ width: width!, height: height! }); await noOverflow(page) }
})

test('UX7-AA: início e login mantêm reflow marca nomes e propósito dos campos', async ({ page }, info) => {
  for (const route of ['/', '/equipe']) {
    if (route === '/equipe') await loginSurface(page); else await page.goto(route)
    await expect(page).toHaveTitle(/Stroop Test Web/); await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 }); await noOverflow(page)
      if ([360, 1366].includes(width)) await page.screenshot({ path: info.outputPath(`${route === '/' ? 'home' : 'login'}-${width}.png`), fullPage: true })
    }
  }
  await expect(page.getByLabel('Usuário', { exact: true })).toHaveAttribute('autocomplete', 'username')
  await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('autocomplete', 'current-password')
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
})

test('UX7-AA: login anuncia envio associa erro e conserva usuário sem conservar senha', async ({ page }) => {
  await loginSurface(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/auth/login', async route => { await gate; await route.fulfill({ status: 401, json: { error: { code: 'authentication_required' } } }) })
  await page.getByLabel('Usuário', { exact: true }).fill('SYNTHETIC_ACCESSIBILITY')
  const password = page.getByLabel('Senha', { exact: true })
  await password.fill('Frase sintética de acessibilidade 2026!'); await password.press('Enter')
  await expect(page.getByRole('status')).toContainText('Verificando credenciais'); await expect(password).toHaveValue('')
  release()
  const error = page.getByRole('alert')
  await expect(error).toHaveText('Usuário ou senha inválidos.'); await expect(password).toBeFocused()
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  expect((await password.getAttribute('aria-describedby'))?.split(' ')).toContain(await error.getAttribute('id'))
  await expect(page.getByLabel('Usuário', { exact: true })).toHaveValue('SYNTHETIC_ACCESSIBILITY')
})

test('UX7-AA: contraste público e login, skip link e erro de serviço não invalidam credenciais', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('main')).toBeFocused()
  const skip = page.getByRole('link', { name: 'Ir para o conteúdo', exact: true })
  for (let count = 0; count < 5 && !await skip.evaluate(el => el === document.activeElement); count++) await page.keyboard.press('Shift+Tab')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter'); await expect(page.getByRole('main')).toBeFocused()
  for (const route of ['/', '/equipe']) {
    if (route === '/equipe') await loginSurface(page); else await page.goto('/')
    for (const selector of ['main :is(h1,h2,h3,label,p)', '.hero-card .journey-indicator :is(li,span)', '.site-footer', 'nav a', '.brand', '.brand-subtitle', '.professional-credentials input', '.professional-credentials button']) {
      for (const element of await page.locator(selector).all()) {
        if (await element.isVisible()) { const result = await contrast(element); expect(result.ratio, `${route} ${selector}: ${JSON.stringify(result)}`).toBeGreaterThanOrEqual(4.5) }
      }
    }
    for (const field of await page.locator('.professional-credentials input').all()) expect((await contrast(field, 'borderTopColor')).ratio).toBeGreaterThanOrEqual(3)
  }
  await page.route('**/api/v1/auth/login', route => route.fulfill({ status: 503, json: { error: { code: 'service_unavailable' } } }))
  await page.getByLabel('Usuário', { exact: true }).fill('SYNTHETIC_ACCESSIBILITY')
  const password = page.getByLabel('Senha', { exact: true })
  await password.fill('Frase sintética 2026!'); await password.press('Enter')
  await expect(page.getByRole('alert')).toContainText('temporariamente indisponível')
  await expect(password).not.toHaveAttribute('aria-invalid', 'true')
  expect((await password.getAttribute('aria-describedby'))?.split(' ')).toContain(await page.getByRole('alert').getAttribute('id'))
})

test('UX7-AA: texto ampliado e espaçamento público preservam leitura em retrato e paisagem', async ({ page }) => {
  for (const route of ['/', '/equipe']) {
    if (route === '/equipe') await loginSurface(page); else await page.goto('/')
    await page.evaluate(() => {
      const fonts = [...document.querySelectorAll<HTMLElement>('body, body *')]
        .filter(el => el instanceof HTMLElement).map(el => [el, parseFloat(getComputedStyle(el).fontSize)] as const)
      for (const [el, size] of fonts) el.style.fontSize = `${size * 2}px`
    })
    for (const [width, height] of [[360, 800], [800, 360], [1366, 900]]) {
      await page.setViewportSize({ width: width!, height: height! }); await noOverflow(page)
    }
    await page.addStyleTag({ content: 'body, body * { line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important; } p { margin-bottom:2em !important; }' })
    await page.setViewportSize({ width: 360, height: 800 }); await noOverflow(page)
    if (route === '/equipe') {
      await page.getByLabel('Usuário', { exact: true }).fill('SYNTHETIC_LARGE_TEXT')
      await expect(page.getByLabel('Usuário', { exact: true })).toHaveValue('SYNTHETIC_LARGE_TEXT')
    } else await expect(page.getByRole('link', { name: 'Iniciar tutorial' })).toBeVisible()
  }
})

test('UX7-AA: orientações, 404, barra autenticada e troca de senha mantêm contraste reflow e associação de erros', async ({ page }) => {
  for (const route of ['/instrucoes', '/rota-inexistente']) {
    await page.goto(route)
    await expect(page).toHaveTitle(/Stroop Test Web/)
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 }); await noOverflow(page)
    }
    for (const element of await page.locator('main :is(h1,h2,p,a), .site-footer, nav a').all()) {
      if (await element.isVisible()) expect((await contrast(element)).ratio).toBeGreaterThanOrEqual(4.5)
    }
  }
  const projectId = '11111111-1111-4111-8111-111111111111'
  let authFailed = true
  await page.route('**/api/v1/auth/me', route => authFailed
    ? route.fulfill({ status: 503, json: { error: { code: 'service_unavailable' } } })
    : route.fulfill({ json: { user_id: 'synthetic', role: 'administracao', csrf_token: 's'.repeat(43), expires_at: new Date(Date.now() + 3600000).toISOString() } }))
  await page.route('**/api/v1/projects?*', route => route.fulfill({ json: { items: [{ id: projectId, code: 'PROJ_AA', name: 'Projeto Acessível', active: true, created_at: '2026-11-16T00:00:00Z' }], next_cursor: null } }))
  await page.route('**/api/v1/patients*', route => route.fulfill({ json: { items: [{ id: '22222222-2222-4222-8222-222222222222', participant_code: 'PAT-20261116-000001' }], total: 1, page: 1, page_size: 100 } }))
  await page.route('**/api/v1/projects/*/assessments/options*', route => route.fulfill({ json: { participant_id: ['PAT-20261116-000001'], visit: ['V1'], evaluator_id: ['EVA-000001'], test_version: ['1.0.0'], platform: ['web'], test_code: ['stroop_go_nogo_ptbr'] } }))
  await page.route('**/api/v1/analysis/query', route => route.fulfill({ json: analysisFixture(route.request().postDataJSON(), []) }))
  await page.goto('/equipe')
  await expect(page.getByRole('alert')).toContainText('temporariamente indisponível')
  authFailed = false
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await expect(page.getByText('Sua sessão está ativa.', { exact: true })).toBeVisible()
  await page.getByText('Alterar senha', { exact: true }).click()
  const currentPwd = page.getByLabel('Senha atual', { exact: true })
  const newPwd = page.getByLabel('Nova senha', { exact: true })
  const confirmPwd = page.getByLabel('Confirmar nova senha', { exact: true })
  await expect(currentPwd).toHaveAttribute('autocomplete', 'current-password')
  await expect(newPwd).toHaveAttribute('autocomplete', 'new-password')
  await expect(confirmPwd).toHaveAttribute('autocomplete', 'new-password')
  await currentPwd.fill('Frase sintética atual 2026!')
  await newPwd.fill('Frase sintética nova 2026!')
  await confirmPwd.fill('Frase divergente 2026!')
  await page.getByRole('button', { name: 'Confirmar nova senha e encerrar sessões', exact: true }).click()
  const pwdAlert = page.locator('.password-settings [role="alert"]')
  await expect(pwdAlert).toContainText('não corresponde')
  await expect(newPwd).toBeFocused()
  await expect(newPwd).toHaveAttribute('aria-invalid', 'true')
  expect((await newPwd.getAttribute('aria-describedby'))?.split(' ')).toContain(await pwdAlert.getAttribute('id'))
  const form = page.getByRole('form', { name: 'Filtros da consulta' })
  await form.getByLabel('Data inicial', { exact: true }).fill('2026-11-16')
  await form.getByLabel('Data final', { exact: true }).fill('2026-11-01')
  await form.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  const filterAlert = form.getByRole('alert')
  await expect(filterAlert).toContainText('anterior ou igual')
  await expect(form.getByLabel('Data inicial', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  expect(await form.getByLabel('Data inicial', { exact: true }).getAttribute('aria-describedby')).toBe(await filterAlert.getAttribute('id'))
  await form.getByText('Filtros avançados e ordenação', { exact: true }).click()
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow(page)
  }
  for (const selector of ['.session-bar :is(p,button)', '.password-settings :is(summary,p,label,button)', '.research-filters :is(h3,p,label,legend,summary,button)']) {
    for (const element of await page.locator(selector).all()) {
      if (await element.isVisible()) expect((await contrast(element)).ratio, selector).toBeGreaterThanOrEqual(4.5)
    }
  }
})

test('UX7-AA: módulos autenticados (análise, histórico, exportação, nova avaliação e gestão) mantêm reflow e contraste', async ({ page }) => {
  const projectId = '11111111-1111-4111-8111-111111111111'
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { user_id: 'synthetic', role: 'administracao', csrf_token: 's'.repeat(43), expires_at: new Date(Date.now() + 3600000).toISOString() } }))
  await page.route('**/api/v1/projects?*', route => route.fulfill({ json: { items: [{ id: projectId, code: 'PROJ_AA', name: 'Projeto Acessível', active: true, created_at: '2026-11-16T00:00:00Z' }], next_cursor: null } }))
  await page.route('**/api/v1/projects/*/members*', route => route.fulfill({ json: { items: [], next_cursor: null } }))
  await page.route('**/api/v1/patients*', route => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 100 } }))
  await page.route('**/api/v1/evaluators*', route => route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 100 } }))
  await page.route('**/api/v1/administration/users', route => route.fulfill({ json: { items: [], next_cursor: null } }))
  await page.route('**/api/v1/projects/*/assessments/options*', route => route.fulfill({ json: { participant_id: [], visit: [], evaluator_id: [], test_version: ['0.2.2-web.1'], platform: ['web'], test_code: ['stroop_go_nogo_ptbr'] } }))
  await page.route('**/api/v1/analysis/query', route => route.fulfill({ json: analysisFixture(route.request().postDataJSON(), []) }))

  await page.goto('/equipe')
  await expect(page.getByText('Sua sessão está ativa.', { exact: true })).toBeVisible()
  for (const tabName of ['Avaliações e histórico', 'Resultados e análises', 'Exportações']) {
    await page.getByRole('tab', { name: tabName, exact: true }).click()
    for (const width of [360, 768, 1366, 320]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(page) }
  }
  await page.setViewportSize({ width: 1366, height: 900 })
  const axes = page.getByRole('navigation', { name: 'Eixos profissionais' })
  await axes.getByRole('button', { name: 'Nova Avaliação', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Preparar avaliação' })).toBeVisible()
  for (const width of [360, 768, 1366, 320]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(page) }
  await page.setViewportSize({ width: 1366, height: 900 })
  await axes.getByRole('button', { name: 'Gestão', exact: true }).click()
  for (const tabName of ['Pacientes', 'Avaliadores', 'Administração']) {
    await page.getByRole('tab', { name: tabName, exact: true }).click()
    for (const width of [360, 768, 1366, 320]) { await page.setViewportSize({ width, height: 900 }); await noOverflow(page) }
  }
})
