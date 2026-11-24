# Tutorial Completo do Sistema em Produção e Cálculo Didático das Métricas

> **Referência de versão:** Plataforma WEB (`https://strooptest.thiagorraposo.dev`) · Instrumento inicial `stroop_go_nogo_ptbr` (`0.2.2-web.1`) · Apresentação `stroop-web-outline/1.0.0`.
> **Aviso metodológico:** Os resultados do Stroop Test Web têm caráter exclusivamente **descritivo, educacional e de pesquisa exploratória**. A plataforma não constitui instrumento clínico, diagnóstico ou normativo e não assume equivalência psicométrica automática com a execução local no PsychoPy.

---

## Parte 1 — Tutorial das Funcionalidades em Produção

O sistema possui dois ambientes distintos:

1. **Portal do Participante (`/`, `/instrucoes`, `/pratica`)**: área pública onde o voluntário lê as orientações, faz uma prática curta e executa o teste usando um **código de convite de uso único** entregue pela equipe. O participante não cria conta nem faz login.
2. **Área da Equipe (`/equipe`)**: painel protegido por autenticação local (usuário e senha técnicos), organizado em **três eixos de navegação** na barra lateral e controlado por perfis de acesso e vínculo explícito por projeto.

---

### 1. Acesso Profissional e Segurança (`/equipe`)

Ao acessar `/equipe`, o integrante da equipe entra com o **Usuário** e a **Senha** provisionados pelo responsável pelo sistema.

#### Perfis de acesso e o que cada um pode fazer

| Perfil | Consultar painel e gráficos | Exportar CSV | Cadastrar pacientes/avaliadores e emitir convites | Gerir contas, criar projetos e ativar vínculos |
|---|---|---|---|---|
| **Consulta** (`consulta`) | Sim (somente projetos vinculados) | Sim | Não | Não |
| **Coleta e importação** (`importacao`) | Sim (somente projetos vinculados) | Sim | Sim | Não |
| **Administração** (`administracao`) | Sim (somente projetos vinculados) | Sim | Sim | Sim |

> **Regra importante de acesso:** mesmo uma conta com perfil **Administração** só enxerga resultados e só prepara convites de um projeto se possuir um **vínculo ativo** com esse projeto.

#### Barra de conta e sessão
- **Alterar senha:** dentro da barra superior da conta em `/equipe`, permite trocar a senha da conta conectada. Por segurança, a troca **encerra todas as sessões ativas** e exige novo login.
- **Encerrar sessão:** faz logout no servidor e invalida o cookie de sessão imediatamente.

---

### 2. Navegação em Três Eixos na Área da Equipe

Depois do login, o menu lateral divide o sistema em três grandes eixos:

1. **Resultados e Análise Unificada** — contém seis seções em abas que compartilham a mesma consulta aplicada:
   - *Visão geral*
   - *Exploração de resultados*
   - *Análise longitudinal*
   - *Avaliações e tentativas*
   - *Qualidade da coleta*
   - *Exportações*
2. **Nova Avaliação** *(oculto para perfil Consulta)* — emissão de convites de uso único e preparação da sessão.
3. **Gestão** — contém as seções de cadastro e governança:
   - *Pacientes*
   - *Avaliadores*
   - *Administração* *(visível apenas para o perfil Administração)*

Em telas menores (`< 1024 px`), a navegação abre pelo botão **Abrir navegação profissional**.

---

### 3. Passo a Passo no Eixo **Gestão**

#### 3.1 Administração (Contas, Projetos e Vínculos)
Acessível apenas ao perfil **Administração**:

1. **Gerenciar contas e permissões:**
   - Lista todas as contas técnicas cadastradas (`Identificador da conta`, `Perfil`, `Estado`).
   - Permite selecionar uma conta, alterar seu **Perfil** (`Consulta`, `Coleta e importação`, `Administração`) e ativar/bloquear (`Conta ativa`).
   - O sistema bloqueia qualquer tentativa de rebaixar ou bloquear o **último administrador ativo** (`409`).
   - O botão **Encerrar sessões** derruba remotamente todas as sessões abertas daquela conta.
