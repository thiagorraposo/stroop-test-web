import { expect } from '@playwright/test'
import type { Locator } from '@playwright/test'

/** Exercita as checkboxes reais; não escreve estado React nem emula select nativo. */
export async function selectMulti(group: Locator, selection: string | string[]) {
  const values = typeof selection === 'string' ? [selection] : selection
  await expect.poll(async () => group.getByRole('checkbox').evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value)))
    .toEqual(expect.arrayContaining(values))
  for (const control of await group.getByRole('checkbox').all()) {
    const value = await control.getAttribute('value')
    await control.setChecked(value !== null && values.includes(value))
  }
  await expectMulti(group, values)
}

export async function expectMulti(group: Locator, values: string[]) {
  await expect.poll(async () => (await group.locator('input[type="checkbox"]:checked').evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value))).sort()).toEqual([...values].sort())
}
