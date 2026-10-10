# Sistema de Inventario de Ativos de TI

Aplicacao corporativa para cadastro de funcionarios, ativos, chamados, movimentacoes, desligamentos e aprovacoes. O backend usa Express 5 e SQLite; o frontend e React, Vite, TypeScript, Tailwind e React Query.

## Instalacao local

Requer Node.js 22 LTS e npm. Instale as dependencias, copie as variaveis de exemplo, preencha a chave do 2FA, crie o administrador e inicie:

```powershell
npm ci
Copy-Item .env.example .env
# Gere a chave e cole o resultado em TOTP_ENCRYPTION_KEY= no .env:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npm run create-admin -- "Nome da pessoa" admin@empresa.com
npm start
```

Abra `http://localhost:3000`. Sem `TOTP_ENCRYPTION_KEY` (ou `TOTP_ENCRYPTION_KEY_FILE`) a aplicacao recusa iniciar com uma mensagem explicita. O primeiro administrador e criado somente no servidor; nome e e-mail podem vir da linha de comando ou de `ADMIN_NAME` e `ADMIN_EMAIL`.

A aplicacao e os scripts `create-admin`, `reset-admin`, `backup` e `backup:verify-restore` leem o `.env` da raiz do projeto. Variaveis ja definidas no ambiente tem precedencia sobre o arquivo.

O comando pede a senha provisoria de forma oculta e pede confirmacao; ela nunca e aceita como argumento. Em automacoes sem terminal, defina `ADMIN_NAME`, `ADMIN_EMAIL` e exatamente uma fonte de senha: `ADMIN_PASSWORD` ou `ADMIN_PASSWORD_FILE`, cujo conteudo e lido localmente. O administrador deve registrar o TOTP no primeiro login. Para desenvolvimento do frontend separado:

```powershell
npm run web:dev
```

## Variaveis de ambiente

Todas estao comentadas no `.env.example`.

| Variavel                          | Uso                                                               | Padrao                     |
| --------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| `PORT`                            | Porta HTTP da aplicacao                                           | `3000`                     |
| `NODE_ENV`                        | `development`, `test` ou `production`                             | `development`              |
| `APP_ORIGIN`                      | Origem HTTPS publica aceita para cookies e CORS                   | obrigatoria em producao    |
| `TOTP_ENCRYPTION_KEY`             | Chave AES-256-GCM (32 bytes em base64) para segredos TOTP         | obrigatoria, ou a de baixo |
| `TOTP_ENCRYPTION_KEY_FILE`        | Arquivo com a chave acima (secret do Docker); nunca junto com ela | sem padrao                 |
| `TOTP_ENCRYPTION_KEY_SECRET_FILE` | Docker Compose: arquivo do host montado como secret no `app`      | `./secrets/totp_key.txt`   |
| `EMPLOYEE_ANONYMIZATION_DAYS`     | Dias ate anonimizar funcionarios desligados                       | `1825`                     |
| `DATABASE_PATH`                   | Caminho do SQLite usado pela aplicacao, scripts e backup          | `data/inventory.db`        |
| `BACKUP_DIR`                      | Diretorio local dos backups                                       | `data/backups`             |
| `BACKUP_RETENTION_DAYS`           | Retencao dos backups em dias                                      | `30`                       |
| `BACKUP_INTERVAL_SECONDS`         | Intervalo do servico Docker de backup (minimo 60)                 | `86400`                    |
| `BACKUP_EXTERNAL_DIR`             | Destino da segunda copia, cifrada com age; exige `AGE_RECIPIENT`  | opcional                   |
| `BACKUP_EXTERNAL_HOST_DIR`        | Docker Compose: pasta do host montada como `BACKUP_EXTERNAL_DIR`  | `./external-backups`       |
| `AGE_RECIPIENT`                   | Chave publica age (`age1...`) que cifra a copia externa           | obrigatoria com externa    |
| `BACKUP_MONITOR_URL`              | URL chamada (GET) apos backup sem falhas                          | opcional                   |
| `ADMIN_NAME`, `ADMIN_EMAIL`       | Identidade do admin para `create-admin` e `reset-admin`           | sem padrao                 |
| `ADMIN_PASSWORD`                  | Senha provisoria apenas para automacao                            | sem padrao                 |
| `ADMIN_PASSWORD_FILE`             | Arquivo local com senha para automacao                            | sem padrao                 |

