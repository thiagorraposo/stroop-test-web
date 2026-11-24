// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { analysisFixture } from '../test/analysis-fixture'
import type { AnalysisPage } from '../api/analysis'
import { ExportHubPanel } from './ExportHubPanel'
import type { ProfessionalProfile } from '../api/client'
import type { Project } from '../api/assessments'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const adminProfile: ProfessionalProfile = {
  user_id: 'admin_export',
  role: 'administracao',
  expires_at: '2026-11-08T22:00:00Z',
  csrf_token: 'c'.repeat(43),
}

const consultaProfile: ProfessionalProfile = {
  user_id: 'consulta_export',
  role: 'consulta',
  expires_at: '2026-11-08T22:00:00Z',
  csrf_token: 'c'.repeat(43),
}

const mockProject: Project = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'PROJ_EXPORT',
  name: 'Pesquisa Exportação',
  active: true,
  created_at: '2026-11-01T10:00:00Z',
}

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('renderiza as 5 granularidades e desabilita modo nominal para perfil consulta', async () => {
  await act(async () => {
    root.render(<ExportHubPanel profile={consultaProfile} />)
  })

  expect(container.textContent).toContain('Central de exportações')
  expect(container.textContent).toContain('Pacientes')
  expect(container.textContent).toContain('Avaliações')
  expect(container.textContent).toContain('Tentativas')
  expect(container.textContent).toContain('Métricas')
  expect(container.textContent).toContain('Stroop 21 colunas')

  const radios = container.querySelectorAll('input[name="id_mode"]')
  expect(radios).toHaveLength(2)
  const nominalRadio = container.querySelector('input[name="id_mode"][value="nominal"]') as HTMLInputElement
  expect(nominalRadio.disabled).toBe(true)
})

const context = analysisFixture({ query: { projects: [mockProject.id], filters: { status: 'valid', include_null_rt: true } }, grouping: { level: 'assessment', dimension: 'project' }, page: { size: 100, sort: 'started_at_desc' } }, []) as AnalysisPage

test('prévia vincula consulta e colunas; rascunho invalida download e resposta atrasada', async () => {
  let release!: (value: Response) => void
  fetchMock.mockImplementation(async (_input, init) => {
    const body = JSON.parse(init!.body as string)
    expect(body.query_id).toBe(context.query_id)
    expect(body.query_fingerprint).toBe(context.query_fingerprint)
    expect(body.project_id).toBeUndefined()
    const result = { total_rows: 1, counts: context.counts, columns: body.columns,
      applied_criteria: { query: context.normalized_query, query_fingerprint: context.query_fingerprint, content_fingerprint: context.content_fingerprint,
        granularity: body.granularity, identification_mode: body.identification_mode },
      sample_rows: [Object.fromEntries(body.columns.map((col: string) => [col, col === 'assessment_id' ? 'ASS-1' : '']))],
      export_token: 'synthetic_token', expires_at: new Date(Date.now() + 900000).toISOString() }
    if (fetchMock.mock.calls.length === 1) return jsonResponse(result)
    return new Promise<Response>(resolve => { release = resolve })
  })
  await act(async () => root.render(<ExportHubPanel profile={adminProfile} context={context} />))
  const previewBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Pré-visualizar'))!
  const downloadBtn = () => [...container.querySelectorAll('button')].find(b => b.textContent?.includes('Baixar arquivo CSV'))!
  await act(async () => previewBtn().click())
  expect(container.textContent).toContain('ASS-1')
  expect(downloadBtn().disabled).toBe(false)
  const column = container.querySelector('input[type="checkbox"]') as HTMLInputElement
  await act(async () => column.click())
  expect(downloadBtn().disabled).toBe(true)
  expect(container.textContent).not.toContain('ASS-1')
  await act(async () => previewBtn().click())
  await act(async () => root.render(<ExportHubPanel profile={adminProfile} context={context} dirty />))
  await act(async () => release(jsonResponse({ error: 'old' })))
  expect(downloadBtn().disabled).toBe(true)
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

test('admin também aguarda habilitação institucional para nominal', async () => {
  await act(async () => root.render(<ExportHubPanel profile={adminProfile} context={context} />))
  expect((container.querySelector('input[value="nominal"]') as HTMLInputElement).disabled).toBe(true)
})