2. **Criar um novo projeto:**
   - Preencha **Código do projeto** (apenas letras, números, `_`, `.` e `-`, sem espaços, até 64 caracteres) e **Nome do projeto** (até 120 caracteres) e clique em **Criar projeto**.
   - **Atenção:** criar um projeto **não vincula ninguém automaticamente**. Logo abaixo, em **Projeto para vínculos**, selecione o projeto criado, escolha sua conta (e as da equipe) em **Conta para vincular** e clique em **Ativar vínculo**.
   - **Dica prática:** após criar e vincular um projeto novo na aba *Administração*, recarregue a página (`F5`) para que ele apareça imediatamente nos seletores de filtros e de *Nova Avaliação*.
3. **Revogar ou reativar vínculos:** na tabela **Vínculos do projeto selecionado**, cada membro pode ser ativado ou revogado sem apagar avaliações já concluídas.

#### 3.2 Pacientes (Cadastro Central Pseudonimizado)
Disponível para perfis **Administração** e **Coleta e importação** (perfil **Consulta** pode visualizar conforme autorização, sem botões de criação/edição):

1. Clique em **+ Cadastrar novo paciente**.
2. Informe o **Nome completo** (2 a 120 caracteres). O sistema gera automaticamente as **Iniciais** (editáveis) e atribui um código sequencial estável **`PAT-AAAAMMDD-NNNNNN`** no servidor.
3. Opcionalmente, adicione uma **Anotação de desambiguação** (ex.: turma ou ambulatório).
4. **Proteção contra duplicidade (homônimos):** ao digitar um nome semelhante ou igual a um paciente existente, o sistema exibe um aviso listando os candidatos encontrados e exige que você marque a caixa **"Confirmo conscientemente que este é um novo paciente homônimo diferente dos listados acima"** para salvar.
5. **Busca, ficha detalhada e auditoria:**
   - Filtre a tabela por nome/código/iniciais e por status (*Todos*, *Apenas ativos*, *Apenas inativos*).
   - Clique em **Ver ficha** para inspecionar projetos, visitas, avaliações, sessões e histórico auditado (`web_registry_audit_events`), ou clique em **Editar cadastro** (informando um motivo auditável).
   - Clique em **Inativar** / **Reativar** para desativação lógica (avaliações históricas são preservadas).
   - Na ficha de detalhe, também é possível corrigir um erro de atribuição histórica via **correção auditada de vínculo (`relink`)**, escolhendo novo paciente/avaliador e registrando o motivo.

#### 3.3 Avaliadores (Cadastro Nominal de Profissionais)
Diferente da conta compartilhada de login da equipe, o cadastro de **Avaliadores** identifica quem conduziu clinicamente/cientificamente cada coleta:

1. Clique em **+ Cadastrar novo avaliador**.
2. Preencha **Nome completo** e confira/ajuste as **Iniciais**. O sistema gera o código sequencial **`EVA-NNNNNN`**.
3. Assim como em pacientes, suporta busca, inativação/reativação lógica, ficha detalhada, edição auditada e correção de vínculo (`relink`).

---

### 4. Passo a Passo no Eixo **Nova Avaliação** (Preparar Convite)

Disponível para **Coleta e importação** e **Administração** em projetos **ativos**:

1. Selecione o **Projeto** desejado no topo do módulo.
2. Selecione um **Paciente cadastrado** pela busca (ou clique em **Cadastrar novo paciente** para criá-lo ali mesmo, sem sair da tela). Ao escolher um paciente, o **Código do participante** (`PAT-...`) e as **Iniciais na sessão** são preenchidos.
3. Selecione o **Avaliador responsável** (`EVA-...`) ou cadastre um novo inline.
4. Preencha a **Visita da sessão** (ex.: `V1`, `T1`, `PRE`, aceitando letras ASCII, números, `_`, `.` e `-`, até 64 caracteres) e confira instrumento/versão (`stroop_go_nogo_ptbr · 0.2.2-web.1`).
5. Clique em **Revisar preparação**, confira o **Resumo para conferência** (projeto, paciente, código, avaliador, visita e protocolo) e clique em **Confirmar e emitir convite**.
6. **Entrega e segurança do código:**
   - O **Código do convite** aparece na tela **apenas uma vez**, junto da validade e do atalho **Abrir prática em outra aba** (`/pratica`, sem o código na URL).
   - **Nunca** recarregue a página antes de copiar o código para o participante, e não compartilhe um mesmo código entre duas pessoas ou duas tentativas.
   - Use **Revogar convite** caso a emissão tenha sido feita por engano antes do resgate; use **Preparar outra sessão** para limpar o formulário mantendo o convite anterior válido.
   - Se ocorrer erro de rede incerto ao emitir, **não gere outro convite automaticamente**: siga o aviso da tela (*"A sessão pode ter sido criada"*) para evitar sessões duplicadas.

