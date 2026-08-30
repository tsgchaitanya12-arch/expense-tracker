// ==================== Storage ====================
const K = {
  EXPENSES: 'ledger-expenses-v3',
  CATEGORIES: 'ledger-categories-v3',
  BUDGET: 'ledger-budget-v3',
  THEME: 'ledger-theme-v3',
  NAME: 'ledger-name-v3',
  GENDER: 'ledger-gender-v3',
  ACHIEVEMENTS: 'ledger-achievements-v3',
  GOALS: 'ledger-goals-v3',
  WIDGETS: 'ledger-widgets-v3',
};

const CAT_COLORS = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5'];
const DEFAULT_CATEGORIES = [
  { name: 'Food', color: '--cat-1' },
  { name: 'Transport', color: '--cat-2' },
  { name: 'Bills', color: '--cat-3' },
  { name: 'Fun', color: '--cat-4' },
  { name: 'Other', color: '--cat-5' },
];

function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch (e) { return fallback; }
}
function saveJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

let expenses = loadJSON(K.EXPENSES, []);
let categories = loadJSON(K.CATEGORIES, DEFAULT_CATEGORIES);
let budgetLimit = loadJSON(K.BUDGET, null);
let userName = localStorage.getItem(K.NAME) || '';
let userGender = localStorage.getItem(K.GENDER) || '';
let unlockedAchievements = loadJSON(K.ACHIEVEMENTS, []);
let goals = loadJSON(K.GOALS, []);
let widgetVisibility = loadJSON(K.WIDGETS, { digestCard: true, ringBlock: true, todayMonthBlock: true, heartbeatBlock: true, forecastBlock: true });
let chartInstance = null;
let currentCapture = 'manual';

// ==================== Helpers ====================
function todayStr() { return new Date().toISOString().slice(0, 10); }
function nowTimeStr() { const d = new Date(); return d.toTimeString().slice(0, 5); }
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function colorHex(varName) { return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888'; }
function categoryColor(name) { const c = categories.find(c => c.name === name); return c ? c.color : '--cat-5'; }
function fmt(n) { return `$${n.toFixed(2)}`; }
function dateObj(dateStr) { return new Date(dateStr + 'T00:00:00'); }

function monthExpenses(dateOffsetMonths = 0) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + dateOffsetMonths, 1);
  return expenses.filter(e => {
    const d = dateObj(e.date);
    return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
  });
}
function todayExpenses() {
  const t = todayStr();
  return expenses.filter(e => e.date === t);
}

// ==================== Elements ====================
const el = id => document.getElementById(id);

// ==================== Tab navigation ====================
document.getElementById('tabbar').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const screen = btn.dataset.screen;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  el(`screen-${screen}`).classList.remove('hidden');
  if (screen === 'insights') renderChart();
});

// ==================== Theme ====================
function initTheme() {
  const saved = localStorage.getItem(K.THEME) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}
el('themeToggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(K.THEME, next);
  render();
});

// ==================== Category select ====================
function populateCategorySelect() {
  const sel = el('category');
  sel.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.name; opt.textContent = cat.name;
    sel.appendChild(opt);
  });
  const addOpt = document.createElement('option');
  addOpt.value = '__new__'; addOpt.textContent = '+ Add new category';
  sel.appendChild(addOpt);

  const vf = el('vaultCategoryFilter');
  vf.innerHTML = '<option value="">All categories</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.name; opt.textContent = cat.name;
    vf.appendChild(opt);
  });
}
populateCategorySelect();

