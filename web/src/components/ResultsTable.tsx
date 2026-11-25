import { useState } from 'react'
import type { Assessment, Project } from '../api/assessments'
import { formatMetric as number } from '../dashboard/analysis'

export type ScopedAssessment = Assessment & { project_id: string }
export type ResultsTableState = { page: number; size: number; search: string; sort: string; direction: 'asc' | 'desc'; compact: boolean; columns: string[] }
export function ResultsTable({ rows, projects, onDetail, state, onState, selected = [], onSelect }: {
  rows: ScopedAssessment[]; projects: Project[]; onDetail(row: ScopedAssessment): void
  state?: ResultsTableState; onState?(value: ResultsTableState): void; selected?: string[]; onSelect?(ids: string[]): void
}) {
  const [local, setLocal] = useState<ResultsTableState>({ page: 1, size: 25, search: '', sort: 'started_at', direction: 'desc', compact: false, columns: [] })
  const view = state ?? local
  const change = (patch: Partial<ResultsTableState>) => (onState ?? setLocal)({ ...view, ...patch })
  const stroop = rows.length > 0 && rows.every(row => row.test_code === 'stroop_go_nogo_ptbr')
  const base = [ ['project_id', 'Projeto'], ['participant_id', 'Participante'], ['visit', 'Visita'], ['started_at', 'Início'], ['platform', 'Plataforma'], ['evaluator_id', 'Avaliador'], ['test_code', 'Instrumento'], ['test_version', 'Versão'] ]
  const metrics = [ ['accuracy', 'Precisão (%)'], ['accuracy_go_trials', 'Precisão Go (%)'], ['accuracy_no_go_trials', 'Precisão No-Go (%)'], ['omission_errors', 'Omissões'], ['commission_errors', 'Comissões'], ['hits', 'Acertos'], ['correct_rejections', 'Rejeições corretas'], ['response_time_seconds', 'RT mediano (s)'] ]
  const columns = [...base, ...(stroop ? metrics : [])] as [string, string][]
  const selectedColumns = view.columns.length ? view.columns : ['project_id', 'participant_id', 'visit', 'started_at', 'accuracy', 'response_time_seconds']
  const visible = columns.filter(([key]) => selectedColumns.includes(key))
  const get = (row: ScopedAssessment, key: string): string | number | null => {
    if (key === 'project_id') return projects.find(project => project.id === row.project_id)?.code ?? row.project_id
    if (key === 'platform') return row.platform === 'web' ? 'WEB' : 'PsychoPy local'
    if (key === 'evaluator_id') return row.evaluator_id ?? 'Legado sem identificação técnica'
    if (metrics.some(([code]) => code === key)) return (row.summary as unknown as Record<string, number | null>)[key] ?? null
    return String((row as unknown as Record<string, unknown>)[key] ?? '')
  }
  const filtered = rows.filter(row => [row.participant_id, row.visit, row.test_code].some(value => value.toLocaleLowerCase('pt-BR').includes(view.search.toLocaleLowerCase('pt-BR'))))
  const sorted = [...filtered].sort((a, b) => {
    const first = get(a, view.sort), second = get(b, view.sort)
    if (first === null || second === null) return first === second ? a.assessment_id.localeCompare(b.assessment_id) : first === null ? 1 : -1
    const order = typeof first === 'number' && typeof second === 'number' ? first - second : String(first).localeCompare(String(second), 'pt-BR')
    return order * (view.direction === 'asc' ? 1 : -1) || a.assessment_id.localeCompare(b.assessment_id)
  })
  const last = Math.max(1, Math.ceil(sorted.length / view.size)), page = Math.min(view.page, last)
  const subset = sorted.slice((page - 1) * view.size, page * view.size)
  return <section aria-label="Tabela de avaliações">
    <div className="table-controls">
      <label>Buscar na tabela (código, visita ou instrumento)<input type="search" value={view.search} onChange={e => change({ search: e.target.value, page: 1 })} /></label>
      <label>Linhas por página<select value={view.size} onChange={e => change({ size: Number(e.target.value), page: 1 })}>{[10,25,50,100].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label><input type="checkbox" checked={view.compact} onChange={e => change({ compact: e.target.checked })} />Densidade compacta</label>
      <details><summary>Colunas visíveis</summary>{columns.map(([key, label]) => <label key={key}><input type="checkbox" checked={selectedColumns.includes(key)} onChange={e => {
        const current = selectedColumns
        const next = e.target.checked ? [...current, key] : current.filter(code => code !== key)
        if (next.length) change({ columns: next })
      }} />{label}</label>)}</details>
    </div>
    <p className="quiet">Busca, ordenação, colunas e página apenas apresentam o recorte. A exportação usa a consulta aplicada completa. Selecionar avaliações edita o rascunho e exige Aplicar filtros.</p>
    {!!selected.length && <p role="status">{selected.length} avaliações selecionadas. <button className="button secondary" onClick={() => onSelect?.([])}>Limpar seleção de avaliações</button></p>}
    <div className="table-scroll" role="region" aria-label="Registros de avaliações filtradas" tabIndex={0}>
    <table className={`results-table ${stroop ? 'stroop-results' : ''} ${view.compact ? 'table-compact' : ''}`}>
      <caption>Avaliações filtradas</caption>
      <thead><tr>{onSelect && <th scope="col">Selecionar</th>}{visible.map(([key, label]) => <th key={key} scope="col" aria-sort={view.sort === key ? view.direction === 'asc' ? 'ascending' : 'descending' : 'none'}>
        <button type="button" onClick={() => change({ sort: key, direction: view.sort === key && view.direction === 'asc' ? 'desc' : 'asc', page: 1 })}>{label}</button>
      </th>)}<th scope="col">Detalhe</th></tr></thead>
      <tbody>{subset.map(row => <tr key={`${row.project_id}:${row.assessment_id}`}>
        {onSelect && <td><input type="checkbox" aria-label={`Selecionar avaliação ${row.participant_id}, visita ${row.visit}`} checked={selected.includes(row.assessment_id)} onChange={e => onSelect(e.target.checked ? [...selected, row.assessment_id] : selected.filter(id => id !== row.assessment_id))} /></td>}
        {visible.map(([key]) => <td key={key} className="tabular-nums">{metrics.some(([code]) => code === key) ? number(get(row, key) as number | null, key === 'response_time_seconds' ? 3 : 1) : get(row, key)}</td>)}
        <td><button className="button secondary button-sm" onClick={() => onDetail(row)} aria-label={`Ver avaliação ${row.participant_id}, visita ${row.visit}, projeto ${projects.find(item => item.id === row.project_id)?.code ?? row.project_id}`}>Ver</button></td>
      </tr>)}</tbody>
    </table></div>
    <nav aria-label="Páginas da tabela de avaliações"><button className="button secondary" disabled={page === 1} onClick={() => change({ page: page - 1 })}>Página anterior</button>
      <span role="status">Página {page} de {last} · {filtered.length} avaliações na tabela</span>
      <button className="button secondary" disabled={page === last} onClick={() => change({ page: page + 1 })}>Próxima página</button></nav>
  </section>
}