---

### 5. Fluxo do Participante (`/`, `/instrucoes`, `/pratica`)

1. **Boas-vindas (`/`) e Orientações (`/instrucoes`):**
   - Explica a regra com exemplos visuais:
     - **Palavra e cor das letras iguais (Go / Congruente):** pressione **`Espaço`**.
     - **Palavra e cor das letras diferentes (No-Go / Incongruente):** aguarde sem pressionar nenhuma tecla.
2. **Resgate e Checagem de Ambiente (`/pratica`):**
   - O participante cola o **Código do convite** (campo mascarado) e clica em **Validar convite**.
   - **Trava de aba única:** o navegador usa `navigator.locks` para impedir duas abas abertas com a mesma sessão.
   - **Verificação pré-prática:** exige navegador compatível em desktop Windows ou Linux (Chrome, Edge ou Firefox), confirmação manual de teclado físico, teste prático pressionando e soltando **`Espaço`** e foco ativo na aba.
3. **Prática (4 tentativas com feedback):**
   - Lembrete da regra (`1,5 s`), contagem regressiva (`Prepare-se`, `3`, `2`, `1`, `Começar`), 4 tentativas (2 congruentes e 2 incongruentes) com mensagem de acerto/erro (`500 ms`) ao final de cada tentativa.
   - Ao terminar a prática, o participante pode **Repetir prática** (atalho `R`) quantas vezes precisar antes de avançar, ou clicar em **Começar tarefa**. **A prática nunca entra nas métricas oficiais.**
4. **Bloco Principal (`16` tentativas, cerca de `60 s`):**
   - Nova contagem regressiva e exibição contínua das 16 tentativas sem feedback.
   - **Checkpoints progressivos:** cada tentativa concluída envia confirmação silenciosa em segundo plano ao servidor (`confirmed_through` até `16/16`).
   - **Interrupções irreversíveis:** pressionar `Esc`, trocar de janela/aba (`blur`), minimizar/ocultar a aba (`visibilitychange`) ou atualizar a página abortam imediatamente a execução. Conforme o protocolo, **o bloco principal nunca é retomado pela metade**; a sessão fica segregada como `aborted` ou `invalidated`, exigindo novo convite se a equipe decidir aplicar novamente.
5. **Resumo e Recibo Oficial:**
   - Ao completar as 16 tentativas, a tela mostra um resumo descritivo imediato e aguarda a gravação no servidor.
   - Só clique em **Finalizar** após aparecer a confirmação **"Resultado recebido pela equipe."**. Se houver oscilação momentânea de internet, aparece **Reenviar resultado**, permitindo retransmitir os mesmos dados em memória sem refazer o teste.

---

### 6. Eixo **Resultados e Análise Unificada**

A barra de **Filtrar resultados** fica fixa no topo das seis abas desse eixo, mantendo o mesmo recorte aplicado entre **Visão geral**, **Exploração de resultados**, **Análise longitudinal**, **Avaliações e tentativas**, **Qualidade da coleta** e **Exportações**.

#### 6.1 Barra Unificada de Filtros e Regra Rascunho × Aplicado
- **Escopo e período:** selecione de **1 a 20 projetos** autorizados (até **5.000 avaliações** por consulta), **Data inicial** e **Data final** (inclusivas; datas WEB usam dia UTC de início, dados importados legados mantêm data civil registrada), **Visitas** e **Instrumento da consulta**.
- **Dimensões experimentais** *(dentro de "Filtros avançados e ordenação")*: multisseleção pesquisável para **Pacientes (cadastro central)**, **Participantes (códigos)**, **Avaliadores**, **Versões** e **Plataformas** (`web` ou `psychopy`).
- **3. Critérios & Métricas:**
  - Busca por código do participante;
  - **Status da avaliação:** *Oficiais válidas (padrão)*, ou segregados (*Invalidadas*, *Abortadas / interrompidas*, *Expiradas*, *Em andamento*, *Todos os status operacionais*), ou *Oficiais válidas + status operacionais segregados*;
  - Faixas de **Precisão geral**, **Precisão Go**, **Precisão No-Go** (`< 50%`, `50% a < 80%`, `≥ 80%`), presença de erros de **Comissão** e **Omissão**, e faixa de **RT mediano** (`< 0,5 s`, `0,5 a < 1,0 s`, `1,0 a < 1,5 s`, `≥ 1,5 s`);
  - Filtros de tentativa (exclusivos do `stroop_go_nogo_ptbr`): **Tipo de resposta/erro** (`Acerto`, `Omissão`, `Comissão`, `Rejeição correta`), **Condição** (`Congruente`, `Incongruente`) e **Go/No-Go**.