el('category').addEventListener('change', () => {
  if (el('category').value === '__new__') {
    el('newCatRow').classList.remove('hidden');
    el('newCatName').focus();
  }
});
el('confirmNewCat').addEventListener('click', () => {
  const name = el('newCatName').value.trim();
  if (!name) return;
  if (categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { el('newCatName').value = ''; return; }
  categories.push({ name, color: CAT_COLORS[categories.length % CAT_COLORS.length] });
  saveJSON(K.CATEGORIES, categories);
  populateCategorySelect();
  el('category').value = name;
  el('newCatRow').classList.add('hidden');
  el('newCatName').value = '';
});
el('cancelNewCat').addEventListener('click', () => {
  el('newCatRow').classList.add('hidden');
  el('category').value = categories[0] ? categories[0].name : '';
});

// ==================== Defaults for date/time ====================
el('dateInput').value = todayStr();
el('timeInput').value = nowTimeStr();

// ==================== Photo attach ====================
let pendingPhoto = null;
el('photoInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingPhoto = reader.result;
    el('photoPreview').src = pendingPhoto;
    el('photoPreview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

// ==================== Add expense (core) ====================
function addExpense({ desc, amount, category, date, time, photo, paymentMethod, tags }) {
  const entry = {
    id: Date.now(), desc, amount, category, date: date || todayStr(), time: time || nowTimeStr(),
    photo: photo || null, paymentMethod: paymentMethod || 'Other',
    tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
  };
  const anomaly = checkAnomaly(entry.amount);
  expenses.push(entry);
  saveJSON(K.EXPENSES, expenses);
  checkAchievements();
  render();
  if (anomaly) showAnomalyBanner(entry);
}

el('addBtn').addEventListener('click', () => {
  const desc = el('desc').value.trim();
  const amount = parseFloat(el('amount').value);
  const category = el('category').value === '__new__' ? '' : el('category').value;
  const date = el('dateInput').value || todayStr();
  const time = el('timeInput').value || nowTimeStr();

  if (!desc || isNaN(amount) || amount <= 0 || !category) {
    el('addBtn').textContent = 'Fix the fields above';
    setTimeout(() => { el('addBtn').textContent = 'Add expense'; }, 1200);
    return;
  }

  addExpense({
    desc, amount, category, date, time, photo: pendingPhoto,
    paymentMethod: el('paymentMethod').value, tags: el('tagsInput').value,
  });

  el('desc').value = ''; el('amount').value = ''; el('tagsInput').value = '';
  el('dateInput').value = todayStr(); el('timeInput').value = nowTimeStr();
  pendingPhoto = null;
  el('photoPreview').classList.add('hidden');
  el('photoInput').value = '';
  el('desc').focus();
});

// ==================== Capture tabs ====================
el('captureTabs').addEventListener('click', e => {
  const btn = e.target.closest('.cap-tab');
  if (!btn) return;
  currentCapture = btn.dataset.cap;
  document.querySelectorAll('.cap-tab').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.cap-panel').forEach(p => p.classList.add('hidden'));
  el(`cap-${currentCapture}`).classList.remove('hidden');
});

// ==================== Voice input ====================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  el('voiceBtn').addEventListener('click', () => {
    el('voiceBtn').classList.add('listening');
    el('voiceStatus').textContent = 'Listening...';
    recognition.start();
  });
  recognition.onresult = e => {
    const transcript = e.results[0][0].transcript;
    el('voiceStatus').textContent = `Heard: "${transcript}"`;
    parseFreeText(transcript);
  };
  recognition.onerror = () => {
    el('voiceStatus').textContent = "Couldn't hear that — try again or use manual entry.";
  };
  recognition.onend = () => { el('voiceBtn').classList.remove('listening'); };
} else {
  el('voiceBtn').addEventListener('click', () => {
    el('voiceStatus').textContent = "Voice input isn't supported in this browser — try Chrome, or use manual entry.";
  });
}

// ==================== Paste / free-text parsing ====================
function guessCategory(text) {
  const t = text.toLowerCase();
  const map = {
    Food: ['dinner', 'lunch', 'breakfast', 'restaurant', 'zomato', 'swiggy', 'coffee', 'food'],
    Transport: ['uber', 'ola', 'taxi', 'cab', 'metro', 'bus', 'fuel', 'petrol'],
    Bills: ['bill', 'electricity', 'recharge', 'rent', 'wifi', 'internet'],
    Fun: ['movie', 'steam', 'game', 'netflix', 'spotify'],
  };
  for (const [cat, keywords] of Object.entries(map)) {
    if (keywords.some(k => t.includes(k)) && categories.some(c => c.name === cat)) return cat;
  }
  return categories[0] ? categories[0].name : 'Other';
}

function parseFreeText(text) {
  const amountMatch = text.match(/(?:rs\.?|₹|\$)?\s?(\d+(?:[.,]\d{1,2})?)/i);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '.')) : null;

  let desc = text
    .replace(/spent|paid|spend/gi, '')
    .replace(/(?:rs\.?|₹|\$)\s?\d+(?:[.,]\d{1,2})?/gi, '')
    .replace(/\bon\b|\bat\b|\bfor\b/gi, '')
    .replace(/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!desc) desc = 'Expense';

  const category = guessCategory(text);

  el('captureTabs').querySelector('[data-cap="manual"]').click();
  el('desc').value = desc.slice(0, 32);
  if (amount) el('amount').value = amount;
  el('category').value = category;
  el('desc').focus();
}

