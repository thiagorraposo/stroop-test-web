import { useState } from 'react'
import type { Project } from '../../api/assessments'
import type { ScopedAssessment } from '../../components/ResultsTable'
import { StratifiedResults } from './StratifiedResults'

export function LongitudinalPage({rows, projects}: {rows: ScopedAssessment[]; projects: Project[]}) {
  const [chosen, setChosen] = useState('')
  const identity = (row: ScopedAssessment) => JSON.stringify([row.project_id,row.participant_id])
  const participants = new Map(rows.map(row => [identity(row),row]))
  const selected = participants.has(chosen) ? chosen : participants.keys().next().value
  const history = rows.filter(row => identity(row) === selected).sort((a,b) =>
    a.started_at.localeCompare(b.started_at) || a.assessment_id.localeCompare(b.assessment_id))
  if (!history.length) return <p role="status">Nenhuma avaliação corresponde aos filtros.</p>
  const protocols = new Set(history.map(row => JSON.stringify([row.test_code,row.test_version,row.protocol_id,row.platform])))
  return <>
    <label>Participante para evolução<select value={selected} onChange={e => setChosen(e.target.value)}>
      {Array.from(participants, ([key,row]) => <option key={key} value={key}>{projects.find(project => project.id === row.project_id)?.code ?? row.project_id} · {row.participant_id}</option>)}
    </select></label>
    <p>{history.length} avaliações · {new Set(history.map(row => row.visit)).size} visitas · {protocols.size} combinações de instrumento, versão, protocolo e plataforma.</p>
    {protocols.size > 1 && <details open><summary>Histórico com mudança de proveniência</summary>
      <ul>{history.map(row => <li key={row.assessment_id}>{row.started_at} · {row.visit} · {row.assessment_id} · {row.test_code} / {row.test_version} · {row.protocol_id ?? 'Protocolo ausente'} · {row.platform}</li>)}</ul>
    </details>}
    <StratifiedResults key={selected} rows={history} projects={projects} viewMode="visitas" />
  </>
}
