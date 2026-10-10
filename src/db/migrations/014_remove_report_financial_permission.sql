-- O relatorio financeiro ainda nao existe. Remove a permissao de bancos novos
-- e ja migrados para que ela nao seja exposta por perfis ou overrides legados.
DELETE FROM role_permissions WHERE permission='report:financial';
DELETE FROM user_permission_overrides WHERE permission='report:financial';