el('parsePasteBtn').addEventListener('click', () => {
  const text = el('pasteInput').value.trim();
  if (!text) return;
  parseFreeText(text);
});

// ==================== CSV import / export ====================
el('csvImportInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const lines = reader.result.split('\n').map(l => l.trim()).filter(Boolean);
    lines.slice(1).forEach(line => {
      const cols = line.match(/(".*?"|[^,]+)/g);
      if (!cols || cols.length < 4) return;
      const [date, descRaw, category, amountRaw] = cols;
      const desc = descRaw.replace(/^"|"$/g, '').replace(/""/g, '"');
      const amount = parseFloat(amountRaw);
      if (!date || !desc || isNaN(amount)) return;
      if (!categories.some(c => c.name === category)) {
        categories.push({ name: category, color: CAT_COLORS[categories.length % CAT_COLORS.length] });
      }
      expenses.push({ id: Date.now() + Math.random(), desc, amount, category, date: date.trim(), time: '12:00', photo: null });
    });
    saveJSON(K.EXPENSES, expenses);
    saveJSON(K.CATEGORIES, categories);
    populateCategorySelect();
    checkAchievements();
    render();
  };
  reader.readAsText(file);
});

el('exportBtn').addEventListener('click', () => {
  if (expenses.length === 0) return;
  const header = 'Date,Item,Category,Amount\n';
  const rows = expenses.slice().sort((a, b) => a.date.localeCompare(b.date))
    .map(e => `${e.date},"${e.desc.replace(/"/g, '""')}",${e.category},${e.amount.toFixed(2)}`).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `ledger-expenses-${todayStr()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ==================== Anomaly detection ====================
function checkAnomaly(amount) {
  const past = expenses.map(e => e.amount);
  if (past.length < 5) return false;
  const mean = past.reduce((s, a) => s + a, 0) / past.length;
  const variance = past.reduce((s, a) => s + (a - mean) ** 2, 0) / past.length;
  const std = Math.sqrt(variance);
  const threshold = std > 0 ? mean + 3 * std : mean * 3;
  return amount > threshold && amount > mean * 2;
}
function showAnomalyBanner(entry) {
  const banner = el('anomalyBanner');
  banner.innerHTML = `⚠ <strong>${fmt(entry.amount)}</strong> for "${escapeHtml(entry.desc)}" is unusually high compared to your typical spending.
    <div><button id="anomalyOk">This was me</button><button id="anomalyDismiss">Dismiss</button></div>`;
  banner.classList.remove('hidden');
  el('anomalyOk').addEventListener('click', () => banner.classList.add('hidden'));
  el('anomalyDismiss').addEventListener('click', () => banner.classList.add('hidden'));
}

// ==================== Achievements & health ====================
const ACHIEVEMENT_DEFS = [
  { id: 'first', emoji: '🌱', label: 'First entry', test: () => expenses.length >= 1 },
  { id: 'ten', emoji: '🔟', label: '10 logged', test: () => expenses.length >= 10 },
  { id: 'fifty', emoji: '🏆', label: '50 logged', test: () => expenses.length >= 50 },
  { id: 'streak7', emoji: '🔥', label: '7-day streak', test: () => calcStreak() >= 7 },
  { id: 'diverse', emoji: '🎨', label: '4+ categories used', test: () => new Set(expenses.map(e => e.category)).size >= 4 },
  { id: 'underbudget', emoji: '✅', label: 'Under budget', test: () => budgetLimit && monthExpenses().reduce((s, e) => s + e.amount, 0) <= budgetLimit },
];
function checkAchievements() {
  ACHIEVEMENT_DEFS.forEach(a => {
    if (!unlockedAchievements.includes(a.id) && a.test()) unlockedAchievements.push(a.id);
  });
  saveJSON(K.ACHIEVEMENTS, unlockedAchievements);
}
function calcStreak() {
  const days = new Set(expenses.map(e => e.date));
  let streak = 0;
  let cursor = new Date();
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}
function healthScore() {
  const rows = healthBreakdown();
  const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
  return Math.max(0, Math.min(100, Math.round(avg)));
}

// ==================== Goals ====================
el('addGoalBtn').addEventListener('click', () => {
  const name = el('goalName').value.trim();
  const target = parseFloat(el('goalTarget').value);
  const monthly = parseFloat(el('goalMonthly').value) || 0;
  if (!name || isNaN(target) || target <= 0) return;
  goals.push({ id: Date.now(), name, target, current: 0, monthly });
  saveJSON(K.GOALS, goals);
  el('goalName').value = ''; el('goalTarget').value = ''; el('goalMonthly').value = '';
  renderGoals();
});
function deleteGoal(id) {
  goals = goals.filter(g => g.id !== id);
  saveJSON(K.GOALS, goals);
  renderGoals();
}
function addToGoal(id, amount) {
  const g = goals.find(g => g.id === id);
  if (!g) return;
  g.current = Math.min(g.target, g.current + amount);
  saveJSON(K.GOALS, goals);
  renderGoals();
}
function renderGoals() {
  const container = el('goalsList');
  container.innerHTML = '';
  if (goals.length === 0) { container.innerHTML = '<p class="empty">— no goals yet, create one above —</p>'; return; }
  goals.forEach(g => {
    const pct = Math.min(100, Math.round((g.current / g.target) * 100));
    const remaining = Math.max(0, g.target - g.current);
    const monthsLeft = g.monthly > 0 ? Math.ceil(remaining / g.monthly) : null;
    const card = document.createElement('div');
    card.className = 'card goal-card';
    card.innerHTML = `
      <div class="goal-head"><span class="name">${escapeHtml(g.name)}</span><span class="amt">${fmt(g.current)} / ${fmt(g.target)}</span></div>
      <div class="budget-track"><div class="budget-fill" style="width:${pct}%"></div></div>
      ${monthsLeft !== null ? `<p class="goal-eta">At ${fmt(g.monthly)}/month → about ${monthsLeft} month${monthsLeft === 1 ? '' : 's'} to go.</p>` : ''}
      <div class="field-grid" style="margin-top:10px;">
        <button class="ghost-btn add25">+ ${fmt(g.monthly || 500)}</button>
        <button class="goal-del">Delete goal</button>
      </div>
    `;
    card.querySelector('.add25').addEventListener('click', () => addToGoal(g.id, g.monthly || 500));
    card.querySelector('.goal-del').addEventListener('click', () => deleteGoal(g.id));
    container.appendChild(card);
  });
}

// ==================== Widget personalization ====================
el('widgetToggles').addEventListener('change', e => {
  const cb = e.target.closest('input[type="checkbox"]');
  if (!cb) return;
  widgetVisibility[cb.dataset.widget] = cb.checked;
  saveJSON(K.WIDGETS, widgetVisibility);
  applyWidgetVisibility();
});
function applyWidgetVisibility() {
  Object.entries(widgetVisibility).forEach(([id, visible]) => {
    const node = el(id);
    if (node) node.classList.toggle('hidden', !visible);
  });
  document.querySelectorAll('#widgetToggles input[type="checkbox"]').forEach(cb => {
    cb.checked = widgetVisibility[cb.dataset.widget] !== false;
  });
}

// ==================== Digest ====================
function renderDigest() {
  const month = monthExpenses();
  if (month.length === 0) { el('digestText').textContent = "No expenses logged this month yet — add your first one to start building your monthly story."; return; }
  const total = month.reduce((s, e) => s + e.amount, 0);
  const totals = {};
  month.forEach(e => totals[e.category] = (totals[e.category] || 0) + e.amount);
  const topCat = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  const biggest = month.reduce((m, e) => e.amount > m.amount ? e : m, month[0]);

  const dayCounts = {};
  month.forEach(e => { const d = dateObj(e.date).toLocaleDateString(undefined, { weekday: 'long' }); dayCounts[d] = (dayCounts[d] || 0) + 1; });
  const activeDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];

  const lastTotal = monthExpenses(-1).reduce((s, e) => s + e.amount, 0);
  let trendLine = '';
  if (lastTotal > 0) {
    const diff = Math.round(((total - lastTotal) / lastTotal) * 100);
    trendLine = ` That's ${Math.abs(diff)}% ${diff <= 0 ? 'less' : 'more'} than last month.`;
  }

  el('digestText').textContent =
    `You've spent ${fmt(total)} across ${month.length} transactions this month.${trendLine} ` +
    `${topCat ? `Your biggest category is ${topCat[0]} at ${fmt(topCat[1])}.` : ''} ` +
    `${biggest ? `Largest single purchase: ${fmt(biggest.amount)} on "${biggest.desc}".` : ''} ` +
    `${activeDay ? `You tend to spend most on ${activeDay[0]}s.` : ''}`;
}

