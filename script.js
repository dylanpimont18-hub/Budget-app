// --- JEU DE DONNÉES PAR DÉFAUT ---
const defaultExpenses = [
    { id: 1, name: "Loyer", amount: 850, icon: "🏠", status: "active" },
    { id: 2, name: "Électricité", amount: 75, icon: "⚡", status: "active" },
    { id: 3, name: "Internet", amount: 40, icon: "🌐", status: "active" },
    { id: 4, name: "Assurance", amount: 35, icon: "🛡️", status: "active" },
    { id: 5, name: "Abonnements", amount: 15, icon: "🍿", status: "active" }
];

const EMOJI_CHOICES = ['📝','🏠','⚡','🌐','🛡️','🍿','🍽️','🚗','🎓','💊','🎮','📱','🐶','✈️','🎁','💇','🧾','☕','🛒','🎵'];
const SORT_LABELS = { default: '↕︎ Défaut', 'amount-desc': '💶 Montant ↓', name: '🔤 A-Z' };
const ONBOARD_KEY = 'comptesCommuns_onboarded';

let expenses = JSON.parse(localStorage.getItem('comptesCommuns')) || JSON.parse(JSON.stringify(defaultExpenses));
let currentIndex = 0;
let reviewSession = [];
let editExpenseId = null;
let selectedIcon = '📝';
let scenarioOverrides = JSON.parse(localStorage.getItem('comptesCommuns_scenario')) || {};
let scenarios = JSON.parse(localStorage.getItem('comptesCommuns_scenarios')) || {};
let swipeSortMode = localStorage.getItem('comptesCommuns_sortMode') || 'default';
let recapSearchTerm = '';
let recapSortMode = localStorage.getItem('comptesCommuns_recapSort') || 'default';

const moneyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
function fmtMoney(n) { return moneyFormatter.format(n); }

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

const expenseModal = document.getElementById('expense-modal');
const expenseForm = document.getElementById('expense-form');
const expenseNameInput = document.getElementById('expense-name');
const expenseAmountInput = document.getElementById('expense-amount');
const modalTitle = document.getElementById('modal-title');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelForm = document.getElementById('btn-cancel-form');
const btnSkipSwipe = document.getElementById('btn-skip-swipe');
const btnResetData = document.getElementById('btn-reset-data');
const summaryList = document.getElementById('summary-list');
const bottomNav = document.getElementById('bottom-nav');
const toastEl = document.getElementById('toast');

// --- NAVIGATION ---
const views = {
    home: document.getElementById('view-home'),
    swipe: document.getElementById('view-swipe'),
    recap: document.getElementById('view-recap'),
    compare: document.getElementById('view-compare')
};

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
    bottomNav.classList.toggle('hidden', viewName === 'swipe');
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === 'recap') updateRecap();
        if (view === 'compare') renderCompare();
        showView(view);
    });
});

// --- TOAST ---
let toastTimeout = null;
function showToast(message, { actionLabel, onAction, duration = 4000 } = {}) {
    clearTimeout(toastTimeout);
    toastEl.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = message;
    toastEl.appendChild(span);
    if (actionLabel && onAction) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.type = 'button';
        btn.textContent = actionLabel;
        btn.addEventListener('click', () => { onAction(); hideToast(); });
        toastEl.appendChild(btn);
    }
    toastEl.classList.add('show');
    toastTimeout = setTimeout(hideToast, duration);
}
function hideToast() { toastEl.classList.remove('show'); }

// --- ANIMATION DU TOTAL ---
function animateNumber(el, from, to) {
    if (isNaN(from)) from = to;
    const duration = 500;
    const start = performance.now();
    function frame(now) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = from + (to - from) * eased;
        el.textContent = fmtMoney(value);
        if (progress < 1) requestAnimationFrame(frame);
        else el.textContent = fmtMoney(to);
    }
    requestAnimationFrame(frame);
}

// --- HISTORIQUE ---
function pushHistorySnapshot(total) {
    let history = JSON.parse(localStorage.getItem('comptesCommuns_history')) || [];
    const last = history[history.length - 1];
    if (!last || last.total !== total) {
        history.push({ total, date: Date.now() });
        if (history.length > 30) history = history.slice(-30);
        localStorage.setItem('comptesCommuns_history', JSON.stringify(history));
    }
    return history;
}

