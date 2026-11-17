# Guia do usuario

## Escolher o fluxo

A versao WEB permite preparar convites, executar a tarefa no navegador e
consultar resultados por projeto. O fluxo local PsychoPy e Streamlit continua
disponivel. O estado de liberacao da WEB fica no [roadmap](../ROADMAP_WEB.md);
a versao publicada e seus limites ficam no [registro da VPS](DEPLOY_WEB_VPS.md).
Use somente dados sinteticos enquanto a liberacao aplicavel a pesquisa nao
estiver registrada. Publicar a pagina nao libera automaticamente coleta real.

Os resultados sao descritivos, sem diagnostico, norma, percentil clinico ou
equivalencia psicometrica entre PsychoPy e navegador. Consulte os limites da
[validacao WEB](../VALIDACAO_WEB.md).

## Participar pela WEB

1. Abra o endereco informado pela equipe e selecione **Iniciar tutorial**.
2. Leia a regra: pressione **Espaco** quando palavra e cor das letras forem
   iguais; quando forem diferentes, aguarde sem pressionar.
3. Selecione **Ir para a pratica** e informe o codigo de convite fornecido pela
   equipe. O participante nao precisa de conta Google.
4. Use computador Windows ou Linux, teclado fisico e Chrome, Edge ou Firefox
   atualizado. Confirme o teclado e pressione e solte Espaco para verifica-lo.
   A verificacao de ambiente nao certifica precisao fisica do equipamento.
5. Selecione **Comecar pratica**. Sao quatro tentativas com feedback. Ao final,
   escolha **Repetir pratica** ou **Comecar tarefa**. O principal dura cerca de
   um minuto; mantenha a aba em foco e evite interrupcoes.
6. Aguarde **Resultado recebido pela equipe** antes de finalizar. O resumo
   local, sozinho, nao confirma que os dados chegaram ao servidor.
7. Selecione **Finalizar** para encerrar o acesso. Depois, pode fechar a pagina.

Use uma unica aba para a tarefa. Escape, perda de foco ou outra interrupcao
podem invalidar o bloco; o principal interrompido nao e retomado nem gera
avaliacao parcial. Comunique a interrupcao a equipe para orientar nova sessao.

Se aparecer **Reenviar resultado**, mantenha a pagina aberta e use esse botao:
o mesmo resultado pode ser enviado sem repetir a tarefa, enquanto o acesso
estiver valido. Fechar ou recarregar pode perder um resultado ainda nao
confirmado, pois ele fica somente na memoria da pagina. **Sair sem confirmacao**
encerra esse acesso sem garantir recebimento. A equipe pode consultar o projeto
para verificar o que foi efetivamente gravado antes de preparar outra sessao.

## Entrar como profissional

Abra **Area da equipe** (`/equipe`) e informe **Usuario** e **Senha** locais
cadastrados pelo responsavel pelo sistema (ou entre com Google apenas quando
expressamente habilitado em configuracao autorizada). Contas locais permitem
colagem e gerenciador de senha; após login ou troca de senha, o painel carrega
apenas os projetos vinculados a conta.

O perfil **Consulta** acessa analises e exportacoes dos projetos autorizados.
**Coleta e importacao** tambem prepara novas avaliacoes e cadastro contextual.
**Administracao** permite gerenciar contas locais, projetos, vinculos, pacientes
e avaliadores, alem de correcoes auditadas de vinculo. Mesmo administradores
precisam de vinculo ativo ao projeto para visualizar ou preparar dados de
pesquisa. Ao terminar, use **Encerrar sessao** e aguarde o fechamento antes de
deixar o terminal.

## Preparar nova avaliacao

1. No eixo **Nova Avaliacao**, selecione o **Projeto** ativo autorizado.
2. Busque o **Paciente** existente por nome normalizado ou codigo estavel
   (`PAT-...`). Quando houver homonimos, confira codigo, iniciais e nota de
   desambiguacao; cadastros novos exigem confirmacao explicita se houver
   duplicidade potencial.