// ==================== Explainable health score ====================
function healthBreakdown() {
  const monthTotal = monthExpenses().reduce((s, e) => s + e.amount, 0);
  const streak = calcStreak();
  const catCount = new Set(expenses.map(e => e.category)).size;
  const goalProgress = goals.length > 0
    ? Math.round(goals.reduce((s, g) => s + Math.min(1, g.current / g.target), 0) / goals.length * 100)
    : null;

  const rows = [];
  if (budgetLimit) {
    const score = monthTotal <= budgetLimit ? 100 : Math.max(0, 100 - Math.round(((monthTotal - budgetLimit) / budgetLimit) * 100));
    rows.push({ label: 'Budget consistency', score, explain: monthTotal <= budgetLimit ? `You're within your ${fmt(budgetLimit)} monthly budget.` : `You're ${fmt(monthTotal - budgetLimit)} over your monthly budget.` });
  } else {
    rows.push({ label: 'Budget consistency', score: 50, explain: 'Set a monthly budget in Settings to track this properly.' });
  }
  const streakScore = Math.min(100, Math.round((streak / 14) * 100));
  rows.push({ label: 'Logging consistency', score: streakScore, explain: `${streak}-day current logging streak.` });

  const diversityScore = Math.min(100, catCount * 20);
  rows.push({ label: 'Spending diversity', score: diversityScore, explain: `Spending logged across ${catCount} categor${catCount === 1 ? 'y' : 'ies'}.` });

  if (goalProgress !== null) {
    rows.push({ label: 'Goal progress', score: goalProgress, explain: `Averaging ${goalProgress}% progress across ${goals.length} goal${goals.length === 1 ? '' : 's'}.` });
  } else {
    rows.push({ label: 'Goal progress', score: 0, explain: 'No goals set yet — create one in the Goals tab.' });
  }
  return rows;
}
function renderHealthBreakdown() {
  const rows = healthBreakdown();
  const container = el('healthBreakdown');
  container.innerHTML = '';
  rows.forEach(r => {
    const div = document.createElement('div');
    div.className = 'health-row';
    div.innerHTML = `
      <div class="health-row-top"><span>${r.label}</span><span>${r.score}</span></div>
      <div class="health-track"><div class="health-fill" style="width:${r.score}%"></div></div>
      <p class="health-row-explain">${r.explain}</p>
    `;
    container.appendChild(div);
  });
}