- **4. Ordenação & Tratamento:** ordenação por data de início, participante, precisão ou RT mediano (crescente/decrescente) e opção para incluir ou excluir avaliações sem `hits` (`RT mediano ausente`).
- **Sempre clique em `Aplicar filtros`** após editar qualquer campo. Enquanto houver alterações não aplicadas (*rascunho*), chips removíveis exibem as mudanças pendentes e **todos os downloads ficam bloqueados** para evitar exportar um arquivo diferente do que está na tela.

#### 6.2 Quatro Contagens Cadastrais e de Participantes (`registry_counts`)
Logo no topo da **Visão geral**, o painel separa quatro números diferentes para evitar ambiguidades estatísticas:

1. **Cadastro central visível autorizado (sem filtro de avaliação):** total de pacientes cadastrados acessíveis à conta no cadastro central, independentemente de terem feito avaliação ou de filtros ativos.
2. **Pacientes vinculados a projeto:** quantos desses pacientes estão associados aos projetos selecionados na consulta.
3. **Participantes com avaliação oficial válida:** quantos participantes distintos possuem ao menos uma avaliação oficial concluída dentro dos projetos consultados.
4. **Participantes do recorte:** quantos participantes únicos restam após aplicar **todos** os filtros atuais da consulta (período, visita, precisão, RT etc.).

#### 6.3 Qualidade da Coleta e Registros Operacionais Segregados
Na aba **Qualidade da coleta**, ficam concentrados os registros não concluídos/inválidos dos projetos filtrados (**Invalidada**, **Abortada / interrompida**, **Expirada** e **Em andamento**, com motivo/estado e progresso de checkpoints `X/16`) e o resumo de disponibilidade das métricas oficiais (quantas avaliações válidas têm precisão geral ou RT mediano ausentes). **Registros operacionais segregados nunca entram no denominador de precisão, nos gráficos científicos nem nos CSVs oficiais.**

#### 6.4 Exploração de Resultados (`Exploração de resultados`)
Permite agrupar o recorte no servidor e analisar distribuições por estrato escolhendo:
- **Nível de exploração:** *Projeto*, *Instrumento/versão*, *Participante/visita*, *Avaliação* ou *Tentativa*;
- **Agrupar por:** *Projeto*, *Data* (por Dia, Semana ISO ou Mês), *Visita*, *Avaliador*, *Instrumento/versão*, *Condição*, *Go/No-Go* ou *Resposta*;
- **Indicador descritivo:** contagem de avaliações, contagem de tentativas selecionadas ou qualquer uma das 12 métricas oficiais agregada por média entre avaliações válidas.
- Cada grupo mostra **Valores disponíveis / ausentes** separadamente e nunca mistura versões, protocolos ou plataformas incompatíveis. A seleção de grupo e o *drill-down* no gráfico de dispersão vinculam-se diretamente à chave/avaliação original.
- Visualizações estratificadas (por visita, condições Go/No-Go, distribuição/quartis e volume operacional) são carregadas sob demanda respeitando sempre a separação de proveniência (`test_code`, `test_version`, `protocol_id`, `platform`).

#### 6.5 Análise Longitudinal, Avaliações e Painel Lateral de Detalhe
- **Análise longitudinal:** permite selecionar um participante do recorte para acompanhar a sequência temporal de visitas e avaliações, sinalizando explicitamente quando há mudança de proveniência (instrumento, versão, protocolo ou plataforma) ao longo do histórico.
- **Avaliações e tentativas:** tabela dedicada com busca rápida local (código, visita ou instrumento), paginação (`10`, `25`, `50` ou `100` linhas por página), densidade compacta, seleção de colunas visíveis, ordenação por clique no cabeçalho e checkboxes para restringir o rascunho a avaliações específicas.
- Clicar em **Ver** (na tabela ou a partir de um ponto de dispersão) abre o **painel lateral (drawer) de Detalhe da avaliação** com todos os metadados (incluindo `Início`, `Conclusão`, `Protocolo`, `Aplicativo` e `Período de quadro observado`), contagens das respostas, as 12 métricas calculadas, a sequência de tentativas linha a linha e o botão **Exportar CSV oficial** (21 colunas canônicas).