3. Selecione o **Avaliador responsavel** (`EVA-...`), a **Visita / Momento**
   (1 a 64 letras ASCII, numeros, ponto, hifen ou sublinhado) e o **Instrumento**.
4. Escolha a modalidade:
   - **Remota**: revise o resumo para conferencia e emita codigo de uso unico com
     QR code gerado em RAM; o endereco publico `/pratica` nunca leva o codigo na URL.
   - **Presencial**: revise o resumo, confirme e use **Iniciar neste dispositivo**
     para handoff atomico (resgata a sessao do participante e encerra a sessao
     profissional no servidor antes de abrir `/pratica`).

O codigo aparece uma unica vez na tela de confirmacao. Em falha de rede, utilize
**Consultar status da operacao** antes de tentar nova preparacao; nao repita em
paralelo para evitar cadastros/convites duplicados.

## Analise, consultas e exportacoes

No eixo **Analise**:

1. Na barra compartilhada **Filtros da consulta**, escolha projetos (1 a 20),
   periodo (UTC em WEB / data civil em legado), instrumento, versao, plataforma,
   participante, avaliador, visita ou filtros de tentativa/desempenho Stroop e
   acione **Aplicar filtros**.
2. Em **Avaliacoes e historico**, consulte os contadores A/T oficiais (sempre
   segregados das sessoes abortadas/expiradas/invalidadas/em andamento), a
   tabela paginada e o **Detalhe da avaliacao** (preservando `—`/nulo quando
   nao ha RT valido, sem substituir por zero).
3. Em **Resultados e analises**, alterne o agrupamento e a metrica descritiva,
   faca drill-down ate o nivel desejado ou consulte a tabela equivalente
   acessivel. As visualizacoes sao estritamente descritivas, sem normas clinicas.
4. Em **Exportacoes**, selecione uma das cinco granularidades (`pacientes`,
   `avaliacoes`, `tentativas`, `metricas`, `stroop_21_colunas`), escolha as
   colunas e clique em **Pré-visualizar contagem e amostra** (modo desidentificado
   padrao) antes de liberar **Baixar arquivo CSV**.

`stroop_21_colunas` requer o instrumento `stroop_go_nogo_ptbr` sem filtros por
tentativa (`condicao`, `go_nogo`, `tipo de resposta`). Cada download revalida no
servidor permissoes, papel, recorte e snapshot; alteracoes de dados ou vinculos
invalidadas retornam conflito `409` sem liberar arquivo divergente. A exportacao
nominal depende de liberacao explicita da pesquisa (`DEC-03`).

## Administrar contas, cadastros e vinculos

No eixo **Gestao**, utilize **Pacientes**, **Avaliadores** e **Administracao**
para manter o cadastro central unico (`PAT-...` e `EVA-...`), gerenciar contas,
criar projetos, atribuir ou revogar vinculos de membros e executar correcoes
auditadas de vinculo (`relink`) com motivo registrado em trilha de auditoria e sem
mutar tentativas (`trial_results`) nem metricas calculadas.

Bloqueios e revogacoes impedem novas operacoes e invalidam sessoes abertas, sem
apagar resultados concluidos. O envio manual de CSV pelo navegador (upload web)
foi retirado do modo produto; dados historicos migrados dependem de mapa
explicito auditavel via CLI/administracao sem fusao automatica por pseudonimo.
Consulte a [transicao e matriz de cobertura](TRANSICAO_WEB.md).

## Ajuda rapida da WEB

- Login sem acesso: confira usuario local, senha, perfil, estado e vinculo com
  o responsavel. Nao envie senha, cookies ou tokens para suporte.
- Nenhum resultado: confira projeto(s), filtros aplicados e eventual mapa de
  identidade historica; use **Limpar filtros** quando necessario.
- Conflito `409` na exportacao: a consulta expirou ou houve alteracao nos dados
  ou vinculos apos a previa; reaplique os filtros e gere nova previa.
- Acesso expirado ou revogado: nao reutilize convite consumido e nao tente
  retomar bloco principal interrompido (D2).
- Falha operacional (5xx/429): aguarde e registre horario aproximado e
  `request_id`, sem dados de participantes, convites ou capturas identificaveis.

