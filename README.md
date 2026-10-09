# Sistema de Inventario de Ativos de TI

Aplicacao corporativa para cadastro de funcionarios, ativos, chamados, movimentacoes, desligamentos e aprovacoes. O backend usa Express 5 e SQLite; o frontend e React, Vite, TypeScript, Tailwind e React Query.

## Instalacao local

Requer Node.js 22 LTS e npm. Instale as dependencias, copie as variaveis de exemplo e inicie:

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

Abra `http://localhost:3000`. O primeiro administrador e criado somente no servidor. Nome e e-mail podem ser passados na linha de comando:

```powershell
npm run create-admin
# ou: npm run create-admin -- "Nome da pessoa" admin@empresa.com
```

O comando pede a senha provisoria de forma oculta e pede confirmacao; ela nunca e aceita como argumento. Em automacoes sem terminal, defina `ADMIN_NAME`, `ADMIN_EMAIL` e exatamente uma fonte de senha: `ADMIN_PASSWORD` ou `ADMIN_PASSWORD_FILE`, cujo conteudo e lido localmente. O administrador deve registrar o TOTP no primeiro login. Para desenvolvimento do frontend separado:

```powershell
npm run web:dev
```

## Variaveis de ambiente

| Variavel                      | Uso                                             | Padrao                  |
| ----------------------------- | ----------------------------------------------- | ----------------------- |
| `PORT`                        | Porta HTTP da aplicacao                         | `3000`                  |
| `NODE_ENV`                    | `development`, `test` ou `production`           | `development`           |
| `APP_ORIGIN`                  | Origem HTTPS publica aceita para cookies e CORS | obrigatoria em producao |
| `TOTP_ENCRYPTION_KEY`          | Chave AES-256-GCM em base64 para segredos TOTP  | obrigatoria             |
| `EMPLOYEE_ANONYMIZATION_DAYS` | Dias ate anonimizar funcionarios desligados     | `1825`                  |
| `DATABASE_PATH`               | Caminho do SQLite para o backup                 | `data/inventory.db`     |
| `BACKUP_DIR`                  | Diretorio local dos backups                     | `data/backups`          |
| `BACKUP_EXTERNAL_DIR`         | Montagem externa para segunda copia             | opcional                |
| `BACKUP_RETENTION_DAYS`       | Retencao dos backups em dias                    | `30`                    |
| `BACKUP_INTERVAL_SECONDS`     | Intervalo do servico Docker de backup           | `86400`                 |
| `ADMIN_PASSWORD`              | Senha provisoria apenas para automacao          | sem padrao              |
| `ADMIN_PASSWORD_FILE`         | Arquivo local com senha para automacao          | sem padrao              |

`APP_ORIGIN` deve ser a URL final, por exemplo `https://inventario.empresa.com`. Nunca versione `.env`, certificados ou `data/`.

`ADMIN_PASSWORD` e `ADMIN_PASSWORD_FILE` sao usados somente por `create-admin` e `reset-admin`; eles nao devem permanecer em `.env`. Prefira um segredo temporario injetado pelo ambiente ou um arquivo de secret com permissao restrita.

`TOTP_ENCRYPTION_KEY` deve conter 32 bytes aleatorios codificados em base64. Guarde-a em um cofre de segredos ou Docker secret separado dos backups; nunca no banco, no repositório ou na mesma montagem externa de backup. A aplicacao nao inicia sem a chave. Para rotaciona-la, execute uma migracao controlada que decifre cada segredo com a chave antiga e o cifre com a nova, altere a chave no cofre e reinicie todos os processos. Se a chave for perdida, use `npm run reset-admin` para reiniciar o 2FA do administrador e recadastre os demais usuarios.

## Arquitetura

```
src/
  config/              configuracao validada
  db/                  conexao e migrations versionadas
  modules/<modulo>/    routes, controller, service, repository e schema
  shared/              erros, middlewares e utilitarios
  app.js               factory Express injetavel
  server.js            processo HTTP de producao
frontend/              React + Vite + TypeScript
tests/unit/            dominio, permissoes e services
tests/integration/     API Express + SQLite em memoria
e2e/                   fluxo completo com Playwright
```

As rotas validam Zod e delegam aos services. Services concentram transacoes e regras; repositories sao a unica camada com SQL. Migrations em `src/db/migrations` sao registradas em `schema_migrations` e aplicadas sem apagar dados existentes.

## Perfis e permissoes

As permissoes usam `recurso:acao`. O perfil fornece a base e o admin pode conceder ou negar permissoes individuais; `deny` sempre vence. Alcances opcionais por cidade, departamento e tipo de equipamento sao aplicados nos services e repositories.

| Perfil       | Acesso padrao                                                                 |
| ------------ | ----------------------------------------------------------------------------- |
| `ADMIN`      | Tudo, incluindo auditoria, usuarios e aprovacoes. Ha apenas um administrador. |
| `TECNICO`    | Le, cadastra e edita ativos; recebe e avalia equipamentos; cria solicitacoes. |
| `RH`         | Gerencia funcionarios, inicia e conclui desligamentos; cria solicitacoes.     |
| `FINANCEIRO` | Le ativos com valores e relatorios financeiros; nao altera ativos.            |
| `CONSULTA`   | Somente leitura com mascaramento de dados pessoais.                           |