`APP_ORIGIN` deve ser a URL final, por exemplo `https://inventario.empresa.com`. Nunca versione `.env`, certificados ou `data/`.

`ADMIN_PASSWORD` e `ADMIN_PASSWORD_FILE` sao usados somente por `create-admin` e `reset-admin`; eles nao devem permanecer em `.env`. Prefira um segredo temporario injetado pelo ambiente ou um arquivo de secret com permissao restrita.

`TOTP_ENCRYPTION_KEY` deve conter 32 bytes aleatorios codificados em base64. Gere-a com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Defina a chave por `TOTP_ENCRYPTION_KEY` ou por `TOTP_ENCRYPTION_KEY_FILE`, nunca pelas duas: com as duas definidas a aplicacao recusa iniciar. No Docker Compose, salve o resultado em `./secrets/totp_key.txt` ou defina `TOTP_ENCRYPTION_KEY_SECRET_FILE` para um arquivo protegido fora do repositório; o Compose o monta somente em `/run/secrets/totp_encryption_key` no serviço `app`. Guarde-a em um cofre de segredos separado dos backups; nunca no banco, no repositório ou na mesma montagem externa de backup. Para rotaciona-la, decifre os segredos com a chave antiga e cifre-os com a nova em uma manutenção controlada, substitua o arquivo do secret e reinicie todos os processos. Se a chave for perdida, use `npm run reset-admin` para reiniciar o 2FA do administrador e recadastre os demais usuarios.

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

As permissoes usam `recurso:acao`. O perfil fornece a base e o admin pode conceder ou negar permissoes individuais do catalogo (`src/modules/auth/permissions.js`); `deny` sempre vence. `user:manage` e `request:approve` sao exclusivas do ADMIN e nunca sao concedidas por permissao individual; coringas e nomes desconhecidos sao recusados, e ninguem concede uma permissao que nao possui. Nenhuma acao sobre a conta do admin (senha, dados, perfil, permissoes, alcance, 2FA ou sessoes) e aceita de outro usuario, e e impossivel negar permissoes ou restringir o alcance do admin. Alcances opcionais por cidade, departamento e tipo de equipamento sao aplicados no SQL dos repositories por uma unica definicao (`src/db/scope.js`): ativo pela cidade e tipo do proprio ativo e pelo departamento de quem esta com ele; funcionario por cidade e departamento; chamado pela cidade e departamento de quem abriu e pelo tipo do equipamento (chamado sem equipamento fica fora de um alcance por tipo). O dashboard e o relatorio mostram contagens dentro do alcance; nomes de funcionarios aparecem so com `employee:read` (e se a pessoa estiver no alcance), valores so com `asset:view_value` e listas de chamados so com `ticket:read`. `audit:read` tambem e exclusiva do ADMIN, porque a auditoria nao tem alcance.

| Perfil       | Acesso padrao                                                                 |
| ------------ | ----------------------------------------------------------------------------- |
| `ADMIN`      | Tudo, incluindo auditoria, usuarios e aprovacoes. Ha apenas um administrador. |
| `TECNICO`    | Le, cadastra e edita ativos; recebe e avalia equipamentos; cria solicitacoes. |
| `RH`         | Gerencia funcionarios, inicia e conclui desligamentos; cria solicitacoes.     |
| `FINANCEIRO` | Le ativos com valores e relatorios financeiros; nao altera ativos.            |
| `CONSULTA`   | Somente leitura com mascaramento de dados pessoais.                           |

Todos entram por e-mail e senha. O admin cadastra usuarios com senha provisoria; eles precisam troca-la no primeiro acesso. Sessao usa cookie `httpOnly`, `SameSite=Strict`, `Secure` em producao, expiracao e bloqueio temporario apos tentativas falhas. O header `x-technician-id` nao e aceito.

Desativar um usuario, redefinir a senha, trocar o perfil ou alterar permissoes ou alcance revoga todas as sessoes dele na mesma transacao da alteracao: a requisicao seguinte recebe 401 e ele precisa entrar de novo (se estiver ativo). Uma sessao so e aceita enquanto o usuario estiver ativo, e permissoes e alcance sao lidos do banco a cada requisicao.

