const { test, expect, request } = require('@playwright/test');
const { generate } = require('otplib');

const password = 'SenhaDeTesteForte1';

async function signedInContext(email, totpCode) {
  const context = await request.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const response = await context.post('/api/auth/login', {
    data: { email, password, ...(totpCode ? { totp_code: totpCode } : {}) }
  });
  expect(response.status(), await response.text()).toBe(200);
  return context;
}

test('RH inicia desligamento, tecnico recebe e propoe, admin aprova e RH conclui', async () => {
  const rh = await signedInContext('rh.e2e@example.test');
  const technician = await signedInContext('tecnico.e2e@example.test');
  const adminCode = await generate({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP' });
  const admin = await signedInContext('admin.e2e@example.test', adminCode);

  try {
    const started = await rh.post('/api/employees/1/offboarding/start', {
      data: { offboarding_date: '2026-12-31', reason: 'Encerramento do contrato' }
    });
    expect(started.status()).toBe(201);

    const received = await technician.post('/api/offboarding/assets/1/receive', {
      data: { physical_condition: 'Danificado', accessories: 'Carregador' }
    });
    expect(received.status()).toBe(200);

    const proposed = await technician.post('/api/offboarding/assets/1/destination', {
      data: {
        destination: 'DESATIVADO',
        justification: 'Falha de placa sem reparo viavel',
        technical_report: 'Placa logica comprometida; reparo economicamente inviavel.'
      }
    });
    expect(proposed.status()).toBe(200);
    const requestId = (await proposed.json()).approval_request_id;
    expect(requestId).toBeTruthy();

    const approved = await admin.post(`/api/approval-requests/${requestId}/approve`);
    expect(approved.status()).toBe(200);

    const concluded = await rh.post('/api/employees/1/offboarding/conclude', { data: {} });
    expect(concluded.status()).toBe(200);
    const employee = await rh.get('/api/employees/1');
    expect(employee.status()).toBe(200);
    expect((await employee.json()).status).toBe('desligado');
  } finally {
    await Promise.all([rh.dispose(), technician.dispose(), admin.dispose()]);
  }
});
