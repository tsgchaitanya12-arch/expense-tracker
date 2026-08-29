// ---- Storage keys ----
const KEY_EXPENSES = 'ledger-expenses-v2';
const KEY_CATEGORIES = 'ledger-categories-v2';
const KEY_BUDGET = 'ledger-budget-v2';
const KEY_THEME = 'ledger-theme-v2';

const COLOR_CYCLE = ['--gold', '--green', '--red', '--purple', '--ink-soft'];

const DEFAULT_CATEGORIES = [
  { name: 'Food', color: '--gold' },
  { name: 'Transport', color: '--green' },
  { name: 'Bills', color: '--red' },
  { name: 'Fun', color: '--purple' },
  { name: 'Other', color: '--ink-soft' },
];

// ---- Elements ----
const els = {
  desc: document.getElementById('desc'),
  amount: document.getElementById('amount'),
  category: document.getElementById('category'),
  dateInput: document.getElementById('dateInput'),
  addBtn: document.getElementById('addBtn'),
  newCatRow: document.getElementById('newCatRow'),
  newCatName: document.getElementById('newCatName'),
  confirmNewCat: document.getElementById('confirmNewCat'),
  cancelNewCat: document.getElementById('cancelNewCat'),
  itemsList: document.getElementById('itemsList'),
  emptyMsg: document.getElementById('emptyMsg'),
  grandTotal: document.getElementById('grandTotal'),
  filterLabel: document.getElementById('filterLabel'),
  categoryBars: document.getElementById('categoryBars'),
  today: document.getElementById('today'),
  themeToggle: document.getElementById('themeToggle'),
  settingsToggle: document.getElementById('settingsToggle'),
  settingsPanel: document.getElementById('settingsPanel'),
  budgetInput: document.getElementById('budgetInput'),
  saveBudget: document.getElementById('saveBudget'),
  budgetSpentLabel: document.getElementById('budgetSpentLabel'),
  budgetLimitLabel: document.getElementById('budgetLimitLabel'),
  budgetFill: document.getElementById('budgetFill'),
  budgetWarning: document.getElementById('budgetWarning'),
  statSpent: document.getElementById('statSpent'),
  statBiggest: document.getElementById('statBiggest'),
  statAvg: document.getElementById('statAvg'),
  filterTabs: document.getElementById('filterTabs'),
  viewToggle: document.getElementById('viewToggle'),
  chartView: document.getElementById('chartView'),
  chartEmptyMsg: document.getElementById('chartEmptyMsg'),
  exportBtn: document.getElementById('exportBtn'),
};

let expenses = loadJSON(KEY_EXPENSES, []);
let categories = loadJSON(KEY_CATEGORIES, DEFAULT_CATEGORIES);
let budgetLimit = loadJSON(KEY_BUDGET, null);
let currentFilter = 'month';
let currentView = 'list';
let editingId = null;
let chartInstance = null;

// ---- Helpers ----
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function colorHex(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
}
function categoryColor(name) {
  const cat = categories.find(c => c.name === name);
  return cat ? cat.color : '--ink-soft';
}

// ---- Theme ----
function initTheme() {
  const saved = localStorage.getItem(KEY_THEME) || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}
els.themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(KEY_THEME, next);
  render(); // re-derive colors for chart/bars
});

// ---- Date display ----
els.today.textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
els.dateInput.value = todayStr();

// ---- Category select ----
function populateCategorySelect() {
  els.category.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.name;
    opt.textContent = cat.name;
    els.category.appendChild(opt);
  });
  const addOpt = document.createElement('option');
  addOpt.value = '__new__';
  addOpt.textContent = '+ Add new category';
  els.category.appendChild(addOpt);
}
populateCategorySelect();

els.category.addEventListener('change', () => {
  if (els.category.value === '__new__') {
    els.newCatRow.classList.remove('hidden');
    els.newCatName.focus();
  }
});
els.confirmNewCat.addEventListener('click', () => {
  const name = els.newCatName.value.trim();
  if (!name) return;
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    els.newCatName.value = '';
    return;
  }
  const color = COLOR_CYCLE[categories.length % COLOR_CYCLE.length];
  categories.push({ name, color });
  saveJSON(KEY_CATEGORIES, categories);
  populateCategorySelect();
  els.category.value = name;
  els.newCatRow.classList.add('hidden');
  els.newCatName.value = '';
});
els.cancelNewCat.addEventListener('click', () => {
  els.newCatRow.classList.add('hidden');
  els.newCatName.value = '';
  els.category.value = categories[0] ? categories[0].name : '';
});

// ---- Settings / budget ----
els.settingsToggle.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
  if (budgetLimit) els.budgetInput.value = budgetLimit;
});
els.saveBudget.addEventListener('click', () => {
  const val = parseFloat(els.budgetInput.value);
  budgetLimit = isNaN(val) || val <= 0 ? null : val;
  saveJSON(KEY_BUDGET, budgetLimit);
  els.settingsPanel.classList.add('hidden');
  render();
});

