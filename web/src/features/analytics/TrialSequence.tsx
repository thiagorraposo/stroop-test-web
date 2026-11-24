import { useState } from 'react'
import type { Trial } from '../../api/assessments'
import { formatMetric } from '../../dashboard/analysis'

const outcomes: Record<string,string> = { hit: 'Acerto Go', omission: 'Omissão', commission: 'Comissão', correct_rejection: 'Rejeição correta' }

export function TrialSequence({ trials }: { trials: Trial[] }) {
  const [filter, setFilter] = useState('')
  const visible = trials.filter(t => !filter || filter === t.error_type)
  const peak = Math.max(.001, ...trials.flatMap(t => t.reaction_time_seconds === null ? [] : [t.reaction_time_seconds]))
  return <section><h4>Sequência de tentativas</h4>
    <label>Mostrar respostas<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todas</option>
      {Array.from(new Set(trials.map(t => t.error_type)), code => <option key={code} value={code}>{outcomes[code] ?? code}</option>)}</select></label>
    <figure><figcaption>RT individual por tentativa (s)</figcaption><ol className="chart-meter-list">
      {visible.map(t => <li key={t.trial_number}><span>{t.trial_number} · {outcomes[t.error_type] ?? t.error_type}</span>
        {t.reaction_time_seconds !== null && <meter max={peak} value={t.reaction_time_seconds}/>}
        <span>{t.reaction_time_seconds === null ? 'Ausente' : formatMetric(t.reaction_time_seconds,3)+' s'}</span></li>)}
    </ol></figure>
    <div className="table-scroll"><table><caption>Tentativas registradas</caption>
      <thead><tr>{['Tentativa','Palavra','Cor','Condição','Resposta','Classificação','RT (s)'].map(label => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{visible.map(t => <tr key={t.trial_number}><td>{t.trial_number}</td><td>{t.word}</td><td>{t.ink_color}</td><td>{t.condition}</td><td>{t.key_pressed ?? '—'}</td><td>{outcomes[t.error_type] ?? t.error_type}</td><td>{formatMetric(t.reaction_time_seconds,3)}</td></tr>)}</tbody>
    </table></div></section>
}
