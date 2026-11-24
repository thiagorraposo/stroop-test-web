import { useState } from 'react'
import type { ScopedAssessment } from '../../components/ResultsTable'
import { formatMetric } from '../../dashboard/analysis'

export function AssessmentPlot({ rows, onOpen }: { rows: ScopedAssessment[]; onOpen(row: ScopedAssessment): void }) {
  const [selected, setSelected] = useState('')
  const [zoom, setZoom] = useState(1)
  const points = rows.flatMap(row => {
    if ('metrics' in row.summary) return []
    const { accuracy, response_time_seconds: rt } = row.summary
    return accuracy === null || rt === null ? [] : [{ row, accuracy, rt }]
  })
  const max = Math.max(0.001, ...points.map(point => point.rt))
  const limit = max / zoom
  const visible = points.filter(point => point.rt <= limit)
  const selection = visible.find(point => point.row.assessment_id === selected)
  return <figure className="analytics-card">
    <figcaption>Precisão e RT mediano por avaliação</figcaption>
    <p>Cada ponto representa uma avaliação completa. {points.length} pares disponíveis · {rows.length - points.length} sem par de medidas.</p>
    {points.length > 0 && <>
      <label>Escala horizontal do RT<select value={zoom} onChange={e => setZoom(Number(e.target.value))}>
        <option value={1}>Faixa completa</option><option value={2}>Ampliar 2× a partir de zero</option><option value={4}>Ampliar 4× a partir de zero</option></select></label>
      <p>{visible.length} de {points.length} pares na faixa de 0 a {formatMetric(limit,3)} s. A escala altera apenas a apresentação.</p>
      <svg viewBox="0 0 620 240" role="img" aria-label="Dispersão da precisão em porcentagem pelo RT mediano em segundos">
        <path d="M60 15 V200 H600" stroke="currentColor" fill="none" />
        <g fontSize="13" fill="currentColor"><text x="6" y="23">100 %</text><text x="18" y="198">0 %</text>
          <text x="57" y="225">0 s</text><text x="596" y="225" textAnchor="end">{formatMetric(limit, 3)} s</text></g>
        {visible.map(({row, accuracy, rt}) => <circle key={row.assessment_id} cx={60 + rt / limit * 530} cy={196 - accuracy * 1.78} r={selected === row.assessment_id ? 6 : 4}
          fill="var(--ui-action)" onClick={() => setSelected(row.assessment_id)}><title>{row.assessment_id} · {accuracy}% · {rt} s</title></circle>)}
      </svg>
      <label>Inspecionar avaliação<select value={selection?.row.assessment_id ?? ''} onChange={e => setSelected(e.target.value)}>
        <option value="">Selecione um ponto</option>{visible.map(({row}) => <option key={row.assessment_id} value={row.assessment_id}>{row.participant_id} · {row.visit} · {row.assessment_id}</option>)}
      </select></label>
      {selection && <p>{formatMetric(selection.accuracy, 1)}% · {formatMetric(selection.rt, 3)} s <button className="button secondary" onClick={() => onOpen(selection.row)}>Abrir avaliação</button></p>}
      <details><summary>Valores dos pontos</summary><div className="table-scroll"><table><thead><tr><th>Avaliação</th><th>Precisão (%)</th><th>RT mediano (s)</th></tr></thead>
        <tbody>{visible.map(({row, accuracy, rt}) => <tr key={row.assessment_id}><th>{row.assessment_id}</th><td>{formatMetric(accuracy, 1)}</td><td>{formatMetric(rt, 3)}</td></tr>)}</tbody></table></div></details>
    </>}
  </figure>
}
