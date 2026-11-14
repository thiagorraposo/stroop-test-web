# Componentes administrativos

Contrato de uso da fundação UX7-VIS. Requisitos em
[UX](../experimento/UX_DECISIONS.md#ux7-vis--identidade-e-sistema-visual),
validação em [UX7-AA](../VALIDACAO_WEB.md#ux7-aa--acessibilidade-e-matriz-visual).
Estado, aceite, evidências e pendências somente na ficha WEB-048 do
[backlog](../Projeto%20Stroop%20Test.md#web-048--padronizar-identidade-pública-e-componentes-visuais).

Implementação: [controles](../../web/src/components/ui/controls.tsx),
[apresentação](../../web/src/components/ui/presentation.tsx) e
[tema](../../web/src/components/ui/theme.css). Importar apenas o componente
necessário e colocá-lo dentro de `.professional-theme`. O tema delimita tokens
administrativos; o CSS anterior também está delimitado. Não aplicar a classe
ao host experimental, instruções, prática ou HUD. Adaptadores de tokens permitem
migrar os módulos existentes durante sua integração, sem novas dependências.

O chamador mantém valores e estado em RAM. Um erro recuperável não desmonta o
formulário nem limpa valores. Disabled precisa de motivo textual próximo;
nenhum componente interpreta permissões, calcula métrica ou concede acesso.
Todos os botões usam `type=button` por padrão: declarar `type=submit` no formulário.

| Responsabilidade | API e contrato de interação | Estados e exemplo sintético |
|---|---|---|
| Button / IconButton | `variant` primary/secondary/danger; `label` obrigatório no IconButton; handlers DOM. Uma ação primária por região. | disabled nativo, loading bloqueia repetição e usa aria-busy; ícone decorativo. Confirmar ação destrutiva por Dialog. |
| Input / SearchInput | `label`, `hint`, `error` e props nativas; ID gerado, erro/ajuda associados por aria-describedby. | focus visível; required/disabled/readOnly nativos; erro anuncia e preserva `value`; SearchInput não aplica consulta. |
| Select | `options`, `value`, `onChange`, label, hint/error. Escolha única nativa, teclas do SO. | Opção desabilitada e campo disabled; disponibilidade acompanhada de texto. |
| MultiSelect | `options`, array `value`, `onChange`. Fieldset com busca e checkboxes; Tab/Espaço sem Ctrl/Cmd. | Selecionados continuam visíveis na busca; opção desmarcada permanece enquanto focada; vazio anunciado; disabled no fieldset ou opção; busca não altera seleção. |
| Combobox | Escolha única fechada; `options/value/onChange`. Campo com listbox, setas ativam opção, Enter escolhe; Escape/blur descartam texto sem confirmar valor arbitrário. | aria-expanded/controls/activedescendant; opções disabled omitidas; busca vazia anunciada; campo disabled. |
| DateRangePicker | `label`, `start/end`, `onChange({start,end})`; dois campos date rotulados e digitáveis. | `error` associado à data final; disabled no grupo. Chamador valida intervalo antes de aplicar. |
| Checkbox / Radio | Label e props nativas; Radio requer `name` comum; grupo requer fieldset/legend do chamador. | checked/disabled nativos; alvo 24px dentro de linha de 44px; Espaço e setas nativas. |
| Tabs | `tabs[{value,label,content,disabled?}]`, `value/onChange`, label do conjunto. | roving tabindex; setas/Home/End saltam disabled e ativam; painéis hidden preservam estado sem expor conteúdo inativo. |
| Card / MetricCard | Card usa title, children/actions; MetricCard usa label, value, description. | Sem elevação de cartão; altura mínima de métrica; ausente deve ser texto “Sem medida”, nunca zero; loading via LoadingState. |
| DataTable | `caption`, `columns[{key,label,render}]`, rows e rowKey estável. | caption/headers; região rotulada focável com scroll local; vazio textual; ordenação/página são controles do chamador e não alteram população. |
| StatusBadge | `tone` neutral/success/warning/error e texto obrigatório. | Texto distingue estado sem depender de cor; não é live region automática. |
| Tooltip | children é rótulo do botão de ajuda; `label` contém explicação complementar. | Hover ou foco mostra; ponteiro pode alcançar conteúdo; Escape dispensa; não usar para informação essencial ou controle interativo. |
| Dialog / Drawer | `open/title/onClose/children`; modal nativo com label, Escape e trap adicional de Tab/Shift+Tab. | Abre por ação explícita; retorna foco ao acionador conectado; conteúdo desmontado ao fechar; Drawer usa o mesmo ciclo. Não repetir escrita incerta. |
| Accordion | `title/children`, details/summary nativo. | Enter/Espaço alternam; metadados acessíveis sem cartões aninhados. |
| EmptyState / LoadingState / ErrorState | Mensagem específica, ação opcional; LoadingState anuncia polite, ErrorState anuncia erro e aceita onRetry. | Diferenciar vazio inicial, recorte sem resultados, atualização e falha; retry somente quando seguro. Não mostrar sucesso para escrita incerta. |
| FilterChip | `label/onRemove`; botão “Remover filtro …”. | Remoção edita rascunho no chamador; exige Aplicar; foco visível e alvo suficiente. |
| ChartContainer | `title/description/chart/table`. Chart decorativo aria-hidden e tabela equivalente em Accordion. | Descrição declara população/unidade/nulos; tabela deve conter toda informação do gráfico; loading/vazio/erro por composição. |
| ExportDialog | Composição de Dialog com título fixo e children. | Somente apresentação; prévia, erros, loading, indisponível e arquivo preparado vêm do chamador; validação/token/HTTP na WEB-053. Não gera download fictício. |

Exemplos de todos os componentes: com Vite local, acessar
`/e2e/fixtures/component-catalog.html`. Esse harness usa somente estado sintético,
não importa App, não chama API e não é entrada do build de produção. Os testes
COMP7 usam esse endereço nos dois navegadores. Abrir os detalhes da tabela para
comparar a representação gráfica; exercitar erros, seleção, tabs, tooltip,
diálogo, drawer e exportação indisponível. Screenshots ficam em artefatos
ignorados do Playwright, nunca no repositório.

Inventário da marca pública: cabeçalho, início, rodapé, títulos por rota,
HTML title/description/application-name usam **Stroop Test Web**. O texto
“Tarefa de Correspondência de Cores” na preparação descreve o instrumento e
permanece; “cores” nas instruções é conteúdo experimental aprovado. Referências
a Cores e Correspondência em registros históricos/metodológicos permanecem
contextualizadas. `test_code`, protocolo, versões, CSV e motor não são marca.
