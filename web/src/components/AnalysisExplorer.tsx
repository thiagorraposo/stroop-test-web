import { GroupChart } from '../features/analytics/GroupChart'
import { useState } from 'react'
import type { Project } from '../api/assessments'
import type { AnalysisBody, AnalysisPage } from '../api/analysis'
import { Select } from './ui/controls'
import { DataTable } from './ui/presentation'
import { formatMetric, OFFICIAL_METRICS_DICTIONARY } from '../dashboard/analysis'

const dimensions = [ ['project', 'Projeto'], ['date', 'Data'], ['visit', 'Visita'], ['evaluator', 'Avaliador'], ['instrument_version', 'Instrumento/versão'], ['condition', 'Condição'], ['go_nogo', 'Go/No-Go'], ['response_type', 'Resposta'] ] as const
export function AnalysisExplorer({ context, grouping, onGrouping, onSelect, onAssessment, projects = [] }: {
  projects?: Project[]; context: AnalysisPage; grouping: AnalysisBody['grouping']; onGrouping(value: AnalysisBody['grouping']): void
  onAssessment?(projectId: string, assessmentId: string): void
  onSelect(dimension: string, value: string): void
}) {
  const [page, setPage] = useState(0)
  const [view, setView] = useState('bars')
  const [selectedKey, selectKey] = useState('')
  const data = context.analytics
  const groups = data.groups.slice(page * 40, (page + 1) * 40)
  const singleStroop = context.normalized_query.filters.test_code instanceof Array && context.normalized_query.filters.test_code.length === 1 && context.normalized_query.filters.test_code[0] === 'stroop_go_nogo_ptbr'
  const change = (next: Partial<AnalysisBody['grouping']>) => {
    const value = { ...grouping, ...next }
    if (value.dimension !== 'date') delete value.time_bucket
    if (value.level === 'trial') value.metric_code = 'trials'
    onGrouping(value)
  }
  const canSelect = ['project', 'visit', 'evaluator', 'condition', 'go_nogo', 'response_type', 'instrument_version'].includes(grouping.dimension)
    || (grouping.dimension === 'date' && (grouping.time_bucket ?? 'day') === 'day')
  const selected = data.groups.find(group => JSON.stringify(group.key) === selectedKey)
  const metric = data.indicators.find(item => item.code === grouping.metric_code)
  const title = metric?.label ?? (grouping.metric_code === 'trials' ? 'Tentativas selecionadas' : 'Avaliações oficiais')
  const groupLabel = (group: AnalysisPage['analytics']['groups'][number]) => {
    const value = group.key.at(-1)
    if (grouping.dimension === 'project') return projects.find(project => project.id === value)?.code ?? group.label
    const labels: Record<string,string> = {hit:'Acerto Go', omission:'Omissão', commission:'Comissão',
      correct_rejection:'Rejeição correta', go:'Go', no_go:'No-Go', congruent:'Congruente', incongruent:'Incongruente',
      LEGADO_NAO_MAPEADO:'Legado sem identificação técnica'}
    return labels[String(value)] ?? group.label
  }
  const numericValues = data.groups.map(group => group.value).filter((v): v is number => v !== null)
  const peak = numericValues.reduce((max,n) => Math.max(max,n), 1)
  const minVal = numericValues.reduce((min,n) => Math.min(min,n), 0)
  return <section className="analysis-explorer" aria-label="Exploração da consulta aplicada">
    <h3>Explorar o conjunto completo</h3>
    <p>{context.counts.participants} participantes · {context.counts.visits} visitas · {context.counts.assessments} avaliações · {context.counts.trials} tentativas selecionadas.</p>
    <div className="filter-fields">
      <Select label="Nível de exploração" value={grouping.level} onChange={e => change({ level: e.target.value as AnalysisBody['grouping']['level'] })}
        options={[{ value: 'project', label: 'Projeto / institucional autorizado' }, { value: 'instrument', label: 'Instrumento / versão' }, { value: 'participant', label: 'Participante / visita' }, { value: 'assessment', label: 'Avaliação' }, { value: 'trial', label: 'Tentativa' }]} />
      <Select label="Agrupar por" value={grouping.dimension} onChange={e => change({ dimension: e.target.value as AnalysisBody['grouping']['dimension'] })}
        options={dimensions.map(([value, label]) => ({ value, label, disabled: ['condition', 'go_nogo', 'response_type'].includes(value) && !singleStroop }))} />
      {grouping.dimension === 'date' && <Select label="Período de agrupamento" value={grouping.time_bucket ?? 'day'} onChange={e => change({ time_bucket: e.target.value as 'day' | 'week' | 'month' })}
        options={[{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana ISO (segunda a domingo)' }, { value: 'month', label: 'Mês' }]} />}
      <Select label="Indicador descritivo" value={grouping.metric_code ?? 'assessments'} onChange={e => change({ metric_code: e.target.value })}
        options={[{ value: 'assessments', label: 'Contagem de avaliações', disabled: grouping.level === 'trial' }, { value: 'trials', label: 'Contagem de tentativas selecionadas' },
          ...data.indicators.map(item => ({ value: item.code, label: `${item.label} — média por avaliação (${item.unit})`, disabled: !singleStroop || grouping.level === 'trial' }))]} />
    </div>
    <p className="quiet">Métricas oficiais da avaliação completa, agregadas no servidor. Ausentes são excluídos da média e contados separadamente. Instrumentos, versões, protocolos e plataformas são estratificados; visitas repetidas são descritivas. Datas WEB em UTC; legado sem fuso mantém a data registrada.</p>
    <label>Visualização<select value={view} onChange={e => setView(e.target.value)}>
      <option value="bars">Barras horizontais</option><option value="vertical">Barras verticais</option><option value="temporal" disabled={grouping.dimension !== 'date'}>Pontos temporais (data)</option><option value="table">Tabela</option>
    </select></label>
    <div className="analysis-presets" aria-label="Configurações rápidas">
      <button className="button secondary" onClick={() => onGrouping({ level: 'instrument', dimension: 'date', time_bucket: 'month', metric_code: 'assessments' })}>Volume por período</button>
      <button className="button secondary" disabled={!singleStroop} onClick={() => onGrouping({ level: 'instrument', dimension: 'visit', metric_code: 'accuracy' })}>Precisão por visita</button>
      <button className="button secondary" disabled={!singleStroop} onClick={() => onGrouping({ level: 'project', dimension: 'project', metric_code: 'omission_errors' })}>Omissões por projeto</button>
      <button className="button secondary" disabled={!singleStroop} onClick={() => onGrouping({ level: 'instrument', dimension: 'condition', metric_code: 'trials' })}>Tentativas por condição</button>
    </div>
    {!singleStroop && <p>Para explorar indicadores Stroop e dimensões de tentativa, aplique o filtro do instrumento Stroop Go/No-Go.</p>}
    {metric && <details><summary>Como interpretar {title}</summary><p>Média dos valores oficiais das avaliações completas com medida disponível. Fonte: {metric.source}. Unidade: {metric.unit}. Prática e sessões não oficiais são excluídas.</p></details>}
    <details><summary>Dicionário de indicadores</summary>{data.indicators.map(item => {
      const definition = OFFICIAL_METRICS_DICTIONARY.find(entry => entry.code === (item.code === 'response_time' ? 'response_time_seconds' : item.code))
      return <details key={item.code}><summary>{item.label} ({item.unit})</summary>
        <p>{definition?.definition} {definition?.origin}</p><p>{definition?.nullTreatment} Média das avaliações com valor disponível. Fonte: {item.source}.</p></details>
    })}</details>
    {selected && <p role="status">{groupLabel(selected)} · {formatMetric(selected.value, 3)} {selected.unit} · {selected.key.slice(0,4).join(' / ')} · {selected.assessments} avaliações. {canSelect && <button className="button secondary" onClick={() => onSelect(grouping.dimension, String(selected.key.at(-1)))}>Restringir dimensão no rascunho</button>}</p>}
    {data.groups.length > 40 && <nav aria-label="Páginas de grupos"><button className="button secondary" disabled={!page} onClick={() => setPage(page-1)}>Grupos anteriores</button>
      <span> {page*40+1}–{Math.min((page+1)*40,data.groups.length)} de {data.groups.length} grupos </span>
      <button className="button secondary" disabled={(page+1)*40>=data.groups.length} onClick={() => setPage(page+1)}>Próximos grupos</button></nav>}
    {(view === 'vertical' || view === 'temporal') && groups.length > 0 && <GroupChart groups={groups} peak={peak} temporal={view === 'temporal'} select={group => selectKey(JSON.stringify(group.key))} />}
    {selected && onAssessment && (grouping.level === 'assessment' || grouping.level === 'trial') &&
      typeof selected.key[4] === 'string' && typeof selected.key[5] === 'string' &&
      <button type="button" className="button secondary" onClick={() => onAssessment(String(selected.key[4]),String(selected.key[5]))}>Ver avaliação do grupo</button>}
    {view === 'bars' && data.groups.length > 0 && (
      <figure className="dashboard-chart analytics-card" style={{ margin: '1rem 0' }}>
        <figcaption>
          {title} por {dimensions.find(([key]) => key === grouping.dimension)?.[1]}
        </figcaption>
        <ul className="chart-meter-list">
          {groups.map(group => (
            <li key={`chart-${JSON.stringify(group.key)}`}>
              <span><button type="button" className="button secondary" onClick={() => selectKey(JSON.stringify(group.key))}>{groupLabel(group)}</button> ({group.assessments} aval. / {group.trials} tent.{group.missing > 0 ? ` · ${group.missing} ausente(s)` : ''})</span>
              {group.value !== null && (
                <meter
                  min={minVal}
                  max={peak}
                  value={group.value}
                  aria-label={`${group.label}: ${formatMetric(group.value, 3)} ${group.unit}`}
                />
              )}
              <strong className="tabular-nums">
                {group.value === null ? 'Ausente' : `${formatMetric(group.value, 3)} ${group.unit}`}
              </strong>
            </li>
          ))}
        </ul>
      </figure>
    )}
    <DataTable caption="Grupos analíticos e população" rows={groups} rowKey={row => JSON.stringify(row.key)} columns={[
      { key: 'group', label: 'Grupo e proveniência', render: row => <>{groupLabel(row)}<details><summary>Identificação do grupo</summary>{row.key.map((value, index) => <p key={index}>{String(value ?? 'Não informado')}</p>)}</details></> },
      { key: 'value', label: 'Valor (unidade)', render: row => `${formatMetric(row.value, 3)} ${row.unit}` },
      { key: 'count', label: 'Avaliações / tentativas', render: row => `${row.assessments} / ${row.trials}` },
      { key: 'missing', label: 'Valores disponíveis / ausentes', render: row => `${row.present} / ${row.missing}` },
      { key: 'drill', label: 'Restringir consulta', render: row => canSelect ? <button type="button" className="button secondary" onClick={() => onSelect(grouping.dimension, String(row.key.at(-1)))}>Selecionar {groupLabel(row)}</button> : 'Consultar detalhe na tabela de avaliações' },
    ]} />
    <p className="quiet">Selecionar um valor restringe a dimensão no rascunho e mantém os demais filtros aplicados ou em edição; use Aplicar filtros para publicar o recorte antes de exportar.</p>
  </section>
}
