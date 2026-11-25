import type { Page } from '@playwright/test'

export async function analyticsSection(page: Page, name: string) {
  const mobile = page.getByRole('button', { name: 'Abrir navegação profissional' })
  if (await mobile.isVisible()) await mobile.click()
  await page.getByRole('tab', { name, exact: true }).click()
}