Na tela **Usuarios**, visivel somente para `user:manage`, o administrador filtra contas por perfil e status, cria e edita usuarios, ativa/desativa contas, redefine senhas provisorias e encerra sessoes. A tela de cada usuario mostra overrides em tres estados (herdar, permitir e negar), a origem da permissao efetiva, alcance por cidade/departamento/tipo de equipamento e uma pre-visualizacao antes do salvamento. Alteracoes administrativas exigem motivo e sao registradas na auditoria.

## Importacao

A importacao (`asset:create`) respeita permissoes e alcance de quem importa. Sem `import:initial_load` (so ADMIN por padrao, concedivel individualmente) entram apenas ativos `DISPONIVEL` ou `BACKUP`, sem atribuicao. Com ela, a carga inicial pode criar ativos ja `EM_USO`, `DESATIVADO`, `EM_MANUTENCAO` ou `EM_AVALIACAO`; `PENDENTE_DEVOLUCAO` nunca e importado. Todo ativo importado recebe uma movimentacao `CARGA_INICIAL` com o autor. Criar funcionarios pela planilha exige `employee:create`. A planilha legada e uma carga inicial: exige `import:initial_load`, registra `CARGA_INICIAL` ao atribuir e coloca em `BACKUP` (nunca `DISPONIVEL`) o equipamento legado sem dono.

## Fluxo de aprovacoes

1. Um usuario com `request:create` abre uma solicitacao com justificativa e ativos.
2. O ativo fica reservado enquanto a solicitacao estiver `PENDENTE`: qualquer mudanca de estado por outra rota (`/move`, desligamento, destino) e recusada com 409 "Ativo reservado pela solicitacao #N". So a execucao da propria solicitacao move o ativo; rejeicao, cancelamento ou expiracao liberam a reserva.
3. Somente o ADMIN aprova ou rejeita; ninguem mais aprova, nem a propria solicitacao nem a de outro. O administrador pode autoaprovar, e a auditoria registra a marca "auto-aprovada".
4. A aprovacao revalida o estado e executa a movimentacao na mesma transacao.
5. Troca movimenta o ativo antigo para avaliacao e atribui o novo. Na criacao e na aprovacao, o ativo antigo precisa estar `EM_USO` e atribuido exatamente ao funcionario da solicitacao; o novo pode estar em `DISPONIVEL` ou `BACKUP` (neste caso, a aprovacao da propria troca atende a regra de backup); backup em uso exige aprovacao; desativacao exige laudo e e irreversivel.

`DISPONIVEL` e somente estoque novo, nunca usado: o ativo so entra nesse estado no cadastro, e atribuir um ativo `DISPONIVEL` nao exige aprovacao. Equipamento devolvido, avaliado ou reparado volta para `BACKUP`, nunca para `DISPONIVEL`. De `BACKUP` para `EM_USO` nao ha atalho: nem por `/move` em dois passos, nem por importacao, troca ou desligamento; o unico caminho e uma solicitacao aprovada. A migration 013 move para `BACKUP` os ativos ja usados que estavam em `DISPONIVEL` pela regra antiga. 6. Eventos de criacao, decisao, execucao, cancelamento e expiracao sao imutaveis.

## Fluxo de desligamento

1. RH/admin com `employee:offboard` inicia com data e motivo. O funcionario vira `em_desligamento` e os ativos vao para `PENDENTE_DEVOLUCAO` na mesma transacao.
2. Tecnico com `asset:receive` recebe cada item pelo endpoint de recebimento, que exige estado fisico e acessorios (ou "Nenhum"); ele vai para `EM_AVALIACAO`. `PENDENTE_DEVOLUCAO` so e marcado no inicio do desligamento e so sai pelo recebimento: o `/move` nao pula etapas nem leva o ativo direto a `BACKUP`, `EM_MANUTENCAO` ou `DESATIVADO`.
3. Tecnico define `BACKUP`, `EM_MANUTENCAO` ou propoe `DESATIVADO`. A ultima opcao abre aprovacao com laudo obrigatorio.
4. RH/admin conclui somente sem ativos pendentes, com registro de recebimento de todos os ativos devolvidos, sem desativacao aberta e depois de fechar ou reatribuir chamados abertos.

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
3. Defina `AGE_RECIPIENT` com a chave publica age da copia externa e, de preferencia, `BACKUP_EXTERNAL_HOST_DIR` com a montagem do NAS (veja Backup e restauracao).
4. Inicie:

```bash
docker compose up -d --build
```

O `Dockerfile` e multi-stage. `app` usa o volume nomeado `inventory-data` em `/app/data`; Nginx termina TLS em 443 e redireciona 80 para HTTPS. O compose nao deve ser iniciado antes dos certificados existirem, pois Nginx precisa deles para iniciar com HTTPS. Sem `AGE_RECIPIENT`, o servico `backup` recusa iniciar com a mensagem `backup_daemon_config_invalid` (codigo de saida 78); o Docker tenta reinicia-lo no maximo 3 vezes e para.

## Backup e restauracao

O backup usa `better-sqlite3.backup`, inclui o WAL, executa `integrity_check` e `foreign_key_check` na copia local e aplica retencao. Quando `BACKUP_EXTERNAL_DIR` esta definido, grava uma segunda copia **cifrada com age** para a chave publica `AGE_RECIPIENT`, fora do volume do banco. Como a chave privada nao fica no servidor, a copia externa nao e aberta nem validada como SQLite ali: o servidor confere apenas que o arquivo nao esta vazio e comeca com o cabecalho age (`age-encryption.org/v1`). A validacao completa e o teste de restauracao abaixo, feito com a chave privada.

```powershell
npm run backup
npm run backup:verify-restore
```

Cada execucao registra em `backup-status.json` (pasta `BACKUP_DIR`) o resultado de cada etapa: copia local, retencao, copia externa e monitoramento. A copia local validada nunca e apagada por falha na copia externa, na criptografia ou no ping de `BACKUP_MONITOR_URL`; o ping so e enviado quando todas as etapas terminam sem falha. `npm run backup` termina com codigo 1 se alguma etapa falhar e com codigo 78 se a configuracao for invalida (por exemplo, `BACKUP_EXTERNAL_DIR` sem `AGE_RECIPIENT`). Com essa configuracao invalida a aplicacao tambem recusa iniciar.

No Docker, o servico `backup` executa no intervalo configurado e monta `BACKUP_EXTERNAL_HOST_DIR` como destino da copia externa. Use uma montagem de NAS, disco criptografado ou agente de backup do provedor; uma pasta no mesmo disco nao protege contra falha desse disco. Se uma execucao falhar, o servico tenta de novo apos 1, 2, 4, 8... minutos, sem passar de `BACKUP_INTERVAL_SECONDS`, e volta ao intervalo normal apos um sucesso.

Para criar o par de chaves age, em uma maquina segura (nao no servidor):

```powershell
age-keygen -o inventario-backup.key   # imprime a chave publica age1...: use-a em AGE_RECIPIENT
# sem a CLI do age:
node -e "import('age-encryption').then(async (a) => { const id = await a.generateIdentity(); console.log(id); console.log(await a.identityToRecipient(id)); })"
```

Guarde o arquivo da chave privada em um cofre, separado dos backups e da chave do 2FA. Sem ele, as copias externas nao podem ser restauradas.

Teste de restauracao recomendado, ao menos mensalmente:

1. No servidor, execute `npm run backup:verify-restore` para restaurar a copia local mais recente em uma pasta temporaria e conferir a integridade.
2. Na maquina que guarda a chave privada, teste a copia externa: `$env:AGE_IDENTITY_FILE="C:\cofre\inventario-backup.key"` e `npm run backup:verify-restore -- \\nas\inventory-backups\inventory-<data>.db.age`. O comando decifra em pasta temporaria, restaura e roda `integrity_check` e `foreign_key_check`. Com a CLI do age, o equivalente e `age -d -i inventario-backup.key inventory-<data>.db.age > inventory-restaurado.db` seguido de `npm run backup:verify-restore -- inventory-restaurado.db`.
3. Para recuperar dados, pare a aplicacao: `docker compose stop app`.
4. Preserve o arquivo atual: renomeie `inventory.db` para `inventory.db.before-restore`.
5. Copie o backup escolhido (decifrado, se vier da copia externa) para `inventory.db` no volume `data/`.
6. Rode `npm run backup:verify-restore <caminho-do-backup>` e inicie `docker compose start app`.
7. Valide login, contagem de ativos e os ultimos movimentos antes de liberar usuarios.

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