Todos entram por e-mail e senha. O admin cadastra usuarios com senha provisoria; eles precisam troca-la no primeiro acesso. Sessao usa cookie `httpOnly`, `SameSite=Strict`, `Secure` em producao, expiracao e bloqueio temporario apos tentativas falhas. O header `x-technician-id` nao e aceito.

## Fluxo de aprovacoes

1. Um usuario com `request:create` abre uma solicitacao com justificativa e ativos.
2. O ativo fica reservado enquanto a solicitacao estiver `PENDENTE`.
3. Somente `request:approve` aprova ou rejeita. O administrador pode autoaprovar, e isso e auditado.
4. A aprovacao revalida o estado e executa a movimentacao na mesma transacao.
5. Troca movimenta o ativo antigo para avaliacao e atribui o novo; backup em uso exige aprovacao; desativacao exige laudo e e irreversivel.
6. Eventos de criacao, decisao, execucao, cancelamento e expiracao sao imutaveis.

## Fluxo de desligamento

1. RH/admin com `employee:offboard` inicia com data e motivo. O funcionario vira `em_desligamento` e os ativos vao para `PENDENTE_DEVOLUCAO` na mesma transacao.
2. Tecnico com `asset:receive` recebe cada item, registrando estado fisico e acessorios; ele vai para `EM_AVALIACAO`.
3. Tecnico define `BACKUP`, `EM_MANUTENCAO` ou propoe `DESATIVADO`. A ultima opcao abre aprovacao com laudo obrigatorio.
4. RH/admin conclui somente sem ativos pendentes, sem desativacao aberta e depois de fechar ou reatribuir chamados abertos.

`employee_events`, `movements` e auditoria preservam o historico. Movimentacoes sao imutaveis no banco.

## Qualidade e testes

```powershell
npm run lint
npm run format:check
npm run test:unit
npm run test:integration
npm run test:e2e
npm run coverage
npm run web:typecheck
npm run web:build
```

O minimo verificado e 80% de statements, linhas e funcoes de dominio/services; branches exigem 70%. A suite de integracao injeta SQLite em memoria em `createApp(db)`, sem copiar o projeto ou iniciar processo manual. O E2E Playwright executa o desligamento completo por HTTP com banco isolado.

O workflow `.github/workflows/ci.yml` roda lint, formatacao, tipos, testes, cobertura, E2E e build no Node 22 em cada push e pull request.

## Docker, Nginx e HTTPS

1. Copie os certificados de uma autoridade valida para `deploy/certs/fullchain.pem` e `deploy/certs/privkey.pem`.
2. Defina `APP_ORIGIN=https://seu-dominio` no ambiente de deploy.
3. Inicie:

```bash
docker compose up -d --build
```

O `Dockerfile` e multi-stage. `app` usa o volume nomeado `inventory-data` em `/app/data`; Nginx termina TLS em 443 e redireciona 80 para HTTPS. O compose nao deve ser iniciado antes dos certificados existirem, pois Nginx precisa deles para iniciar com HTTPS.

## Backup e restauracao

O backup usa `better-sqlite3.backup`, inclui o WAL, executa `integrity_check` e `foreign_key_check`, aplica retencao e, quando `BACKUP_EXTERNAL_DIR` foi definido, grava e valida uma segunda copia fora do volume do banco.

```powershell
npm run backup
npm run backup:verify-restore
```

No Docker, o servico `backup` executa no intervalo configurado e monta `BACKUP_EXTERNAL_HOST_DIR` como segunda copia. Use uma montagem de NAS, disco criptografado ou agente de backup do provedor; uma pasta no mesmo disco nao protege contra falha desse disco.

Teste de restauracao recomendado, ao menos mensalmente:

1. Execute `npm run backup:verify-restore` para testar uma restauracao temporaria e a integridade.
2. Pare a aplicacao antes de recuperar dados: `docker compose stop app`.
3. Preserve o arquivo atual: renomeie `inventory.db` para `inventory.db.before-restore`.
4. Copie o backup escolhido para `inventory.db` no volume `data/`.
5. Rode `npm run backup:verify-restore <caminho-do-backup>` e inicie `docker compose start app`.
6. Valide login, contagem de ativos e os ultimos movimentos antes de liberar usuarios.

## Recuperacao do administrador

O administrador unico nao pode ser desativado, excluido ou ter o perfil mudado pela API. Com acesso ao servidor, use:

```powershell
npm run reset-admin
# ou: npm run reset-admin -- admin@empresa.com
```

O comando pede uma nova senha provisoria oculta com confirmacao. Em automacao, use `ADMIN_PASSWORD` ou `ADMIN_PASSWORD_FILE`; a senha nunca pode ser passada por argumento. Ele encerra as sessoes ativas, reinicia o 2FA, exige a troca de senha e novo cadastro do TOTP no proximo acesso. Registre o procedimento no controle interno de incidentes; nao compartilhe senhas ou segredos TOTP.

## Operacao e privacidade

Para anonimizar desligados depois do prazo configurado:

```powershell
npm run privacy:anonymize
```

Antes de atualizacoes, execute backup e valide a restauracao. Para mais detalhes de controles, matriz rota-permissao e checklist de seguranca, veja [docs/security-review.md](docs/security-review.md).