// ---- Add expense ----
els.addBtn.addEventListener('click', () => {
  const desc = els.desc.value.trim();
  const amount = parseFloat(els.amount.value);
  const category = els.category.value === '__new__' ? '' : els.category.value;
  const date = els.dateInput.value || todayStr();

  if (!desc || isNaN(amount) || amount <= 0 || !category) {
    els.addBtn.textContent = 'FIX FIELDS!';
    setTimeout(() => { els.addBtn.textContent = 'RING UP +'; }, 1200);
    return;
  }

  expenses.push({ id: Date.now(), desc, amount, category, date });
  saveJSON(KEY_EXPENSES, expenses);

  els.desc.value = '';
  els.amount.value = '';
  els.dateInput.value = todayStr();
  els.desc.focus();

  render();
});
els.desc.addEventListener('keydown', e => { if (e.key === 'Enter') els.addBtn.click(); });
els.amount.addEventListener('keydown', e => { if (e.key === 'Enter') els.addBtn.click(); });

// ---- Filter tabs ----
els.filterTabs.addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  currentFilter = btn.dataset.range;
  [...els.filterTabs.children].forEach(b => b.classList.toggle('active', b === btn));
  render();
});

// ---- View toggle ----
els.viewToggle.addEventListener('click', e => {
  const btn = e.target.closest('.view-btn');
  if (!btn) return;
  currentView = btn.dataset.view;
  [...els.viewToggle.children].forEach(b => b.classList.toggle('active', b === btn));
  els.itemsList.classList.toggle('hidden', currentView !== 'list');
  els.chartView.classList.toggle('hidden', currentView !== 'chart');
  render();
});

// ---- Filtering logic ----
function isInRange(dateStr, range) {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === 'today') {
    return d.getTime() === startOfToday.getTime();
  }
  if (range === 'week') {
    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 6);
    return d >= weekAgo && d <= startOfToday;
  }
  if (range === 'month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  return true; // 'all'
}

function getFiltered() {
  return expenses.filter(e => isInRange(e.date, currentFilter));
}

function getMonthExpenses() {
  return expenses.filter(e => isInRange(e.date, 'month'));
}

// ---- Delete / Edit ----
function deleteExpense(id) {
  expenses = expenses.filter(item => item.id !== id);
  saveJSON(KEY_EXPENSES, expenses);
  render();
}
function startEdit(id) {
  editingId = id;
  render();
}
function cancelEdit() {
  editingId = null;
  render();
}
function saveEdit(id, descVal, amountVal, categoryVal, dateVal) {
  const item = expenses.find(e => e.id === id);
  if (!item) return;
  const amt = parseFloat(amountVal);
  if (!descVal.trim() || isNaN(amt) || amt <= 0 || !categoryVal) return;
  item.desc = descVal.trim();
  item.amount = amt;
  item.category = categoryVal;
  item.date = dateVal || item.date;
  saveJSON(KEY_EXPENSES, expenses);
  editingId = null;
  render();
}

// ---- Render: list ----
function renderList(filtered) {
  els.itemsList.innerHTML = '';
  if (filtered.length === 0) {
    els.itemsList.appendChild(els.emptyMsg);
    return;
  }
  filtered.slice().reverse().forEach(item => {
    if (editingId === item.id) {
      const row = document.createElement('div');
      row.className = 'edit-row';
      const catOptions = categories.map(c => `<option value="${c.name}" ${c.name === item.category ? 'selected' : ''}>${c.name}</option>`).join('');
      row.innerHTML = `
        <input type="text" class="edit-desc" value="${escapeHtml(item.desc)}" maxlength="28">
        <input type="number" class="edit-amount" value="${item.amount}" step="0.01" min="0">
        <select class="edit-category">${catOptions}</select>
        <input type="date" class="edit-date" value="${item.date}">
        <span class="edit-actions">
          <button class="icon-mini save" title="Save">✓</button>
          <button class="icon-mini cancel" title="Cancel">✕</button>
        </span>
      `;
      row.querySelector('.save').addEventListener('click', () => {
        saveEdit(
          item.id,
          row.querySelector('.edit-desc').value,
          row.querySelector('.edit-amount').value,
          row.querySelector('.edit-category').value,
          row.querySelector('.edit-date').value
        );
      });
      row.querySelector('.cancel').addEventListener('click', cancelEdit);
      els.itemsList.appendChild(row);
    } else {
      const row = document.createElement('div');
      row.className = 'line-item';
      row.innerHTML = `
        <span class="meta">
          <span class="name"><span class="cat-tag">${escapeHtml(item.category)}</span>${escapeHtml(item.desc)}</span>
          <span class="sub-meta">${item.date}</span>
        </span>
        <span class="leader"></span>
        <span class="price">$${item.amount.toFixed(2)}</span>
        <span class="actions">
          <button class="icon-mini edit" title="Edit">✎</button>
          <button class="icon-mini del" title="Remove">✕</button>
        </span>
      `;
      row.querySelector('.edit').addEventListener('click', () => startEdit(item.id));
      row.querySelector('.del').addEventListener('click', () => deleteExpense(item.id));
      els.itemsList.appendChild(row);
    }
  });
}

