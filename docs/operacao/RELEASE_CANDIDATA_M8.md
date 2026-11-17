# Manifesto de Release Candidata WEB — Marco M8

Registro técnico local da candidata integrada de M8, produzida na branch
`feat/m8-fechamento-integrado` antes da homologação final de candidato (`M9`) e
da decisão de publicação (`M10`). Estado formal, aceites e pendências
permanecem exclusivamente no [backlog canônico](../Projeto%20Stroop%20Test.md).

## Identificação da candidata local avaliada

| Item | Valor observado |
|---|---|
| Schema relacional | Migrations `0001` a `0015` (`0015_direct_evaluation_operations.sql`, incluindo tabela `web_direct_evaluation_operations` e função `SECURITY DEFINER` `public.web_relink_identity`) |
| Papel mínimo de escrita (`writer`) | Grants explícitos sobre tabelas operacionais; sem `UPDATE` direto em `assessments` ou `web_assessments`; `EXECUTE` restrito em `web_lock_emitter`, `web_manage_user` e `web_relink_identity` |
| Imagem API candidata local | `stroop-web-api:m8-rc` (`sha256:0bd129d59afb54aa97b8d81dcc163911629f0a031c9547feb52f7142b5ecaecf`) |
| Imagem Proxy candidata local | `stroop-web-proxy:m8-rc` (`sha256:5cfa526916e60fb29c98120c6e29726eac0eb5f5bda3e5e7d61bcb46bdf9bc4c`) |
| Ambiente local medido | `Linux-7.0.0-43-generic-x86_64`, Python `3.12.3`, Node `24.15.0`, PostgreSQL `17.6`, `12` CPUs lógicas |

## Síntese operacional e de recuperação (WEB-032)

Ensaios realizados exclusivamente contra infraestrutura Docker/Compose e dados
sintéticos descartáveis em loopback, sem acesso a VPS, DNS público, `.env`
operacional ou coletas reais:

- `scripts/smoke_web_compose.py`: aprovado (`0` falhas) com aplicação das 15
  migrations, provisionamento de papéis dedicados, isolamento HTTPS/Nginx e
  persistência após reinício do PostgreSQL.
- `scripts/smoke_web_recovery.py`: aprovado (`restoration_seconds=7.768`,
  `restored_migrations=15`, `registry_links_metrics_audit_snapshot_verified=true`,
  `failed_candidate_rollback=true`, `counts_preserved=true`).
- `scripts/smoke_web_replication.py`: aprovado (`real_ssh_copy=true`,
  `copy_seconds=1.329`, `restore_seconds=6.888`, comando forçado/hostkey
  adulterada bloqueados, alerta/agenda `systemd` validados; `external_rpo_not_measured=true`).
- `scripts/smoke_local_auth_restore.py`: aprovado (`old_token_rejected=true`,
  `old_passwords_rejected=true`, `new_login_status=200`, `credential_version=3`,
  16 tentativas, 12 métricas e 16 observações preservadas).
- `scripts/benchmark_web.py` (1/4/8/16 clientes a 1 GET/s × 30s com limites
  padrão Nginx `10 req/s burst 20`, Postgres `1 CPU/768 MiB`, API `1 CPU/384 MiB`,
  proxy `0.5 CPU/128 MiB`): `highest_tested_clients_all_successful=8` (`1` cliente
  `p95=170.59 ms`, `4` clientes `p95=161.59 ms`, `8` clientes `240/240` `200 OK`
  `p95=911.73 ms`, `16` clientes `242/480` `p95=2734.23 ms`, zero `5xx` ou `200`
  inválido, `session_canaries_absent_from_logs=true`, `all_containers_restart=true`).

## Runbooks revisados e limites mantidos

- [Guia do usuário](GUIA_DO_USUARIO.md): alinhado aos três eixos CHG-007
  (`Análise`, `Nova Avaliação`, `Gestão`), login local `/equipe`, QR em RAM,
  handoff presencial atômico e retirada do upload CSV no produto.
- [Operação e recuperação WEB](WEB_RECUPERACAO.md): inclui a função
  `public.web_relink_identity` da migration `0015` na lista de revogação de
  `PUBLIC` após restauração isolada.
- [Implantação WEB na VPS](DEPLOY_WEB_VPS.md) e [homologação](HOMOLOGACAO_WEB.md):
  mantêm `workflow_dispatch` manual e limites declarados de medição local.
- Pendências externas explícitas fora do escopo local de M8: `DEC-03`/`WEB-033`,
  aprovação metodológica e temporal física `WEB-034`, aceite técnico M9
  `WEB-036`, `DEC-05`/`WEB-041` e publicação/handoff `WEB-037..040`.
