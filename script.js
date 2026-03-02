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

// --- DÉMARRER "FAIRE LES COMPTES" ---
document.getElementById('btn-start').addEventListener('click', () => {
    reviewSession = expenses.filter(e => e.status !== 'deleted');
    
    if (reviewSession.length === 0) {
        updateRecap();
        showView('recap');
        return;
    }

    currentIndex = 0;
    renderCard();
    updateProgress();
    updateUndoButton();
    showView('swipe');
});

document.getElementById('btn-cancel-swipe').addEventListener('click', () => {
    showView('home');
});

// --- LOGIQUE DE SWIPE ---
const cardContainer = document.getElementById('card-container');
let startX = 0, isDragging = false;

function renderCard() {
    if (currentIndex >= reviewSession.length) {
        saveData();
        updateRecap();
        showView('recap');
        return;
    }
    
    const expense = reviewSession[currentIndex];
    document.getElementById('card-icon').textContent = expense.icon;
    document.getElementById('card-name').textContent = expense.name;
    document.getElementById('card-amount').textContent = `${expense.amount} €`;
    
    cardContainer.style.transition = 'none';
    cardContainer.style.transform = 'translate(0px, 0px) rotate(0deg)';
    cardContainer.style.backgroundColor = 'var(--surface-color)';
}

function updateProgress() {
    document.getElementById('progress-text').textContent = `${currentIndex + 1} / ${reviewSession.length}`;
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
    const newAmount = prompt(`Nouveau montant pour ${expense.name} (€) :`, expense.amount);
    
    if (newAmount !== null && !isNaN(newAmount) && newAmount.trim() !== "") {
        expense.amount = parseFloat(newAmount);
        const globalIndex = expenses.findIndex(e => e.id === expense.id);
        if(globalIndex !== -1) expenses[globalIndex].amount = expense.amount;
        
        renderCard();
        saveData(); 
    }
});

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
    
    const listEl = document.getElementById('summary-list');
    listEl.innerHTML = '';
    activeExpenses.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${item.icon} ${item.name}</span> <strong>${item.amount} €</strong>`;
        listEl.appendChild(li);
    });
}

// --- AJOUTER UNE NOUVELLE DÉPENSE ---
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

// Initialisation au lancement
updateHome();