// ---- Render: chart ----
function renderChart(filtered) {
  const totalsByCategory = {};
  categories.forEach(c => totalsByCategory[c.name] = 0);
  filtered.forEach(e => { totalsByCategory[e.category] = (totalsByCategory[e.category] || 0) + e.amount; });

  const labels = Object.keys(totalsByCategory).filter(k => totalsByCategory[k] > 0);
  const data = labels.map(k => totalsByCategory[k]);
  const bgColors = labels.map(name => colorHex(categoryColor(name)));

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  if (labels.length === 0) {
    els.chartEmptyMsg.classList.remove('hidden');
    return;
  }
  els.chartEmptyMsg.classList.add('hidden');

  const ctx = document.getElementById('categoryChart').getContext('2d');
  chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: bgColors, borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: colorHex('--ink'), font: { family: 'IBM Plex Mono', size: 11 } } },
      },
    },
  });
}

// ---- Render: category bars ----
function renderBars(filtered) {
  els.categoryBars.innerHTML = '';
  const totalsByCategory = {};
  categories.forEach(c => totalsByCategory[c.name] = 0);
  filtered.forEach(e => { totalsByCategory[e.category] = (totalsByCategory[e.category] || 0) + e.amount; });

  const maxCat = Math.max(1, ...Object.values(totalsByCategory));
  categories.forEach(cat => {
    const amt = totalsByCategory[cat.name] || 0;
    const pct = Math.round((amt / maxCat) * 100);
    const row = document.createElement('div');
    row.className = 'cat-bar-row';
    row.innerHTML = `
      <span>${cat.name}</span>
      <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${pct}%; background:${colorHex(cat.color)}"></span></span>
      <span class="cat-bar-amt">$${amt.toFixed(2)}</span>
    `;
    els.categoryBars.appendChild(row);
  });
}

// ---- Render: budget ----
function renderBudget() {
  const monthTotal = getMonthExpenses().reduce((s, e) => s + e.amount, 0);
  els.budgetSpentLabel.textContent = `$${monthTotal.toFixed(2)} spent this month`;

  if (!budgetLimit) {
    els.budgetLimitLabel.textContent = 'no limit set';
    els.budgetFill.style.width = '0%';
    els.budgetFill.classList.remove('over');
    els.budgetWarning.classList.add('hidden');
    return;
  }
  els.budgetLimitLabel.textContent = `of $${budgetLimit.toFixed(2)}`;
  const pct = Math.min(100, Math.round((monthTotal / budgetLimit) * 100));
  els.budgetFill.style.width = `${pct}%`;
  const over = monthTotal > budgetLimit;
  els.budgetFill.classList.toggle('over', over);
  els.budgetWarning.classList.toggle('hidden', !over);
}

// ---- Render: stats ----
function renderStats(filtered) {
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const biggest = filtered.reduce((m, e) => Math.max(m, e.amount), 0);

  let days = 1;
  if (currentFilter === 'week') days = 7;
  else if (currentFilter === 'month') {
    days = new Date().getDate();
  } else if (currentFilter === 'all') {
    if (expenses.length > 0) {
      const dates = expenses.map(e => new Date(e.date + 'T00:00:00').getTime());
      const earliest = Math.min(...dates);
      const diffDays = Math.round((Date.now() - earliest) / 86400000) + 1;
      days = Math.max(1, diffDays);
    }
  }
  const avg = total / days;

  els.statSpent.textContent = `$${total.toFixed(2)}`;
  els.statBiggest.textContent = `$${biggest.toFixed(2)}`;
  els.statAvg.textContent = `$${avg.toFixed(2)}`;
}

// ---- CSV export ----
els.exportBtn.addEventListener('click', () => {
  if (expenses.length === 0) return;
  const header = 'Date,Item,Category,Amount\n';
  const rows = expenses
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => `${e.date},"${e.desc.replace(/"/g, '""')}",${e.category},${e.amount.toFixed(2)}`)
    .join('\n');
  const csv = header + rows;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ledger-expenses-${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ---- Main render ----
function render() {
  const filtered = getFiltered();

  els.filterLabel.textContent = currentFilter;
  const total = filtered.reduce((s, e) => s + e.amount, 0);
  els.grandTotal.textContent = `$${total.toFixed(2)}`;

  if (currentView === 'list') {
    renderList(filtered);
  } else {
    renderChart(filtered);
  }
  renderBars(filtered);
  renderBudget();
  renderStats(filtered);
}

// ---- Init ----
initTheme();
render();
