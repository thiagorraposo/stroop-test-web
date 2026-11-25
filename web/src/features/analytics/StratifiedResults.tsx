import { VisitMatrix } from './VisitMatrix'
import { DistributionView } from './DistributionView'
import { useState } from 'react'
import { descriptiveStrata } from './DescriptiveSummary'
import { AssessmentPlot } from './AssessmentPlot'
import { ResearchVisualizations, GenericInstrumentResults } from '../../components/ResearchVisualizations'
import type { ScopedAssessment } from '../../components/ResultsTable'
import type { Project } from '../../api/assessments'

export function StratifiedResults({ rows, projects, viewMode, onOpen }: { rows: ScopedAssessment[]; projects: Project[]; viewMode?: 'visitas'; onOpen?(row: ScopedAssessment): void }) {
  const [chart, setChart] = useState('distribution')
  const strata = descriptiveStrata(rows)
  if (!rows.length) return <p role="status">Nenhuma avaliação corresponde aos filtros.</p>
  return <>{!viewMode && <label>Visualizações das avaliações<select value={chart} onChange={e => setChart(e.target.value)}>
    <option value="distribution">Distribuição da precisão</option><option value="matrix">Mapa de participante por visita</option><option value="scatter">Dispersão entre precisão e RT</option>
    <option value="responses">Respostas Go/No-Go</option><option value="operations">Volume e erros por grupo</option>
  </select></label>}{Array.from(strata, ([key, group]) => {
    const row = group[0]!
    return <section key={key}><h3>{row.test_code} · {row.test_version}</h3>
      <p>Protocolo {row.protocol_id ?? 'não informado'} · {row.platform} · {group.length} avaliações</p>
      {chart === 'matrix' && onOpen && row.test_code === 'stroop_go_nogo_ptbr' && <VisitMatrix rows={group} onOpen={onOpen} />}
      {chart === 'scatter' && onOpen && row.test_code === 'stroop_go_nogo_ptbr' && <AssessmentPlot rows={group} onOpen={onOpen} />}
      {!viewMode && chart === 'distribution' && row.test_code === 'stroop_go_nogo_ptbr' && <DistributionView rows={group} />}
      {(viewMode || ['responses','operations'].includes(chart)) && row.test_code === 'stroop_go_nogo_ptbr' && <ResearchVisualizations fixedParticipant={viewMode === 'visitas'} rows={group} projects={projects} viewMode={viewMode ?? (chart === 'operations' ? 'operacional' : 'condicoes')} />}
      {row.test_code !== 'stroop_go_nogo_ptbr' && <GenericInstrumentResults rows={group} projects={projects} />}
    </section>
  })}</>
}
