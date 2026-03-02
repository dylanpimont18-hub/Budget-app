// --- 1. MODÈLE DE DONNÉES ET INITIALISATION ---
const STORAGE_KEY = 'comptes_communs_data';

// Données par défaut si le LocalStorage est vide
const defaultExpenses = [
    { id: 1, name: 'Loyer', amount: 800.00, icon: '🏠', isActive: true },
    { id: 2, name: 'Électricité', amount: 60.50, icon: '⚡', isActive: true },
    { id: 3, name: 'Internet', amount: 29.99, icon: '🌐', isActive: true },
    { id: 4, name: 'Assurance Habitation', amount: 15.00, icon: '🛡️', isActive: true },
    { id: 5, name: 'Netflix', amount: 13.49, icon: '🎬', isActive: true }
];

let expenses = [];
let activeExpenses = [];
let validatedExpenses = [];
let totalAmount = 0;

// Variables pour la gestion du swipe tactile
let startX = 0;
let currentX = 0;

// Éléments du DOM
const cardStack = document.getElementById('card-stack');
const swipeView = document.getElementById('swipe-view');
const summaryView = document.getElementById('summary-view');
const totalAmountElement = document.getElementById('total-amount');
const validatedListElement = document.getElementById('validated-list');

// --- 2. FONCTIONS DE DÉMARRAGE ---
function init() {
    // Récupération des données ou injection des données par défaut
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (storedData) {
        expenses = JSON.parse(storedData);
    } else {
        expenses = [...defaultExpenses];
        saveData();
    }

    // On ne garde que les fiches "actives" pour ce mois-ci
    activeExpenses = expenses.filter(exp => exp.isActive);
    
    if (activeExpenses.length === 0) {
        showSummary();
    } else {
        renderCards();
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

// --- 3. GESTION DES CARTES (UI) ---
function renderCards() {
    cardStack.innerHTML = '';
    
    // On affiche les cartes à l'envers pour que la première de la liste soit au-dessus
    activeExpenses.slice().reverse().forEach((exp, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        // Effet d'empilement visuel
        card.style.transform = `scale(${1 - index * 0.05}) translateY(${index * 10}px)`;
        card.style.zIndex = activeExpenses.length - index;
        card.dataset.id = exp.id;

        card.innerHTML = `
            <div class="icon">${exp.icon}</div>
            <div class="name">${exp.name}</div>
            <div class="amount">${exp.amount.toFixed(2)} €</div>
        `;

        // Seule la carte du dessus (index 0 dans l'affichage renversé) écoute le tactile
        if (index === 0) {
            setupTouchEvents(card);
        }

        cardStack.appendChild(card);
    });
}

// --- 4. LOGIQUE MÉTIER (Validation, Modification, Résiliation) ---
function processCurrentCard(action) {
    if (activeExpenses.length === 0) return;

    // Récupère la carte du dessus (la première du tableau)
    const currentExp = activeExpenses[0];
    const topCardElement = cardStack.lastElementChild; // last child car empilé à l'envers

    if (action === 'validate') {
        topCardElement.classList.add('swipe-right-anim');
        validatedExpenses.push(currentExp);
        totalAmount += currentExp.amount;
    } else if (action === 'cancel') {
        topCardElement.classList.add('swipe-left-anim');
        // On désactive l'abonnement dans les données globales
        const indexInGlobal = expenses.findIndex(e => e.id === currentExp.id);
        if (indexInGlobal !== -1) {
            expenses[indexInGlobal].isActive = false;
            saveData();
        }
    }

    // Retire l'élément du tableau actif
    activeExpenses.shift();

    // Attend la fin de l'animation CSS avant de mettre à jour le DOM
    setTimeout(() => {
        if (activeExpenses.length > 0) {
            renderCards();
        } else {
            showSummary();
        }
    }, 300); // 300ms correspond à la transition CSS
}

function editCurrentCard() {
    if (activeExpenses.length === 0) return;
    
    const currentExp = activeExpenses[0];
    const newAmountStr = prompt(`Modifier le montant pour ${currentExp.name} (€):`, currentExp.amount);
    
    if (newAmountStr !== null) {
        const newAmount = parseFloat(newAmountStr.replace(',', '.'));
        if (!isNaN(newAmount) && newAmount >= 0) {
            // Mise à jour locale
            currentExp.amount = newAmount;
            // Mise à jour globale
            const indexInGlobal = expenses.findIndex(e => e.id === currentExp.id);
            if (indexInGlobal !== -1) {
                expenses[indexInGlobal].amount = newAmount;
                saveData();
            }
            renderCards(); // Rafraîchit l'affichage
        } else {
            alert('Montant invalide.');
        }
    }
}

// --- 5. GESTION DU TACTILE (Swipe) ---
function setupTouchEvents(card) {
    card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        card.style.transition = 'none'; // Désactive l'animation le temps du drag
    });

    card.addEventListener('touchmove', (e) => {
        currentX = e.touches[0].clientX;
        const diffX = currentX - startX;
        // Rotation et déplacement proportionnels
        card.style.transform = `translateX(${diffX}px) rotate(${diffX * 0.05}deg)`;
    });

    card.addEventListener('touchend', (e) => {
        const diffX = currentX - startX;
        card.style.transition = 'transform 0.3s ease, opacity 0.3s ease'; // Réactive l'animation

        if (diffX > 100) {
            processCurrentCard('validate'); // Swipe Droit
        } else if (diffX < -100) {
            processCurrentCard('cancel'); // Swipe Gauche
        } else {
            // Reviens au centre si le swipe n'est pas assez fort
            card.style.transform = `scale(1) translateY(0px)`;
        }
    });
}

// --- 6. LE BILAN ---
function showSummary() {
    swipeView.classList.add('hidden');
    summaryView.classList.remove('hidden');

    totalAmountElement.textContent = `${totalAmount.toFixed(2)} €`;

    validatedListElement.innerHTML = '';
    validatedExpenses.forEach(exp => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${exp.icon} ${exp.name}</span> <strong>${exp.amount.toFixed(2)} €</strong>`;
        validatedListElement.appendChild(li);
    });
}

function resetCycle() {
    // Réinitialise l'état pour une nouvelle utilisation
    validatedExpenses = [];
    totalAmount = 0;
    swipeView.classList.remove('hidden');
    summaryView.classList.add('hidden');
    init(); // Recharge depuis le LocalStorage
}

// --- 7. ÉCOUTEURS D'ÉVÉNEMENTS (Boutons) ---
document.getElementById('btn-validate').addEventListener('click', () => processCurrentCard('validate'));
document.getElementById('btn-cancel').addEventListener('click', () => processCurrentCard('cancel'));
document.getElementById('btn-edit').addEventListener('click', editCurrentCard);
document.getElementById('btn-finish').addEventListener('click', resetCycle);

// Lancement de l'application
init();