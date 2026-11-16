/** Contexto de consulta em RAM. Não é fingerprint de conteúdo/autorização do servidor. */
import type { AssessmentOptions } from '../api/assessments'
import type { AnalysisBody } from '../api/analysis'

export type Condition = 'congruent' | 'incongruent'
export type ResponseType = 'hit' | 'omission' | 'commission' | 'correct_rejection'

export type AdvancedFilterValues = {
  searchText: string
  status: 'valid' | 'all' | 'invalid'
  accuracyRange: 'all' | 'under50' | '50to80' | '80plus'
  goAccuracyRange: AdvancedFilterValues['accuracyRange']
  noGoAccuracyRange: AdvancedFilterValues['accuracyRange']
  hasCommissionErrors: 'all' | 'yes' | 'no'
  hasOmissionErrors: 'all' | 'yes' | 'no'
  rtRange: 'all' | 'under500ms' | '500to1000ms' | '1000to1500ms' | '1500msPlus'
  includeNullRt: boolean
  condition: Condition[]
  goNogo?: ('go' | 'no_go')[]
  responseType: ResponseType[]
  sortBy: 'date' | 'participant' | 'accuracy' | 'response_time'
  sortOrder: 'asc' | 'desc'
}

export type ResearchQuery = {
  projects: string[]
  filters: AssessmentOptions
  assessmentIds?: string[]
  advanced?: AdvancedFilterValues
}


export const defaultAdvanced: AdvancedFilterValues = {
  searchText: '', status: 'valid', accuracyRange: 'all', rtRange: 'all',
  goAccuracyRange: 'all', noGoAccuracyRange: 'all', hasCommissionErrors: 'all', hasOmissionErrors: 'all',
  includeNullRt: true, condition: [], goNogo: [], responseType: [],
  sortBy: 'date', sortOrder: 'desc',
}

export function defaultQuery(project: string): ResearchQuery {
  return { projects: project ? [project] : [], filters: {}, advanced: { ...defaultAdvanced, condition: [], goNogo: [], responseType: [] } }
}

/** Remove transporte, vazios e duplicatas; ordena dimensões sem mudar seus valores. */
export function normalizeQuery(query: ResearchQuery): ResearchQuery {
  const filters: AssessmentOptions = {}
  for (const key of ['start_date', 'end_date'] as const) {
    if (query.filters[key]) filters[key] = query.filters[key]
  }
  for (const key of ['participant_id', 'visit', 'evaluator_id', 'test_version', 'platform', 'test_code'] as const) {
    const raw = query.filters[key]
    const values = [...new Set(typeof raw === 'string' ? (raw ? [raw] : []) : raw ?? [])].sort()
    if (values.length) Object.assign(filters, { [key]: values })
  }
  return {
    projects: [...new Set(query.projects)].sort(), filters,
    ...(query.assessmentIds?.length ? { assessmentIds: [...new Set(query.assessmentIds)].sort() } : {}),
    advanced: { ...defaultAdvanced, ...query.advanced,
      condition: [...new Set(query.advanced?.condition ?? [])].sort(),
      goNogo: [...new Set(query.advanced?.goNogo ?? [])].sort(),
      responseType: [...new Set(query.advanced?.responseType ?? [])].sort(),
    },
  }
}

/** Identidade local: nunca escrever em URL/storage/log nem apresentar como hash público. */
export function queryKey(query: ResearchQuery): string {
  return JSON.stringify(normalizeQuery(query))
}

/** O agregado atual só suporta dimensões básicas. Falha fechada até WEB-051/053. */
export function supportsLegacyExport(query: ResearchQuery): boolean {
  const a = normalizeQuery(query).advanced!
  return !query.assessmentIds?.length && !a.searchText && a.status === 'valid' && a.accuracyRange === 'all'
    && a.goAccuracyRange === 'all' && a.noGoAccuracyRange === 'all'
    && a.hasCommissionErrors === 'all' && a.hasOmissionErrors === 'all'
    && a.rtRange === 'all' && a.includeNullRt && !a.condition.length && !a.responseType.length && !a.goNogo?.length
}

/** Adapta o transporte existente; filtros de tentativa são avaliados no servidor. */
export function assessmentQueryFilters(query: ResearchQuery): AssessmentOptions {
  const normalized = normalizeQuery(query)
  if (normalized.advanced!.goNogo?.length) throw new Error('Go/No-Go exige a consulta POST normalizada.')
  return { ...normalized.filters,
    ...(normalized.advanced!.condition.length ? { condition: normalized.advanced!.condition } : {}),
    ...(normalized.advanced!.responseType.length ? { response_type: normalized.advanced!.responseType } : {}),
  }
}

/** Normalização de transporte; nenhuma seleção científica acontece no cliente. */
export function analysisQueryBody(query: ResearchQuery, cursor?: string): AnalysisBody {
  const normalized = normalizeQuery(query), a = normalized.advanced!
  const filters: AnalysisBody['query']['filters'] = { status: a.status, include_null_rt: a.includeNullRt }
  for (const [key, value] of Object.entries(normalized.filters)) {
    const canonical = ({ start_date: 'date_from', end_date: 'date_to', participant_id: 'participant_code' } as Record<string, string>)[key] ?? key
    filters[canonical] = key === 'platform' ? (value as string[]).map(item => item === 'psychopy' ? 'psychopy_local' : item) : value
  }
  if (a.searchText.trim()) filters.patient_search = a.searchText.trim().toLowerCase()
  if (a.condition.length) filters.condition = a.condition
  if (a.goNogo?.length) filters.go_nogo = a.goNogo
  if (a.responseType.length) filters.response_type = a.responseType
  if (a.accuracyRange === 'under50') filters.accuracy_max = 50
  if (a.accuracyRange === '50to80') { filters.accuracy_min = 50; filters.accuracy_max = 80 }
  if (a.accuracyRange === '80plus') filters.accuracy_min = 80
  for (const [range, prefix] of [[a.goAccuracyRange, 'go_accuracy'], [a.noGoAccuracyRange, 'no_go_accuracy']] as const) {
    if (range === 'under50') filters[`${prefix}_max`] = 50
    if (range === '50to80') { filters[`${prefix}_min`] = 50; filters[`${prefix}_max`] = 80 }
    if (range === '80plus') filters[`${prefix}_min`] = 80
  }
  if (a.hasCommissionErrors !== 'all') filters.has_commission_errors = a.hasCommissionErrors === 'yes'
  if (a.hasOmissionErrors !== 'all') filters.has_omission_errors = a.hasOmissionErrors === 'yes'
  const bounds = { under500ms: [undefined, 500], '500to1000ms': [500, 1000], '1000to1500ms': [1000, 1500], '1500msPlus': [1500, undefined] }[a.rtRange as Exclude<typeof a.rtRange, 'all'>]
  if (bounds?.[0] !== undefined) filters.rt_median_min_ms = bounds[0]
  if (bounds?.[1] !== undefined) filters.rt_median_max_ms = bounds[1]
  const sort = { date: 'started_at', participant: 'participant_code', accuracy: 'accuracy', response_time: 'response_time' }[a.sortBy]
  return { query: { projects: normalized.projects, filters, ...(normalized.assessmentIds?.length ? { assessment_ids: normalized.assessmentIds } : {}) }, grouping: { level: 'assessment', dimension: 'project' },
    page: { size: 100, sort: `${sort}_${a.sortOrder}`, ...(cursor ? { cursor } : {}) } }
}
