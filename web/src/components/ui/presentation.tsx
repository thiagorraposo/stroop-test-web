import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from './controls'

export function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  const id = useId()
  return <section className="ui-card" aria-labelledby={id}><h2 id={id}>{title}</h2>{children}{actions && <div className="ui-actions">{actions}</div>}</section>
}
export function MetricCard({ label, value, description }: { label: string; value: ReactNode; description: string }) {
  return <div className="ui-metric"><dl><dt>{label}</dt><dd>{value}</dd></dl><p className="ui-hint">{description}</p></div>
}
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'error' }) {
  return <span className={`ui-badge ui-tone-${tone}`}>{children}</span>
}
export function LoadingState({ children = 'Carregando…' }: { children?: ReactNode }) {
  return <p role="status" className="ui-state" aria-live="polite">{children}</p>
}
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="ui-state"><h3>{title}</h3><p>{children}</p>{action}</div>
}
export function ErrorState({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return <div className="ui-state ui-tone-error"><p role="alert">{children}</p>{onRetry && <Button onClick={onRetry}>Tentar novamente</Button>}</div>
}
export function FilterChip({ label, onRemove }: { label: string; onRemove(): void }) {
  return <span className="ui-filter-chip">{label}<Button aria-label={`Remover filtro ${label}`} onClick={onRemove}>×</Button></span>
}
export function Accordion({ title, children }: { title: string; children: ReactNode }) {
  return <details className="ui-accordion"><summary>{title}</summary>{children}</details>
}
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId(), [dismissed, setDismissed] = useState(false)
  return <span className={`ui-tooltip ${dismissed ? 'ui-tooltip-dismissed' : ''}`}
    onMouseEnter={() => setDismissed(false)} onFocus={() => setDismissed(false)} onKeyDown={event => { if (event.key === 'Escape') setDismissed(true) }}>
    <button type="button" aria-describedby={dismissed ? undefined : id}>{children}</button>
    {!dismissed && <span id={id} role="tooltip">{label}</span>}
  </span>
}

/** Modal nativo mantém o foco no top layer; pai controla open e desmonta dados ao sair. */
export function Dialog({ open, title, children, onClose, kind = 'dialog' }: {
  open: boolean; title: string; children: ReactNode; onClose(): void; kind?: 'dialog' | 'drawer'
}) {
  const id = useId(), ref = useRef<HTMLDialogElement>(null), close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => { dialog.close(); if (previous?.isConnected) previous.focus() }
  }, [open])
  return <dialog ref={ref} className={`ui-dialog ui-${kind}`} aria-labelledby={id} tabIndex={-1}
    onKeyDown={event => {
      if (event.key !== 'Tab') return
      const dialog = event.currentTarget
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.tabIndex >= 0 && element.getClientRects().length)
      const first = controls[0], last = controls.at(-1)
      if (!first || !last) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus() }
    }}
    onCancel={event => { event.preventDefault(); close.current() }}>
    <div className="ui-dialog-heading"><h2 id={id}>{title}</h2><Button aria-label={`Fechar ${title}`} onClick={onClose}>Fechar</Button></div>
    {open && children}
  </dialog>
}
export function Drawer(props: Omit<Parameters<typeof Dialog>[0], 'kind'>) { return <Dialog {...props} kind="drawer" /> }
/** Apenas apresentação: seleção, token, permissão e chamada HTTP pertencem a WEB-053. */
export function ExportDialog({ children, ...props }: Omit<Parameters<typeof Dialog>[0], 'title'>) {
  return <Dialog {...props} title="Exportar seleção aplicada">{children}</Dialog>
}

export type TableColumn<T> = { key: string; label: string; render(row: T): ReactNode }
export function DataTable<T>({ caption, columns, rows, rowKey }: { caption: string; columns: TableColumn<T>[]; rows: T[]; rowKey(row: T): string }) {
  return <div className="ui-table-scroll" role="region" aria-label={caption} tabIndex={0}><table><caption>{caption}</caption>
    <thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map(column => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody>
  </table>{!rows.length && <p>Nenhum registro para esta seleção.</p>}</div>
}
export function ChartContainer({ title, description, chart, table }: { title: string; description: string; chart: ReactNode; table: ReactNode }) {
  return <Card title={title}><p>{description}</p><div className="ui-chart" aria-hidden="true">{chart}</div>
    <Accordion title={`Tabela de ${title.toLocaleLowerCase('pt-BR')}`}>{table}</Accordion></Card>
}
