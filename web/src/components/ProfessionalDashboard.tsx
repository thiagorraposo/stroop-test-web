import { AssessmentDrawer } from '../features/analytics/AssessmentDrawer'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AnalysisExplorer } from './AnalysisExplorer'
import type { AnalysisBody } from '../api/analysis'
import { analysisSections, ProfessionalShell } from './ProfessionalShell'
import type { ProfessionalProfile } from '../api/client'
import { SessionInvitation } from './SessionInvitation'
import { ResearchFilters } from './ResearchFilters'
import { ResultsTable } from './ResultsTable'

import { Overview } from '../features/analytics/Overview'
import { CollectionQuality } from '../features/analytics/CollectionQuality'
import { PatientsPanel } from './PatientsPanel'
import { EvaluatorsPanel } from './EvaluatorsPanel'
import { AdministrationPanel } from './AdministrationPanel'
import { ExportHubPanel } from './ExportHubPanel'
import type { ResultsTableState } from './ResultsTable'
import type { ScopedAssessment } from './ResultsTable'
import type { ResearchQuery } from './ResearchFilters'
import { ApiError, apiErrorMessage } from '../api/client'
import { listProjects, getAssessment, exportAssessment } from '../api/assessments'
import type { AssessmentDetail, Project } from '../api/assessments'
import { exportAssessmentView } from '../api/aggregate'
import type { ExportContext } from '../api/aggregate'
import { listPatients } from '../api/patients'
import { loadAnalysis } from '../features/analytics/loadAnalysis'
import type { AnalysisPage } from '../api/analysis'
import { defaultQuery, normalizeQuery, queryKey, supportsLegacyExport } from '../dashboard/query'

const LongitudinalPage = lazy(() => import('../features/analytics/LongitudinalPage').then(module => ({default:module.LongitudinalPage})))
const StratifiedResults = lazy(() => import('../features/analytics/StratifiedResults').then(module => ({default: module.StratifiedResults})))

export type AdministrativeModule =
  | 'dashboard'
  | 'pacientes'
  | 'avaliadores'
  | 'preparar'
  | 'longitudinal'
  | 'qualidade'
  | 'historico'
  | 'resultados'
  | 'exportacoes'
  | 'administracao'

const filterLabels: Record<string, string> = {
  start_date: 'Data inicial',
  end_date: 'Data final',
  patient_id: 'Pacientes (UUID)',
  participant_id: 'Participantes',
  visit: 'Visitas',
  evaluator_id: 'Avaliadores',
  test_version: 'Versões',
  platform: 'Plataformas',
  test_code: 'Instrumento',
}

