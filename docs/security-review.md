# Revisão de segurança

Data: 2026-10-09. Escopo: API Express, autenticação, autorização, fluxo de ativos, aprovações, desligamento e importação.

## Achados corrigidos

| Severidade | Achado | Correção | Cobertura |
|---|---|---|---|
| Alta | Rotas de cancelamento e notificações aceitavam qualquer sessão autenticada. | `request:create` passou a ser exigida. | `security-hardening.test.js` |
| Alta | Documentação OpenAPI estava disponível a qualquer usuário autenticado. | `audit:read` passou a ser exigida. | Revisão de rota/OpenAPI |
| Alta | O cliente podia enviar campos de workflow em corpos de cadastro. | Schemas estritos rejeitam `status`, solicitante, aprovador e campos desconhecidos. | `security-hardening.test.js` |
| Alta | O detalhe de ativo necessário ao novo frontend poderia vazar dados se não aplicasse alcance. | Endpoint e service usam `assertScope`. | `security-hardening.test.js` |
| Média | Sem verificação explícita de origem para requisições com cookie. | Middleware bloqueia origem e `Sec-Fetch-Site` cruzados; cookie permanece `SameSite=Strict`. | `security-hardening.test.js` |
| Média | Upload aceitava formatos não validados previamente. | Limite de 15 MB, um arquivo, extensão permitida e parsing do workbook; arquivo temporário é removido. | `import-template.test.js` |
| Média | Erros internos e falhas de importação podiam registrar conteúdo sensível. | Logs estruturados sem body, stack, senha, e-mail ou caminho de arquivo. | Revisão de código |
| Média | Dados pessoais permaneciam visíveis para todos os perfis de leitura. | Consulta mascara e-mail e telefone; técnico não recebe telefone pessoal. | Service de funcionários |
| Média | Não havia rotina de retenção LGPD. | `npm run privacy:anonymize`, configurado por `EMPLOYEE_ANONYMIZATION_DAYS`. | Execução controlada por operador |

## Controles validados

- Escalonamento próprio de perfil, permissões e alcance: bloqueado no service e coberto por `auth-rbac.test.js`.
- IDOR de funcionário, ativo, histórico, atribuições, checklist e chamados: services aplicam alcance antes de retornar ou alterar dados.
- Transições que exigem aprovação: bloqueadas em `performMove`; aprovação é revalidada e executada na mesma transação.
- Replay de aprovação: uma solicitação só pode estar `PENDENTE`; a segunda tentativa falha.
- Concorrência de solicitações: reserva exclusiva do ativo no banco impede duas solicitações pendentes.
- Desligamento: as quatro etapas verificam estado, atribuição e solicitação pendente em transação.

## Rota × permissão

| Rotas | Permissão |
|---|---|
| `POST /api/auth/login` | Pública, rate limit; demais `/api/auth/*` exigem sessão/onboarding conforme fluxo |
| `/api/employees*` | `employee:read`, `employee:create`, `employee:update` ou `employee:offboard` |
| `/api/assets*` | `asset:read`, `asset:create`, `asset:update` ou `asset:receive` |
| `/api/tickets` | `ticket:read` / `ticket:create` |
| `/api/approval-requests*` | `request:create` / `request:approve` |
| `/api/notifications` | `request:create` |
| `/api/users*` | `user:manage` |
| `/api/admin/audit`, `/api/openapi.json`, `/api/docs` | `audit:read` |
| `/api/dashboard*` | `asset:read` |
| `/api/import/excel`, `/api/templates/initial` | `asset:create` |

## Checklist operacional

- [ ] Definir `NODE_ENV=production`, `APP_ORIGIN` HTTPS e cookie `Secure` antes da publicação.
- [ ] Executar `npm audit --omit=dev` no pipeline e bloquear vulnerabilidades altas/críticas.
- [ ] Executar `npm test`, `npm run lint`, `npm run web:typecheck` e `npm run web:build` no pipeline.
- [ ] Agendar `npm run privacy:anonymize` após validação jurídica do prazo de retenção.
- [ ] Proteger o arquivo SQLite, backups e `.env` com ACL do sistema operacional e criptografia em repouso.
- [ ] Guardar logs estruturados fora do banco e limitar acesso de auditoria.
- [ ] Revisar permissões e alcances de usuários periodicamente.
