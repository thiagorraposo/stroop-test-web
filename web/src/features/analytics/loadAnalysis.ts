import { ApiError } from '../../api/client'
import { queryAnalysis, contextKey } from '../../api/analysis'
import type { AnalysisBody, AnalysisPage } from '../../api/analysis'
import { analysisQueryBody } from '../../dashboard/query'
import type { ResearchQuery } from '../../dashboard/query'

export async function loadAnalysis(query: ResearchQuery, grouping: AnalysisBody['grouping'], csrf: string, signal: AbortSignal, onProgress: (count: number) => void) {
  const items: AnalysisPage['items'] = []
  const cursors = new Set<string>(), ids = new Set<string>()
  let cursor: string | undefined, first: AnalysisPage | undefined
  do {
    const body = { ...analysisQueryBody(query, cursor), grouping }
    const page = await queryAnalysis(body, csrf, signal)
    signal.throwIfAborted()
    if (first && (page.query_id !== first.query_id || page.query_fingerprint !== first.query_fingerprint
      || page.content_fingerprint !== first.content_fingerprint || page.expires_at !== first.expires_at
      || contextKey(page.counts) !== contextKey(first.counts)
      || contextKey(page.registry_counts) !== contextKey(first.registry_counts)
      || contextKey(page.operational.counts) !== contextKey(first.operational.counts)
      || contextKey(page.aggregates) !== contextKey(first.aggregates)
      || contextKey(page.analytics) !== contextKey(first.analytics)
      || contextKey(page.legacy_export_context) !== contextKey(first.legacy_export_context))) throw new ApiError('state_conflict', 409)
    first ??= page
    for (const item of page.items) {
      if (ids.has(item.assessment_id)) throw new ApiError('invalid_response', 200)
      ids.add(item.assessment_id); items.push(item)
      if (items.length > 5000 || items.length > page.counts.assessments) throw new ApiError('invalid_response', 200)
    }
    cursor = page.next_cursor ?? undefined
    if (cursor && (!page.items.length || cursors.has(cursor))) throw new ApiError('invalid_response', 200)
    if (cursor) cursors.add(cursor)
    onProgress(items.length)
  } while (cursor)
  if (items.length !== first!.counts.assessments) throw new ApiError('invalid_response', 200)
  return { items, context: first! }
}