#### 6.6 Exportações (`Exportações` e botão rápido)
- **Exportar visão filtrada** *(na Visão geral)*: exporta uma linha por avaliação para Stroop Go/No-Go quando não há filtros avançados incompatíveis.
- **Central de exportações (`Exportações`)**:
  1. Escolha entre **5 granularidades:**
     - **Pacientes** (`patient_id`, `participant_code`, `participant_name`, `initials`, `active`, `created_at`);
     - **Avaliações** (metadados completos, `started_at`, `completed_at`, plataforma, instrumento);
     - **Tentativas** (1 linha por tentativa com palavra, cor, condição, tecla e `reaction_time_seconds`);
     - **Métricas** (1 linha por métrica oficial de cada avaliação com código, rótulo, valor e unidade);
     - **Stroop 21 colunas** (formato completo compatível com o contrato clássico do PsychoPy).
  2. **Modo de identificação:** por padrão opera em modo **Desidentificado** (expõe apenas códigos `PAT-...` e `EVA-...`, mantendo nome mascarado como `NAO_COLETADO` e iniciais ocultas). O modo *Nominal* aguarda habilitação institucional explícita.
  3. Selecione as colunas desejadas (em *Stroop 21 colunas* o esquema é fixo).
  4. Clique em **Pré-visualizar contagem e amostra**: o servidor valida o recorte atual (`status = valid`), mostra o total exato de linhas e uma prévia na tela, e gera um token temporário vinculado ao recorte.
  5. Só então o botão **Baixar arquivo CSV** é liberado.

---

## Parte 2 — Como São Calculadas as Métricas (Explicação Didática)

Todas as métricas oficiais são calculadas de forma determinística pelo núcleo Python oficial ([`stroop/domain/stroop.py`](../../stroop/domain/stroop.py)) e espelhadas no resumo da execução ([`web/src/experiment/summary.ts`](../../web/src/experiment/summary.ts)) sobre o **bloco principal (`main`)**. As 4 tentativas de prática (`practice`) **nunca** entram na conta.

### 1. A Estrutura de Cada Tentativa no Bloco Principal

O bloco principal tem exatamente **16 tentativas** sorteadas em ordem aleatória (`8` congruentes e `8` incongruentes), totalizando **60 segundos nominais** (`16 × 3,75 s`):

```
0 ms              300 ms                                  2.800 ms               3.750 ms
|---- Fixação ----|----------- Janela do Estímulo -----------|---- Intervalo -----|
        (+)                Palavra colorida na tela               Tela em branco
   [não aceita       [aceita apenas o 1º toque de Espaço]        [sem estímulo]
    resposta]         RT (ms) = instante_tecla - 300 ms
```

Regras da captura de resposta em cada tentativa:
- **Fixação (`0` a `300 ms`):** ponto de fixação antes do estímulo; pressionar tecla nesse intervalo não conta como resposta.
- **Janela do estímulo (`300` a `2.800 ms`, duração de `2.500 ms`):** a palavra aparece na cor sorteada. Só o **primeiro pressionamento** da barra de **`Espaço`** (sem repetição automática de tecla segurada) é registrado. Pressionar `Espaço` **não encerra** a tentativa mais cedo — o tempo continua fixo até completar `3.750 ms`.
- **Intervalo em branco (`2.800` a `3.750 ms`, duração de `950 ms`):** descanso visual antes da próxima fixação.
- **Tempo de reação individual (`RT`):** medido em milissegundos entre o aparecimento efetivo do estímulo (`stimulus_onset_ms`) e o instante da tecla (`key_at_ms`):
  $$\text{RT (ms)} = \text{key\_at\_ms} - \text{stimulus\_onset\_ms}$$
  No cálculo oficial e no CSV canônico, o valor é armazenado em **segundos**:
  $$\text{RT (s)} = \frac{\text{RT (ms)}}{1000}$$

