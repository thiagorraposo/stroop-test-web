import { useState } from 'react'
import type { ScopedAssessment } from '../../components/ResultsTable'
import { formatMetric } from '../../dashboard/analysis'

export function VisitMatrix({ rows, onOpen }: { rows: ScopedAssessment[]; onOpen(row: ScopedAssessment): void }) {
  const [page, setPage] = useState(0)
  const visits = [...new Set(rows.map(row => row.visit))].sort()
  const subjects = new Map<string, Map<string, ScopedAssessment[]>>()
  for (const row of rows) {
    const key = JSON.stringify([row.project_id, row.participant_id])
    const cells = subjects.get(key) ?? new Map<string, ScopedAssessment[]>()
    const assessments = cells.get(row.visit) ?? []
    assessments.push(row)
    cells.set(row.visit, assessments)
    subjects.set(key,cells)
  }
  const last = Math.max(0,Math.ceil(subjects.size / 20)-1)
  const current = Math.min(page,last)
  return <figure><figcaption>Precisão por participante e visita</figcaption>
    <p>Cada célula preserva as avaliações da visita. A intensidade indica a precisão em porcentagem. Selecione um valor para conferir a avaliação.</p>
    <div className="table-scroll"><table><thead><tr><th>Projeto / participante</th>{visits.map(visit => <th key={visit}>{visit}</th>)}</tr></thead>
      <tbody>{Array.from(subjects.entries()).slice(current*20,current*20+20).map(([key,cells]) => {
        const first: ScopedAssessment = cells.values().next().value![0]!
        return <tr key={key}><th>{first.project_id} / {first.participant_id}</th>{visits.map(visit => <td key={visit}>{cells.get(visit)?.map(row => {
          const score = 'accuracy' in row.summary ? row.summary.accuracy : null
          return <button type="button" key={row.assessment_id} title={row.assessment_id} className="button secondary" style={score === null ? undefined : {backgroundColor:`hsl(255 70% ${98-score*.18}%)`,color:'#202139'}} onClick={() => onOpen(row)}>{score === null ? 'Ausente' : formatMetric(score,1)+'%'} · {row.assessment_id}</button>
        }) ?? 'Sem avaliação'}</td>)}</tr>
      })}</tbody></table></div>
    {last>0 && <nav><button disabled={!current} onClick={() => setPage(current-1)}>Anterior</button> {current+1} / {last+1} <button disabled={current===last} onClick={() => setPage(current+1)}>Seguinte</button></nav>}
  </figure>
}