// ==================== Settings ====================
el('saveSettings').addEventListener('click', () => {
  userName = el('nameInput').value.trim();
  localStorage.setItem(K.NAME, userName);
  userGender = el('genderInput').value;
  localStorage.setItem(K.GENDER, userGender);
  const val = parseFloat(el('budgetInput').value);
  budgetLimit = isNaN(val) || val <= 0 ? null : val;
  saveJSON(K.BUDGET, budgetLimit);
  render();
});

// ==================== Assistant ====================
function answerQuestion(q) {
  const text = q.toLowerCase();
  const month = monthExpenses();
  const lastMonth = monthExpenses(-1);
  const monthTotal = month.reduce((s, e) => s + e.amount, 0);
  const lastTotal = lastMonth.reduce((s, e) => s + e.amount, 0);

  const catMatch = categories.find(c => text.includes(c.name.toLowerCase()));
  if (catMatch) {
    const spent = month.filter(e => e.category === catMatch.name).reduce((s, e) => s + e.amount, 0);
    const spentLast = lastMonth.filter(e => e.category === catMatch.name).reduce((s, e) => s + e.amount, 0);
    if (spentLast === 0) return `You've spent ${fmt(spent)} on ${catMatch.name} this month.`;
    const diff = Math.round(((spent - spentLast) / spentLast) * 100);
    return `You spent ${fmt(spent)} on ${catMatch.name} this month, which is ${Math.abs(diff)}% ${diff >= 0 ? 'higher' : 'lower'} than last month.`;
  }

  if (text.includes('too much') || text.includes('increase')) {
    let worst = null, worstPct = -Infinity;
    categories.forEach(c => {
      const spent = month.filter(e => e.category === c.name).reduce((s, e) => s + e.amount, 0);
      const spentLast = lastMonth.filter(e => e.category === c.name).reduce((s, e) => s + e.amount, 0);
      if (spentLast > 0) {
        const pct = ((spent - spentLast) / spentLast) * 100;
        if (pct > worstPct) { worstPct = pct; worst = { name: c.name, spent }; }
      }
    });
    if (!worst || worstPct <= 0) return "Nothing stands out as increasing — your spending looks fairly steady across categories.";
    return `Your ${worst.name} spending increased ${Math.round(worstPct)}% this month, now at ${fmt(worst.spent)}.`;
  }

  if (text.includes('compare')) {
    if (lastTotal === 0) return `You've spent ${fmt(monthTotal)} this month. No data from last month to compare yet.`;
    const diff = Math.round(((monthTotal - lastTotal) / lastTotal) * 100);
    return `This month: ${fmt(monthTotal)}, last month: ${fmt(lastTotal)} — that's ${Math.abs(diff)}% ${diff >= 0 ? 'more' : 'less'}.`;
  }

  if (text.includes('where') && text.includes('money')) {
    const totals = {};
    month.forEach(e => totals[e.category] = (totals[e.category] || 0) + e.amount);
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return "No expenses logged this month yet.";
    return `Biggest categories this month: ${sorted.slice(0, 3).map(([name, amt]) => `${name} (${fmt(amt)})`).join(', ')}.`;
  }

  return `You've spent ${fmt(monthTotal)} this month across ${month.length} transactions. Try asking about a specific category, or say "compare this month".`;
}
el('assistantAsk').addEventListener('click', () => {
  const q = el('assistantInput').value.trim();
  if (!q) return;
  el('assistantAnswer').textContent = answerQuestion(q);
});
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    el('assistantInput').value = chip.dataset.q;
    el('assistantAnswer').textContent = answerQuestion(chip.dataset.q);
  });
});