---

### 2. Classificação de Cada Tentativa (Os 4 Desfechos)

Em cada uma das 16 tentativas, o sistema cruza a **condição da palavra** com a **ação do participante**:

| Condição do estímulo (`condition`) | Regra para o participante | Ação observada (`key_pressed`) | Classificação (`error_type`) | Correta (`correct`) | Entra no RT oficial? |
|---|---|---|---|---|---|
| **Congruente — Go** *(palavra = cor das letras, ex.: `AZUL` em azul)* | **Deve apertar `Espaço`** | Apertou `Espaço` | **`hit`** *(Acerto Go)* | `1` (Sim) | **Sim** |
| **Congruente — Go** | **Deve apertar `Espaço`** | Não apertou nada | **`omission`** *(Erro de omissão)* | `0` (Não) | Não (vazio) |
| **Incongruente — No-Go** *(palavra ≠ cor das letras, ex.: `AZUL` em vermelho)* | **Deve aguardar sem apertar** | Não apertou nada | **`correct_rejection`** *(Rejeição correta)* | `1` (Sim) | Não (vazio) |
| **Incongruente — No-Go** | **Deve aguardar sem apertar** | Apertou `Espaço` | **`commission`** *(Erro de comissão)* | `0` (Não) | **Não** (tecla indevida) |

> **Detalhe fundamental:** mesmo que a tentativa tenha registrado o momento em que a pessoa apertou `Espaço` por impulso em um estímulo No-Go (**erro de comissão**), esse tempo **nunca** é usado no cálculo da métrica oficial de tempo de reação (`response_time`). O RT oficial mede exclusivamente a velocidade nos **acertos Go (`hits`)**.

---

### 3. As 12 Métricas Oficiais de Uma Avaliação

A partir da contagem das 16 tentativas principais, o servidor calcula e grava exatamente **12 métricas** na tabela `assessment_metrics`:

| # | Código da métrica | Nome exibido | Unidade | Fórmula exata | O que mede na prática |
|---|---|---|---|---|---|
| 1 | `total_trials` | Total de tentativas | `count` | $\text{hits} + \text{omission\_errors} + \text{correct\_rejections} + \text{commission\_errors}$ | Quantas tentativas válidas compõem o bloco principal (16 no protocolo WEB). |
| 2 | `total_go_trials` | Total de tentativas Go | `count` | $\text{hits} + \text{omission\_errors}$ | Quantos estímulos eram congruentes / pediam resposta (8 no protocolo WEB). |
| 3 | `total_no_go_trials` | Total de tentativas No-Go | `count` | $\text{correct\_rejections} + \text{commission\_errors}$ | Quantos estímulos eram incongruentes / exigiam inibição (8 no protocolo WEB). |
| 4 | `hits` | Acertos Go | `count` | Quantidade de tentativas `error_type = 'hit'` | Quantas vezes o participante apertou `Espaço` corretamente nos estímulos Go. |
| 5 | `correct_rejections` | Rejeições corretas | `count` | Quantidade de tentativas `error_type = 'correct_rejection'` | Quantas vezes o participante conseguiu segurar a resposta nos estímulos No-Go. |
| 6 | `omission_errors` | Erros de omissão | `count` | Quantidade de tentativas `error_type = 'omission'` | Quantas vezes deixou passar um estímulo Go sem apertar `Espaço`. |
| 7 | `commission_errors` | Erros de comissão | `count` | Quantidade de tentativas `error_type = 'commission'` | Quantas vezes apertou `Espaço` por impulso quando não devia (estímulo No-Go). |
| 8 | `accuracy` | Precisão total | `%` | $\dfrac{\text{hits} + \text{correct\_rejections}}{\text{total\_trials}} \times 100$ | Porcentagem de acertos considerando todas as 16 tentativas juntas. |
| 9 | `accuracy_go_trials` | Precisão em Go | `%` | $\dfrac{\text{hits}}{\text{total\_go\_trials}} \times 100$ | Porcentagem de acerto apenas nos estímulos em que era preciso agir. |
| 10 | `accuracy_no_go_trials` | Precisão em No-Go | `%` | $\dfrac{\text{correct\_rejections}}{\text{total\_no\_go\_trials}} \times 100$ | Porcentagem de acerto apenas nos estímulos que exigiam controle inibitório. |
| 11 | `omission_errors_percentage` | Percentual de omissões | `%` | $\dfrac{\text{omission\_errors}}{\text{total\_go\_trials}} \times 100$ | Proporção de falhas por não resposta dentro das tentativas Go *(sempre igual a $100\% - \text{accuracy\_go\_trials}$)*. |
| 12 | `response_time` *(ou `response_time_seconds` no resumo/CSV agregado)* | Tempo de resposta | `seconds` | **Mediana** dos valores de `reaction_time` (em segundos) apenas das tentativas **`hit`** | Tempo típico de resposta correta em estímulos Go. |

