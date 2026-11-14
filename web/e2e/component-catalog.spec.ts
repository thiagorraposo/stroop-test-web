import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.goto('/e2e/fixtures/component-catalog.html') })

test('COMP7: busca e seleção por teclado preservam opções e campos após erro', async ({ page }) => {
  const projects = page.getByRole('group', { name: 'Projetos sintéticos', exact: true })
  await projects.getByRole('searchbox').fill('B')
  await expect(projects.getByRole('checkbox', { name: 'Projeto sintético A' })).toBeChecked()
  const second = projects.getByRole('checkbox', { name: 'Projeto sintético B' })
  await second.focus(); await page.keyboard.press('Space')
  await expect(second).toBeChecked()
  await projects.getByRole('searchbox').fill('sem correspondência')
  await expect(second).toBeVisible()
  await second.focus(); await page.keyboard.press('Space')
  await expect(second).not.toBeChecked()
  await expect(second).toBeFocused()
  await page.keyboard.press('Space'); await expect(second).toBeChecked()
  const combo = page.getByRole('combobox', { name: 'Projeto contextual' })
  await combo.fill('B'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
  await expect(combo).toHaveValue('Projeto sintético B')
  await combo.fill('Não existe'); await page.keyboard.press('Escape')
  await expect(combo).toHaveValue('Projeto sintético B')
  const input = page.getByRole('textbox', { name: 'Identificação sintética' })
  await input.fill('VALOR_SINTETICO_MANTIDO')
  await page.getByRole('button', { name: 'Validar exemplo', exact: true }).click()
  await expect(input).toHaveValue('VALOR_SINTETICO_MANTIDO')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  const message = page.getByRole('alert').filter({ hasText: 'Confira o valor informado' })
  expect((await input.getAttribute('aria-describedby'))?.split(' ')).toContain(await message.getAttribute('id'))
  await page.getByRole('button', { name: 'Limpar erro' }).click()
  await expect(input).not.toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveValue('VALOR_SINTETICO_MANTIDO')
})

test('COMP7: tabs, tooltip e sobreposições gerenciam teclado, Escape e retorno de foco', async ({ page }) => {
  await page.getByRole('tab', { name: 'Resumo' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Detalhes' })).toBeFocused()
  await expect(page.getByRole('tabpanel')).toContainText('Detalhes sintéticos')
  await page.keyboard.press('Home')
  await expect(page.getByRole('tab', { name: 'Resumo' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Sobre o denominador' }).focus()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toHaveCount(0)
  for (const [trigger, title] of [['Abrir diálogo', 'Conferir dados sintéticos'], ['Abrir navegação móvel', 'Navegação de exemplo'], ['Abrir exportação', 'Exportar seleção aplicada']]) {
    const button = page.getByRole('button', { name: trigger!, exact: true })
    await button.click()
    const dialog = page.getByRole('dialog', { name: title! })
    await expect(dialog).toBeVisible()
    for (let count = 0; count < 6; count++) {
      await page.keyboard.press(count % 2 ? 'Shift+Tab' : 'Tab')
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(button).toBeFocused()
  }
})

test('COMP7: catálogo reflow, zoom, espaçamento e isolamento dos tokens', async ({ page }, info) => {
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-action'))).toBe('')
  for (const width of [360, 768, 1024, 1366, 1920, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `scroll global em ${width}`).toBe(true)
    await page.getByText('Tabela de coletas sintéticas', { exact: true }).click()
    await expect(page.getByRole('table', { name: 'Avaliações sintéticas por projeto' })).toHaveCount(2)
    await page.getByText('Tabela de coletas sintéticas', { exact: true }).click()
    await page.getByRole('button', { name: 'Abrir diálogo', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Conferir dados sintéticos' })
    const bounds = await dialog.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    await page.keyboard.press('Escape')
    if ([360, 1366].includes(width)) await page.screenshot({ path: info.outputPath(`catalog-${width}.png`), fullPage: true })
  }
  for (const [width, zoom] of [[1366, 2], [1920, 2], [1280, 4]]) {
    await page.setViewportSize({ width: width!, height: 900 })
    await page.evaluate(scale => { document.documentElement.style.zoom = String(scale) }, zoom)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} / ${zoom}`).toBe(true)
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
    const style = document.createElement('style')
    style.textContent = '.professional-theme, .professional-theme * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } .professional-theme p { margin-bottom: 2em !important; }'
    document.head.append(style)
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByRole('button', { name: 'Validar exemplo', exact: true })).toBeVisible()
})

test('COMP7: contraste dos tokens e alvos dos controles', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Validar exemplo', exact: true })).toHaveCSS('background-color', 'rgb(109, 40, 217)')
  await expect(page.getByRole('button', { name: 'Validar exemplo', exact: true })).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(page.getByRole('button', { name: 'Confirmar inativação', exact: true })).toHaveCSS('color', 'rgb(153, 27, 27)')
  const ratios = await page.locator('.professional-theme').evaluate(element => {
    const style = getComputedStyle(element)
    const luminance = (hex: string) => {
      const digits = hex.trim().replace('#', '')
      const full = digits.length === 3 ? [...digits].map(value => value + value).join('') : digits
      const parts = full.match(/../g)!.map(value => parseInt(value, 16) / 255)
      const linear = parts.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      return linear[0]! * .2126 + linear[1]! * .7152 + linear[2]! * .0722
    }
    return [['--ui-text', '--ui-surface'], ['--ui-muted', '--ui-background'], ['--ui-action', '--ui-surface'],
      ['--ui-success-text', '--ui-success-bg'], ['--ui-warning-text', '--ui-warning-bg'], ['--ui-error-text', '--ui-error-bg'],
      ['--ui-border', '--ui-surface'], ['--ui-focus', '--ui-surface']].map(([foreground, background]) => {
        const a = luminance(style.getPropertyValue(foreground!)), b = luminance(style.getPropertyValue(background!))
        return { foreground, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
      })
  })
  for (const pair of ratios) expect(pair.ratio, `${pair.foreground} / ${pair.background}`).toBeGreaterThanOrEqual(4.5)
  for (const control of await page.locator('.ui-button:visible, .ui-choice input:visible').all()) {
    const box = await control.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(24)
    expect(box!.width).toBeGreaterThanOrEqual(24)
  }
})

test('COMP7: datas, escolhas, busca vazia, retry e estados indisponíveis são operáveis', async ({ page }) => {
  await page.getByLabel('Data inicial', { exact: true }).fill('2026-11-14')
  await page.getByLabel('Data final', { exact: true }).fill('2026-11-13')
  await expect(page.getByRole('alert').filter({ hasText: 'A data final' })).toBeVisible()
  await page.getByLabel('Data final', { exact: true }).fill('2026-11-15')
  await expect(page.getByLabel('Data final', { exact: true })).not.toHaveAttribute('aria-invalid', 'true')
  const checkbox = page.getByRole('checkbox', { name: 'Incluir ausentes' })
  await checkbox.focus(); await page.keyboard.press('Space'); await expect(checkbox).toBeChecked()
  await page.getByRole('radio', { name: 'Sintético', exact: true }).focus(); await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('radio', { name: 'Desidentificado', exact: true })).toBeChecked()
  const group = page.getByRole('group', { name: 'Projetos sintéticos', exact: true })
  await group.getByRole('checkbox', { name: 'Projeto sintético A' }).uncheck()
  await group.getByRole('searchbox').fill('NÃO_EXISTE')
  await expect(group.getByRole('status')).toHaveText('Nenhuma opção corresponde à busca.')
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Atualizações:' })).toHaveText('Atualizações: 1')
  await expect(page.getByRole('button', { name: 'Indisponível', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Salvando…', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Salvando…', exact: true })).toHaveAttribute('aria-busy', 'true')
  await page.getByRole('button', { name: 'Confirmar inativação', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Confirmar inativação' })).toContainText('Nenhum cadastro será alterado')
  await page.keyboard.press('Escape')
})
