import type { ScopedAssessment } from '../../components/ResultsTable'
import type { AnalysisPage } from '../../api/analysis'

export function CollectionQuality({ analysisContext, rows }: { analysisContext: AnalysisPage; rows: ScopedAssessment[] }) {
  const operationalStatusLabels: Record<string, string> = {
    invalidated: 'Invalidada',
    aborted: 'Abortada / interrompida',
    expired: 'Expirada',
    in_progress: 'Em andamento',
  }

  const stroop = rows.flatMap(row => 'accuracy' in row.summary ? [row.summary] : [])
  const op = analysisContext.operational
  return (
    <section className="operational-sessions-section analytics-card" aria-label="Sessões operacionais segregadas" style={{ marginTop: '1rem' }}>
      <p>{op.counts.total} sessões operacionais no contexto. Os filtros de métricas se referem às avaliações oficiais.</p>
      <h3>Registros operacionais segregados (fora de A/T e das métricas oficiais)</h3>
      <p className="quiet" role="status">
        População operacional segregada (sem 12 métricas oficiais e excluída do CSV oficial):{' '}
        {op.counts.invalidated} invalidada(s) · {op.counts.aborted} abortada(s) · {op.counts.expired} expirada(s) · {op.counts.in_progress} em andamento (total operacional: {op.counts.total}).
      </p>
      <h4>Disponibilidade nas avaliações oficiais Stroop</h4>
      <p>{stroop.length} avaliações · {stroop.filter(summary => summary.accuracy === null).length} sem precisão geral · {stroop.filter(summary => summary.response_time_seconds === null).length} sem RT mediano.</p>
      {op.items.length > 0 && (
        <div className="table-scroll">
          <table aria-label="Sessões operacionais segregadas">
            <caption>Sessões operacionais segregadas ({op.items.length})</caption>
            <thead>
              <tr>
                <th>Sessão</th>
                <th>Projeto</th>
                <th>Participante</th>
                <th>Visita</th>
                <th>Instrumento e protocolo</th>
                <th>Status operacional</th>
                <th>Motivo / estado</th>
                <th>Checkpoints</th>
                <th>Início / Ativação</th>
              </tr>
            </thead>
            <tbody>
              {op.items.map(item => (
                <tr key={item.session_id}>
                  <td className="tabular-nums">{item.session_id}</td>
                  <td>{item.project_code}</td>
                  <td className="tabular-nums">{item.participant_id}</td>
                  <td>{item.visit}</td>
                  <td>{item.test_code} ({item.test_version}) · {item.protocol_id ?? 'protocolo ausente'} · {item.platform}</td>
                  <td>{operationalStatusLabels[item.status] ?? item.status}</td>
                  <td>{item.invalidation_reason ?? item.abort_reason ?? item.state}</td>
                  <td className="tabular-nums">{item.confirmed_through}/16</td>
                  <td className="tabular-nums">{item.started_at ?? item.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
