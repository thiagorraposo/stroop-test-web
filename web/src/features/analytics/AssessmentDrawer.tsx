import type { AssessmentDetail, Project } from '../../api/assessments'
import { Drawer } from '../../components/ui/presentation'
import { formatMetric as number } from '../../dashboard/analysis'
import { TrialSequence } from './TrialSequence'

type Props = {
  detail: AssessmentDetail
  projects: Project[]
  disabled: boolean
  exporting: boolean
  downloadMessage: string | null
  download(): Promise<void>
  onClose(): void
}

export function AssessmentDrawer({detail, projects, disabled, exporting, downloadMessage, download, onClose}: Props) {
  return <Drawer title="Avaliação e tentativas" open onClose={onClose}>
      <section tabIndex={-1} className="assessment-detail" aria-label="Detalhe da avaliação">
        <h3>Detalhe da avaliação</h3>
        <dl className="assessment-metadata">
          <div><dt>Avaliação</dt><dd className="tabular-nums">{detail.assessment_id}</dd></div>
          <div><dt>Sessão</dt><dd className="tabular-nums">{detail.session_id ?? 'Legado sem sessão WEB'}</dd></div>
          <div><dt>Projeto</dt><dd>{projects.find(item => item.id === detail.project_id)?.code ?? detail.project_id} ({detail.project_id})</dd></div>
          <div><dt>Participante</dt><dd className="tabular-nums">{detail.participant_id}</dd></div>
          <div><dt>Visita</dt><dd>{detail.visit}</dd></div>
          <div><dt>Avaliador</dt><dd>{detail.evaluator_id ?? 'Legado sem identificação técnica'}</dd></div>
          <div><dt>Início</dt><dd className="tabular-nums">{detail.started_at}</dd></div>
          <div><dt>Conclusão</dt><dd className="tabular-nums">{detail.completed_at ?? 'Não registrada no legado'}</dd></div>
          <div><dt>Plataforma</dt><dd>{detail.platform === 'web' ? 'WEB' : 'PsychoPy local (importado)'}</dd></div>
          <div><dt>Instrumento</dt><dd>{detail.test_code}</dd></div>
          <div><dt>Versão</dt><dd className="tabular-nums">{detail.test_version}</dd></div>
          <div><dt>Protocolo</dt><dd>{detail.protocol_id ?? 'Legado sem protocolo WEB'}</dd></div>
          <div><dt>Aplicativo</dt><dd>{detail.app_version ?? 'Não registrado'}</dd></div>
          <div><dt>Período de quadro observado (ms)</dt><dd className="tabular-nums">{number(detail.frame_period_ms, 3)}</dd></div>
        </dl>
        {'accuracy' in detail.summary && (
          <section aria-label="Contagens das respostas">
            <h4>Contagens das respostas principais</h4>
            <dl className="dashboard-cards">
              <div><dt>Acertos (hit)</dt><dd className="tabular-nums">{detail.summary.hits}</dd></div>
              <div><dt>Omissões (omission)</dt><dd className="tabular-nums">{detail.summary.omission_errors}</dd></div>
              <div><dt>Rejeições corretas (correct_rejection)</dt><dd className="tabular-nums">{detail.summary.correct_rejections}</dd></div>
              <div><dt>Comissões (commission)</dt><dd className="tabular-nums">{detail.summary.commission_errors}</dd></div>
            </dl>
          </section>
        )}
        <dl>
          {detail.metrics.map(metric => (
            <div key={metric.metric_code}>
              <dt>{metric.metric_label}</dt>
              <dd className="tabular-nums">
                {number(metric.metric_value, 3)} {metric.unit}
              </dd>
            </div>
          ))}
        </dl>
        {detail.trials.length > 0 && <TrialSequence trials={detail.trials} />}
        {detail.test_code === 'stroop_go_nogo_ptbr' && (
          <button className="button primary" disabled={exporting || disabled} onClick={() => void download()}>
            {exporting ? 'Preparando arquivo…' : 'Exportar CSV oficial'}
          </button>
        )}
        {downloadMessage && <p role="status">{downloadMessage}</p>}
        <button className="button secondary" onClick={onClose}>
          Fechar detalhe
        </button>
      </section>
  </Drawer>
}
