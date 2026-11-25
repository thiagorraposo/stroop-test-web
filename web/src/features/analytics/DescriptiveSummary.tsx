import type { ScopedAssessment } from '../../components/ResultsTable'
import { formatMetric, responseDistribution, summarize } from '../../dashboard/analysis'

export function descriptiveStrata(rows: ScopedAssessment[]) {
  const strata = new Map<string, ScopedAssessment[]>()
  for (const row of rows) {
    const key = JSON.stringify([row.test_code, row.test_version, row.protocol_id, row.platform])
    const bucket = strata.get(key)
    if (bucket) bucket.push(row)
    else strata.set(key, [row])
  }
  return strata
}

export function DescriptiveSummary({ rows }: { rows: ScopedAssessment[] }) {
  const summary = summarize(rows)
  const summaries = rows.flatMap(row => 'accuracy' in row.summary ? [row.summary] : [])
  const mean = (field: 'accuracy_go_trials' | 'accuracy_no_go_trials') => {
    const values = summaries.flatMap(row => row[field] === null ? [] : [row[field]])
    return values.length ? formatMetric(values.reduce((sum,n) => sum+n,0)/values.length,1)+'%' : 'Ausente'
  }
  const total = (field: 'hits'|'correct_rejections'|'total_trials') => summaries.reduce((sum,row) => sum+row[field],0)
  const distribution = responseDistribution(rows)
  const available = distribution.reduce((n, [, count]) => n + count, 0)
  return <section>
    <dl className="dashboard-cards">
      <div><dt>Precisão média</dt><dd>{formatMetric(summary.meanAccuracy,1)}%</dd></div>
      <div><dt>Precisão mediana</dt><dd>{formatMetric(summary.medianAccuracy,1)}%</dd></div>
      <div><dt>Mediana dos tempos por avaliação</dt><dd>{formatMetric(summary.medianResponseSeconds,3)} s</dd></div>
      <div><dt>Omissões</dt><dd>{summary.omissions}</dd></div>
      <div><dt>Comissões</dt><dd>{summary.commissions}</dd></div>
    </dl>
    <p>Precisão média individual Go: {mean('accuracy_go_trials')} · No-Go: {mean('accuracy_no_go_trials')}.</p>
    <p>Respostas nas {total('total_trials')} tentativas das avaliações completas: {total('hits')} acertos Go, {total('correct_rejections')} rejeições corretas, {summary.omissions} omissões e {summary.commissions} comissões.</p>
    <details><summary>Distribuição dos RTs medianos por avaliação</summary>
      <p>{available} avaliações com RT · {rows.length - available} ausentes</p>
      <table><thead><tr><th>RT mediano</th><th>Avaliações</th></tr></thead>
        <tbody>{distribution.map(([label,count]) => <tr key={label}><th>{label}</th><td><meter value={count} max={Math.max(1, available)} /> {count}</td></tr>)}</tbody>
      </table>
    </details>
  </section>
}