// ==================== Render: Home ====================
function renderHome() {
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const honorific = userGender === 'male' ? ', sir' : userGender === 'female' ? ", ma'am" : '';
  el('greeting').textContent = `${timeGreeting},`;
  el('greetName').textContent = `${userName || 'friend'}${honorific}`;

  const month = monthExpenses();
  const monthTotal = month.reduce((s, e) => s + e.amount, 0);
  const available = budgetLimit ? Math.max(0, budgetLimit - monthTotal) : monthTotal;
  el('availableBalance').textContent = fmt(available);

  el('budgetSpentCaption').textContent = `${fmt(monthTotal)} spent`;
  el('budgetLimitCaption').textContent = budgetLimit ? `of ${fmt(budgetLimit)}` : 'no limit set';
  const pct = budgetLimit ? Math.min(100, (monthTotal / budgetLimit) * 100) : 0;
  el('budgetFill').style.width = `${pct}%`;
  el('budgetFill').classList.toggle('over', budgetLimit && monthTotal > budgetLimit);

  const lastTotal = monthExpenses(-1).reduce((s, e) => s + e.amount, 0);
  const trendEl = el('trendLine');
  if (lastTotal > 0) {
    const diff = Math.round(((monthTotal - lastTotal) / lastTotal) * 100);
    trendEl.textContent = diff <= 0 ? `↓ ${Math.abs(diff)}% better than last month` : `↑ ${diff}% more than last month`;
    trendEl.className = `trend ${diff <= 0 ? 'down' : 'up'}`;
  } else {
    trendEl.textContent = '';
  }

  // Ring: top category this month
  const totals = {};
  month.forEach(e => totals[e.category] = (totals[e.category] || 0) + e.amount);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const circumference = 364.4;
  if (sorted.length > 0 && monthTotal > 0) {
    const [topCat, topAmt] = sorted[0];
    const share = topAmt / monthTotal;
    el('ringCat').textContent = topCat;
    el('ringAmt').textContent = fmt(topAmt);
    el('ringPct').textContent = `${Math.round(share * 100)}% of spend`;
    el('ringFill').style.stroke = colorHex(categoryColor(topCat));
    el('ringFill').style.strokeDashoffset = circumference * (1 - share);
  } else {
    el('ringCat').textContent = '—';
    el('ringAmt').textContent = '$0.00';
    el('ringPct').textContent = '0% of spend';
    el('ringFill').style.strokeDashoffset = circumference;
  }

  // Today / month lists
  renderMiniList('todayList', todayExpenses());
  renderMiniList('monthList', month);

  // Heartbeat
  renderHeartbeat(todayExpenses());

  // Forecast
  renderForecast(month, monthTotal);
}

function renderMiniList(elementId, list) {
  const container = el(elementId);
  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = '<p class="mini-empty">Nothing yet</p>';
    return;
  }
  const totals = {};
  list.forEach(e => totals[e.category] = (totals[e.category] || 0) + e.amount);
  Object.entries(totals).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
    const row = document.createElement('div');
    row.className = 'mini-row';
    row.innerHTML = `<span class="mrl">${escapeHtml(cat)}</span><span>${fmt(amt)}</span>`;
    container.appendChild(row);
  });
}

