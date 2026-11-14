/** Harness de desenvolvimento, sem importação pelo App ou rota no build de produção. */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Checkbox, Combobox, DateRangePicker, IconButton, Input, MultiSelect, Radio, SearchInput, Select, Tabs } from '../components/ui/controls'
import { Accordion, Card, ChartContainer, DataTable, Dialog, Drawer, EmptyState, ErrorState, ExportDialog, FilterChip, LoadingState, MetricCard, StatusBadge, Tooltip } from '../components/ui/presentation'
import '../styles.css'

const options = [{ value: 'P1', label: 'Projeto sintético A' }, { value: 'P2', label: 'Projeto sintético B' }, { value: 'P3', label: 'Projeto indisponível', disabled: true }]
function ComponentCatalog() {
  const [selected, setSelected] = useState(['P1']), [project, setProject] = useState('P1'), [name, setName] = useState('Valor sintético preservado')
  const [period, setPeriod] = useState({ start: '', end: '' }), [checked, setChecked] = useState(false), [mode, setMode] = useState('synthetic')
  const [tab, setTab] = useState('one'), [modal, setModal] = useState(''), [error, setError] = useState(false), [retry, setRetry] = useState(0)
  const table = <DataTable caption="Avaliações sintéticas por projeto" columns={[{ key: 'project', label: 'Projeto', render: (row: { id: string; total: number }) => row.id }, { key: 'total', label: 'Avaliações', render: (row: { id: string; total: number }) => row.total }]}
    rows={[{ id: 'P1', total: 2 }, { id: 'P2', total: 3 }]} rowKey={row => row.id} />
  return <main className="professional-theme ui-catalog">
    <h1>Stroop Test Web · Catálogo sintético</h1>
    <p>Exemplos locais de componentes administrativos. Sem coleta ou serviço externo.</p>
    <div className="ui-catalog-grid">
      <Card title="Ações"><div className="ui-actions">
        <Button variant="primary" onClick={() => setError(true)}>Validar exemplo</Button>
        <Button onClick={() => setError(false)}>Limpar erro</Button>
        <Button variant="danger" onClick={() => setModal('confirm')}>Confirmar inativação</Button>
        <Button disabled>Indisponível</Button><Button loading>Salvando…</Button>
        <IconButton label="Atualizar exemplo" onClick={() => setRetry(n => n + 1)}>↻</IconButton>
      </div><p role="status">Atualizações: {retry}</p></Card>
      <Card title="Campos e validação">
        <Input label="Identificação sintética" hint="Somente exemplo, mantido em RAM." value={name} onChange={event => setName(event.target.value)} error={error ? 'Confira o valor informado. Seu preenchimento foi preservado.' : undefined} />
        <SearchInput label="Buscar código sintético" placeholder="PAT-000001" />
        <Select label="Projeto principal" options={options} value={project} onChange={event => setProject(event.target.value)} />
        <Input label="Campo indisponível" value="Sem permissão" disabled />
      </Card>
      <Card title="Seleção pesquisável"><MultiSelect label="Projetos sintéticos" options={options} value={selected} onChange={setSelected} />
        <Combobox label="Projeto contextual" options={options} value={project} onChange={setProject} />
        <p role="status">Projeto selecionado: {project}</p>
      </Card>
      <Card title="Período e escolhas"><DateRangePicker label="Período da consulta" {...period} onChange={setPeriod} error={period.start && period.end && period.start > period.end ? 'A data final deve ser posterior ou igual à inicial.' : undefined} />
        <Checkbox label="Incluir ausentes" checked={checked} onChange={event => setChecked(event.target.checked)} />
        <fieldset><legend>Modo do exemplo</legend><Radio label="Sintético" name="mode" checked={mode === 'synthetic'} onChange={() => setMode('synthetic')} />
          <Radio label="Desidentificado" name="mode" checked={mode === 'deidentified'} onChange={() => setMode('deidentified')} /></fieldset>
      </Card>
      <Card title="Navegação e ajuda"><Tabs label="Seções do exemplo" value={tab} onChange={setTab} tabs={[
        { value: 'one', label: 'Resumo', content: <p>Resumo sintético.</p> }, { value: 'disabled', label: 'Indisponível', content: null, disabled: true },
        { value: 'two', label: 'Detalhes', content: <p>Detalhes sintéticos.</p> },
      ]} /><Tooltip label="As contagens se referem ao conjunto completo.">Sobre o denominador</Tooltip>
        <Accordion title="Proveniência do exemplo"><p>Fixture sintética, sem interpretação científica.</p></Accordion>
      </Card>
      <Card title="Indicadores e estados"><MetricCard label="Avaliações sintéticas" value="5" description="Contagem operacional; dois projetos." />
        <div className="ui-actions"><StatusBadge>Sem seleção</StatusBadge><StatusBadge tone="success">Concluída</StatusBadge><StatusBadge tone="warning">Revisar</StatusBadge><StatusBadge tone="error">Interrompida</StatusBadge></div>
        <LoadingState>Atualizando consulta…</LoadingState><EmptyState title="Nenhum resultado">Ajuste os filtros e aplique novamente.</EmptyState>
        <ErrorState onRetry={() => setRetry(n => n + 1)}>Não foi possível consultar. Tente novamente.</ErrorState>
        {selected.map(value => <FilterChip key={value} label={value} onRemove={() => setSelected(items => items.filter(item => item !== value))} />)}
      </Card>
      <ChartContainer title="Coletas sintéticas" description="Avaliações por projeto; população sintética, sem ausentes."
        chart={<div style={{ display: 'flex', gap: '16px', alignItems: 'end', height: '120px' }}><div style={{ background: 'var(--ui-action)', height: '66%', width: '40%' }} /><div style={{ background: 'var(--ui-text)', height: '100%', width: '40%' }} /></div>}
        table={table} />
      <Card title="Tabela e sobreposições">{table}<div className="ui-actions">
        <Button onClick={() => setModal('dialog')}>Abrir diálogo</Button><Button onClick={() => setModal('drawer')}>Abrir navegação móvel</Button><Button onClick={() => setModal('export')}>Abrir exportação</Button>
      </div></Card>
    </div>
    <Dialog open={modal === 'dialog' || modal === 'confirm'} title={modal === 'confirm' ? 'Confirmar inativação' : 'Conferir dados sintéticos'} onClose={() => setModal('')}>
      <p>{modal === 'confirm' ? 'Esta confirmação é apenas um exemplo. Nenhum cadastro será alterado.' : name}</p>
      <Button onClick={() => setModal('')}>Cancelar</Button>
    </Dialog>
    <Drawer open={modal === 'drawer'} title="Navegação de exemplo" onClose={() => setModal('')}><Button onClick={() => setModal('')}>Resultados sintéticos</Button></Drawer>
    <ExportDialog open={modal === 'export'} onClose={() => setModal('')}><p>Exportação indisponível neste catálogo. Nenhum arquivo será gerado.</p><Button disabled>Preparar arquivo</Button></ExportDialog>
  </main>
}
createRoot(document.getElementById('root')!).render(<ComponentCatalog />)
