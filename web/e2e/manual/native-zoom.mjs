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
    await page.route('**/api/v1/auth/me', route => route.fulfill({ status: 401, json: { error: { code: 'authentication_required' } } }))
    for (const [surface, path] of [['catalog', '/e2e/fixtures/component-catalog.html'], ['home', '/'], ['login', '/equipe']]) {
      await page.goto(`http://127.0.0.1:${port}${path}`)
      await page.bringToFront()
      await page.getByRole('main').waitFor()
      if (surface === 'login') await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor()
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