function renderHeartbeat(list) {
  const container = el('heartbeat');
  container.innerHTML = '<div class="line"></div>';
  if (list.length === 0) return;
  list.forEach(e => {
    const [h, m] = (e.time || '12:00').split(':').map(Number);
    const pct = ((h * 60 + m) / 1440) * 100;
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.left = `${pct}%`;
    dot.title = `${e.time} — ${e.desc} (${fmt(e.amount)})`;
    container.appendChild(dot);
  });
}

function renderForecast(month, monthTotal) {
  const now = new Date();
  const daysElapsed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = daysElapsed > 0 ? (monthTotal / daysElapsed) * daysInMonth : 0;

  el('forecastCurrent').textContent = fmt(monthTotal);
  el('forecastProjected').textContent = fmt(projected);

  const pct = budgetLimit ? Math.min(100, (projected / budgetLimit) * 100) : Math.min(100, (monthTotal / (projected || 1)) * 100);
  el('forecastFill').style.width = `${pct}%`;
  el('forecastFill').classList.toggle('over', budgetLimit && projected > budgetLimit);

  const warnEl = el('forecastWarning');
  if (budgetLimit && projected > budgetLimit) {
    warnEl.textContent = `⚠ You're trending ${fmt(projected - budgetLimit)} above your budget this month.`;
    warnEl.classList.remove('hidden');
  } else {
    warnEl.classList.add('hidden');
  }
}

// ==================== Render: Vault ====================
function renderVault() {
  const search = el('vaultSearch').value.toLowerCase();
  const catFilter = el('vaultCategoryFilter').value;
  const filtered = expenses.filter(e =>
    (!catFilter || e.category === catFilter) &&
    (!search || e.desc.toLowerCase().includes(search) || e.category.toLowerCase().includes(search) ||
      (e.tags || []).some(t => t.toLowerCase().includes(search)))
  ).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  const container = el('vaultList');
  container.innerHTML = '';
  if (filtered.length === 0) {
    container.innerHTML = '<p class="empty">— no receipts match —</p>';
    return;
  }

  let lastMonthLabel = '';
  filtered.forEach(e => {
    const monthLabel = dateObj(e.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (monthLabel !== lastMonthLabel) {
      const label = document.createElement('p');
      label.className = 'vault-group-label';
      label.textContent = monthLabel;
      container.appendChild(label);
      lastMonthLabel = monthLabel;
    }
    const row = document.createElement('div');
    row.className = 'vault-item';
    row.innerHTML = `
      ${e.photo ? `<img class="vault-thumb" src="${e.photo}">` : `<div class="vault-thumb-placeholder">🧾</div>`}
      <div class="vault-meta">
        <div class="vault-desc">${escapeHtml(e.desc)}</div>
        <div class="vault-sub">${e.category} · ${e.date} · ${e.paymentMethod || 'Other'}${(e.tags && e.tags.length) ? ' · ' + e.tags.map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('') : ''}</div>
      </div>
      <div class="vault-amt">${fmt(e.amount)}</div>
    `;
    container.appendChild(row);
  });
}
el('vaultSearch').addEventListener('input', renderVault);
el('vaultCategoryFilter').addEventListener('change', renderVault);

// ==================== Render: Insights ====================
function renderChart() {
  const month = monthExpenses();
  const totals = {};
  categories.forEach(c => totals[c.name] = 0);
  month.forEach(e => totals[e.category] = (totals[e.category] || 0) + e.amount);
  const labels = Object.keys(totals).filter(k => totals[k] > 0);
  const data = labels.map(k => totals[k]);
  const bg = labels.map(name => colorHex(categoryColor(name)));

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  if (labels.length === 0) { el('chartEmptyMsg').classList.remove('hidden'); return; }
  el('chartEmptyMsg').classList.add('hidden');

  chartInstance = new Chart(el('categoryChart').getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bg, borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: colorHex('--text'), font: { family: 'Inter', size: 11 } } } } },
  });
}

