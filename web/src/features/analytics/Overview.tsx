import { descriptiveStrata, DescriptiveSummary } from './DescriptiveSummary'
import type { AnalysisPage } from '../../api/analysis'
import type { ScopedAssessment } from '../../components/ResultsTable'
import { countByDate } from '../../dashboard/analysis'

export function Overview({ analysisContext, rows, onOpen }: { analysisContext: AnalysisPage; rows: ScopedAssessment[]; onOpen(row: ScopedAssessment): void }) {
  const dates = countByDate(rows)
  const peak = Math.max(1, ...dates.map(([, count]) => count))
  const counts = analysisContext.counts
  const renderRegistryCounts = () =>
    analysisContext ? (
      <section className="overview-summary-kpis" aria-label="Quatro contagens cadastrais e de participantes">
        <div className="kpi-grid">
          <div className="kpi-box">
            <span className="kpi-label">Cadastro central visível autorizado (sem filtro de avaliação)</span>
            <strong className="kpi-value tabular-nums">{analysisContext.registry_counts.visible_patients}</strong>
          </div>
          <div className="kpi-box">
            <span className="kpi-label">Pacientes vinculados a projeto</span>
            <strong className="kpi-value tabular-nums">{analysisContext.registry_counts.project_linked_patients}</strong>
          </div>
          <div className="kpi-box">
            <span className="kpi-label">Participantes com avaliação oficial válida</span>
            <strong className="kpi-value tabular-nums">{analysisContext.registry_counts.valid_assessment_participants}</strong>
          </div>
          <div className="kpi-box">
            <span className="kpi-label">Participantes do recorte</span>
            <strong className="kpi-value tabular-nums">{analysisContext.registry_counts.filtered_participants}</strong>
          </div>
        </div>
      </section>
    ) : null

  return <>
    <dl className="dashboard-cards">{[['Participantes do recorte', counts.participants], ['Visitas', counts.visits], ['Avaliações oficiais', counts.assessments], ['Tentativas selecionadas', counts.trials]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
    <figure className="dashboard-chart analytics-card" style={{ margin: '1rem 0' }}>
      <figcaption>Avaliações por data de início (unidade: avaliações · n={rows.length})</figcaption>
      <ul className="chart-meter-list">
        {dates.map(([day, count]) => (
          <li key={day}>
            <span>{day}</span>
            <meter
              min={0}
              max={peak}
              value={count}
              aria-label={`${day}: ${count} avaliações`}
            />
            <strong className="tabular-nums">{count}</strong>
          </li>
        ))}
      </ul>
      <details style={{ marginTop: '0.75rem' }}>
        <summary>Tabela equivalente: avaliações por data de início</summary>
        <div className="table-scroll">
          <table>
            <caption>Avaliações por data de início</caption>
            <thead><tr><th>Data</th><th>Avaliações</th></tr></thead>
            <tbody>{dates.map(([day, count]) => <tr key={day}><td>{day}</td><td className="tabular-nums">{count}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>

    <p className="quiet">Resultado descritivo de pesquisa. Este painel não representa avaliação clínica ou diagnóstico.</p>
    {Array.from(descriptiveStrata(rows), ([key, group]) => {
      const first = group[0]!
      return first.test_code === 'stroop_go_nogo_ptbr' && <details key={key}><summary>Resumo das avaliações · {first.platform} · {first.test_version} · {first.protocol_id ?? 'protocolo não informado'} ({group.length})</summary><DescriptiveSummary rows={group} /></details>
    })}
    <h3>Avaliações recentes</h3>
    {rows.length === 0 && <p>Nenhuma avaliação corresponde aos filtros.</p>}
    <ul>{[...rows].sort((a,b) => b.started_at.localeCompare(a.started_at)).slice(0,5).map(row => <li key={row.assessment_id}><button className="button secondary" onClick={() => onOpen(row)}>{row.participant_id} · {row.visit} · {row.started_at}</button></li>)}</ul>
    <details><summary>Populações cadastrais e participantes</summary>{renderRegistryCounts()}</details>
  </>
}
