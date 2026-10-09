let dashboardTab = 'summary';
let dashboardFilters = {
  year: '',
  month: '',
  ticketStatus: '',
  ticketType: '',
  assetStatus: '',
  assetType: ''
};
let dashboardRequest = 0;
const dashboardAssetStatus = {
  assigned: 'Em uso',
  backup: 'Backup',
  maintenance: 'Manutenção',
  retired: 'Desativado'
};
const dashboardTicketStatus = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  closed: 'Resolvido',
  cancelled: 'Cancelado'
};
const dashboardColors = [
  '#4b82f0',
  '#34cc9e',
  '#f5c14b',
  '#f37689',
  '#34c7df',
  '#a78bfa',
  '#80b4f8',
  '#e3a363'
];

async function dashboard(tab = dashboardTab) {
  dashboardTab = tab;
  document.body.classList.add('dashboard-mode');
  const params = new URLSearchParams(Object.entries(dashboardFilters).filter(([, value]) => value));
  const request = ++dashboardRequest;
  try {
    const report = await api(`/api/dashboard/report?${params}`);
    if (request !== dashboardRequest || !document.body.classList.contains('dashboard-mode')) return;
    renderDashboard(report);
  } catch (error) {
    notify(error.message);
  }
}

function dashboardMetric(label, value, note) {
  return `<div class='dash-metric'><span>${esc(label)}</span><strong>${Number(value || 0).toLocaleString('pt-BR')}</strong><small>${esc(note)}</small></div>`;
}
function dashboardEmpty(message = 'Ainda não há dados para este filtro.') {
  return `<p class='dash-empty'>${esc(message)}</p>`;
}
function dashboardBars(rows, labels = {}) {
  if (!rows.length) return dashboardEmpty();
  const max = Math.max(...rows.map((row) => Number(row.n)), 1);
  return `<div class='dash-bars'>${rows.map((row, index) => `<div class='dash-bar-row'><span title='${esc(labels[row.label] || row.label)}'>${esc(labels[row.label] || row.label)}</span><div class='dash-bar-track'><i style='width:${Math.max((Number(row.n) / max) * 100, 2)}%;background:${dashboardColors[index % dashboardColors.length]}'></i></div><b>${Number(row.n).toLocaleString('pt-BR')}</b></div>`).join('')}</div>`;
}
function dashboardDonut(rows, labels = {}) {
  const total = rows.reduce((sum, row) => sum + Number(row.n), 0);
  if (!total) return dashboardEmpty();
  let start = 0;
  const stops = rows.map((row, index) => {
    const end = start + (Number(row.n) / total) * 100;
    const stop = `${dashboardColors[index % dashboardColors.length]} ${start}% ${end}%`;
    start = end;
    return stop;
  });
  return `<div class='dash-donut-layout'><div class='dash-donut' style='background:conic-gradient(${stops.join(',')})'><div><strong>${total.toLocaleString('pt-BR')}</strong><small>total</small></div></div><div class='dash-legend'>${rows.map((row, index) => `<div><i style='background:${dashboardColors[index % dashboardColors.length]}'></i><span>${esc(labels[row.label] || row.label)}</span><b>${Number(row.n).toLocaleString('pt-BR')}</b></div>`).join('')}</div></div>`;
}
function dashboardMonths(rows, year) {
  if (!rows.length) return dashboardEmpty('Nenhum chamado foi aberto nesse período.');
  let displayed = rows.slice(-12);
  if (year) {
    const values = new Map(rows.map((row) => [row.label, Number(row.n)]));
    displayed = Array.from({ length: 12 }, (_, index) => ({
      label: `${year}-${String(index + 1).padStart(2, '0')}`,
      n: values.get(`${year}-${String(index + 1).padStart(2, '0')}`) || 0
    }));
  }
  const max = Math.max(...displayed.map((row) => Number(row.n)), 1);
  return `<div class='dash-months'>${displayed.map((row) => `<div class='dash-month'><b>${row.n || ''}</b><div class='dash-month-track'><i style='height:${(Number(row.n) / max) * 100}%'></i></div><small>${esc(row.label.slice(5))}/${esc(row.label.slice(2, 4))}</small></div>`).join('')}</div>`;
}
function dashboardDate(value) {
  if (!value) return '—';
  const date = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
    : value;
}
function dashboardRecentTickets(rows) {
  if (!rows.length) return dashboardEmpty();
  return `<div class='dash-table-wrap'><table><thead><tr><th>ID</th><th>Data</th><th>Funcionário</th><th>Categoria</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.ticket_number || row.id)}</td><td>${esc(dashboardDate(row.opened_at))}</td><td>${esc(row.employee_name)}</td><td>${esc(row.type || 'Sem categoria')}</td><td>${esc(dashboardTicketStatus[row.status] || row.status)}</td></tr>`).join('')}</tbody></table></div>`;
}
function dashboardRecentAssets(rows) {
  if (!rows.length) return dashboardEmpty();
  return `<div class='dash-table-wrap'><table><thead><tr><th>Funcionário</th><th>Hostname</th><th>Equipamento</th><th>Patrimônio</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.employee_name || '—')}</td><td>${esc(row.hostname || '—')}</td><td>${esc(row.equipment_type)}</td><td>${esc(row.reference || '—')}</td><td>${esc(dashboardAssetStatus[row.status] || row.status)}</td></tr>`).join('')}</tbody></table></div>`;
}
function dashboardPanel(title, content, extraClass = '') {
  return `<section class='dash-panel ${extraClass}'><h2>${esc(title)}</h2>${content}</section>`;
}
function dashboardOptions(values, selected, allLabel) {
  return `<option value=''>${esc(allLabel)}</option>${values.map((value) => `<option value='${esc(value)}' ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('')}`;
}
function dashboardFiltersHtml(report) {
  if (dashboardTab === 'assets') {
    const statuses = Object.entries(dashboardAssetStatus)
      .map(
        ([value, label]) =>
          `<option value='${value}' ${dashboardFilters.assetStatus === value ? 'selected' : ''}>${label}</option>`
      )
      .join('');
    return `<div class='dash-filters'><label>Status do ativo<select data-dash-filter='assetStatus'><option value=''>Todos os status</option>${statuses}</select></label><label>Equipamento<select data-dash-filter='assetType'>${dashboardOptions(report.assets.types, dashboardFilters.assetType, 'Todos os equipamentos')}</select></label><button type='button' class='dash-clear' data-dash-clear>Limpar filtros</button></div>`;
  }
  if (dashboardTab === 'tickets') {
    const years = report.tickets.years;
    const months = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro'
    ];
    return `<div class='dash-filters'><label>Ano<select data-dash-filter='year'>${dashboardOptions(years, dashboardFilters.year, 'Todos os anos')}</select></label><label>Mês<select data-dash-filter='month'><option value=''>Todos os meses</option>${months.map((name, index) => `<option value='${String(index + 1).padStart(2, '0')}' ${dashboardFilters.month === String(index + 1).padStart(2, '0') ? 'selected' : ''}>${name}</option>`).join('')}</select></label><label>Status<select data-dash-filter='ticketStatus'><option value=''>Todos os status</option>${Object.entries(
      dashboardTicketStatus
    )
      .map(
        ([value, label]) =>
          `<option value='${value}' ${dashboardFilters.ticketStatus === value ? 'selected' : ''}>${label}</option>`
      )
      .join(
        ''
      )}</select></label><label>Categoria<select data-dash-filter='ticketType'>${dashboardOptions(report.tickets.types, dashboardFilters.ticketType, 'Todas as categorias')}</select></label><button type='button' class='dash-clear' data-dash-clear>Limpar filtros</button></div>`;
  }
  return '';
}
function dashboardSummary(report) {
  const s = report.summary;
  return `<div class='dash-metrics'>${dashboardMetric('Funcionários ativos', s.employeesActive, 'situação atual')}${dashboardMetric('Ativos sob gestão', s.assetsManaged, 'não desativados')}${dashboardMetric('Chamados registrados', s.ticketsTotal, 'desde o início do sistema')}${dashboardMetric('Chamados abertos', s.ticketsOpen, 'abertos ou em andamento')}${dashboardMetric('Técnicos ativos', s.techniciansActive, 'cadastrados no sistema')}</div><div class='dash-grid dash-grid-3'>${dashboardPanel('Chamados por ano', dashboardBars(s.ticketAnnual))}${dashboardPanel('Situação dos ativos', dashboardDonut(s.assetStatus, dashboardAssetStatus))}${dashboardPanel('Status dos chamados', dashboardDonut(s.ticketStatus, dashboardTicketStatus))}</div><div class='dash-grid'>${dashboardPanel('Chamados recentes', dashboardRecentTickets(s.recentTickets), 'dash-wide')}</div><p class='dash-footnote'>Funcionários e ativos representam a situação atual. O gráfico anual usa a data de abertura registrada em cada chamado.</p>`;
}
function dashboardAssets(report) {
  const a = report.assets;
  const counts = Object.fromEntries(a.byStatus.map((row) => [row.label, row.n]));
  return `${dashboardFiltersHtml(report)}<div class='dash-metrics'>${dashboardMetric('Ativos no filtro', a.total, 'equipamentos encontrados')}${dashboardMetric('Em uso', counts.assigned, 'atribuídos')}${dashboardMetric('Backup', counts.backup, 'disponíveis')}${dashboardMetric('Manutenção', counts.maintenance, 'em atendimento')}${dashboardMetric('Desativados', counts.retired, 'fora de uso')}</div><div class='dash-grid'>${dashboardPanel('Ativos por equipamento', dashboardBars(a.byType))}${dashboardPanel('Situação dos ativos', dashboardDonut(a.byStatus, dashboardAssetStatus))}</div><div class='dash-grid'>${dashboardPanel('Ativos atualizados recentemente', dashboardRecentAssets(a.recent), 'dash-wide')}</div>`;
}
function dashboardTickets(report) {
  const t = report.tickets;
  const resolved = t.total ? Math.round((t.resolved / t.total) * 100) : 0;
  return `${dashboardFiltersHtml(report)}<div class='dash-metrics'>${dashboardMetric('Chamados', t.total, 'no filtro atual')}${dashboardMetric('Resolvidos', t.resolved, `${resolved}% do total`)}${dashboardMetric('Pendentes', t.pending, 'abertos ou em andamento')}${dashboardMetric('Solicitantes', t.requesters, 'funcionários distintos')}</div><div class='dash-grid dash-grid-3'>${dashboardPanel('Evolução mensal', dashboardMonths(t.monthly, dashboardFilters.year))}${dashboardPanel('Principais categorias', dashboardBars(t.byType))}${dashboardPanel('Status dos chamados', dashboardDonut(t.byStatus, dashboardTicketStatus))}</div><div class='dash-grid'>${dashboardPanel('Chamados mais recentes', dashboardRecentTickets(t.recent), 'dash-wide')}</div>`;
}
function renderDashboard(report) {
  const tabs = [
    ['summary', 'Resumo executivo'],
    ['assets', 'Dashboard de ativos'],
    ['tickets', 'Dashboard de chamados']
  ];
  app.innerHTML = `<div class='dash'><div class='dash-heading'><div><h1>Dashboard — Gestão de TI</h1><p>Indicadores calculados a partir dos registros do sistema.</p></div><button type='button' data-dash-import>Importar Excel</button></div><div class='dash-tabs' role='tablist'>${tabs.map(([key, label]) => `<button type='button' role='tab' aria-selected='${dashboardTab === key}' class='${dashboardTab === key ? 'active' : ''}' data-dash-tab='${key}'>${label}</button>`).join('')}</div>${dashboardTab === 'assets' ? dashboardAssets(report) : dashboardTab === 'tickets' ? dashboardTickets(report) : dashboardSummary(report)}</div>`;
  const root = app.querySelector('.dash');
  root.onclick = (event) => {
    const tab = event.target.closest('[data-dash-tab]');
    if (tab) return dashboard(tab.dataset.dashTab);
    if (event.target.closest('[data-dash-clear]')) {
      if (dashboardTab === 'assets') {
        dashboardFilters.assetStatus = '';
        dashboardFilters.assetType = '';
      }
      if (dashboardTab === 'tickets') {
        dashboardFilters.year = '';
        dashboardFilters.month = '';
        dashboardFilters.ticketStatus = '';
        dashboardFilters.ticketType = '';
      }
      return dashboard();
    }
    if (event.target.closest('[data-dash-import]')) {
      document.body.classList.remove('dashboard-mode');
      document
        .querySelectorAll('.nav')
        .forEach((button) => button.classList.toggle('active', button.dataset.page === 'import'));
      importPage();
    }
  };
  root.onchange = (event) => {
    const key = event.target.dataset.dashFilter;
    if (!key) return;
    dashboardFilters[key] = event.target.value;
    dashboard();
  };
}
