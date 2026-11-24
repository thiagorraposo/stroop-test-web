import type { AnalysisPage } from '../../api/analysis'
import { formatMetric } from '../../dashboard/analysis'
type Group = AnalysisPage['analytics']['groups'][number]

export function GroupChart({groups, peak, temporal, select}: {groups: Group[]; peak: number; temporal: boolean; select(group: Group): void}) {
  const times = groups.map(group => Date.parse(String(group.key.at(-1))))
  const validTimes = times.filter(Number.isFinite)
  const start = Math.min(...validTimes), end = Math.max(...validTimes)
  if (temporal && !validTimes.length) return <p>Datas indisponíveis para este gráfico.</p>
  const width = Math.max(460,groups.length*34)
  const y = (value: number) => 160 - value/peak*140
  return <figure className="analytics-card">
    <figcaption>{temporal ? 'Valores por data de início' : 'Comparação entre grupos'} · {groups[0]?.unit}</figcaption>
    <p>Escala de 0 a {formatMetric(peak,2)}. Selecione um grupo para inspecionar sua proveniência.</p>
    <div className="table-scroll"><svg width={width} height={202} viewBox={`0 0 ${width} 202`} role="img" aria-label={temporal ? 'Pontos temporais dos grupos publicados' : 'Barras verticais dos grupos publicados'}>
      <path d={`M30 18V160H${width-20}`} fill="none" stroke="currentColor" />
      {groups.map((group,index) => {
        if(group.value === null || (temporal && !Number.isFinite(times[index]))) return null
        const x = temporal ? 42+(width-80)*(end===start ? .5 : (times[index]!-start)/(end-start)) : 42+(width-80)*(index+.5)/groups.length
        return <g key={JSON.stringify(group.key)} fill="var(--ui-action)" onClick={() => select(group)}>
          <title>{group.label} · {formatMetric(group.value,3)} {group.unit}</title>
          {temporal ? <circle cx={x} cy={y(group.value)} r="5"/> : <rect x={x-8} width="16" y={y(group.value)} height={Math.max(1,160-y(group.value))}/>}
          {!temporal && <text x={x} y="181" textAnchor="middle" fontSize="12">{index+1}</text>}
        </g>
      })}
      {temporal && <g fontSize="12" fill="currentColor"><text x="30" y="185">{new Date(start).toISOString().slice(0,10)}</text><text x={width-20} y="185" textAnchor="end">{new Date(end).toISOString().slice(0,10)}</text></g>}
    </svg></div>
    <label>Inspecionar grupo<select defaultValue="" onChange={e => {const group=groups[Number(e.target.value)]; if(e.target.value && group) select(group)}}>
      <option value="">Selecione</option>{groups.map((group,index) => <option key={JSON.stringify(group.key)} value={index}>{index+1} · {group.label} · {group.key.slice(0,4).join(' / ')}</option>)}</select></label>
  </figure>
}
