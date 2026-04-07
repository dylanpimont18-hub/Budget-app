// --- JEU DE DONNÉES PAR DÉFAUT ---
const defaultExpenses = [
    { id: 1, name: "Loyer", amount: 850, icon: "🏠", status: "active" },
    { id: 2, name: "Électricité", amount: 75, icon: "⚡", status: "active" },
    { id: 3, name: "Internet", amount: 40, icon: "🌐", status: "active" },
    { id: 4, name: "Assurance", amount: 35, icon: "🛡️", status: "active" },
    { id: 5, name: "Abonnements", amount: 15, icon: "🍿", status: "active" }
];

let expenses = JSON.parse(localStorage.getItem('comptesCommuns')) || JSON.parse(JSON.stringify(defaultExpenses));
let currentIndex = 0;
let reviewSession = [];
let editExpenseId = null;

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

// --- NAVIGATION ---
const views = {
    home: document.getElementById('view-home'),
    swipe: document.getElementById('view-swipe'),
    recap: document.getElementById('view-recap')
};

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

// --- ACCUEIL ---
function updateHome() {
    const activeExpenses = expenses.filter(e => e.status !== 'deleted');
    const total = activeExpenses.reduce((sum, item) => sum + item.amount, 0);
    document.getElementById('home-total').textContent = `${total} €`;
}

function openExpenseForm(expense = null) {
    editExpenseId = expense ? expense.id : null;
    modalTitle.textContent = expense ? `Modifier ${expense.name}` : 'Nouvelle dépense';
    expenseNameInput.value = expense ? expense.name : '';
    expenseAmountInput.value = expense ? expense.amount : '';
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
        }
    } else {
        expenses.push({
            id: Date.now(),
            name,
            amount,
            icon: '📝',
            status: 'active'
        });
    }

    saveData();
    updateRecap();

    if (views.swipe.classList.contains('active')) {
        reviewSession = expenses.filter(e => e.status !== 'deleted');
        currentIndex = Math.min(currentIndex, Math.max(reviewSession.length - 1, 0));
        renderCard();
        updateProgress();
        updateUndoButton();
    }

    closeExpenseForm();
}

function deleteExpense(expenseId) {
    const expense = expenses.find(item => item.id === expenseId);
    if (!expense) return;
    const confirmed = confirm(`Supprimer définitivement “${expense.name}” ?`);
    if (!confirmed) return;

    expenses = expenses.filter(item => item.id !== expenseId);
    saveData();
    updateRecap();
}

function restoreDefaultData() {
    if (!confirm('Réinitialiser toutes les dépenses aux valeurs par défaut ?')) return;
    expenses = JSON.parse(JSON.stringify(defaultExpenses));
    saveData();
    updateRecap();
    updateHome();
}

// --- DÉMARRER "FAIRE LES COMPTES" ---
document.getElementById('btn-start').addEventListener('click', () => {
    reviewSession = expenses.filter(e => e.status !== 'deleted');
    
    // On lance la vue swipe dans tous les cas
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
    updateRecap();
    showView('recap');
});

btnCloseModal.addEventListener('click', closeExpenseForm);
btnCancelForm.addEventListener('click', closeExpenseForm);
expenseForm.addEventListener('submit', saveExpenseForm);

summaryList.addEventListener('click', (event) => {
    const editButton = event.target.closest('.edit-expense');
    const deleteButton = event.target.closest('.delete-expense');
    if (editButton) {
        const expenseId = Number(editButton.dataset.id);
        const expense = expenses.find(item => item.id === expenseId);
        if (expense) openExpenseForm(expense);
    }
    if (deleteButton) {
        const expenseId = Number(deleteButton.dataset.id);
        deleteExpense(expenseId);
    }
});

btnResetData.addEventListener('click', restoreDefaultData);

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && expenseModal.classList.contains('open')) {
        closeExpenseForm();
    }
});

// --- LOGIQUE DE SWIPE ---
const cardContainer = document.getElementById('card-container');
let startX = 0, isDragging = false;

