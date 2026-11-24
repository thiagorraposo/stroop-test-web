import { useState } from 'react'
import type { ScopedAssessment } from '../../components/ResultsTable'
import { formatMetric } from '../../dashboard/analysis'

/** Interpolação linear no índice (n - 1)p, para a distribuição exibida. */
export function quartiles(values: number[]) {
  const sorted = [...values].sort((a,b) => a-b)
  if (!sorted.length) return null
  return [0, .25, .5, .75, 1].map(p => {
    const index = (sorted.length - 1) * p
    const low = sorted[Math.floor(index)]!, high = sorted[Math.ceil(index)]!
    return low + (high - low) * (index - Math.floor(index))
  })
}

export function DistributionView({ rows }: { rows: ScopedAssessment[] }) {
  const [view, setView] = useState('histogram')
  const visits = new Map<string, number[]>()
  const bins = [0, 0, 0, 0, 0]
  let present = 0
  for (const row of rows) {
    const values = visits.get(row.visit) ?? []
    visits.set(row.visit, values)
    if ('metrics' in row.summary || row.summary.accuracy === null) continue
    values.push(row.summary.accuracy)
    bins[Math.min(4, Math.floor(row.summary.accuracy / 20))]!++
    present++
  }
  return <figure className="analytics-card"><figcaption>Distribuição da precisão por avaliação</figcaption>
    <label>Apresentação da distribuição<select value={view} onChange={e => setView(e.target.value)}>
      <option value="histogram">Histograma de precisão</option><option value="box">Boxplot por visita</option></select></label>
    <p>{present} avaliações disponíveis · {rows.length-present} sem precisão.</p>
    {view === 'histogram' ? <table><thead><tr><th>Precisão (%)</th><th>Avaliações</th></tr></thead>
      <tbody>{bins.map((n,i) => <tr key={i}><th>{i*20} a {i === 4 ? '100' : '< '+(i+1)*20}</th><td><meter max={Math.max(1,...bins)} value={n}/> {n}</td></tr>)}</tbody></table> :
      <><p>Caixa entre os quartis 25% e 75%, com mediana, mínimo e máximo. Quartis interpolados no índice (n − 1)p. Cada avaliação contribui uma vez.</p>
      <div className="table-scroll"><table><thead><tr>{['Visita','N com medida','Distribuição (0–100%)','Mínimo','Q1','Mediana','Q3','Máximo'].map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{Array.from(visits, ([visit,values]) => {
          const q = quartiles(values)
          return <tr key={visit}><th>{visit}</th><td>{values.length}</td>{q ? <><td><svg width="150" height="24" viewBox="0 0 104 24" aria-hidden="true">
            <line x1={2+q[0]!} x2={2+q[4]!} y1="12" y2="12" stroke="currentColor"/><rect x={2+q[1]!} y="5" width={Math.max(.4,q[3]!-q[1]!)} height="14" fill="var(--ui-selection)" stroke="currentColor"/><path d={`M${2+q[2]!} 4v16`} stroke="var(--ui-action)"/>
          </svg></td>{q.map((n,i) => <td key={i}>{formatMetric(n,2)}</td>)}</> : <td colSpan={6}>Ausente</td>}</tr>
        })}</tbody></table></div></>}
  </figure>
}