export function ProfessionalDashboard({
  profile,
  initialModule = 'dashboard',
  onHandoffToParticipant,
}: {
  profile: ProfessionalProfile
  initialModule?: AdministrativeModule
  onHandoffToParticipant?(): void
}) {
  const [activeModule, setActiveModule] = useState<AdministrativeModule>(profile.role === 'consulta' && ['preparar', 'administracao'].includes(initialModule) ? 'dashboard' : initialModule)
  const [grouping, setGrouping] = useState<AnalysisBody['grouping']>({ level: 'project', dimension: 'project' })
  const [projects, setProjects] = useState<Project[]>([])
  const [project, setProject] = useState('')
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [query, setQuery] = useState<ResearchQuery | null>(null)
  const [rows, setRows] = useState<ScopedAssessment[]>([])
  const [analysisContext, setAnalysisContext] = useState<AnalysisPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [draft, setDraft] = useState<ResearchQuery | null>(null)
  const [generation, setGeneration] = useState(0)
  const [detail, setDetail] = useState<AssessmentDetail | null>(null)
  const [detailId, setDetailId] = useState('')
  const [detailProject, setDetailProject] = useState('')
  const [detailError, setDetailError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null)
  const [aggregateContext, setAggregateContext] = useState<ExportContext | null>(null)
  const [aggregateBusy, setAggregateBusy] = useState(false)
  const [aggregateMessage, setAggregateMessage] = useState<string | null>(null)
  const [tableState, setTableState] = useState<ResultsTableState>({ page: 1, size: 25, search: '', sort: 'started_at', direction: 'desc', compact: false, columns: [] })
  const [registeredPatients, setRegisteredPatients] = useState<{ id: string; participant_code: string }[]>([])

  const queryIO = useRef<AbortController | null>(null)
  const detailIO = useRef<AbortController | null>(null)
  const dirty = !!draft && !!query && queryKey(draft) !== queryKey(query)
  const analyticModule = ['dashboard', 'longitudinal', 'qualidade', 'historico', 'resultados', 'exportacoes'].includes(activeModule)

  function editQuery(next: ResearchQuery) {
    downloadIO.current?.abort(); aggregateIO.current?.abort()
    setExporting(false); setAggregateBusy(false)
    setDownloadMessage(null); setAggregateMessage(null)
    setDraft(next)
  }

  function applyQuery(next: ResearchQuery) {
    queryIO.current?.abort(); detailIO.current?.abort()
    downloadIO.current?.abort(); aggregateIO.current?.abort()
    setRows([]); setAnalysisContext(null); setAggregateContext(null); setAggregateMessage(null); setLoading(true)
    setDetail(null); setDetailId(''); setDetailError(null); setDownloadMessage(null)
    setExporting(false); setAggregateBusy(false); setError(null)
    const normalized = normalizeQuery(next)
    const instrument = normalized.filters.test_code
    if (!(instrument?.length === 1 && instrument[0] === 'stroop_go_nogo_ptbr')
        && (['condition','response_type','go_nogo'].includes(grouping.dimension) || !['assessments','trials'].includes(grouping.metric_code ?? 'assessments'))) {
      setGrouping({level:'project', dimension:'project'})
    }
    setDraft(normalized); setQuery(normalized); setGeneration(n => n + 1)
  }

  function changeGrouping(next: AnalysisBody['grouping']) {
    if (next.level === grouping.level && next.dimension === grouping.dimension &&
        (next.metric_code ?? 'assessments') === (grouping.metric_code ?? 'assessments') &&
        (next.time_bucket ?? 'day') === (grouping.time_bucket ?? 'day')) return
    queryIO.current?.abort()
    setLoading(true)
    setAnalysisContext(null)
    setAggregateContext(null)
    setRows([])
    setGrouping(next)
  }

  function expireContext(cause: unknown) {
    if (!(cause instanceof ApiError) || ![401, 403, 409].includes(cause.status)) return
    queryIO.current?.abort(); detailIO.current?.abort()
    downloadIO.current?.abort(); aggregateIO.current?.abort()
    setRows([]); setAnalysisContext(null); setLoaded(0); setAggregateContext(null); setDetail(null); setDetailId('')
    setLoading(false); setExporting(false); setAggregateBusy(false)
    setError('O conjunto não está mais disponível. Atualize a consulta antes de continuar.')
    if ([401, 403].includes(cause.status)) window.dispatchEvent(new Event('stroop-professional-session-ended'))
  }

  const downloadIO = useRef<AbortController | null>(null)
  const aggregateIO = useRef<AbortController | null>(null)

  // Contagem cadastral autorizada, distinta dos pacientes presentes no recorte.
  useEffect(() => {
    if (!project) {
      setRegisteredPatients([])
      return
    }
    const io = new AbortController()
    void listPatients({ page_size: 100 }, io.signal)
      .then(res => {
        if (!io.signal.aborted) {
          setRegisteredPatients(Array.isArray(res.items) ? res.items.map(item => ({ id: item.id, participant_code: item.participant_code })) : [])
        }
      })
      .catch(() => {
        if (!io.signal.aborted) {
          setRegisteredPatients([])
        }
      })
    return () => io.abort()
  }, [project, revision])

  // Carrega lista de projetos autorizados
  useEffect(() => {
    const io = new AbortController()
    void (async () => {
      try {
        const items: Project[] = []
        const cursors = new Set<string>(), ids = new Set<string>()
        let cursor: string | undefined
        do {
          const page = await listProjects({ cursor, limit: 100, signal: io.signal })
          for (const item of page.items) {
            if (ids.has(item.id)) throw new ApiError('invalid_response', 200)
            ids.add(item.id); items.push(item)
          }
          cursor = page.next_cursor ?? undefined
          if (cursor && cursors.has(cursor)) throw new ApiError('invalid_response', 200)
          if (cursor) cursors.add(cursor)
        } while (cursor)
        if (!io.signal.aborted) {
          setProjects(items)
          setProject(current => current && items.some(item => item.id === current) ? current : items[0]?.id ?? '')
          if (!query && items[0]) applyQuery(defaultQuery(items[0].id))
        }
      } catch (cause) {
        if (!io.signal.aborted) setError(apiErrorMessage(cause))
      } finally {
        if (!io.signal.aborted) setProjectsLoading(false)
      }
    })()
    return () => io.abort()
  }, [revision])

  // Carrega avaliações conforme projeto e filtros
  useEffect(() => {
    const io = new AbortController()
    setRows([]); setAnalysisContext(null); setAggregateContext(null); setAggregateMessage(null); setDetail(null); setDetailId(''); setDetailError(null); setDownloadMessage(null)
    setLoaded(0)
    downloadIO.current?.abort(); setExporting(false)
    aggregateIO.current?.abort(); setAggregateBusy(false)
    queryIO.current = io
    const selected = query?.projects ?? []
    if (!selected.length) { setLoading(false); return () => io.abort() }
    setLoading(true); setError(null)
    void (async () => {
      try {
        const {items, context} = await loadAnalysis(query!, grouping, profile.csrf_token, io.signal, setLoaded)
        if (!io.signal.aborted) {
          setRows(items); setAnalysisContext(context)
          setAggregateContext(context.legacy_export_context)
        }
      } catch (cause) {
        if (!io.signal.aborted) {
          setRows([]); setAnalysisContext(null); setLoaded(0); setAggregateContext(null)
          if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
            window.dispatchEvent(new Event('stroop-professional-session-ended'))
          }
          setError(
            cause instanceof ApiError && cause.status === 422
              ? 'A consulta não pôde ser concluída com estes filtros. Restrinja o período ou os projetos (até 5.000 avaliações); nenhum total parcial foi exibido.'
              : cause instanceof ApiError && cause.code === 'state_conflict'
                ? 'O conjunto mudou durante a consulta. Atualize para carregar todas as páginas novamente; nenhum total parcial foi exibido.'
                : apiErrorMessage(cause),
          )
        }
      } finally {
        if (!io.signal.aborted) setLoading(false)
      }
    })()
    return () => { io.abort(); downloadIO.current?.abort(); aggregateIO.current?.abort() }
  }, [query, revision, grouping])

  useEffect(() => {
    if (!analysisContext) return
    const expire = () => expireContext(new ApiError('state_conflict', 409))
    const remaining = Date.parse(analysisContext.expires_at) - Date.now()
    if (remaining <= 0) { expire(); return }
    const timer = window.setTimeout(expire, remaining)
    return () => window.clearTimeout(timer)
  }, [analysisContext])

  // Detalhe individual de avaliação
  useEffect(() => {
    const io = new AbortController()
    detailIO.current = io
    setDetail(null); setDetailError(null); setDownloadMessage(null)
    downloadIO.current?.abort(); setExporting(false)
    if (detailId && rows.some(row => row.project_id === detailProject && row.assessment_id === detailId)) void getAssessment(detailProject, detailId, io.signal).then(value => {
      if (!io.signal.aborted) setDetail(value)
    }, cause => { if (!io.signal.aborted) { setDetailError(apiErrorMessage(cause)); expireContext(cause) } })
    return () => io.abort()
  }, [detailProject, detailId, rows])

  useEffect(() => () => downloadIO.current?.abort(), [])
  useEffect(() => () => aggregateIO.current?.abort(), [])

  async function downloadAggregate() {
    if (!analysisContext || Date.parse(analysisContext.expires_at) <= Date.now() || dirty || !query || !supportsLegacyExport(query) || !aggregateContext || aggregateBusy || !['stroop_go_nogo_ptbr', 'instrumento_sintetico_demo'].includes(selectedInstrument)) return
    const io = new AbortController(); aggregateIO.current = io
    setAggregateBusy(true); setAggregateMessage(null)
    try {
      const result = await exportAssessmentView(
        aggregateContext,
        { test_code: selectedInstrument },
        profile.csrf_token,
        io.signal,
      )
      if (io.signal.aborted) return
      const url = URL.createObjectURL(result.blob)
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename
        document.body.append(link)
        link.click()
        link.remove()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setAggregateMessage('Arquivo agregado preparado para download.')
    } catch (cause) {
      if (!io.signal.aborted) {
        expireContext(cause)
        setAggregateMessage(
          cause instanceof ApiError && cause.status === 409
            ? 'Os dados mudaram desde a consulta. Atualize os filtros para recarregar todas as páginas antes de exportar.'
            : apiErrorMessage(cause),
        )
      }
    } finally {
      if (!io.signal.aborted) setAggregateBusy(false)
    }
  }

  async function download() {
    if (!detail || !analysisContext || Date.parse(analysisContext.expires_at) <= Date.now() || exporting || dirty || loading || error) return
    const io = new AbortController(); downloadIO.current = io
    setExporting(true); setDownloadMessage(null)
    try {
      const result = await exportAssessment(detail.project_id, detail.assessment_id, io.signal)
      if (io.signal.aborted) return
      const url = URL.createObjectURL(result.blob)
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename
        document.body.append(link)
        link.click()
        link.remove()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setDownloadMessage('Arquivo preparado para download.')
    } catch (cause) {
      if (!io.signal.aborted) {
        setDownloadMessage(apiErrorMessage(cause))
        expireContext(cause)
      }
    } finally {
      if (!io.signal.aborted) setExporting(false)
    }
  }

  function openRecord(row: ScopedAssessment) {
    window.history.pushState(null, '', '#historico')
    setActiveModule('historico')
    setDetailProject(row.project_id)
    setDetailId(row.assessment_id)
  }

  const currentProject = projects.find(item => item.id === project) ?? null

  // O servidor seleciona e ordena o conjunto completo. Consumidores compartilham
  // a geração publicada somente após validar todas as páginas do mesmo contexto.
  const instruments = [...new Set(rows.map(row => row.test_code))].sort()
  const selectedInstrument = instruments.length === 1 ? instruments[0]! : ''
  // Renderizador do seletor de projeto compartilhado
  const renderProjectSelector = () => (
    <div className="project-selector-wrapper">
      <label htmlFor="research-project">Projeto</label>
      <select
        id="research-project"
        value={project}
        onChange={event => {
          if (event.target.value !== project) {
            setProject(event.target.value)
          }
        }}
      >
        {projects.map(item => (
          <option key={item.id} value={item.id}>
            {item.code} — {item.name}
            {item.active ? '' : ' (inativo)'}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <ProfessionalShell profile={profile} active={activeModule} onNavigate={setActiveModule}>
    <div className="professional-dashboard" aria-label="Painel administrativo da pesquisa">
      {analyticModule && <h2 className="analytics-title">{analysisSections.find(([key]) => key === activeModule)?.[1]}</h2>}
      {projects.length > 0 && query && draft && <div className="query-context" hidden={!analyticModule}>
        {!error && <button className="button secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>Atualizar consulta aplicada</button>}
        <details className="query-controls"><summary>Configurar filtros{dirty ? ' · alterações pendentes' : ''}</summary>
        <ResearchFilters projects={projects} patients={registeredPatients} initialProject={project} loading={loading}
          value={draft} applied={query} refreshKey={revision} onChange={editQuery} onApply={applyQuery} /></details>
        <p className="quiet" role="status">Consulta aplicada {generation}. {loading ? 'Carregando conjunto completo…' : error ? 'Conjunto indisponível; atualize a consulta.' : 'Consulta carregada.'}</p>
              {query && (
                <p className="quiet active-filters-bar" role="status">
                  Filtros aplicados: {query.projects.length} projeto(s) ({query.projects.map(id => projects.find(item => item.id === id)?.code ?? id).join(', ')});{' '}
                  {Object.entries(query.filters)
                    .filter(([, value]) => (Array.isArray(value) ? value.length : !!value))
                    .map(
                      ([key, value]) =>
                        `${filterLabels[key] ?? key}: ${Array.isArray(value) ? value.join(', ') : value}`,
                    )
                    .join(' · ') || 'sem restrições adicionais'}
                  {query.assessmentIds?.length ? ` · ${query.assessmentIds.length} avaliações selecionadas` : ''}
                  {query.advanced?.includeNullRt === false ? ' · excluir RT ausente' : ''}
                  {query.advanced?.searchText ? ` · busca: "${query.advanced.searchText}"` : ''}
                  {query.advanced?.status && query.advanced.status !== 'valid' ? ` · status: ${query.advanced.status}` : ''}
                  {query.advanced?.accuracyRange && query.advanced.accuracyRange !== 'all' ? ` · precisão: ${query.advanced.accuracyRange}` : ''}
                  {query.advanced?.goAccuracyRange && query.advanced.goAccuracyRange !== 'all' ? ` · precisão Go: ${query.advanced.goAccuracyRange}` : ''}
                  {query.advanced?.noGoAccuracyRange && query.advanced.noGoAccuracyRange !== 'all' ? ` · precisão No-Go: ${query.advanced.noGoAccuracyRange}` : ''}
                  {query.advanced?.hasCommissionErrors && query.advanced.hasCommissionErrors !== 'all' ? ` · erros de comissão: ${query.advanced.hasCommissionErrors === 'yes' ? 'com' : 'sem'}` : ''}
                  {query.advanced?.hasOmissionErrors && query.advanced.hasOmissionErrors !== 'all' ? ` · erros de omissão: ${query.advanced.hasOmissionErrors === 'yes' ? 'com' : 'sem'}` : ''}
                  {query.advanced?.rtRange && query.advanced.rtRange !== 'all' ? ` · RT: ${query.advanced.rtRange}` : ''}
                  {query.advanced?.condition.length ? ` · condições: ${query.advanced.condition.join(', ')}` : ''}
                  {query.advanced?.goNogo?.length ? ` · Go/No-Go: ${query.advanced.goNogo.map(kind => kind === 'go' ? 'Go' : 'No-Go').join(', ')}` : ''}
                  {query.advanced?.responseType.length ? ` · respostas: ${query.advanced.responseType.join(', ')}` : ''}
                  .
                </p>
              )}

        {instruments.length > 1 && <p role="status">Há instrumentos diferentes no recorte. Aplique um instrumento para comparar métricas ou exportar a visão filtrada.</p>}
        {query && !supportsLegacyExport(query) && <p role="status">Para exportar os filtros avançados, use Exportações e gere uma nova prévia do recorte; nenhum arquivo sem esses filtros é gerado.</p>}
      </div>}

      {analyticModule && error && <>
        <p role="alert">{error}</p>
        <button className="button secondary" onClick={() => setRevision(value => value + 1)}>Atualizar consultas</button>
      </>}
      {activeModule === 'dashboard' && <>

        {projectsLoading && <p role="status">Carregando projetos…</p>}
        {!projectsLoading && !projects.length && !error && <p role="status">Nenhum projeto disponível para sua conta.</p>}
        {loading && <p role="status">Carregando avaliações… {loaded} recebidas.</p>}
        {analysisContext && <Overview analysisContext={analysisContext} rows={rows} onOpen={openRecord} />}
      </>}
      {activeModule === 'qualidade' && <>{analysisContext && <CollectionQuality rows={rows} analysisContext={analysisContext} />}</>}
      {activeModule === 'longitudinal' && <>{analysisContext && <Suspense fallback={<p role="status">Preparando visualizações…</p>}><LongitudinalPage rows={rows} projects={projects} /></Suspense>}</>}
      {/* MÓDULO 2: PACIENTES (WEB-047) */}
      {activeModule === 'pacientes' && (
        <PatientsPanel profile={profile} project={currentProject} />
      )}

      {/* MÓDULO 3: AVALIADORES (WEB-047) */}
      {activeModule === 'avaliadores' && (
        <EvaluatorsPanel profile={profile} project={currentProject} />
      )}

      {/* MÓDULO 4: PREPARAR AVALIAÇÃO */}
      {activeModule === 'preparar' && (
        <section aria-label="Módulo Preparar avaliação">
          <div className="panel-header-section">
            <h2>Preparar avaliação</h2>
            <p className="panel-subtitle">
              Emissão de convites de uso único para aplicação da Tarefa de Correspondência de Cores.
              Selecione o paciente e o avaliador cadastrados, informe a visita e confira o resumo.
            </p>
          </div>

          {renderProjectSelector()}

          {currentProject?.active && profile.role !== 'consulta' ? (
            <SessionInvitation
              key={`invitation-mod:${project}`}
              project={currentProject}
              profile={profile}
              onHandoffToParticipant={onHandoffToParticipant}
            />
          ) : profile.role === 'consulta' ? (
            <p className="notice" role="status">
              Seu perfil é de consulta e não tem permissão para gerar novos convites de avaliação.
            </p>
          ) : (
            <p className="notice" role="status">
              O projeto selecionado está inativo. Selecione um projeto ativo para preparar novas sessões.
            </p>
          )}
        </section>
      )}

      {/* MÓDULO 5: AVALIAÇÕES E HISTÓRICO */}
      {activeModule === 'historico' && (
        <section aria-label="Módulo Avaliações e histórico">
          <div className="panel-header-section">

            <p className="panel-subtitle">
              Acompanhamento operacional de sessões, tentativas registradas e conferência detalhada de resultados.
            </p>
          </div>

          {loading && <p role="status">Carregando histórico de avaliações…</p>}

          {!loading && !error && !rows.length && (
            <p role="status">Nenhuma avaliação corresponde aos filtros.</p>
          )}

          {!loading && !error && rows.length > 0 && (
            <ResultsTable
              rows={rows}
              state={tableState} onState={setTableState}
              selected={draft?.assessmentIds ?? []} onSelect={ids => draft && editQuery({ ...draft, assessmentIds: ids })}
              projects={projects}
              onDetail={row => {
                setDetailProject(row.project_id)
                setDetailId(row.assessment_id)
              }}
            />
          )}

          {detailId && !detail && !detailError && <p role="status">Carregando detalhe…</p>}
          {detailError && <p role="alert">{detailError}</p>}
          {detail && <AssessmentDrawer detail={detail} projects={projects} disabled={dirty || loading || !!error}
            exporting={exporting} downloadMessage={downloadMessage} download={download}
            onClose={() => { setDetail(null); setDetailId('') }} />}
        </section>
      )}

      {activeModule === 'resultados' && <>
        {analysisContext && <AnalysisExplorer projects={projects} context={analysisContext} grouping={grouping} onGrouping={changeGrouping}
          onAssessment={(projectId, assessmentId) => {
            const row = rows.find(item => item.project_id === projectId && item.assessment_id === assessmentId)
            if (row) openRecord(row)
          }}
          onSelect={(dimension, value) => {
            if (!draft) return
            if (dimension === 'project') editQuery({ ...draft, projects: [value] })
            else if (dimension === 'condition') editQuery({ ...draft, advanced: { ...normalizeQuery(draft).advanced!, condition: [value as 'congruent' | 'incongruent'] } })
            else if (dimension === 'go_nogo') editQuery({ ...draft, advanced: { ...normalizeQuery(draft).advanced!, goNogo: [value as 'go' | 'no_go'] } })
            else if (dimension === 'response_type') editQuery({ ...draft, advanced: { ...normalizeQuery(draft).advanced!, responseType: [value as 'hit' | 'omission' | 'commission' | 'correct_rejection'] } })
            else if (dimension === 'visit' || dimension === 'evaluator') editQuery({ ...draft, filters: { ...draft.filters, [dimension === 'visit' ? 'visit' : 'evaluator_id']: [value] } })
            else if (dimension === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) editQuery({ ...draft, filters: { ...draft.filters, start_date: value, end_date: value } })
            else if (dimension === 'instrument_version' && value.includes('/')) {
              const [testCode, testVersion] = value.split('/')
              if (testCode && testVersion) editQuery({ ...draft, filters: { ...draft.filters, test_code: [testCode], test_version: [testVersion] } })
            }
          }} />}
        {analysisContext && <Suspense fallback={<p role="status">Preparando visualizações…</p>}><StratifiedResults rows={rows} projects={projects} onOpen={openRecord} /></Suspense>}
      </>}
      {/* MÓDULO 7: EXPORTAÇÕES (WEB-020) */}
      {activeModule === 'exportacoes' && (
        <section aria-label="Módulo Exportações" className="export-hub-panel">

          <ExportHubPanel profile={profile} context={analysisContext} dirty={dirty || loading || !!error} onExpired={expireContext} />
          <details open><summary>Exportação agregada legada</summary>
            <button type="button" className="button secondary"
              disabled={dirty || loading || !!error || !query || !supportsLegacyExport(query) || aggregateBusy ||
                !aggregateContext || !['stroop_go_nogo_ptbr', 'instrumento_sintetico_demo'].includes(selectedInstrument)}
              onClick={() => void downloadAggregate()}>
              {aggregateBusy ? 'Preparando arquivo agregado…' : 'Exportar visão filtrada'}
            </button>
            {aggregateMessage && <p role="status">{aggregateMessage}</p>}
          </details>

        </section>
      )}

      {/* MÓDULO 8: ADMINISTRAÇÃO (AdministrationPanel.tsx) */}
      {activeModule === 'administracao' && profile.role === 'administracao' && (
        <AdministrationPanel
          profile={profile}
          onNavigateToEvaluators={() => setActiveModule('avaliadores')}
        />
      )}
    </div>
    </ProfessionalShell>
  )
}