function renderCard() {
    const emptyCard = document.getElementById('empty-card');
    const swipeGuides = document.querySelector('.swipe-guides');

    // Vérifie si on a fini la session ou s'il n'y a rien
    if (currentIndex >= reviewSession.length) {
        if (reviewSession.length === 0) {
            // S'il n'y a vraiment aucune dépense, on affiche la carte vide
            cardContainer.style.display = 'none';
            swipeGuides.style.display = 'none';
            emptyCard.style.display = 'flex';
            document.getElementById('progress-text').textContent = "0 / 0";
            return;
        } else {
            // S'il a fini de swiper des dépenses existantes, on va au récap
            saveData();
            updateRecap();
            showView('recap');
            return;
        }
    }
    
    // Affichage normal de la carte à swiper
    cardContainer.style.display = 'flex';
    emptyCard.style.display = 'none';
    swipeGuides.style.display = 'flex';

    const expense = reviewSession[currentIndex];
    document.getElementById('card-icon').textContent = expense.icon;
    document.getElementById('card-name').textContent = expense.name;
    document.getElementById('card-amount').textContent = `${expense.amount} €`;
    
    cardContainer.style.transition = 'none';
    cardContainer.style.transform = 'translate(0px, 0px) rotate(0deg)';
    cardContainer.style.backgroundColor = 'var(--surface-color)';
}

function updateProgress() {
    if (reviewSession.length === 0) {
        document.getElementById('progress-text').textContent = `0 / 0`;
    } else {
        document.getElementById('progress-text').textContent = `${currentIndex + 1} / ${reviewSession.length}`;
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
    
    if (deltaX > 50) cardContainer.style.backgroundColor = '#e8f5e9'; 
    else if (deltaX < -50) cardContainer.style.backgroundColor = '#ffebee'; 
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
    reviewSession[currentIndex].status = newStatus;
    
    const globalIndex = expenses.findIndex(e => e.id === reviewSession[currentIndex].id);
    if(globalIndex !== -1) expenses[globalIndex].status = newStatus;
    
    setTimeout(() => {
        currentIndex++;
        renderCard();
        if(currentIndex < reviewSession.length) {
            updateProgress();
            updateUndoButton();
        }
    }, 300);
}

function saveData() {
    expenses = expenses.filter(e => e.status !== 'deleted');
    localStorage.setItem('comptesCommuns', JSON.stringify(expenses));
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
        if(globalIndex !== -1) expenses[globalIndex].status = 'active';
        
        renderCard();
        updateProgress();
        updateUndoButton();
    }
});

// --- RÉCAPITULATIF ---
document.getElementById('btn-go-recap').addEventListener('click', () => {
    updateRecap();
    showView('recap');
});

document.getElementById('btn-back-home').addEventListener('click', () => {
    updateHome();
    showView('home');
});

function updateRecap() {
    const activeExpenses = expenses.filter(e => e.status !== 'deleted');
    const total = activeExpenses.reduce((sum, item) => sum + item.amount, 0);
    
    document.getElementById('recap-count').textContent = `${activeExpenses.length} dépenses`;
    document.getElementById('recap-total').textContent = `${total} €`;
    
    summaryList.innerHTML = '';
    activeExpenses.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="expense-item">
                <span>${item.icon} ${item.name}</span>
                <div class="expense-actions">
                    <button class="btn-text btn-small edit-expense" data-id="${item.id}" type="button">✎ Modifier</button>
                    <button class="btn-text btn-small delete-expense" data-id="${item.id}" type="button" aria-label="Supprimer ${item.name}">🗑️ Supprimer</button>
                </div>
            </div>
            <strong>${item.amount} €</strong>
        `;
        summaryList.appendChild(li);
    });
}

// --- AJOUTER UNE NOUVELLE DÉPENSE (DEPUIS LE RÉCAP) ---
document.getElementById('btn-add-expense').addEventListener('click', () => {
    const name = prompt("Nom de la nouvelle dépense :");
    if (!name || name.trim() === "") return; 

    const amountStr = prompt(`Montant pour ${name} (€) :`);
    if (!amountStr || isNaN(amountStr) || amountStr.trim() === "") return; 

    const newExpense = {
        id: Date.now(), 
        name: name.trim(),
        amount: parseFloat(amountStr),
        icon: "📝", 
        status: "active"
    };

    expenses.push(newExpense);
    saveData(); 
    updateRecap();
});

// --- AJOUTER UNE DÉPENSE DEPUIS L'ÉCRAN SWIPE (QUAND VIDE) ---
document.getElementById('btn-add-swipe').addEventListener('click', () => {
    const name = prompt("Nom de la nouvelle dépense :");
    if (!name || name.trim() === "") return; 

    const amountStr = prompt(`Montant pour ${name} (€) :`);
    if (!amountStr || isNaN(amountStr) || amountStr.trim() === "") return; 

    const newExpense = {
        id: Date.now(), 
        name: name.trim(),
        amount: parseFloat(amountStr),
        icon: "📝", 
        status: "active"
    };

    expenses.push(newExpense);
    saveData(); 
    
    // Mettre à jour la session en cours avec la nouvelle dépense et relancer l'affichage
    reviewSession = expenses.filter(e => e.status !== 'deleted');
    renderCard();
    updateProgress();
});

// Initialisation au lancement
updateHome();