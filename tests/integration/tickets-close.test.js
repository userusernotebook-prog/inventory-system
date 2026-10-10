const test = require('node:test');
const assert = require('node:assert/strict');
const { createIntegrationContext, createUser, login } = require('../helpers/integration-context');

test('tecnico encerra chamado com parecer e consulta nao pode encerrar', async () => {
  const context = createIntegrationContext();
  try {
    const technician = await createUser(context.db, {
      name: 'Tecnico de chamados',
      email: 'tecnico.chamados@example.test',
      profile: 'TECNICO'
    });
    const consultation = await createUser(context.db, {
      name: 'Consulta de chamados',
      email: 'consulta.chamados@example.test',
      profile: 'CONSULTA'
    });
    const employeeId = context.db
      .prepare("INSERT INTO employees(name, email, status) VALUES(?, ?, 'ativo')")
      .run('Pessoa com chamado', 'pessoa.chamado@example.test').lastInsertRowid;
    assert.equal((await login(context.agent, technician.email, technician.password)).status, 200);
    const created = await context.agent.post('/api/tickets').send({
      employee_id: Number(employeeId),
      type: 'Suporte',
      priority: 'Alta',
      description: 'Falha de conexão na estação de trabalho.'
    });
    assert.equal(created.status, 200);
    const closed = await context.agent
      .post(`/api/tickets/${created.body.id}/close`)
      .send({ technical_opinion: 'Adaptador de rede substituído e conexão validada.' });
    assert.deepEqual(closed.body, { id: created.body.id, status: 'closed' });
    const ticket = context.db
      .prepare('SELECT status, technical_opinion, closed_at FROM tickets WHERE id=?')
      .get(created.body.id);
    assert.equal(ticket.status, 'closed');
    assert.match(ticket.technical_opinion, /Adaptador/);
    assert.match(ticket.closed_at, /Z$/);
    await context.agent.post('/api/auth/logout');
    assert.equal((await login(context.agent, consultation.email, consultation.password)).status, 200);
    const forbidden = await context.agent
      .post(`/api/tickets/${created.body.id}/close`)
      .send({ technical_opinion: 'Tentativa indevida.' });
    assert.equal(forbidden.status, 403);
  } finally {
    context.close();
  }
});