---

### 4. Exemplo Numérico Completo Passo a Passo

Imagine um participante que completou as **16 tentativas** do bloco principal com os seguintes resultados:

- Nos **8 estímulos Go (Congruentes)**:
  - Apertou `Espaço` corretamente **6 vezes (`hits = 6`)**, com tempos de reação em segundos: `0,420 s`, `0,510 s`, `0,480 s`, `0,600 s`, `0,450 s`, `0,530 s`.
  - Não apertou a tempo **2 vezes (`omission_errors = 2`)**.
- Nos **8 estímulos No-Go (Incongruentes)**:
  - Segurou a resposta corretamente **7 vezes (`correct_rejections = 7`)**.
  - Apertou `Espaço` por engano **1 vez (`commission_errors = 1`)**, aos `0,390 s` *(esse valor fica guardado na linha da tentativa, mas **não entra** no cálculo do RT oficial)*.

#### Passo 1 — Contagens base
- `total_trials` = $6 + 2 + 7 + 1 = \mathbf{16}$
- `total_go_trials` = $6 + 2 = \mathbf{8}$
- `total_no_go_trials` = $7 + 1 = \mathbf{8}$

#### Passo 2 — Precisões e percentuais
- `accuracy` (Precisão geral) = $\dfrac{6 + 7}{16} \times 100 = \dfrac{13}{16} \times 100 = \mathbf{81{,}25\%}$ *(exibida no painel com 1 casa decimal: `81,2%` pelo arredondamento half-even — veja seção 5)*.
- `accuracy_go_trials` (Precisão Go) = $\dfrac{6}{8} \times 100 = \mathbf{75{,}0\%}$
- `omission_errors_percentage` (% Omissões) = $\dfrac{2}{8} \times 100 = \mathbf{25{,}0\%}$
- `accuracy_no_go_trials` (Precisão No-Go) = $\dfrac{7}{8} \times 100 = \mathbf{87{,}5\%}$

#### Passo 3 — Tempo de reação oficial (`response_time`)
Pegamos **apenas os 6 RTs dos `hits`** e ordenamos do menor para o maior:
$$0{,}420 \quad;\quad 0{,}450 \quad;\quad \mathbf{0{,}480} \quad;\quad \mathbf{0{,}510} \quad;\quad 0{,}530 \quad;\quad 0{,}600$$

Como há **6 valores** (quantidade par), a **mediana** é a média aritmética dos dois valores centrais (3º e 4º):
$$\text{response\_time} = \frac{0{,}480 + 0{,}510}{2} = \mathbf{0{,}495\text{ s}}$$

*(Se houvesse uma quantidade ímpar de `hits`, ex.: 5 valores, a mediana seria diretamente o 3º valor ordenado.)*

---

### 5. Por que Mediana, Como Funciona o Valor Nulo (`—`) e Arredondamento

1. **Por que usar a Mediana em vez da Média no Tempo de Reação?**
   Em tarefas cognitivas, basta uma única distração momentânea (ex.: `2,100 s` em uma tentativa) para distorcer bastante a média aritmética. A **mediana** (valor central) é muito mais resistente a valores extremos ocasionais e representa melhor a velocidade típica daquele participante naquela sessão.

2. **Tratamento de Ausência (`null` / `—`) quando `hits = 0`:**
   - Se o participante errar ou omitir **todas** as tentativas Go (`hits = 0`), **não existe nenhuma resposta correta para medir tempo**.
   - Na API, nos gráficos e nas tabelas do painel WEB, o campo `response_time_seconds` recebe explicitamente **`null` (exibido como `—`)** e essa avaliação é **excluída** do cálculo de medianas e da distribuição de tempos do grupo. O sistema **nunca** transforma falta de resposta em `0,000 s`, porque `0` significaria tempo instantâneo falso.
   - *(Observação técnica de compatibilidade: no script histórico `stroop/domain/stroop.py` que popula `assessment_metrics` herdado do PsychoPy/CSV, `response_time` grava `0.0` numericamente quando não há hits; por isso, a camada de consulta e painel WEB verifica `hits` / `total_go_trials` e converte casos sem hits em `None`/`—` antes de exibir ou agregar.)*