## Fluxo local preservado

O experimento PsychoPy gera um CSV oficial. O launcher importa esse CSV para
SQLite local, ou o importador explicito usa PostgreSQL. O Streamlit consulta
os resultados sem modificar o CSV bruto.

```text
PsychoPy -> data/*_trials.csv -> SQLite local -> dashboard Streamlit
```

O projeto e educacional e exploratorio. Ele nao e instrumento clinico, nao produz diagnostico e nao oferece comparacao normativa.

## Configurar o fluxo local PsychoPy e Streamlit

Se voce recebeu o projeto como ZIP, siga primeiro o
[guia por ZIP](USO_POR_ZIP_GITHUB.md). Em resumo:

- Windows: instale Python, execute `setup.bat` e depois `abrir_dashboard.bat`.
- Linux/macOS: instale Python, execute `bash setup.sh` e depois `bash abrir_dashboard.sh`.

O PsychoPy deve ser instalado separadamente do ambiente usado pelo dashboard.

## Executar o experimento

1. Abra o PsychoPy.
2. Entre na interface Builder.
3. Abra `stroop_go_nogo_ptbr.psyexp`.
4. Antes de uma coleta, rode o experimento em modo Pilot e confira instrucoes, pratica, respostas e tela de resultados.
5. Para a execucao desejada, preencha apenas os campos solicitados pelo formulario local.
6. Ao final, confirme que um CSV unificado com sufixo `_trials.csv` foi criado em `data/`.

Nao mova o `.psyexp` sozinho para outra pasta: ele depende dos arquivos versionados em `condicoes/` e da estrutura do projeto.

## Abrir o dashboard

Depois que houver um CSV oficial em `data/`:

- Windows: execute `abrir_dashboard.bat`.
- Linux/macOS: execute `bash abrir_dashboard.sh`.

O launcher usa o CSV `*_trials.csv` modificado mais recentemente, importa a avaliacao para `database/stroop_results.sqlite3` e inicia o Streamlit. Se a avaliacao ja estiver no banco, ela nao e duplicada.

Para escolher outro CSV ou reimportar uma avaliacao, consulte a
[instalacao multiplataforma](INSTALACAO_MULTIPLATAFORMA.md). O CSV de origem
nunca e alterado pelo launcher ou pelo dashboard.

## Encerrar

Feche a aba do navegador e encerre o processo do dashboard no terminal com `Ctrl+C`. Em operação PostgreSQL, os dados importados permanecem no banco; no fallback local, permanecem no SQLite.

## Cuidado com dados pessoais

No fluxo local, os dados ficam no computador do usuario, dentro de `data/` e
`database/`, ou no PostgreSQL explicitamente configurado. Na WEB, os resultados
confirmados ficam no banco do servidor. Pastas, bancos e exportacoes nao devem
ser publicados nem enviados junto com contribuicoes ao projeto. Nao coloque
dados reais em screenshots, issues publicas, mensagens de suporte ou exemplos
de documentacao.

Use `participant_id` como identificador tecnico. `participant_name` e informacao pessoal local e nao deve aparecer em nomes de arquivo, capturas publicas ou logs compartilhados.

## Ajuda rapida

- Python nao abre: reinstale uma versao compativel e confira o `PATH`.
- Setup informa ambiente gerenciado: use o script de setup, sem instalar pacotes globalmente.
- Streamlit ausente: execute o setup novamente e use o launcher do projeto.
- Banco ausente: gere um CSV oficial e abra o dashboard novamente.
- Nenhum CSV encontrado: confirme o sufixo `_trials.csv` dentro de `data/`.
- Cabecalho incompativel: use o CSV oficial sem edicao manual e consulte `../experimento/CSV_UNIFICADO.md`.

Para instrucoes detalhadas de Download ZIP e solucao de problemas, consulte o
[guia por ZIP](USO_POR_ZIP_GITHUB.md). Operadores da WEB devem seguir a
[transicao e manutencao](TRANSICAO_WEB.md) e o [runbook de recuperacao](WEB_RECUPERACAO.md).
