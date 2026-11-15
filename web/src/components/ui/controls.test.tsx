// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Button, Input, MultiSelect, Tabs } from './controls'
import { Dialog } from './presentation'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let host: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

test('erro de campo associa mensagem e preserva valor controlado', async () => {
  await act(async () => root.render(<Input label="Código" value="SINTETICO" onChange={() => {}} hint="Sem nome" error="Confira o código" />))
  const field = host.querySelector('input')!
  expect(field.value).toBe('SINTETICO')
  expect(field.getAttribute('aria-invalid')).toBe('true')
  expect(field.getAttribute('aria-describedby')?.split(' ').map(id => document.getElementById(id)?.textContent)).toEqual(['Sem nome', 'Confira o código'])
})

test('multisseleção usa checkboxes independentes e devolve a seleção integral', async () => {
  const update = vi.fn()
  await act(async () => root.render(<MultiSelect label="Projetos" value={['A']} onChange={update} options={[{ value: 'A', label: 'Projeto A' }, { value: 'B', label: 'Projeto B' }]} />))
  expect(host.querySelector('select[multiple]')).toBeNull()
  await act(async () => (host.querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement).click())
  expect(update).toHaveBeenCalledWith(['A', 'B'])
})

test('tabs navegam com setas, saltam indisponível e mantêm foco', async () => {
  function Example() {
    const [value, setValue] = useState('a')
    return <Tabs label="Exemplo" value={value} onChange={setValue} tabs={[
      { value: 'a', label: 'Um', content: 'Primeiro' }, { value: 'b', label: 'Dois', content: '', disabled: true }, { value: 'c', label: 'Três', content: 'Terceiro' },
    ]} />
  }
  await act(async () => root.render(<Example />))
  const first = host.querySelector<HTMLButtonElement>('[role=tab]')!
  first.focus()
  await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
  expect(document.activeElement?.textContent).toBe('Três')
  expect(host.querySelector('[role=tabpanel]:not([hidden])')?.textContent).toBe('Terceiro')
})

test('diálogo monta conteúdo apenas quando aberto, cancela e devolve foco', async () => {
  // jsdom não implementa o top layer; trap/foco nativo também é verificado nos dois browsers.
  const previous = Object.getOwnPropertyDescriptors(HTMLDialogElement.prototype)
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false } },
  })
  function Example() {
    const [open, setOpen] = useState(false)
    return <><Button onClick={() => setOpen(true)}>Abrir</Button><Dialog title="Revisão" open={open} onClose={() => setOpen(false)}><p>Conteúdo sintético</p></Dialog></>
  }
  await act(async () => root.render(<Example />))
  expect(host.textContent).not.toContain('Conteúdo sintético')
  const button = host.querySelector('button')!
  button.focus()
  await act(async () => button.click())
  expect(host.querySelector('dialog')!.open).toBe(true)
  await act(async () => host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true })))
  expect(host.querySelector('dialog')!.open).toBe(false)
  expect(host.textContent).not.toContain('Conteúdo sintético')
  expect(document.activeElement).toBe(button)
  for (const key of ['showModal', 'close']) {
    if (previous[key]) Object.defineProperty(HTMLDialogElement.prototype, key, previous[key]!)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, key)
  }
})