3. **Arredondamento oficial (*Half-Even* / Arredondamento Bancário):**
   Para garantir que os números exibidos no navegador coincidam bit a bit com o formato Python oficial (`formatHalfEven` em [`web/src/experiment/summary.ts`](../../web/src/experiment/summary.ts)), valores que terminam exatamente na metade (`.x5`) arredondam para o **dígito par mais próximo**. No exemplo acima, `81,25%` exibido com 1 casa decimal vira **`81,2%`** (pois `2` é par); já `81,35%` viraria `81,4%` (pois `4` é par).

---

### 6. Como o Painel Calcula Indicadores de Grupo (Múltiplas Avaliações)

Quando você filtra um conjunto de avaliações válidas na **Visão geral** ou na **Exploração**, o sistema agrega os valores assim:

| Indicador no painel | Onde aparece | Como é calculado sobre as $N$ avaliações filtradas |
|---|---|---|
| **Avaliações** | Card da Visão geral | Contagem total $N$ de avaliações oficiais válidas no recorte. |
| **Participantes únicos** | Card da Visão geral | Contagem de pares distintos `(projeto, participant_id)` presentes nas $N$ avaliações. |
| **Precisão média** | Card da Visão geral e tabelas por Visita/Avaliador | Média simples das precisões totais (`accuracy`) de cada avaliação com valor válido: $\dfrac{1}{N}\sum_{i=1}^{N} \text{accuracy}_i$. |
| **Precisão mediana** | Card da Visão geral | Mediana da lista `[accuracy_1, accuracy_2, ..., accuracy_N]`. |
| **Mediana dos tempos por avaliação** | Card da Visão geral e tabela por Visita | Primeiro cada avaliação tem sua mediana individual $RT_i$ (ignorando as que têm `—`); depois tira-se a **mediana das medianas** $[RT_1, RT_2, \dots, RT_k]$. |
| **Omissões / Comissões** | Cards e gráficos por Projeto/Visita/Avaliador | Soma direta das contagens de todas as avaliações do grupo. |
| **Precisão média por condição (Go / No-Go)** | Aba *Condições (Go / No-Go)* | $\dfrac{\sum \text{hits}}{\sum \text{total\_go\_trials}} \times 100$ e $\dfrac{\sum \text{correct\_rejections}}{\sum \text{total\_no\_go\_trials}} \times 100$ sobre o total agregado de tentativas no recorte. |
| **Exploração do conjunto completo** | Tabela *Explorar o conjunto completo* (servidor) | Calcula a **média aritmética por avaliação** do indicador escolhido, separando automaticamente grupos com `test_code`, `test_version`, `protocol_id` ou `platform` diferentes para não misturar metodologias incompatíveis. |

> **Regra de integridade ao filtrar por tentativa:** se você filtrar *Condição = Congruente* ou *Resposta = Acerto* na barra de filtros, a consulta restringe **quais avaliações** entram e **quais tentativas** aparecem nas contagens de tentativas e exportação de *Tentativas*; porém, as **12 métricas oficiais** de cada avaliação continuam sendo sempre as da **avaliação inteira (16 tentativas)** — o sistema não inventa uma "precisão parcial" misturada com a métrica oficial.

---

## Referências Diretas no Repositório

- Cálculo oficial Python (12 métricas): [`stroop/domain/stroop.py`](../../stroop/domain/stroop.py)
- Agregação descritiva estratificada no servidor: [`stroop/domain/web_analytics.py`](../../stroop/domain/web_analytics.py)
- Resumo e arredondamento *half-even* no navegador: [`web/src/experiment/summary.ts`](../../web/src/experiment/summary.ts)
- Dicionário e agregação de painel: [`web/src/dashboard/analysis.ts`](../../web/src/dashboard/analysis.ts)
- Parâmetros temporais oficiais da tarefa WEB: [`condicoes/web_protocol.json`](../../condicoes/web_protocol.json)
