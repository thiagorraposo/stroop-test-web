import { useEffect, useId, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export type Option = { value: string; label: string; disabled?: boolean }

export function Button({ variant = 'secondary', loading = false, children, disabled, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean }) {
  return <button type="button" {...props} className={`ui-button ui-${variant} ${props.className ?? ''}`}
    disabled={disabled || loading} aria-busy={loading || undefined}>{loading && <span aria-hidden="true">◌ </span>}{children}</button>
}

export function IconButton({ label, children, ...props }: Omit<Parameters<typeof Button>[0], 'aria-label'> & { label: string }) {
  return <Button {...props} aria-label={label} className={`ui-icon-button ${props.className ?? ''}`}><span aria-hidden="true">{children}</span></Button>
}

type FieldProps = { label: string; hint?: string; error?: string }
export function Input({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const generated = useId(), id = props.id ?? generated
  const description = [props['aria-describedby'], hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return <div className="ui-field"><label htmlFor={id}>{label}</label>
    <input {...props} id={id} aria-describedby={description} aria-invalid={error ? true : props['aria-invalid']} />
    {hint && <p id={`${id}-hint`} className="ui-hint">{hint}</p>}
    {error && <p id={`${id}-error`} className="ui-field-error" role="alert">{error}</p>}
  </div>
}
export function SearchInput(props: Parameters<typeof Input>[0]) { return <Input {...props} type="search" /> }

export function Select({ label, options, hint, error, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps & { options: Option[] }) {
  const generated = useId(), id = props.id ?? generated
  return <div className="ui-field"><label htmlFor={id}>{label}</label>
    <select {...props} id={id} aria-invalid={!!error} aria-describedby={[props['aria-describedby'], hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined}>
      {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    {hint && <p id={`${id}-hint`} className="ui-hint">{hint}</p>}
    {error && <p id={`${id}-error`} role="alert" className="ui-field-error">{error}</p>}
  </div>
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="ui-choice"><input {...props} type="checkbox" /><span>{label}</span></label>
}
export function Radio({ label, ...props }: Parameters<typeof Checkbox>[0]) {
  return <label className="ui-choice"><input {...props} type="radio" /><span>{label}</span></label>
}

/** Lista de checkboxes: seleção múltipla sem teclas modificadoras; busca nunca remove a seleção. */
export function MultiSelect({ label, options, value, onChange, disabled = false }: {
  label: string; options: Option[]; value: string[]; onChange(value: string[]): void; disabled?: boolean
}) {
  const [search, setSearch] = useState('')
  const [focused, setFocused] = useState<string | null>(null)
  const matches = options.filter(option => value.includes(option.value) || option.value === focused || option.label.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  return <fieldset className="ui-multiselect" disabled={disabled}><legend>{label}</legend>
    <SearchInput label={`Buscar opções de ${label.toLocaleLowerCase('pt-BR')}`} value={search} onChange={event => setSearch(event.target.value)} />
    <div className="ui-options">{matches.map(option => <Checkbox key={option.value} label={option.label} value={option.value} checked={value.includes(option.value)} disabled={option.disabled}
      onFocus={() => setFocused(option.value)} onBlur={() => setFocused(null)}
      onChange={event => onChange(event.target.checked ? [...value, option.value] : value.filter(item => item !== option.value))} />)}</div>
    <p role="status" className="ui-hint">{matches.length ? `${value.length} selecionada(s).` : 'Nenhuma opção corresponde à busca.'}</p>
  </fieldset>
}

export function Combobox({ label, options, value, onChange, disabled = false }: {
  label: string; options: Option[]; value: string; onChange(value: string): void; disabled?: boolean
}) {
  const id = useId(), input = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState<string | null>(null), [open, setOpen] = useState(false), [active, setActive] = useState(-1)
  const matches = options.filter(option => !option.disabled && option.label.toLocaleLowerCase('pt-BR').includes((search ?? '').toLocaleLowerCase('pt-BR')))
  useEffect(() => { if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' }) }, [open, active, id])
  const choose = (index: number) => { const option = matches[index]; if (!option) return; onChange(option.value); setSearch(null); setOpen(false); setActive(-1); input.current?.focus() }
  return <div className="ui-field ui-combobox"><label htmlFor={id}>{label}</label>
    <input id={id} ref={input} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-controls={`${id}-list`}
      aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined} disabled={disabled}
      value={search ?? options.find(option => option.value === value)?.label ?? ''}
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setSearch(null); setActive(-1) }}
      onChange={event => { setSearch(event.target.value); setActive(-1); setOpen(true) }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setSearch(null); setActive(-1) }
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); setActive(index => !matches.length ? -1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length) }
        if (event.key === 'Enter' && open) { event.preventDefault(); choose(active) }
      }} />
    {open && <><ul id={`${id}-list`} role="listbox" aria-label={label} className="ui-combobox-options">
      {matches.map((option, index) => <li id={`${id}-${index}`} key={option.value} role="option" aria-selected={option.value === value}
        className={active === index ? 'ui-option-active' : undefined} onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>{option.label}</li>)}
    </ul>{!matches.length && <p role="status">Nenhuma opção corresponde à busca.</p>}</>}
  </div>
}

export function DateRangePicker({ label, start, end, onChange, error, disabled }: {
  label: string; start: string; end: string; onChange(value: { start: string; end: string }): void; error?: string; disabled?: boolean
}) {
  return <fieldset className="ui-date-range" disabled={disabled}><legend>{label}</legend>
    <Input label="Data inicial" type="date" value={start} onChange={event => onChange({ start: event.target.value, end })} />
    <Input label="Data final" type="date" value={end} onChange={event => onChange({ start, end: event.target.value })} error={error} />
  </fieldset>
}

export function Tabs({ label, tabs, value, onChange }: { label: string; tabs: { value: string; label: string; content: ReactNode; disabled?: boolean }[]; value: string; onChange(value: string): void }) {
  const id = useId(), refs = useRef<(HTMLButtonElement | null)[]>([])
  return <div className="ui-tabs"><div role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button key={tab.value} type="button" role="tab" id={`${id}-tab-${tab.value}`} aria-controls={`${id}-panel-${tab.value}`}
      aria-selected={tab.value === value} tabIndex={tab.value === value ? 0 : -1} disabled={tab.disabled}
      ref={node => { refs.current[index] = node }} onClick={() => onChange(tab.value)} onKeyDown={event => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const enabled = tabs.map((item, i) => item.disabled ? -1 : i).filter(i => i >= 0)
        const position = enabled.indexOf(index)
        const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : enabled[(position + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length]
        if (next !== undefined) { onChange(tabs[next]!.value); refs.current[next]?.focus() }
      }}>{tab.label}</button>)}
  </div>{tabs.map(tab => <div key={tab.value} role="tabpanel" id={`${id}-panel-${tab.value}`} aria-labelledby={`${id}-tab-${tab.value}`} hidden={tab.value !== value} tabIndex={0}>{tab.content}</div>)}</div>
}
