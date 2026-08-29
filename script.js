// ---- Setup ----
const descInput = document.getElementById('desc');
const amountInput = document.getElementById('amount');
const categoryInput = document.getElementById('category');
const addBtn = document.getElementById('addBtn');
const itemsList = document.getElementById('itemsList');
const emptyMsg = document.getElementById('emptyMsg');
const grandTotalEl = document.getElementById('grandTotal');
const categoryBarsEl = document.getElementById('categoryBars');
const todayEl = document.getElementById('today');

const STORAGE_KEY = 'ledger-expenses';
const CATEGORY_COLORS = ['Food', 'Transport', 'Bills', 'Fun', 'Other'];

todayEl.textContent = new Date().toLocaleDateString(undefined, {
  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
});

// ---- Load saved expenses (or start empty) ----
function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveExpenses(expenses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

let expenses = loadExpenses();

// ---- Add a new expense ----
addBtn.addEventListener('click', () => {
  const desc = descInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;

  if (!desc || isNaN(amount) || amount <= 0) {
    addBtn.textContent = 'FIX FIELDS!';
    setTimeout(() => { addBtn.textContent = 'RING UP +'; }, 1200);
    return;
  }

  expenses.push({ id: Date.now(), desc, amount, category });
  saveExpenses(expenses);

  descInput.value = '';
  amountInput.value = '';
  descInput.focus();

  render();
});

// allow Enter key to submit from the description field
descInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addBtn.click();
});
amountInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addBtn.click();
});

// ---- Delete an expense ----
function deleteExpense(id) {
  expenses = expenses.filter(item => item.id !== id);
  saveExpenses(expenses);
  render();
}

// ---- Render everything ----
function render() {
  // line items
  itemsList.innerHTML = '';

  if (expenses.length === 0) {
    itemsList.appendChild(emptyMsg);
  } else {
    expenses.forEach(item => {
      const row = document.createElement('div');
      row.className = 'line-item';
      row.innerHTML = `
        <span class="name"><span class="cat-tag">${item.category}</span>${escapeHtml(item.desc)}</span>
        <span class="leader"></span>
        <span class="price">$${item.amount.toFixed(2)}</span>
        <button class="del" title="remove">✕</button>
      `;
      row.querySelector('.del').addEventListener('click', () => deleteExpense(item.id));
      itemsList.appendChild(row);
    });
  }

  // grand total
  const grandTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  grandTotalEl.textContent = `$${grandTotal.toFixed(2)}`;

  // category breakdown
  categoryBarsEl.innerHTML = '';
  const totalsByCategory = {};
  CATEGORY_COLORS.forEach(cat => totalsByCategory[cat] = 0);
  expenses.forEach(item => {
    totalsByCategory[item.category] = (totalsByCategory[item.category] || 0) + item.amount;
  });

  const maxCat = Math.max(1, ...Object.values(totalsByCategory));

  CATEGORY_COLORS.forEach(cat => {
    const amt = totalsByCategory[cat] || 0;
    const pct = grandTotal > 0 ? Math.round((amt / maxCat) * 100) : 0;
    const row = document.createElement('div');
    row.className = `cat-bar-row ${cat}`;
    row.innerHTML = `
      <span>${cat}</span>
      <span class="cat-bar-track"><span class="cat-bar-fill" style="width:${pct}%"></span></span>
      <span class="cat-bar-amt">$${amt.toFixed(2)}</span>
    `;
    categoryBarsEl.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Initial paint ----
render();
