# Sistema de Gestão de Ativos

Protótipo funcional criado a partir da estrutura da planilha **\_BASE DE CHAMADOS E RELATORIOS - ISDIN - Q1-2025.xlsm**.

## O que já faz

- Cadastro de funcionários e ativos.
- Estados do ativo: **em uso, backup, manutenção e desativado**.
- Um ativo em uso possui uma atribuição aberta a um funcionário.
- Histórico permanente de cada movimentação.
- Fluxo de desligamento: cada equipamento do funcionário precisa ir para **backup**, **manutenção** ou **desativado**. A operação é transacional.
- Cadastro de chamados: ao selecionar o funcionário, o sistema mostra automaticamente os equipamentos atribuídos a ele.
- Dashboard com três visões: resumo executivo, ativos e chamados. Os painéis de ativos e chamados têm filtros; os gráficos usam os registros do banco.
- Técnico se identifica pelo nome, sem login, como solicitado.
- Administrador entra com senha e pode acessar importação e auditoria.
- Importação inicial pelo modelo das abas `Funcionarios` e `Ativos`, além de compatibilidade com a planilha antiga.
- Importador usa **lista permitida de campos** e não importa outros dados/credenciais da planilha.
- Banco SQLite em modo WAL, chaves estrangeiras e índices para uso interno por pequena equipe.

## Executar

Requer Node.js 20.19+ (ou 22.13+/24+) para executar também o ESLint.

```bash
npm ci
```

Copie `.env.example` para `.env`, escolha uma senha própria em `ADMIN_PASSWORD` e inicie:

```bash
npm start
```

No PowerShell, a cópia pode ser feita com `Copy-Item .env.example .env`. Variáveis definidas no ambiente têm prioridade sobre o arquivo `.env`. O servidor não inicia sem `ADMIN_PASSWORD` ou com `admin123`; `PORT` deve estar entre 1 e 65535.

Abra `http://localhost:3000` (ou a porta configurada).

## Qualidade do código

```bash
npm test
npm run lint
npm run format:check
```

Use `npm run format` para aplicar o padrão do Prettier. O pacote SheetJS CE 0.20.3 foi obtido da [distribuição oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) e mantido em `vendor/xlsx-0.20.3.tgz` para instalações reproduzíveis. SHA-256: `8DC73FC3B00203E72D176E85B50938627C7B086E607C682E8D3C22C02BB99FE8`.

## Importação inicial

1. Abra [o modelo](public/modelo-importacao-inicial.xlsx) ou baixe-o na tela **Importar Excel**. O botão usa a rota `/api/templates/initial`.
2. Na aba `Funcionarios`, preencha uma linha por pessoa. `CÓDIGO` e `NOME` são obrigatórios; use um código único por pessoa.
3. Na aba `Ativos`, preencha uma linha por equipamento. Informe `EQUIPAMENTO`, `STATUS` e pelo menos `SERIAL` ou uma `REFERÊNCIA` individual. Preencha `REFERÊNCIA` com o número de patrimônio; ele aparece como **Patrimônio** na lista de ativos.
4. Para `Em uso`, repita o código da pessoa em `CÓDIGO FUNCIONÁRIO`. Para `Backup`, `Manutenção` ou `Desativado`, deixe esse campo vazio. Ao desativar, informe `MOTIVO / OBSERVAÇÃO`.
5. Salve como `.xlsx`, entre no modo Administrador e envie pela tela **Importar Excel**. O modelo novo é importado em uma única transação; uma linha inválida impede toda a gravação.

A aba `Instrucoes` contém essas regras. Ela não é importada. Não inclua senhas ou credenciais na planilha.

As datas de admissão e desligamento podem ficar vazias na importação. Para preenchê-las depois, entre no modo **Administrador**, abra **Funcionários** e clique em **Editar**. A data de desligamento só aparece para quem já está desligado; use **Desligamento** para mudar o status e definir o destino dos equipamentos.

## Backup

```bash
npm run backup
```

Os backups ficam em `data/backups/`.

## Estrutura de dados

- `technicians`: técnicos e administradores.
- `employees`: funcionários.
- `assets`: cadastro mestre de ativos.
- `assignments`: quem está com qual ativo e em qual período.
- `movements`: trilha permanente de movimentações.
- `tickets`: chamados.
- `audit_log`: alterações relevantes.

## Regras importantes

1. Equipamento desativado **não é apagado**; fica com status `retired` e mantém histórico.
2. Só existe uma atribuição aberta por equipamento.
3. Para desligar um funcionário, todos os ativos atribuídos precisam ter um destino definido.
4. Duplicidade por serial é bloqueada.
5. Dados do Excel são importados por whitelist. Isso reduz risco de importar conteúdo que não pertence ao inventário.

## Para colocar em produção

Para dois técnicos em uma rede interna, SQLite funciona bem. Para acesso externo, várias filiais ou crescimento de usuários, a próxima evolução recomendada é PostgreSQL, HTTPS, autenticação corporativa (Microsoft/Google/SSO), permissões por perfil e backups automáticos fora do servidor.

O modo “técnico sem login” atende ao requisito, mas identifica o responsável apenas pelo nome escolhido. Para auditoria forte, adicione PIN individual ou SSO.
