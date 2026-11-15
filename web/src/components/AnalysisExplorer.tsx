import type { AnalysisBody, AnalysisPage } from '../api/analysis'
import { Select } from './ui/controls'
import { DataTable } from './ui/presentation'
import { formatMetric } from '../dashboard/analysis'

const dimensions = [ ['project', 'Projeto'], ['date', 'Data'], ['visit', 'Visita'], ['evaluator', 'Avaliador'], ['instrument_version', 'Instrumento/versão'], ['condition', 'Condição'], ['go_nogo', 'Go/No-Go'], ['response_type', 'Resposta'] ] as const
export function AnalysisExplorer({ context, grouping, onGrouping, onSelect }: {
  context: AnalysisPage; grouping: AnalysisBody['grouping']; onGrouping(value: AnalysisBody['grouping']): void
  onSelect(dimension: string, value: string): void
}) {
  const data = context.analytics
  const singleStroop = context.normalized_query.filters.test_code instanceof Array && context.normalized_query.filters.test_code.length === 1 && context.normalized_query.filters.test_code[0] === 'stroop_go_nogo_ptbr'
  const change = (next: Partial<AnalysisBody['grouping']>) => {
    const value = { ...grouping, ...next }
    if (value.dimension !== 'date') delete value.time_bucket
    if (value.level === 'trial') value.metric_code = 'trials'
    onGrouping(value)
  }
  const canSelect = ['project', 'visit', 'evaluator', 'condition', 'response_type'].includes(grouping.dimension)
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
    <DataTable caption="Grupos analíticos e população" rows={data.groups} rowKey={row => JSON.stringify(row.key)} columns={[
      { key: 'group', label: 'Grupo e proveniência', render: row => <>{row.label}<details><summary>Identificação do grupo</summary>{row.key.map((value, index) => <p key={index}>{String(value ?? 'Não informado')}</p>)}</details></> },
      { key: 'value', label: 'Valor (unidade)', render: row => `${formatMetric(row.value, 3)} ${row.unit}` },
      { key: 'count', label: 'Avaliações / tentativas', render: row => `${row.assessments} / ${row.trials}` },
      { key: 'missing', label: 'Valores disponíveis / ausentes', render: row => `${row.present} / ${row.missing}` },
      { key: 'drill', label: 'Restringir consulta', render: row => canSelect ? <button type="button" className="button secondary" onClick={() => onSelect(grouping.dimension, row.label)}>Selecionar {row.label}</button> : 'Consultar detalhe na tabela de avaliações' },
    ]} />
    <p className="quiet">Selecionar um grupo edita os filtros; use Aplicar filtros para publicar o recorte antes de exportar.</p>
  </section>
}