function renderSparkline(history) {
    const container = document.getElementById('home-trend');
    const svg = document.getElementById('trend-sparkline');
    if (history.length < 2) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    const values = history.map(h => h.total);
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = 28 - ((v - min) / range) * 26;
        return `${x},${y}`;
    }).join(' ');
    svg.innerHTML = `<polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
}

function renderHomeDelta(total) {
    const history = JSON.parse(localStorage.getItem('comptesCommuns_history')) || [];
    const el = document.getElementById('home-delta');
    if (history.length < 2) {
        el.textContent = '';
        el.className = 'home-delta';
    } else {
        const previous = history[history.length - 2].total;
        const diff = parseFloat((total - previous).toFixed(2));
        if (diff === 0) {
            el.textContent = 'Stable depuis la dernière mise à jour';
            el.className = 'home-delta neutral';
        } else {
            el.textContent = `${diff > 0 ? '+' : ''}${fmtMoney(diff)} depuis la dernière mise à jour`;
            el.className = `home-delta ${diff > 0 ? 'more' : 'saving'}`;
        }
    }
    renderSparkline(history);
}

function renderHomeTop(activeExpenses, total) {
    const container = document.getElementById('home-top');
    if (activeExpenses.length === 0 || total === 0) { container.innerHTML = ''; return; }
    const top = [...activeExpenses].sort((a, b) => b.amount - a.amount).slice(0, 3);
    container.innerHTML = `<p class="home-top-label">Principales dépenses</p>` + top.map(item => {
        const pct = Math.round((item.amount / total) * 100);
        return `
            <div class="home-top-row">
                <span class="home-top-name">${item.icon} ${escapeHtml(item.name)}</span>
                <span class="home-top-pct">${pct}%</span>
            </div>
            <div class="home-top-bar"><div class="home-top-bar-fill" style="width:${pct}%"></div></div>
        `;
    }).join('');
}

// --- ACCUEIL ---
function updateHome() {
    const activeExpenses = expenses.filter(e => e.status !== 'deleted');
    const total = activeExpenses.reduce((sum, item) => sum + item.amount, 0);
    const totalEl = document.getElementById('home-total');
    const previousDisplayed = parseFloat(totalEl.dataset.value);
    animateNumber(totalEl, previousDisplayed, total);
    totalEl.dataset.value = total;

    renderHomeDelta(total);
    renderHomeTop(activeExpenses, total);
}

function renderEmojiPicker() {
    const wrap = document.getElementById('emoji-picker');
    wrap.innerHTML = '';
    EMOJI_CHOICES.forEach(e => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-choice' + (e === selectedIcon ? ' selected' : '');
        btn.textContent = e;
        btn.addEventListener('click', () => {
            selectedIcon = e;
            wrap.querySelectorAll('.emoji-choice').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
        wrap.appendChild(btn);
    });
}

function openExpenseForm(expense = null) {
    editExpenseId = expense ? expense.id : null;
    selectedIcon = expense ? expense.icon : '📝';
    modalTitle.textContent = expense ? `Modifier ${expense.name}` : 'Nouvelle dépense';
    expenseNameInput.value = expense ? expense.name : '';
    expenseAmountInput.value = expense ? expense.amount : '';
    renderEmojiPicker();
    expenseModal.classList.add('open');
    expenseModal.setAttribute('aria-hidden', 'false');
    expenseNameInput.focus();
}

function closeExpenseForm() {
    expenseModal.classList.remove('open');
    expenseModal.setAttribute('aria-hidden', 'true');
    expenseForm.reset();
    editExpenseId = null;
}

function saveExpenseForm(event) {
    event.preventDefault();
    const name = expenseNameInput.value.trim();
    const amount = parseFloat(expenseAmountInput.value);
    if (!name || isNaN(amount) || amount < 0) return;

    if (editExpenseId !== null) {
        const index = expenses.findIndex(item => item.id === editExpenseId);
        if (index !== -1) {
            expenses[index].name = name;
            expenses[index].amount = amount;
            expenses[index].icon = selectedIcon;
        }
    } else {
        expenses.push({
            id: Date.now(),
            name,
            amount,
            icon: selectedIcon,
            status: 'active'
        });
    }

    saveData();
    updateRecap();

    if (views.swipe.classList.contains('active')) {
        reviewSession = applySwipeSort(expenses.filter(e => e.status !== 'deleted'));
        currentIndex = Math.min(currentIndex, Math.max(reviewSession.length - 1, 0));
        renderCard();
        updateProgress();
        updateUndoButton();
    }

    closeExpenseForm();
}

function deleteExpense(expenseId) {
    const index = expenses.findIndex(item => item.id === expenseId);
    if (index === -1) return;
    const removed = expenses[index];
    expenses.splice(index, 1);
    delete scenarioOverrides[expenseId];
    saveScenario();
    saveData();
    updateRecap();

    showToast(`"${removed.name}" supprimée`, {
        actionLabel: 'Annuler',
        onAction: () => {
            expenses.splice(index, 0, removed);
            saveData();
            updateRecap();
        }
    });
}

function restoreDefaultData() {
    if (!confirm('Réinitialiser toutes les dépenses aux valeurs par défaut ?')) return;
    expenses = JSON.parse(JSON.stringify(defaultExpenses));
    scenarioOverrides = {};
    saveScenario();
    saveData();
    updateRecap();
    updateHome();
}

// --- DÉMARRER "FAIRE LES COMPTES" ---
document.getElementById('btn-start').addEventListener('click', () => {
    reviewSession = applySwipeSort(expenses.filter(e => e.status !== 'deleted'));
    currentIndex = 0;
    renderCard();
    updateProgress();
    updateUndoButton();
    showView('swipe');
});

document.getElementById('btn-cancel-swipe').addEventListener('click', () => {
    showView('home');
});

btnSkipSwipe.addEventListener('click', () => {
    saveData();
    updateRecap();
    showView('recap');
});

document.getElementById('btn-fab-add').addEventListener('click', () => openExpenseForm());

btnCloseModal.addEventListener('click', closeExpenseForm);
btnCancelForm.addEventListener('click', closeExpenseForm);
expenseForm.addEventListener('submit', saveExpenseForm);

btnResetData.addEventListener('click', restoreDefaultData);

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && expenseModal.classList.contains('open')) {
        closeExpenseForm();
    }
});

// --- LOGIQUE DE SWIPE ---
const cardContainer = document.getElementById('card-container');
let startX = 0, isDragging = false;

const btnSortSwipe = document.getElementById('btn-sort-swipe');
btnSortSwipe.textContent = SORT_LABELS[swipeSortMode];

function applySwipeSort(list) {
    const arr = [...list];
    if (swipeSortMode === 'amount-desc') arr.sort((a, b) => b.amount - a.amount);
    else if (swipeSortMode === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return arr;
}

btnSortSwipe.addEventListener('click', () => {
    const modes = Object.keys(SORT_LABELS);
    const idx = modes.indexOf(swipeSortMode);
    swipeSortMode = modes[(idx + 1) % modes.length];
    localStorage.setItem('comptesCommuns_sortMode', swipeSortMode);
    btnSortSwipe.textContent = SORT_LABELS[swipeSortMode];
    reviewSession = applySwipeSort(reviewSession);
    currentIndex = 0;
    renderCard();
    updateProgress();
    updateUndoButton();
});

function renderStack() {
    const back1 = document.getElementById('card-back-1');
    const back2 = document.getElementById('card-back-2');
    back1.style.display = reviewSession[currentIndex + 1] ? 'flex' : 'none';
    back2.style.display = reviewSession[currentIndex + 2] ? 'flex' : 'none';
}

function renderCard() {
    const emptyCard = document.getElementById('empty-card');
    const swipeGuides = document.querySelector('.swipe-guides');
    const cardStack = document.getElementById('card-stack');

    if (currentIndex >= reviewSession.length) {
        if (reviewSession.length === 0) {
            cardStack.style.display = 'none';
            swipeGuides.style.display = 'none';
            emptyCard.style.display = 'flex';
            document.getElementById('progress-text').textContent = "0 / 0";
            document.getElementById('progress-bar-fill').style.width = '0%';
            return;
        } else {
            saveData();
            updateRecap();
            showView('recap');
            return;
        }
    }

    cardStack.style.display = 'flex';
    emptyCard.style.display = 'none';
    swipeGuides.style.display = 'flex';

    const expense = reviewSession[currentIndex];
    document.getElementById('card-icon').textContent = expense.icon;
    document.getElementById('card-name').textContent = expense.name;
    document.getElementById('card-amount').textContent = fmtMoney(expense.amount);

    cardContainer.style.transition = 'none';
    cardContainer.style.transform = 'translate(0px, 0px) rotate(0deg)';
    cardContainer.style.backgroundColor = 'var(--surface-color)';

    renderStack();
}

function updateProgress() {
    if (reviewSession.length === 0) {
        document.getElementById('progress-text').textContent = `0 / 0`;
        document.getElementById('progress-bar-fill').style.width = '0%';
    } else {
        document.getElementById('progress-text').textContent = `${currentIndex + 1} / ${reviewSession.length}`;
        document.getElementById('progress-bar-fill').style.width = `${(currentIndex / reviewSession.length) * 100}%`;
    }
}

cardContainer.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
    cardContainer.style.transition = 'none';
});

cardContainer.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaX = e.touches[0].clientX - startX;
    cardContainer.style.transform = `translate(${deltaX}px, 0) rotate(${deltaX * 0.05}deg)`;

    if (deltaX > 50) cardContainer.style.backgroundColor = 'var(--swipe-accept-bg)';
    else if (deltaX < -50) cardContainer.style.backgroundColor = 'var(--swipe-reject-bg)';
    else cardContainer.style.backgroundColor = 'var(--surface-color)';
});

cardContainer.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    const deltaX = e.changedTouches[0].clientX - startX;
    cardContainer.style.transition = 'transform 0.3s ease, background-color 0.3s ease';

    if (deltaX > 100) {
        cardContainer.style.transform = `translate(150vw, 0) rotate(20deg)`;
        handleAction('active');
    } else if (deltaX < -100) {
        cardContainer.style.transform = `translate(-150vw, 0) rotate(-20deg)`;
        handleAction('deleted');
    } else {
        cardContainer.style.transform = 'translate(0px, 0px) rotate(0deg)';
        cardContainer.style.backgroundColor = 'var(--surface-color)';
    }
});

function handleAction(newStatus) {
    if (navigator.vibrate) navigator.vibrate(newStatus === 'deleted' ? [15, 30, 15] : 15);

    reviewSession[currentIndex].status = newStatus;

    const globalIndex = expenses.findIndex(e => e.id === reviewSession[currentIndex].id);
    if (globalIndex !== -1) expenses[globalIndex].status = newStatus;

    setTimeout(() => {
        currentIndex++;
        renderCard();
        if (currentIndex < reviewSession.length) {
            updateProgress();
            updateUndoButton();
        }
    }, 300);
}

function saveData() {
    expenses = expenses.filter(e => e.status !== 'deleted');
    localStorage.setItem('comptesCommuns', JSON.stringify(expenses));
    const total = parseFloat(expenses.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
    pushHistorySnapshot(total);
    updateHome();
}

// --- MODIFICATION D'UNE CARTE ---
document.getElementById('btn-edit').addEventListener('click', () => {
    const expense = reviewSession[currentIndex];
    openExpenseForm(expense);
});

document.getElementById('btn-add-expense').addEventListener('click', () => openExpenseForm());
document.getElementById('btn-add-swipe').addEventListener('click', () => openExpenseForm());

// --- ANNULATION (UNDO) ---
const btnUndo = document.getElementById('btn-undo');
function updateUndoButton() {
    btnUndo.disabled = currentIndex === 0;
}

btnUndo.addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        reviewSession[currentIndex].status = 'active';
        const globalIndex = expenses.findIndex(e => e.id === reviewSession[currentIndex].id);
        if (globalIndex !== -1) expenses[globalIndex].status = 'active';

        renderCard();
        updateProgress();
        updateUndoButton();
    }
});

// --- RÉCAPITULATIF ---
const recapSearchInput = document.getElementById('recap-search');
const recapSortSelect = document.getElementById('recap-sort');
recapSortSelect.value = recapSortMode;

recapSearchInput.addEventListener('input', () => {
    recapSearchTerm = recapSearchInput.value;
    updateRecap();
});
recapSortSelect.addEventListener('change', () => {
    recapSortMode = recapSortSelect.value;
    localStorage.setItem('comptesCommuns_recapSort', recapSortMode);
    updateRecap();
});

function updateRecap() {
    const activeExpenses = expenses.filter(e => e.status !== 'deleted');
    const total = activeExpenses.reduce((sum, item) => sum + item.amount, 0);

    document.getElementById('recap-count').textContent = `${activeExpenses.length} dépenses`;
    document.getElementById('recap-total').textContent = fmtMoney(total);

    let filtered = activeExpenses.filter(item => item.name.toLowerCase().includes(recapSearchTerm.toLowerCase()));
    if (recapSortMode === 'amount-desc') filtered = [...filtered].sort((a, b) => b.amount - a.amount);
    else if (recapSortMode === 'amount-asc') filtered = [...filtered].sort((a, b) => a.amount - b.amount);
    else if (recapSortMode === 'name') filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

    const maxAmount = Math.max(1, ...activeExpenses.map(e => e.amount));

    summaryList.innerHTML = '';
    document.getElementById('recap-empty-state').style.display = filtered.length === 0 ? 'block' : 'none';

    filtered.forEach(item => {
        const pct = Math.round((item.amount / maxAmount) * 100);
        const li = document.createElement('li');
        li.dataset.id = item.id;
        li.innerHTML = `
            <div class="swipe-delete-bg">🗑️ Supprimer</div>
            <div class="swipe-content">
                <div class="expense-item">
                    <span>${item.icon} ${escapeHtml(item.name)}</span>
                    <div class="expense-bar"><div class="expense-bar-fill" style="width:${pct}%"></div></div>
                </div>
                <strong>${fmtMoney(item.amount)}</strong>
            </div>
        `;
        summaryList.appendChild(li);
    });
}

// --- SWIPE-TO-DELETE + TAP-TO-EDIT SUR LE RÉCAP ---
let recapStartX = 0, recapDragEl = null, recapDragging = false, recapSuppressClick = false;

summaryList.addEventListener('touchstart', (e) => {
    const content = e.target.closest('.swipe-content');
    if (!content) return;
    recapDragEl = content;
    recapStartX = e.touches[0].clientX;
    recapDragging = true;
    content.style.transition = 'none';
});

summaryList.addEventListener('touchmove', (e) => {
    if (!recapDragging || !recapDragEl) return;
    const deltaX = Math.min(0, e.touches[0].clientX - recapStartX);
    recapDragEl.style.transform = `translateX(${deltaX}px)`;
});

summaryList.addEventListener('touchend', (e) => {
    if (!recapDragging || !recapDragEl) return;
    recapDragging = false;
    const deltaX = e.changedTouches[0].clientX - recapStartX;
    recapDragEl.style.transition = 'transform 0.25s ease';

    if (Math.abs(deltaX) > 10) {
        recapSuppressClick = true;
        setTimeout(() => { recapSuppressClick = false; }, 300);
    }

    if (deltaX < -80) {
        const li = recapDragEl.closest('li');
        const id = Number(li.dataset.id);
        recapDragEl.style.transform = 'translateX(-110%)';
        setTimeout(() => deleteExpense(id), 180);
    } else {
        recapDragEl.style.transform = 'translateX(0)';
    }
    recapDragEl = null;
});

summaryList.addEventListener('click', (event) => {
    if (recapSuppressClick) return;
    const content = event.target.closest('.swipe-content');
    if (!content) return;
    const li = content.closest('li');
    const id = Number(li.dataset.id);
    const expense = expenses.find(item => item.id === id);
    if (expense) openExpenseForm(expense);
});

// --- SCÉNARIO / COMPARAISON ---
function saveScenario() {
    localStorage.setItem('comptesCommuns_scenario', JSON.stringify(scenarioOverrides));
}
function saveScenariosStore() {
    localStorage.setItem('comptesCommuns_scenarios', JSON.stringify(scenarios));
}

const scenarioSelect = document.getElementById('scenario-select');
const btnDeleteScenario = document.getElementById('btn-delete-scenario');

function populateScenarioSelect() {
    const names = Object.keys(scenarios);
    scenarioSelect.innerHTML = `<option value="__current">Scénario en cours</option>` +
        names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    scenarioSelect.value = '__current';
    btnDeleteScenario.style.display = 'none';
}

scenarioSelect.addEventListener('change', () => {
    const name = scenarioSelect.value;
    if (name === '__current') {
        btnDeleteScenario.style.display = 'none';
        return;
    }
    btnDeleteScenario.style.display = 'inline-block';
    scenarioOverrides = { ...scenarios[name] };
    saveScenario();
    renderCompare();
});

document.getElementById('btn-save-scenario').addEventListener('click', () => {
    const name = prompt('Nom du scénario :');
    if (!name) return;
    scenarios[name] = { ...scenarioOverrides };
    saveScenariosStore();
    populateScenarioSelect();
    scenarioSelect.value = name;
    btnDeleteScenario.style.display = 'inline-block';
    showToast(`Scénario "${name}" enregistré`);
});

btnDeleteScenario.addEventListener('click', () => {
    const name = scenarioSelect.value;
    if (name === '__current') return;
    delete scenarios[name];
    saveScenariosStore();
    populateScenarioSelect();
    showToast(`Scénario "${name}" supprimé`);
});

function fmtDiff(diff, original) {
    const n = parseFloat(diff.toFixed(2));
    if (n === 0) return '=';
    const amountStr = (n > 0 ? '+' : '') + fmtMoney(n);
    if (!original) return amountStr;
    const pct = Math.round((diff / original) * 100);
    return `${amountStr} (${pct > 0 ? '+' : ''}${pct}%)`;
}

function renderCompare() {
    const active = expenses.filter(e => e.status !== 'deleted');
    const list = document.getElementById('compare-list');
    list.innerHTML = '';

    active.forEach(item => {
        const scenAmt = scenarioOverrides[item.id] !== undefined ? scenarioOverrides[item.id] : item.amount;
        const diff = parseFloat((scenAmt - item.amount).toFixed(2));
        const badgeClass = diff < 0 ? 'saving' : diff > 0 ? 'more' : 'same';

        const li = document.createElement('li');
        li.className = 'compare-item';
        li.innerHTML = `
            <div class="compare-item-top">
                <span class="compare-item-name">${item.icon} ${escapeHtml(item.name)}</span>
                <span class="compare-item-original">${fmtMoney(item.amount)}</span>
            </div>
            <div class="compare-item-bottom">
                <div class="compare-input-wrap">
                    <input type="number" min="0" step="0.01" inputmode="decimal"
                        value="${scenAmt}" data-id="${item.id}">
                    <span class="unit">€</span>
                </div>
                <span class="compare-badge ${badgeClass}">${fmtDiff(diff, item.amount)}</span>
            </div>
        `;
        list.appendChild(li);
    });

    updateCompareSummary();
}

function updateCompareSummary() {
    const active = expenses.filter(e => e.status !== 'deleted');
    const currentTotal = active.reduce((s, e) => s + e.amount, 0);
    const scenTotal = parseFloat(active.reduce((s, e) => {
        return s + (scenarioOverrides[e.id] !== undefined ? scenarioOverrides[e.id] : e.amount);
    }, 0).toFixed(2));
    const delta = parseFloat((scenTotal - currentTotal).toFixed(2));

    document.getElementById('compare-current').textContent = fmtMoney(currentTotal);
    document.getElementById('compare-scenario').textContent = fmtMoney(scenTotal);

    const maxTotal = Math.max(currentTotal, scenTotal, 1);
    document.getElementById('bar-current').style.width = `${(currentTotal / maxTotal) * 100}%`;
    document.getElementById('bar-scenario').style.width = `${(scenTotal / maxTotal) * 100}%`;

    const deltaEl = document.getElementById('compare-delta');
    if (delta === 0) {
        deltaEl.className = 'compare-delta neutral';
        deltaEl.textContent = 'Aucune modification';
    } else if (delta < 0) {
        deltaEl.className = 'compare-delta saving';
        deltaEl.textContent = `Économies : ${fmtMoney(Math.abs(delta))}/mois`;
    } else {
        deltaEl.className = 'compare-delta more';
        deltaEl.textContent = `Surcoût : +${fmtMoney(delta)}/mois`;
    }
}

document.getElementById('compare-list').addEventListener('input', e => {
    const input = e.target.closest('input[data-id]');
    if (!input) return;
    const id = Number(input.dataset.id);
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) return;

    const original = expenses.find(ex => ex.id === id);
    if (!original) return;

    if (parseFloat(val.toFixed(2)) === original.amount) {
        delete scenarioOverrides[id];
    } else {
        scenarioOverrides[id] = val;
    }
    saveScenario();
    updateCompareSummary();

    const diff = parseFloat((val - original.amount).toFixed(2));
    const badge = input.closest('.compare-item').querySelector('.compare-badge');
    badge.className = `compare-badge ${diff < 0 ? 'saving' : diff > 0 ? 'more' : 'same'}`;
    badge.textContent = fmtDiff(diff, original.amount);
});

document.getElementById('btn-reset-scenario').addEventListener('click', () => {
    scenarioOverrides = {};
    saveScenario();
    scenarioSelect.value = '__current';
    btnDeleteScenario.style.display = 'none';
    renderCompare();
});

// --- ONBOARDING ---
function maybeShowOnboarding() {
    if (localStorage.getItem(ONBOARD_KEY)) return;
    document.getElementById('onboarding').style.display = 'flex';
}
document.getElementById('btn-onboarding-close').addEventListener('click', () => {
    localStorage.setItem(ONBOARD_KEY, '1');
    document.getElementById('onboarding').style.display = 'none';
});

// Initialisation au lancement
updateHome();
populateScenarioSelect();
maybeShowOnboarding();
