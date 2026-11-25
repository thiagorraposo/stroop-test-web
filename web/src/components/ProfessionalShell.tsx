import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ProfessionalProfile } from '../api/client'
import type { AdministrativeModule } from './ProfessionalDashboard'
import { Drawer } from './ui/presentation'

export const analysisSections = [
  ['dashboard', 'Visão geral'], ['resultados', 'Exploração de resultados'],
  ['longitudinal', 'Análise longitudinal'], ['historico', 'Avaliações e tentativas'], ['qualidade', 'Qualidade da coleta'], ['exportacoes', 'Exportações'],
] as const
const management = [['pacientes', 'Pacientes'], ['avaliadores', 'Avaliadores'], ['administracao', 'Administração']] as const
const axisOf = (active: AdministrativeModule) => active === 'preparar' ? 'preparar' : management.some(([key]) => key === active) ? 'gestao' : 'analise'

/** Navegação contém apenas destinos públicos; consulta e posição ficam em RAM. */
export function ProfessionalShell({ profile, active, onNavigate, children }: {
  profile: ProfessionalProfile; active: AdministrativeModule; onNavigate(value: AdministrativeModule): void; children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false), [open, setOpen] = useState(false)
  const id = useId(), content = useRef<HTMLElement>(null), positions = useRef(new Map<string, number>())
  const keyboardTab = useRef(false)
  const activeRef = useRef(active), navigateRef = useRef(onNavigate)
  navigateRef.current = onNavigate
  const allowed = (value: string): value is AdministrativeModule => [...analysisSections, ...management, ['preparar']].some(([key]) => key === value)
    && !(value === 'administracao' && profile.role !== 'administracao') && !(value === 'preparar' && profile.role === 'consulta')
  const axis = axisOf(active)
  const move = (next: AdministrativeModule, push = true) => {
    if (!allowed(next)) return
    positions.current.set(activeRef.current, window.scrollY)
    activeRef.current = next
    if (push) window.history.pushState(null, '', `#${next}`)
    navigateRef.current(next); setOpen(false)
  }
  useEffect(() => {
    const back = () => { const target = window.location.hash.slice(1); move(allowed(target) ? target : 'dashboard', false) }
    window.addEventListener('popstate', back)
    return () => window.removeEventListener('popstate', back)
  }, [profile.role])
  useEffect(() => {
    activeRef.current = active
    if (!keyboardTab.current && document.activeElement !== document.body) content.current?.focus({ preventScroll: true })
    keyboardTab.current = false
    if (positions.current.has(active)) window.scrollTo(0, positions.current.get(active)!)
    const suffix = axis === 'analise' ? 'Resultados e Análise Unificada' : axis === 'gestao' ? 'Gestão' : 'Nova Avaliação'
    document.title = `${suffix} · Stroop Test Web`
  }, [active, axis])
  const navigation = () => <nav aria-label="Eixos profissionais">
    {([['analise', 'Resultados e Análise Unificada', 'dashboard', '◫'], ['preparar', 'Nova Avaliação', 'preparar', '+'], ['gestao', 'Gestão', 'pacientes', '☷']] as const)
      .filter(([key]) => key !== 'preparar' || profile.role !== 'consulta')
      .map(([key, label, target, icon]) => <button key={key} type="button" className="button secondary" aria-current={axis === key ? 'page' : undefined}
        aria-label={label} title={label} onClick={() => move(target)}><span aria-hidden="true">{icon}</span><span className="axis-label">{label}</span></button>)}
  </nav>
  const secondary = axis === 'analise' ? analysisSections : axis === 'gestao' ? management.filter(([key]) => key !== 'administracao' || profile.role === 'administracao') : []
  const sections = !!secondary.length && <nav aria-label={axis === 'analise' ? 'Seções de análise' : 'Seções de gestão'} className="professional-sections" role="tablist">
        {secondary.map(([key, label], index) => <button type="button" role="tab" key={key} id={`${id}-tab-${key}`} aria-controls={`${id}-panel`} aria-selected={active === key} tabIndex={active === key ? 0 : -1}
          className="button secondary" onClick={() => move(key)} onKeyDown={event => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? secondary[0] : event.key === 'End' ? secondary.at(-1) : secondary[(index + (event.key === 'ArrowRight' ? 1 : -1) + secondary.length) % secondary.length]
            if (next) { keyboardTab.current = true; move(next[0]); document.getElementById(`${id}-tab-${next[0]}`)?.focus() }
          }}>{label}</button>)}
      </nav>
  return <div className={`professional-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <a className="skip-link" href={`#${id}`}>Ir para o conteúdo profissional</a>
    <aside className="professional-sidebar" aria-label="Navegação profissional">
      <button type="button" className="button secondary sidebar-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}>☰</button>
      {navigation()}
      {!collapsed && !open && sections}
      <p className="sidebar-profile">Perfil: {profile.role === 'administracao' ? 'Administração' : profile.role === 'consulta' ? 'Consulta' : 'Coleta'}</p>
      <a className="sidebar-account" href="#conta-profissional">Conta e sessão</a>
    </aside>
    <div className="professional-workspace">
      <button type="button" className="button secondary mobile-navigation" aria-expanded={open} onClick={() => setOpen(true)}>Abrir navegação profissional</button>
      <Drawer title="Navegação profissional" open={open} onClose={() => setOpen(false)}>{navigation()}{sections}</Drawer>
      {collapsed && !open && sections}
      <section id={`${id}-panel`} ref={content} tabIndex={-1} role={secondary.length ? 'tabpanel' : 'region'} aria-label={secondary.find(([key]) => key === active)?.[1] ?? 'Nova Avaliação'}>
        <span id={id} />{children}
      </section>
    </div>
  </div>
}