function renderHeatmap() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const topCats = categories.slice(0, 4);
  const totals = {};
  topCats.forEach(c => totals[c.name] = new Array(7).fill(0));

  expenses.forEach(e => {
    if (!totals[e.category]) return;
    const d = dateObj(e.date);
    const dayIdx = (d.getDay() + 6) % 7; // Mon=0
    totals[e.category][dayIdx] += e.amount;
  });

  let maxVal = 1;
  topCats.forEach(c => { totals[c.name].forEach(v => { if (v > maxVal) maxVal = v; }); });

  const container = el('heatmap');
  container.innerHTML = '<div></div>' + days.map(d => `<div class="hm-head">${d}</div>`).join('');
  topCats.forEach(c => {
    container.innerHTML += `<div class="hm-label">${c.name}</div>`;
    totals[c.name].forEach(v => {
      const opacity = v > 0 ? 0.15 + 0.85 * (v / maxVal) : 0;
      container.innerHTML += `<div class="hm-cell" style="background:${colorHex(c.color)}; opacity:${opacity || 0.06}"></div>`;
    });
  });
}

function renderTimeInsight() {
  const withTime = expenses.filter(e => e.time);
  if (withTime.length < 5) { el('timeInsight').textContent = 'Log a few more expenses to unlock this insight.'; return; }
  let eveningTotal = 0, restTotal = 0;
  withTime.forEach(e => {
    const hour = parseInt(e.time.split(':')[0], 10);
    if (hour >= 18 && hour <= 23) eveningTotal += e.amount; else restTotal += e.amount;
  });
  if (restTotal === 0) { el('timeInsight').textContent = 'Most of your spending happens in the evening.'; return; }
  const evAvg = eveningTotal / 6;
  const restAvg = restTotal / 18;
  const diffPct = Math.round(((evAvg - restAvg) / restAvg) * 100);
  if (diffPct > 10) el('timeInsight').textContent = `You spend about ${diffPct}% more per hour between 6–11 PM than during the rest of the day.`;
  else if (diffPct < -10) el('timeInsight').textContent = `Your evenings (6–11 PM) are actually lighter on spending than the rest of the day.`;
  else el('timeInsight').textContent = 'Your spending is fairly evenly spread across the day.';
}

function renderMerchantRanking() {
  const totals = {};
  expenses.forEach(e => totals[e.desc] = (totals[e.desc] || 0) + e.amount);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const container = el('merchantRanking');
  container.innerHTML = '';
  if (sorted.length === 0) { container.innerHTML = '<p class="mini-empty">No transactions yet</p>'; return; }
  sorted.forEach(([name, amt], i) => {
    const row = document.createElement('div');
    row.className = 'mini-row';
    row.innerHTML = `<span class="mrl">${String(i + 1).padStart(2, '0')} ${escapeHtml(name)}</span><span>${fmt(amt)}</span>`;
    container.appendChild(row);
  });
}

el('whatIfInput').addEventListener('input', renderWhatIf);
function renderWhatIf() {
  const weeklyCut = parseFloat(el('whatIfInput').value) || 0;
  const recent = expenses.filter(e => {
    const d = dateObj(e.date);
    return (Date.now() - d.getTime()) / 86400000 <= 28;
  });
  const weeklyAvg = recent.reduce((s, e) => s + e.amount, 0) / 4;
  const months = 6;
  const weeksInPeriod = months * 4.33;
  const currentPathSpend = weeklyAvg * weeksInPeriod;
  const smartPathSpend = Math.max(0, weeklyAvg - weeklyCut) * weeksInPeriod;
  const currentSaved = 0;
  const smartSaved = currentPathSpend - smartPathSpend;
  el('whatIfCurrent').textContent = `${fmt(currentSaved)} saved`;
  el('whatIfSmart').textContent = `${fmt(smartSaved)} saved`;
}

// ==================== Render: Me ====================
function renderMe() {
  el('nameInput').value = userName;
  el('genderInput').value = userGender;
  el('budgetInput').value = budgetLimit || '';
  el('healthScore').innerHTML = `${healthScore()}<span>/100</span>`;
  el('streakLine').textContent = `🔥 ${calcStreak()}-day logging streak`;

  const container = el('achievements');
  container.innerHTML = '';
  ACHIEVEMENT_DEFS.forEach(a => {
    const unlocked = unlockedAchievements.includes(a.id);
    const badge = document.createElement('div');
    badge.className = `badge ${unlocked ? 'unlocked' : ''}`;
    badge.innerHTML = `<span class="emoji">${a.emoji}</span>${a.label}`;
    container.appendChild(badge);
  });
}

// ==================== Main render ====================
function render() {
  renderHome();
  renderVault();
  renderHeatmap();
  renderTimeInsight();
  renderMerchantRanking();
  renderWhatIf();
  renderMe();
  renderGoals();
  renderDigest();
  renderHealthBreakdown();
  applyWidgetVisibility();
}

// ==================== Init ====================
initTheme();
checkAchievements();
render();
