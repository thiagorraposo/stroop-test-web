// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { encodeQrMatrix, QrCodeSvg } from './QrCodeSvg'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let container: HTMLDivElement | null = null
let root: ReturnType<typeof createRoot> | null = null

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  container?.remove()
  root = null
  container = null
})

test('gera matriz QR determinística localmente sem rede para código de convite', () => {
  const matrix = encodeQrMatrix('SINTETICO_CONVITE_QR_12345678901234567890123')
  expect(matrix.length).toBeGreaterThanOrEqual(29)
  expect(matrix.length).toBe(matrix[0]!.length)
  // Três marcadores de posição 7x7 nos cantos superior-esquerdo, superior-direito e inferior-esquerdo
  expect(matrix[0]!.slice(0, 7)).toEqual([true, true, true, true, true, true, true])
  expect(matrix[1]!.slice(0, 7)).toEqual([true, false, false, false, false, false, true])
  expect(matrix[0]!.slice(-7)).toEqual([true, true, true, true, true, true, true])
  expect(matrix[matrix.length - 7]!.slice(0, 7)).toEqual([true, true, true, true, true, true, true])

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(<QrCodeSvg value="SINTETICO_CONVITE_QR_12345678901234567890123" label="QR do convite" />))
  const svg = container.querySelector('svg[role="img"]')
  expect(svg?.getAttribute('aria-label')).toBe('QR do convite')
  expect(svg?.querySelector('path')?.getAttribute('d')).toContain('M')
})
