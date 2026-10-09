let technician = JSON.parse(sessionStorage.getItem('technician') || 'null');
let adminToken = sessionStorage.getItem('adminToken') || '';
const app = document.querySelector('#app'),
  toast = document.querySelector('#toast');
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
  );
function notify(s) {
  toast.textContent = s;
  toast.style.display = 'block';
  setTimeout(() => (toast.style.display = 'none'), 2800);
}
async function api(url, opt = {}) {
  opt.headers = {
    ...(opt.headers || {}),
    'content-type': opt.body instanceof FormData ? undefined : 'application/json'
  };
  if (!opt.headers['content-type']) delete opt.headers['content-type'];
  if (technician) opt.headers['x-technician-id'] = technician.id;
  if (adminToken) opt.headers.authorization = 'Bearer ' + adminToken;
  const r = await fetch(url, opt);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Erro');
  return d;
}
async function loadTech() {
  const ts = await api('/api/technicians');
  techSelect.innerHTML = ts
    .map((t) => `<option value='${t.id}' data-name='${esc(t.name)}'>${esc(t.name)}</option>`)
    .join('');
  if (technician) {
    techModal.classList.add('hidden');
    actorBadge.textContent = '• ' + technician.name;
  } else techModal.classList.remove('hidden');
}
chooseTech.onclick = () => {
  const o = techSelect.selectedOptions[0];
  technician = { id: Number(o.value), name: o.dataset.name };
  sessionStorage.setItem('technician', JSON.stringify(technician));
  techModal.classList.add('hidden');
  actorBadge.textContent = '• ' + technician.name;
  dashboard();
};
adminBtn.onclick = async () => {
  const p = prompt('Senha do administrador:');
  if (!p) return;
  try {
    const d = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: p })
    });
    adminToken = d.token;
    sessionStorage.setItem('adminToken', adminToken);
    document.querySelectorAll('.admin-only').forEach((x) => x.classList.remove('hidden'));
    notify('Modo administrador ativado.');
  } catch (e) {
    notify(e.message);
  }
};
document.querySelectorAll('.nav').forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll('.nav').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      document.body.classList.toggle('dashboard-mode', b.dataset.page === 'dashboard');
      (
        ({ dashboard, employees, assets, move, tickets, importPage, audit })[
          b.dataset.page === 'import' ? 'importPage' : b.dataset.page
        ] || dashboard
      )();
    })
);
const fmtDate = (s) => (s ? new Date(s).toLocaleString('pt-BR') : '');
function smallTable(rows, cols) {
  return `<table><thead><tr>${cols.map((c) => `<th>${esc(c.replaceAll('_', ' '))}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c.includes('at') ? esc(fmtDate(r[c])) : esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
async function employees() {
  const rows = await api('/api/employees');
  app.innerHTML = `<h1>Funcionários</h1><div class=toolbar><button id=newEmp>Novo funcionário</button><input id=empSearch placeholder='Buscar nome, e-mail ou departamento'></div><div id=empList>${employeeTable(rows)}</div><div id=empForm></div>`;
  empSearch.oninput = async () =>
    (empList.innerHTML = employeeTable(
      await api('/api/employees?q=' + encodeURIComponent(empSearch.value))
    ));
  newEmp.onclick = () => showEmpForm();
  empList.onclick = async (event) => {
    const button = event.target.closest('button[data-edit],button[data-offboard]');
    if (!button) return;
    try {
      if (button.dataset.edit) return await showEditEmpForm(Number(button.dataset.edit));
      const employee = await api(`/api/employees/${button.dataset.offboard}`);
      await offboard(employee.id, employee.name);
    } catch (error) {
      notify(error.message);
    }
  };
}
function employeeTable(rows) {
  return `<table><thead><tr><th>Nome</th><th>E-mail</th><th>Departamento</th><th>Cidade</th><th>Telefone corporativo</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.email)}</td><td>${esc(r.department)}</td><td>${esc(r.city)}</td><td>${esc(r.corporate_phone)}</td><td><span class=status>${r.status === 'active' ? 'Ativo' : 'Desligado'}</span></td><td><button class=ghost data-edit='${r.id}'>Editar</button> ${r.status === 'active' ? `<button class=ghost data-offboard='${r.id}'>Desligamento</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
}
function showEmpForm() {
  empForm.innerHTML = `<section class=panel><h2>Novo funcionário</h2><div class=form-grid><input id=en placeholder='Nome'><input id=ec placeholder='Código'><input id=ee placeholder='E-mail'><input id=ed placeholder='Departamento'><input id=eci placeholder='Cidade'><input id=el placeholder='Localidade'><input id=ep placeholder='Telefone corporativo'></div><div class=toolbar><button id=saveEmp>Salvar</button></div></section>`;
  saveEmp.onclick = async () => {
    try {
      await api('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          name: en.value,
          code: ec.value,
          email: ee.value,
          department: ed.value,
          city: eci.value,
          location: el.value,
          corporate_phone: ep.value
        })
      });
      notify('Funcionário cadastrado.');
      employees();
    } catch (e) {
      notify(e.message);
    }
  };
}
async function showEditEmpForm(id) {
  if (!adminToken) {
    notify('Ative o modo administrador para editar funcionários.');
    return;
  }
  const employee = await api(`/api/employees/${id}`);
  const fields = [
    ['code', 'Código'],
    ['name', 'Nome'],
    ['email', 'E-mail'],
    ['department', 'Departamento'],
    ['cost_center', 'Centro de custo'],
    ['city', 'Cidade'],
    ['location', 'Localidade'],
    ['corporate_phone', 'Telefone corporativo'],
    ['personal_phone', 'Telefone pessoal'],
    ['hire_date', 'Data de admissão']
  ];
  if (employee.status === 'inactive') fields.push(['offboarded_at', 'Data de desligamento']);
  empForm.innerHTML = `<section class=panel><h2>Editar funcionário: ${esc(employee.name)}</h2><p class=muted>Status: ${employee.status === 'active' ? 'Ativo' : 'Desligado'}. Para desligar um funcionário ativo, use o botão Desligamento.</p><form id=editEmpForm><div class=form-grid>${fields.map(([key, label]) => `<label>${label}<input name='${key}' type='${key.includes('date') || key === 'offboarded_at' ? 'date' : 'text'}' value='${esc(key === 'hire_date' || key === 'offboarded_at' ? (employee[key] || '').slice(0, 10) : employee[key])}' ${key === 'name' ? 'required' : ''}></label>`).join('')}</div><div class=toolbar><button type=submit>Salvar alterações</button><button type=button class=ghost id=cancelEditEmp>Cancelar</button></div></form></section>`;
  empForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  cancelEditEmp.onclick = () => (empForm.innerHTML = '');
  editEmpForm.onsubmit = async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(editEmpForm));
    try {
      await api(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(values) });
      notify('Dados do funcionário atualizados.');
      await employees();
    } catch (error) {
      notify(error.message);
    }
  };
}
async function offboard(id, name) {
  const as = await api(`/api/employees/${id}/assets`);
  if (!as.length) {
    if (confirm(`${name} não possui equipamentos atribuídos. Marcar como desligado?`)) {
      try {
        await api(`/api/employees/${id}/offboard`, {
          method: 'POST',
          body: JSON.stringify({ decisions: {} })
        });
        notify('Desligamento concluído.');
        employees();
      } catch (e) {
        notify(e.message);
      }
    }
    return;
  }
  app.innerHTML = `<h1>Desligamento: ${esc(name)}</h1><p>Defina o destino de cada equipamento antes de concluir.</p><section class=panel><div id=offs>${as.map((a) => `<div class=toolbar data-off='${a.id}'><b>${esc(a.equipment_type)} ${esc(a.hostname || a.serial)}</b><select><option value=backup>Retornar para backup</option><option value=maintenance>Enviar para manutenção</option><option value=retired>Desativar equipamento</option></select><input placeholder='Motivo / observação (obrigatório ao desativar)'></div>`).join('')}</div><button id=finishOff>Concluir desligamento</button></section>`;
  finishOff.onclick = async () => {
    const decisions = {};
    document.querySelectorAll('[data-off]').forEach(
      (x) =>
        (decisions[x.dataset.off] = {
          status: x.querySelector('select').value,
          reason: x.querySelector('input').value
        })
    );
    try {
      await api(`/api/employees/${id}/offboard`, {
        method: 'POST',
        body: JSON.stringify({ decisions })
      });
      notify('Desligamento concluído e histórico preservado.');
      employees();
    } catch (e) {
      notify(e.message);
    }
  };
}
async function assets() {
  const rows = await api('/api/assets');
  app.innerHTML = `<h1>Ativos</h1><div class=toolbar><button id=newAsset>Novo ativo</button><input id=assetSearch placeholder='Funcionário, hostname, modelo, serial ou patrimônio'><select id=assetStatus><option value=''>Todos</option><option value=assigned>Em uso</option><option value=backup>Backup</option><option value=maintenance>Manutenção</option><option value=retired>Baixados</option></select></div><div id=assetList>${assetTable(rows)}</div><div id=assetForm></div>`;
  const refresh = async () =>
    (assetList.innerHTML = assetTable(
      await api(
        `/api/assets?q=${encodeURIComponent(assetSearch.value)}&status=${assetStatus.value}`
      )
    ));
  assetSearch.oninput = refresh;
  assetStatus.onchange = refresh;
  newAsset.onclick = () => showAssetForm();
}
function assetTable(rows) {
  const statusName = {
    assigned: 'Em uso',
    backup: 'Backup',
    maintenance: 'Manutenção',
    retired: 'Desativado'
  };
  return `<table><thead><tr><th>Funcionário</th><th>Hostname</th><th>Equipamento</th><th>Modelo</th><th>Serial</th><th>Patrimônio</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map((a) => `<tr><td>${esc(a.employee_name || '—')}</td><td>${esc(a.hostname)}</td><td>${esc(a.equipment_type)}</td><td>${esc(a.model)}</td><td>${esc(a.serial)}</td><td>${esc(a.reference)}</td><td><span class=status>${esc(statusName[a.status] || a.status)}</span></td><td><span class=click onclick='historyAsset(${a.id})'>Histórico</span></td></tr>`).join('')}</tbody></table>`;
}
function showAssetForm() {
  assetForm.innerHTML = `<section class=panel><h2>Novo ativo</h2><div class=form-grid><input id=at placeholder='Tipo: Notebook, iPad, Smartphone'><input id=ah placeholder='Hostname'><input id=as placeholder='Serial'><input id=am placeholder='Modelo'><input id=af placeholder='Fabricante'><input id=ar placeholder='Patrimônio'><input id=ai1 placeholder='IMEI 1'><input id=ai2 placeholder='IMEI 2'><input id=ac placeholder='Condições de uso'><input id=acity placeholder='Cidade'><input id=aloc placeholder='Localidade'><select id=ast><option value=backup>Backup</option><option value=maintenance>Manutenção</option></select><textarea id=ades class=wide placeholder='Descrição'></textarea></div><div class=toolbar><button id=saveAsset>Salvar</button></div></section>`;
  saveAsset.onclick = async () => {
    try {
      await api('/api/assets', {
        method: 'POST',
        body: JSON.stringify({
          equipment_type: at.value,
          hostname: ah.value,
          serial: as.value,
          model: am.value,
          manufacturer: af.value,
          reference: ar.value,
          imei1: ai1.value,
          imei2: ai2.value,
          condition_text: ac.value,
          city: acity.value,
          location: aloc.value,
          status: ast.value,
          description: ades.value
        })
      });
      notify('Ativo cadastrado.');
      assets();
    } catch (e) {
      notify(e.message);
    }
  };
}
async function historyAsset(id) {
  const h = await api(`/api/assets/${id}/history`);
  app.innerHTML = `<h1>Histórico do equipamento</h1><button class=ghost onclick='assets()'>Voltar</button><section class='panel history' style='margin-top:12px'>${smallTable(h, ['created_at', 'movement_type', 'from_status', 'to_status', 'employee_from', 'employee_to', 'technician', 'reason'])}</section>`;
}
async function move() {
  const as = await api('/api/assets');
  const es = await api('/api/employees');
  app.innerHTML = `<h1>Movimentar equipamento</h1><section class=panel><div class=form-grid><select id=ma><option value=''>Selecione o ativo</option>${as
    .filter((a) => a.status !== 'retired')
    .map(
      (a) =>
        `<option value='${a.id}'>${esc(a.equipment_type)} | ${esc(a.hostname || a.serial)} | ${esc(a.employee_name || a.status)}</option>`
    )
    .join(
      ''
    )}</select><select id=ms><option value=assigned>Atribuir a funcionário</option><option value=backup>Enviar para backup</option><option value=maintenance>Enviar para manutenção</option><option value=retired>Dar baixa</option></select><select id=me><option value=''>Selecione o funcionário</option>${es
    .filter((e) => e.status === 'active')
    .map((e) => `<option value='${e.id}'>${esc(e.name)}</option>`)
    .join(
      ''
    )}</select><textarea id=mr class=wide placeholder='Motivo / observação'></textarea></div><div class=toolbar><button id=doMove>Registrar movimentação</button></div></section>`;
  ms.onchange = () => me.classList.toggle('hidden', ms.value !== 'assigned');
  doMove.onclick = async () => {
    try {
      await api(`/api/assets/${ma.value}/move`, {
        method: 'POST',
        body: JSON.stringify({ to_status: ms.value, employee_id: me.value, reason: mr.value })
      });
      notify('Movimentação registrada no histórico.');
      move();
    } catch (e) {
      notify(e.message);
    }
  };
}
async function tickets() {
  const [rows, es] = await Promise.all([api('/api/tickets'), api('/api/employees')]);
  app.innerHTML = `<h1>Chamados</h1><section class=panel><h2>Novo chamado</h2><div class=form-grid><select id=te><option value=''>Funcionário</option>${es
    .filter((e) => e.status === 'active')
    .map((e) => `<option value='${e.id}'>${esc(e.name)}</option>`)
    .join(
      ''
    )}</select><select id=ta><option value=''>Equipamento do funcionário</option></select><input id=tt placeholder='Tipo de chamado'><select id=tp><option>Normal</option><option>Alta</option><option>Urgente</option></select><textarea id=td class=wide placeholder='Descrição do problema'></textarea></div><button id=saveTicket>Registrar chamado</button></section><section class=panel style='margin-top:18px'><h2>Chamados recentes</h2>${smallTable(rows, ['ticket_number', 'employee_name', 'equipment_type', 'hostname', 'priority', 'status', 'technician', 'opened_at'])}</section>`;
  te.onchange = async () => {
    const a = await api(`/api/employees/${te.value}/assets`);
    ta.innerHTML =
      `<option value=''>Sem equipamento específico</option>` +
      a
        .map(
          (x) =>
            `<option value='${x.id}'>${esc(x.equipment_type)} | ${esc(x.hostname || x.serial)}</option>`
        )
        .join('');
  };
  saveTicket.onclick = async () => {
    try {
      const d = await api('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: te.value,
          asset_id: ta.value,
          type: tt.value,
          priority: tp.value,
          description: td.value
        })
      });
      notify('Chamado ' + d.ticket_number + ' criado.');
      tickets();
    } catch (e) {
      notify(e.message);
    }
  };
}
function importPage() {
  app.innerHTML = `<h1>Importar Excel</h1><p class=muted>Preencha o modelo para cadastrar funcionários e ativos em uma única importação. As datas de admissão e desligamento podem ficar vazias e ser preenchidas depois em Funcionários → Editar.</p><div class=toolbar><a class=ghost href='/api/templates/initial' download='modelo-importacao-inicial.xlsx'>Baixar modelo de importação</a></div><div class=drop><input id=file type=file accept='.xlsx'><p>Use as abas Funcionarios e Ativos do modelo. Confira os códigos e as referências antes de importar.</p><button id=sendFile>Importar</button></div><div id=impResult></div>`;
  sendFile.onclick = async () => {
    if (!adminToken) return notify('Ative o modo Administrador primeiro.');
    if (!file.files[0]) return notify('Selecione um arquivo.');
    const fd = new FormData();
    fd.append('file', file.files[0]);
    try {
      const d = await api('/api/import/excel', { method: 'POST', body: fd, headers: {} });
      impResult.innerHTML = `<section class=panel style='margin-top:16px'><b>Importação concluída</b><p>Funcionários: ${d.employees} • Ativos: ${d.assets} • Chamados: ${d.tickets} • Já existentes: ${d.skipped}</p><p class=muted>${esc(d.note)}</p></section>`;
    } catch (e) {
      notify(e.message);
    }
  };
}
async function audit() {
  if (!adminToken) return notify('Ative o modo Administrador primeiro.');
  const rows = await api('/api/admin/audit');
  app.innerHTML = `<h1>Auditoria</h1><p class=muted>Registro das alterações administrativas e operacionais.</p>${smallTable(rows, ['created_at', 'actor', 'action', 'entity_type', 'entity_id', 'details'])}`;
}
loadTech().then(() => dashboard());
