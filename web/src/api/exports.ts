/** Prévia e arquivo vinculados a fingerprints da consulta completa em RAM. */
import { ApiError, record, request } from './client'
import { contextKey } from './analysis'
import type { AnalysisPage } from './analysis'

export type ExportGranularity = 'pacientes' | 'avaliacoes' | 'tentativas' | 'metricas' | 'stroop_21_colunas'
export type IdentificationMode = 'deidentified' | 'nominal'
export type ExportPreviewInput = Pick<AnalysisPage, 'query_id' | 'query_fingerprint' | 'content_fingerprint'> & {
  granularity: ExportGranularity; columns: string[]; identification_mode: IdentificationMode
}
export type ExportPreviewResponse = {
  total_rows: number; counts: AnalysisPage['counts']; columns: string[]
  applied_criteria: { query: AnalysisPage['normalized_query']; query_fingerprint: string; content_fingerprint: string; granularity: ExportGranularity; identification_mode: IdentificationMode }
  sample_rows: Record<string, string>[]; export_token: string; expires_at: string
}
export type ExportDownloadInput = ExportPreviewInput & { export_token: string }
function headers(csrf: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(csrf)) throw new ApiError('invalid_request', 422)
  return { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }
}
function invalid(): never { throw new ApiError('invalid_response', 200) }
export function previewExport(input: ExportPreviewInput, csrf: string, signal?: AbortSignal): Promise<ExportPreviewResponse> {
  return request('/api/v1/exports/preview', { method: 'POST', headers: headers(csrf), body: JSON.stringify(input) }, async response => {
    let value: unknown
    try { value = await response.json() } catch { return invalid() }
    if (response.status !== 200 || !record(value) || !Number.isSafeInteger(value.total_rows) || Number(value.total_rows) < 0
      || !Array.isArray(value.columns) || new Set(value.columns).size !== input.columns.length
      || value.columns.some(x => !input.columns.includes(x)) || !record(value.applied_criteria)
      || value.applied_criteria.query_fingerprint !== input.query_fingerprint || value.applied_criteria.content_fingerprint !== input.content_fingerprint
      || value.applied_criteria.granularity !== input.granularity || value.applied_criteria.identification_mode !== input.identification_mode
      || !record(value.counts) || !['participants', 'visits', 'assessments', 'trials'].every(key => Number.isSafeInteger((value.counts as Record<string, unknown>)[key]) && Number((value.counts as Record<string, unknown>)[key]) >= 0)
      || !Array.isArray(value.sample_rows) || value.sample_rows.length > 5 || value.sample_rows.length > Number(value.total_rows)
      || value.sample_rows.some(row => !record(row) || Object.keys(row).length !== input.columns.length || Object.keys(row).some(key => !input.columns.includes(key)) || Object.values(row).some(x => typeof x !== 'string'))
      || typeof value.export_token !== 'string' || !/^[A-Za-z0-9_-]{1,8192}$/.test(value.export_token)
      || typeof value.expires_at !== 'string' || !Number.isFinite(Date.parse(value.expires_at)) || Date.parse(value.expires_at) <= Date.now()) return invalid()
    return value as ExportPreviewResponse
  }, signal)
}
export function downloadExport(input: ExportDownloadInput, csrf: string, signal?: AbortSignal): Promise<{ filename: string; blob: Blob }> {
  return request('/api/v1/exports/download', { method: 'POST', headers: { ...headers(csrf), Accept: 'text/csv' }, body: JSON.stringify(input) }, async response => {
    const match = /^attachment; filename="(stroop-test-web_(?:pacientes|avaliacoes|tentativas|metricas|stroop_21_colunas)_\d{8}T\d{6}Z_[a-f0-9]{8}\.csv)"$/.exec(response.headers.get('Content-Disposition') ?? '')
    if (response.status !== 200 || !match || !(response.headers.get('Content-Type') ?? '').startsWith('text/csv')) return invalid()
    return { filename: match[1]!, blob: await response.blob() }
  }, signal)
}
export function exportSelection(context: AnalysisPage): Pick<ExportPreviewInput, 'query_id' | 'query_fingerprint' | 'content_fingerprint'> {
  return { query_id: context.query_id, query_fingerprint: context.query_fingerprint, content_fingerprint: context.content_fingerprint }
}
export { contextKey }
