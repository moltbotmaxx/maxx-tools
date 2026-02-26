/**
 * Content Scheduler App
 * Drag & drop content planning for the week
 */

// ===========================
// Constants & Configuration
// ===========================
const SLOTS_PER_DAY = 8;
const STORAGE_KEY = 'contentSchedulerData';
const NOTES_KEY = 'contentSchedulerNotes';

// Content types
const CONTENT_TYPES = {
    POST: { id: 'post', label: 'Post', icon: '📷' },
    PROMO: { id: 'promo', label: 'Promo', icon: '📢' },
    REEL: { id: 'reel', label: 'Reel', icon: '🎬' }
};

// Card status in schedule
const CARD_STATUS = {
    SCHEDULED: 'scheduled',
    POSTED: 'posted'
};

// ===========================
// State
// ===========================
let appData = {
    pool: [],           // Cards in the pool
    schedule: {},       // Cards scheduled by date key
    ideas: []           // Captures from Inspiration Board
};
let permanentNotes = '';
let draggedCard = null;
let globalOffset = 0;
let currentDate = new Date();
let activeStagingCardId = null;
let sourceSelectionDraft = null;

// ===========================
// News Ticker State
// ===========================
let showDoneNews = false;
let doneHeadlines = new Set();
const SOURCING_FEEDS = [
    {
        id: 'ai-general',
        label: 'AI General',
        kind: 'news',
        url: 'https://rss.app/feeds/v1.1/ow6LmNtmgkH0e876.json'
    }
];
let selectedSourcingFeed = 'all';
const sourcingFeedCache = new Map();
let sourcingArticlesCache = [];
let sourcingArticlesDirty = true;
let scheduledNewsRender = null;
const NEWS_REFRESH_INTERVAL_MS = 120000;
let newsAutoRefreshTimer = null;

// Load done headlines from localStorage
try {
    const saved = localStorage.getItem('done_articles');
    if (saved) doneHeadlines = new Set(JSON.parse(saved));
} catch (e) {
    console.error('Failed to load done_articles', e);
}

function ensureAppDataIntegrity() {
    if (!appData || typeof appData !== 'object') {
        appData = { pool: [], schedule: {}, ideas: [] };
    }
    if (!Array.isArray(appData.pool)) appData.pool = [];
    if (!appData.schedule || typeof appData.schedule !== 'object') appData.schedule = {};
    if (!Array.isArray(appData.ideas)) appData.ideas = [];
    return appData;
}

// ===========================
// DOM Elements
// ===========================
const elements = {
    weekIndicator: document.getElementById('weekIndicator'),
    poolCards: document.getElementById('poolCards'),
    poolCount: document.getElementById('poolCount'),
    weekGrid: document.getElementById('weekGrid'),
    addPost: document.getElementById('addPost'),
    addPromo: document.getElementById('addPromo'),
    addReel: document.getElementById('addReel'),
    permanentNotes: document.getElementById('permanentNotes'),
    notesStatus: document.getElementById('notesStatus'),
    postsMetric: document.getElementById('postsMetric'),
    reelsMetric: document.getElementById('reelsMetric'),
    postsFill: document.getElementById('postsFill'),
    reelsFill: document.getElementById('reelsFill'),
    // Tabs & Dashboard
    tabBtns: document.querySelectorAll('.tab-btn'),
    views: document.querySelectorAll('.view-container'),
    monthCalendar: document.getElementById('monthCalendar'),
    currentMonthLabel: document.getElementById('currentMonthLabel'),
    totalPostsValue: document.getElementById('totalPostsValue'),
    completionRateValue: document.getElementById('completionRateValue'),
    jumpToday: document.getElementById('jumpToday'),
    // History
    historyGrid: document.getElementById('historyGrid'),
    historyWeekLabel: document.getElementById('historyWeekLabel'),
    // Global Navigation
    weekPrev: document.getElementById('weekPrev'),
    weekNext: document.getElementById('weekNext'),
    // Context Menu
    cardContextMenu: document.getElementById('cardContextMenu'),
    menuDelete: document.getElementById('menuDelete'),
    menuEdit: document.getElementById('menuEdit'),
    // Modal
    editModalOverlay: document.getElementById('editModalOverlay'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalSaveBtn: document.getElementById('modalSaveBtn'),
    modalEditDesc: document.getElementById('modalEditDesc'),
    // Delete Modal
    deleteModalOverlay: document.getElementById('deleteModalOverlay'),
    deleteConfirmBtn: document.getElementById('deleteConfirmBtn'),
    deleteCancelBtn: document.getElementById('deleteCancelBtn'),
    stagingCardModalOverlay: document.getElementById('stagingCardModalOverlay'),
    stagingCardDeleteBtn: document.getElementById('stagingCardDeleteBtn'),
    stagingCardReturnBtn: document.getElementById('stagingCardReturnBtn'),
    stagingCardCancelBtn: document.getElementById('stagingCardCancelBtn'),
    // Context Menu Extra
    menuMoveToPool: document.getElementById('menuMoveToPool'),
    clearPoolBtn: document.getElementById('clearPoolBtn'),
    // Inspiration Board
    inspirationGrid: document.getElementById('inspirationGrid'),
    inspirationMainInput: document.getElementById('inspirationMainInput'),
    inspirationModalOverlay: document.getElementById('inspirationModalOverlay'),
    insModalTitle: document.getElementById('insModalTitle'),
    insModalCategorySelector: document.getElementById('insModalCategorySelector'),
    insModalSaveBtn: document.getElementById('insModalSaveBtn'),
    insModalCancelBtn: document.getElementById('insModalCancelBtn'),
    insModalCloseBtn: document.getElementById('insModalCloseBtn'),
    // Inspiration Edit Modal
    insEditModalOverlay: document.getElementById('insEditModalOverlay'),
    insEditTitle: document.getElementById('insEditTitle'),
    insEditCategorySelector: document.getElementById('insEditCategorySelector'),
    insEditMainUrl: document.getElementById('insEditMainUrl'),
    insEditNotes: document.getElementById('insEditNotes'),
    insEditExtraLinks: document.getElementById('insEditExtraLinks'),
    insEditModalSaveBtn: document.getElementById('insEditModalSaveBtn'),
    insEditModalCancelBtn: document.getElementById('insEditModalCancelBtn'),
    insEditModalCloseBtn: document.getElementById('insEditModalCloseBtn'),
    sourceSelectionModalOverlay: document.getElementById('sourceSelectionModalOverlay'),
    sourceSelectionModalCloseBtn: document.getElementById('sourceSelectionModalCloseBtn'),
    sourceSelectionCancelBtn: document.getElementById('sourceSelectionCancelBtn'),
    sourceSelectionSaveBtn: document.getElementById('sourceSelectionSaveBtn'),
    sourceSelectionTitle: document.getElementById('sourceSelectionTitle'),
    sourceSelectionNotes: document.getElementById('sourceSelectionNotes'),
    sourceSelectionCategorySelector: document.getElementById('sourceSelectionCategorySelector'),
    syncStatus: document.getElementById('syncStatus'),
    syncText: document.querySelector('#syncStatus .sync-text'),
    // News Tab Elements
    showDoneNews: document.getElementById('showDoneNews'),
    resetNewsBtn: document.getElementById('resetNewsBtn'),
    sourcingFeedFilter: document.getElementById('sourcingFeedFilter'),
    featuredGrid: document.getElementById('featuredGrid'),
    simpleGrid: document.getElementById('simpleGrid'),
    poolListNews: document.getElementById('poolListNews'),
    xViralList: document.getElementById('xViralList'),
    redditViralList: document.getElementById('redditViralList'),
    top6Count: document.getElementById('top6Count'),
    next6Count: document.getElementById('next6Count'),
    poolCountNews: document.getElementById('poolCountNews'),
    selectionPoolCards: document.getElementById('poolCardsSelection')
};

// ===========================
// Utility Functions
// ===========================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeWhitespace(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function safeHttpUrl(url, fallback = '#') {
    if (!url || typeof url !== 'string') return fallback;
    try {
        const parsed = new URL(url, window.location.origin);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : fallback;
    } catch {
        return fallback;
    }
}

function toSafeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateShort(date) {
    return date.getDate();
}

function getDayName(date) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
}

function getWeekDates(offset = 0) {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    // Set to previous Sunday
    startOfWeek.setDate(startOfWeek.getDate() - day + (offset * 7));

    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        dates.push(d);
    }
    return dates;
}

// function getCurrentWeekDates() is redundant, using getWeekDates instead.

function isToday(date) {
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();
}

// ===========================
// Data Management (API-First with LocalStorage Fallback)
// ===========================
// ===========================
// Imports & Firebase Config
// ===========================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyD9Q9b_RkQ5KCUSoNdqs8W2C3jrB6Q_pCQ",
    authDomain: "daily-tracker-ee82c.firebaseapp.com",
    projectId: "daily-tracker-ee82c",
    storageBucket: "daily-tracker-ee82c.firebasestorage.app",
    messagingSenderId: "240727869932",
    appId: "1:240727869932:web:09e2f501e2674d65a698c9",
    measurementId: "G-X6CE1KMD4H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const DATA_DOC_ID = "global-tracker-data"; // Single document for ELI5 simplicity

// ===========================
// Data Management (Firebase Firestore)
// ===========================

async function loadData() {
    updateSyncStatus('pending');
    try {
        const docRef = doc(db, "daily-tracker-data", DATA_DOC_ID);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // REMOTE DATA EXISTS -> Use it (Source of Truth)
            const data = docSnap.data();
            appData = data.appData || {};
            ensureAppDataIntegrity();
            permanentNotes = data.permanentNotes || '';
            updateSyncStatus('online');
            console.log("Data loaded from Firebase");
        } else {
            updateSyncStatus('offline', 'No data found');
            // NO REMOTE DATA -> Check LocalStorage for Migration
            console.log("No Firebase data found. Checking local storage for migration...");
            const localData = localStorage.getItem(STORAGE_KEY);
            const localNotes = localStorage.getItem(NOTES_KEY);

            if (localData || localNotes) {
                // MIGRATE: Upload Local -> Firebase
                if (localData) {
                    appData = JSON.parse(localData);
                    ensureAppDataIntegrity();
                }
                if (localNotes) permanentNotes = localNotes;

                await saveData(); // Save to Firebase immediately
                console.log("Migration successful: Local data uploaded to Firebase.");
            }
        }
    } catch (e) {
        console.error("Error loading/migrating data:", e);
        // Fallback to local if offline or error, just to show something
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            appData = JSON.parse(stored);
            ensureAppDataIntegrity();
        }
    }

    // Initial Render
    ensureAppDataIntegrity();
    if (elements.permanentNotes) elements.permanentNotes.value = permanentNotes;
    render();

    // Trigger initial tab logic (e.g. fetch news if news is default)
    if (currentView === 'sourcing') {
        renderNews();
    } else if (currentView === 'selection') {
        renderInspiration();
    }
}

async function saveData() {
    // ALWAYS save to LocalStorage first so data isn't lost if Firebase fails
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    if (elements.permanentNotes) {
        localStorage.setItem(NOTES_KEY, elements.permanentNotes.value);
    }

    updateSyncStatus('pending');

    // Attempt Firebase sync
    try {
        await setDoc(doc(db, "daily-tracker-data", DATA_DOC_ID), {
            appData: appData,
            permanentNotes: permanentNotes,
            lastUpdated: new Date().toISOString()
        });
        updateSyncStatus('online');
    } catch (e) {
        console.error("Firebase Sync Error:", e);
        // We stay 'offline' but local data is safe
        updateSyncStatus('offline', 'Permissions/Connection Error (Local Active)');
    }
}

function updateSyncStatus(status, errorMsg = '') {
    if (!elements.syncStatus) return;

    elements.syncStatus.classList.remove('online', 'offline', 'pending');
    elements.syncStatus.classList.add(status);

    if (status === 'online') {
        elements.syncText.textContent = 'Synced';
        elements.syncStatus.title = 'Cloud Sync Active';
    } else if (status === 'pending') {
        elements.syncText.textContent = 'Saving...';
        elements.syncStatus.title = 'Uploading to Cloud...';
    } else if (status === 'offline') {
        elements.syncText.textContent = 'Error';
        elements.syncStatus.title = 'Sync Failed: ' + errorMsg;
    }
}

async function saveNotes() {
    permanentNotes = elements.permanentNotes.value;
    // Debounce or just save directly (Firestore is fast enough for notes usually)
    await saveData();
    localStorage.setItem(NOTES_KEY, permanentNotes);
    showNotesSaved();
}

function showNotesSaved() {
    elements.notesStatus.classList.remove('saving');
}

function showNotesSaving() {
    elements.notesStatus.classList.add('saving');
}

// ===========================
// Card Creation
// ===========================
function createCard(type) {
    const card = {
        id: generateId(),
        type: type.id,
        description: '',
        createdAt: new Date().toISOString()
    };

    appData.pool.push(card);
    saveData();
    render();

    // Focus on the new card's input
    setTimeout(() => {
        const input = document.querySelector(`[data-id="${card.id}"] .card-description`);
        if (input) input.focus();
    }, 50);
}

function deleteCard(cardId, fromPool = true) {
    if (fromPool) {
        appData.pool = appData.pool.filter(c => c.id !== cardId);
    } else {
        // Remove from schedule - look through all days and all slots
        for (const dateKey in appData.schedule) {
            if (Array.isArray(appData.schedule[dateKey])) {
                appData.schedule[dateKey] = appData.schedule[dateKey].map(slot =>
                    (slot && slot.id === cardId) ? null : slot
                );
            }
        }
    }
    saveData();
    render();
}

function clearPool() {
    if (appData.pool.length === 0) return;
    if (confirm("Are you sure you want to clear all cards from the pool?")) {
        appData.pool = [];
        saveData();
        render();
    }
}

function updateCardDescription(cardId, description, inPool = true) {
    if (inPool) {
        const card = appData.pool.find(c => c.id === cardId);
        if (card) card.description = description;
    } else {
        for (const dateKey in appData.schedule) {
            if (Array.isArray(appData.schedule[dateKey])) {
                const card = appData.schedule[dateKey].find(c => c && c.id === cardId);
                if (card) {
                    card.description = description;
                    break;
                }
            }
        }
    }
    saveData();
}

function toggleCardStatus(cardId) {
    for (const dateKey in appData.schedule) {
        if (Array.isArray(appData.schedule[dateKey])) {
            const cardIndex = appData.schedule[dateKey].findIndex(c => c && c.id === cardId);
            if (cardIndex !== -1) {
                const card = appData.schedule[dateKey][cardIndex];
                card.status = card.status === CARD_STATUS.POSTED
                    ? CARD_STATUS.SCHEDULED
                    : CARD_STATUS.POSTED;
                saveData();
                render();
                break;
            }
        }
    }
}

// ===========================
// Context Menu & Edit Logic
// ===========================
let activeContextCard = null;

function showContextMenu(e, cardId, isPool) {
    e.preventDefault();
    activeContextCard = { id: cardId, isPool };

    const menu = elements.cardContextMenu;
    menu.style.display = 'block';

    // Position menu properly, accounting for window boundaries
    const menuWidth = 180;
    const menuHeight = 100;
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y -= menuHeight;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Show/Hide "Move to Pool" based on where the card is
    if (isPool) {
        elements.menuMoveToPool.style.display = 'none';
    } else {
        elements.menuMoveToPool.style.display = 'flex';
    }

    // Hide menu on click elsewhere
    const hideMenu = () => {
        menu.style.display = 'none';
        document.removeEventListener('click', hideMenu);
    };
    setTimeout(() => document.addEventListener('click', hideMenu), 10);
}

function handleMenuDelete() {
    if (!activeContextCard) return;
    elements.deleteModalOverlay.classList.add('show');
}

function confirmDelete() {
    if (!activeContextCard) return;
    deleteCard(activeContextCard.id, activeContextCard.isPool);
    hideDeleteModal();
}

function hideDeleteModal() {
    elements.deleteModalOverlay.classList.remove('show');
    activeContextCard = null;
}

function showStagingCardModal(cardId) {
    activeStagingCardId = cardId;
    if (elements.stagingCardModalOverlay) {
        elements.stagingCardModalOverlay.classList.add('show');
    }
}

function hideStagingCardModal() {
    if (elements.stagingCardModalOverlay) {
        elements.stagingCardModalOverlay.classList.remove('show');
    }
    activeStagingCardId = null;
}

async function returnStagingCardToSelection(cardId) {
    const card = appData.pool.find(c => c.id === cardId);
    if (!card) return;

    const rawDescription = String(card.description || '').trim();
    const title = rawDescription.split('\n')[0]?.trim() || 'Recovered Card';
    const notes = rawDescription || '';

    const newIdea = {
        id: generateId(),
        title,
        url: card.url || '',
        image: '',
        content: notes,
        notes,
        extraLinks: card.extraLinks || '',
        type: card.type || 'post',
        createdAt: new Date().toISOString()
    };

    appData.ideas.unshift(newIdea);
    appData.pool = appData.pool.filter(c => c.id !== cardId);
    renderInspiration();
    renderPool();
    await saveData();
}

function handleMenuMoveToPool() {
    if (!activeContextCard || activeContextCard.isPool) return;

    const { id } = activeContextCard;

    // Find the card in the schedule
    let foundCard = null;
    for (const dKey in appData.schedule) {
        const index = appData.schedule[dKey].findIndex(c => c && c.id === id);
        if (index !== -1) {
            foundCard = appData.schedule[dKey][index];
            appData.schedule[dKey][index] = null;
            break;
        }
    }

    if (foundCard) {
        appData.pool.push(foundCard);
        saveData();
        render();
    }
    activeContextCard = null;
}

function handleMenuEdit() {
    if (!activeContextCard) return;

    const { id, isPool } = activeContextCard;

    const currentCard = isPool
        ? appData.pool.find(c => c.id === id)
        : Object.values(appData.schedule).flat().find(c => c && c.id === id);

    if (currentCard) {
        elements.modalEditDesc.value = currentCard.description || "";
        elements.editModalOverlay.classList.add('show');
    }
}

function hideModal() {
    elements.editModalOverlay.classList.remove('show');
    activeContextCard = null;
}

function saveModalEdit() {
    if (!activeContextCard) return;

    const { id, isPool } = activeContextCard;
    const newDesc = elements.modalEditDesc.value;

    updateCardDescription(id, newDesc, isPool);
    render();
    hideModal();
}

// ===========================
// Drag & Drop
// ===========================
function handleDragStart(e, card, fromPool = true) {
    draggedCard = { card, fromPool, sourceDate: null };

    if (!fromPool) {
        // Find which date this card is in
        for (const dateKey in appData.schedule) {
            if (appData.schedule[dateKey].find(c => c.id === card.id)) {
                draggedCard.sourceDate = dateKey;
                break;
            }
        }
    }

    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.id);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.day-column').forEach(col => {
        col.classList.remove('drag-over');
    });
    draggedCard = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    const column = e.target.closest('.day-column');
    if (column) {
        column.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const column = e.target.closest('.day-column');
    if (column && !column.contains(e.relatedTarget)) {
        column.classList.remove('drag-over');
    }
}

function handleDrop(e, targetDate, slotIndex) {
    e.preventDefault();

    const column = e.target.closest('.day-column');
    if (column) column.classList.remove('drag-over');

    if (!draggedCard) return;

    const { card, fromPool, sourceDate } = draggedCard;
    const targetKey = getDateKey(targetDate);

    // Remove from source ONLY (to prevent losing card if dropped on same day)
    // We search the entire appData to ensure we remove any existing instance 
    // (prevention against "strange duplicates")
    appData.pool = appData.pool.filter(c => c.id !== card.id);
    for (const dKey in appData.schedule) {
        appData.schedule[dKey] = appData.schedule[dKey].map(slot =>
            (slot && slot.id === card.id) ? null : slot
        );
    }

    // Initialize target day if needed
    if (!appData.schedule[targetKey]) {
        appData.schedule[targetKey] = Array(SLOTS_PER_DAY).fill(null);
    }

    // Ensure slotIndex exists in array (allow expansion)
    while (slotIndex >= appData.schedule[targetKey].length) {
        appData.schedule[targetKey].push(null);
    }

    // Set initial status as scheduled if coming from pool
    if (fromPool) {
        card.status = CARD_STATUS.SCHEDULED;
    }

    // Place card in target slot
    appData.schedule[targetKey][slotIndex] = card;

    // Check if we need to add an extra empty slot at the end if the last one was filled
    if (appData.schedule[targetKey][appData.schedule[targetKey].length - 1] !== null) {
        appData.schedule[targetKey].push(null);
    }

    saveData();
    render();
}

function handleDropToPool(e) {
    e.preventDefault();

    if (!draggedCard || draggedCard.fromPool) return;

    const { card, sourceDate } = draggedCard;

    // Remove from source ONLY
    appData.pool = appData.pool.filter(c => c.id !== card.id);
    for (const dKey in appData.schedule) {
        appData.schedule[dKey] = appData.schedule[dKey].map(slot =>
            (slot && slot.id === card.id) ? null : slot
        );
    }

    // Add back to pool
    appData.pool.push(card);

    saveData();
    render();
}

// ===========================
// UI Rendering
// ===========================
function renderPool() {
    const poolContainers = [
        elements.poolCards,
        elements.poolListNews,
        elements.selectionPoolCards
    ].filter(el => el !== null);

    poolContainers.forEach(container => { container.innerHTML = ''; });

    elements.poolCount.textContent = appData.pool.length;
    if (elements.poolCountNews) elements.poolCountNews.textContent = appData.pool.length;

    poolContainers.forEach(container => {
        if (appData.pool.length === 0) {
            container.innerHTML = `
                <div class="empty-pool-premium" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; opacity: 0.4; padding: 20px; border: 1px dashed var(--border-light); border-radius: var(--border-radius-md); margin: 10px;">
                    <p style="color: var(--text-tertiary); font-size: 0.8rem; text-align: center; font-weight: 500;">
                        Pool is empty
                    </p>
                </div>
            `;
            return;
        }

        appData.pool.forEach(card => container.appendChild(createPoolCardElement(card)));
    });
}

function createPoolCardElement(card) {
    const el = document.createElement('div');
    el.className = `content-card ${card.type}`;
    el.dataset.id = card.id;
    el.draggable = true;

    const safeCardUrl = safeHttpUrl(card.url);
    el.innerHTML = `
        <div class="card-controls">
            ${safeCardUrl !== '#' ? `
                <a href="${safeCardUrl}" target="_blank" rel="noopener noreferrer" class="card-link-btn" title="View Source">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                </a>
            ` : ''}
            <button class="card-delete" data-action="delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <textarea class="card-description" placeholder="Add description..." rows="1"></textarea>
    `;

    el.addEventListener('dragstart', (e) => handleDragStart(e, card, true));
    el.addEventListener('dragend', handleDragEnd);
    el.querySelector('.card-delete').addEventListener('click', () => showStagingCardModal(card.id));
    const textarea = el.querySelector('.card-description');
    textarea.value = card.description || '';
    textarea.addEventListener('input', (e) => updateCardDescription(card.id, e.target.value, true));
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.target.blur();
        }
    });

    return el;
}

function renderWeekGrid() {
    const dates = getWeekDates(0);
    elements.weekGrid.innerHTML = '';

    // Update week indicator if it exists
    if (elements.weekIndicator && currentView === 'history') {
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        elements.weekIndicator.textContent = `${months[startDate.getMonth()]} ${startDate.getDate()} - ${months[endDate.getMonth()]} ${endDate.getDate()}`;
    }

    dates.forEach(date => {
        const dateKey = getDateKey(date);

        // Ensure schedule for this day exists
        if (!appData.schedule[dateKey]) {
            appData.schedule[dateKey] = Array(SLOTS_PER_DAY).fill(null);
        }

        const scheduleDay = appData.schedule[dateKey];
        const activeCardsCount = scheduleDay.filter(c => c !== null).length;
        const isComplete = activeCardsCount >= 5; // Goal is 5+

        const column = document.createElement('div');
        column.className = 'day-column';
        if (isToday(date)) {
            column.classList.add('today');
            if (activeCardsCount >= 5) {
                column.classList.add('goal-reached');
            }
        }

        column.innerHTML = `
            <div class="day-header">
                <div class="day-info">
                    <span class="day-name">${getDayName(date)}</span>
                    <span class="day-date">${formatDateShort(date)}</span>
                </div>
                <div class="day-progress ${isComplete ? 'complete' : ''}">
                    ${activeCardsCount}/${SLOTS_PER_DAY} ${isComplete ? '✓' : ''}
                </div>
            </div>
            <div class="day-slots"></div>
        `;

        const slotsContainer = column.querySelector('.day-slots');

        // Render all available slots
        for (let i = 0; i < scheduleDay.length; i++) {
            const card = scheduleDay[i];

            if (card) {
                // Render scheduled card
                const status = card.status || CARD_STATUS.SCHEDULED;
                const cardEl = document.createElement('div');
                cardEl.className = `scheduled-card ${card.type} ${status}`;
                cardEl.dataset.id = card.id;
                cardEl.draggable = true;

                const icon = card.type === 'post' ? '📷' : card.type === 'promo' ? '📢' : '🎬';

                // Super simple card: Icon + description on one line, no header
                const safeCardUrl = safeHttpUrl(card.url);
                cardEl.innerHTML = `
                    <div class="card-main">
                        <span class="card-icon">${icon}</span>
                        <div class="card-info">
                            <div class="card-desc">${escapeHtml(card.description || 'New Entry')}</div>
                        </div>
                        <div class="card-actions">
                            ${safeCardUrl !== '#' ? `
                                <a href="${safeCardUrl}" target="_blank" rel="noopener noreferrer" class="card-link-btn grid-link" title="Ver link original">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                    </svg>
                                </a>
                            ` : ''}
                            <div class="card-check">
                                ${status === CARD_STATUS.POSTED ? '✓' : ''}
                            </div>
                        </div>
                    </div>
                `;

                cardEl.addEventListener('dragstart', (e) => handleDragStart(e, card, false));
                cardEl.addEventListener('dragend', handleDragEnd);
                cardEl.addEventListener('contextmenu', (e) => showContextMenu(e, card.id, false));
                cardEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleCardStatus(card.id);
                });

                slotsContainer.appendChild(cardEl);
            } else {
                // Render empty slot
                const slot = document.createElement('div');
                slot.className = 'empty-slot';
                slot.dataset.slotIndex = i;

                // Slot-specific drop events
                slot.addEventListener('dragover', handleDragOver);
                slot.addEventListener('dragenter', (e) => {
                    e.preventDefault();
                    slot.classList.add('drag-over-slot');
                });
                slot.addEventListener('dragleave', () => {
                    slot.classList.remove('drag-over-slot');
                });
                slot.addEventListener('drop', (e) => {
                    e.stopPropagation();
                    slot.classList.remove('drag-over-slot');
                    handleDrop(e, date, i);
                });

                slotsContainer.appendChild(slot);
            }
        }

        // Column level drop (if dropped outside specific slots, prepend or find first empty?)
        // For simplicity, we'll keep slot-level drops as primary, but column level defaults to first empty slot if possible
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('dragenter', handleDragEnter);
        column.addEventListener('dragleave', handleDragLeave);
        column.addEventListener('drop', (e) => {
            // Find first empty slot if dropped on column
            if (e.target.classList.contains('day-column') || e.target.classList.contains('day-slots')) {
                const firstEmpty = scheduleDay.findIndex(s => s === null);
                if (firstEmpty !== -1) {
                    handleDrop(e, date, firstEmpty);
                }
            }
        });

        elements.weekGrid.appendChild(column);
    });
}

function renderMetrics() {
    // Use standard Sunday-Saturday week
    const dates = getWeekDates();
    let contentCount = 0, reels = 0;

    dates.forEach(d => {
        const dateKey = getDateKey(d);
        const cards = appData.schedule[dateKey] || [];
        cards.forEach(card => {
            if (card) {
                // Count all types towards content goal, separate reels for reels goal
                if (card.type === 'post' || card.type === 'promo') contentCount++;
                else if (card.type === 'reel') {
                    reels++;
                    contentCount++; // Reels also count as content
                }
            }
        });
    });

    // Goals: Content = 49 (7/day), Reels = 7 (1/day)
    const contentGoal = 49;
    const reelsGoal = 7;

    if (elements.postsMetric) {
        elements.postsMetric.textContent = `${contentCount}/${contentGoal}`;
        elements.postsFill.style.width = `${Math.min(100, (contentCount / contentGoal) * 100)}%`;
    }

    if (elements.reelsMetric) {
        elements.reelsMetric.textContent = `${reels}/${reelsGoal}`;
        elements.reelsFill.style.width = `${Math.min(100, (reels / reelsGoal) * 100)}%`;
    }
}

function render() {
    renderPool();
    renderWeekGrid();
    renderMetrics();
    renderInspiration();

    // Also update dashboard if active
    if (currentView === 'metrics') {
        renderDashboard();
    }

    // Debug Expose
    window.appData = appData;
}

// ===========================
// Tabs & Views
// ===========================
let currentView = 'sourcing';
let dashboardMonth = new Date();

function switchTab(viewId) {
    currentView = viewId;

    // Update Tab Buttons
    elements.tabBtns.forEach(btn => {
        if (btn.dataset.tab === viewId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Update Views
    elements.views.forEach(view => {
        if (view.id === `${viewId}-view`) view.classList.add('active');
        else view.classList.remove('active');
    });

    if (viewId === 'metrics') {
        // When switching to metrics, align the monthly view with the current global focal date
        dashboardMonth = new Date(getWeekDates(globalOffset)[3]); // Use Wednesday of the current focal week
        stopNewsAutoRefresh();
        renderDashboard();
    } else if (viewId === 'history') {
        stopNewsAutoRefresh();
        renderHistory();
    } else if (viewId === 'selection') {
        renderInspiration();
        stopNewsAutoRefresh();
        renderPool(); // Ensure pool is synced on Selection tab
    } else if (viewId === 'sourcing') {
        renderNews(true);
        startNewsAutoRefresh();
        renderPool(); // Ensure pool is synced on Sourcing tab
    } else {
        stopNewsAutoRefresh();
    }
}

// ===========================
// News Rendering Logic
// ===========================
function getSelectedFeedConfigs() {
    if (selectedSourcingFeed === 'all') return SOURCING_FEEDS;
    return SOURCING_FEEDS.filter(f => f.id === selectedSourcingFeed);
}

function getFeedSourceLabel(item, fallbackUrl = '') {
    const authorName = item?.authors?.[0]?.name;
    if (authorName) return authorName;
    try {
        const host = new URL(item?.url || fallbackUrl).hostname.replace('www.', '');
        return host || 'RSS Source';
    } catch {
        return 'RSS Source';
    }
}

function normalizeFeedItemToArticle(item, index = 0) {
    const link = safeHttpUrl(item?.url || '');
    const publishedAt = item?.date_published || item?.date_modified || new Date().toISOString();
    const publishedDate = toIsoDateString(publishedAt);
    const headline = decodeEntities(item?.title || 'Untitled');
    const reason = normalizeWhitespace(item?.content_text || '').slice(0, 220);
    const source = getFeedSourceLabel(item, link);
    const imageUrl = safeHttpUrl(item?.image || item?.attachments?.[0]?.url || '', '');
    const now = Date.now();
    const hoursAgo = Math.max(0, (now - new Date(publishedAt).getTime()) / (1000 * 60 * 60));
    const recencyScore = Math.max(0, Math.round(100 - hoursAgo * 2));
    const ranking = clampScore(recencyScore - Math.round(index / 2));

    return {
        headline,
        link,
        source,
        date: publishedDate,
        published_at: publishedAt,
        ranking,
        rating: ranking,
        virality: clampScore(Math.round(ranking * 0.78)),
        fit: clampScore(Math.round(ranking * 0.72)),
        reason: reason || 'Imported from RSS feed.',
        image_url: imageUrl
    };
}

function clampScore(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, Math.round(num)));
}

function toIsoDateString(value) {
    const d = new Date(value || '');
    if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return d.toISOString().slice(0, 10);
}

function dedupeArticlesByLink(articles) {
    const seen = new Set();
    const output = [];
    for (const article of articles) {
        const key = safeHttpUrl(article?.link || '', '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        output.push(article);
    }
    return output;
}

function renderSidebarEmpty(container, text) {
    if (!container) return;
    container.innerHTML = `<div class="sourcing-empty">${escapeHtml(text)}</div>`;
}

function scheduleNewsRender() {
    if (scheduledNewsRender !== null) return;
    scheduledNewsRender = requestAnimationFrame(() => {
        scheduledNewsRender = null;
        renderNews(false);
    });
}

function applyDoneOptimistic(headline) {
    if (!headline) return;
    const selector = `.card-wrapper[data-headline="${CSS.escape(headline)}"]`;
    const cards = document.querySelectorAll(selector);

    cards.forEach((card) => {
        card.classList.add('card-wrapper--done');
        const doneBtn = card.querySelector('.done-button');
        if (doneBtn) doneBtn.remove();

        if (!showDoneNews) {
            card.style.transition = 'opacity 120ms ease, transform 120ms ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.98)';
        }
    });
}

async function fetchSourcingFeed(feedConfig, forceRefresh = false) {
    if (!feedConfig?.url) return [];
    if (!forceRefresh && sourcingFeedCache.has(feedConfig.id)) {
        return sourcingFeedCache.get(feedConfig.id);
    }

    const ts = Date.now();
    const url = `${feedConfig.url}${feedConfig.url.includes('?') ? '&' : '?'}t=${ts}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Feed ${feedConfig.id} failed with ${res.status}`);
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];
    sourcingFeedCache.set(feedConfig.id, items);
    return items;
}

async function rebuildSourcingArticles(forceRefresh = false) {
    const selectedFeeds = getSelectedFeedConfigs();
    const allArticles = [];

    for (const feed of selectedFeeds) {
        if (feed.kind !== 'news') continue;
        const items = await fetchSourcingFeed(feed, forceRefresh);
        items.forEach((item, i) => allArticles.push(normalizeFeedItemToArticle(item, i)));
    }

    sourcingArticlesCache = dedupeArticlesByLink(allArticles).sort((a, b) => {
        const da = new Date(a.published_at || a.date).getTime();
        const db = new Date(b.published_at || b.date).getTime();
        return db - da;
    });
    sourcingArticlesDirty = false;
}

async function renderNews(forceRefresh = false) {
    try {
        if (forceRefresh || sourcingArticlesDirty || sourcingArticlesCache.length === 0) {
            await rebuildSourcingArticles(forceRefresh);
        }
    } catch (err) {
        console.error('Failed to load RSS feeds:', err);
        return;
    }

    const activeArticles = showDoneNews
        ? sourcingArticlesCache
        : sourcingArticlesCache.filter(item => !doneHeadlines.has(item.headline));

    const top6 = activeArticles.slice(0, 6);
    const next6 = activeArticles.slice(6, 12);
    const remaining = activeArticles.slice(12);

    // Render counts
    if (elements.top6Count) elements.top6Count.textContent = `${top6.length} articles`;
    if (elements.next6Count) elements.next6Count.textContent = `${next6.length} articles`;
    if (elements.poolCountNews) elements.poolCountNews.textContent = `${remaining.length} articles`;

    // Clear and render grids
    elements.featuredGrid.innerHTML = '';
    const featuredFrag = document.createDocumentFragment();
    top6.forEach((item, i) => featuredFrag.appendChild(createFeaturedCard(item, i)));
    elements.featuredGrid.appendChild(featuredFrag);

    elements.simpleGrid.innerHTML = '';
    const simpleFrag = document.createDocumentFragment();
    next6.forEach((item, i) => simpleFrag.appendChild(createSimpleCard(item, i + 6)));
    elements.simpleGrid.appendChild(simpleFrag);

    if (elements.poolListNews) {
        elements.poolListNews.innerHTML = '';
        const poolFrag = document.createDocumentFragment();
        remaining.forEach(item => poolFrag.appendChild(createPoolItem(item)));
        elements.poolListNews.appendChild(poolFrag);
    }

    renderSidebarEmpty(elements.xViralList, 'No X feed configured yet');
    renderSidebarEmpty(elements.redditViralList, 'No Reddit feed configured yet');
}

function decodeEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

function getScoreClass(ranking) {
    if (ranking >= 85) return 'score-fire';
    if (ranking >= 70) return 'score-orange';
    if (ranking >= 55) return 'score-amber';
    if (ranking >= 40) return 'score-blue';
    return 'score-muted';
}

function getScoreInternalHtml(item) {
    const virality = toSafeNumber(item.virality, 0);
    const fit = toSafeNumber(item.fit, 0);
    return `
        <span class="score-badge__internal">
            <span title="Virality">V ${virality}</span>
            <span title="Fit">F ${fit}</span>
        </span>
    `;
}

function getDoneButtonHtml(extraClass = '') {
    const className = `done-button ${extraClass}`.trim();
    return `
        <button class="${className}" title="Mark as done">
            <span class="done-button__icon">✓</span>
            <span class="done-button__label">Done</span>
        </button>
    `;
}

function getSendToSelectionButtonHtml(extraClass = '') {
    const className = `send-selection-btn ${extraClass}`.trim();
    return `
        <button class="${className}" title="Send to Selection">
            <span class="send-selection-btn__icon">↗</span>
            <span class="send-selection-btn__label">Selection</span>
        </button>
    `;
}

function buildSelectionDraftFromSource(item, sourceKind = 'article') {
    const rawHeadline = decodeEntities(item?.headline || 'Untitled');
    const title = normalizeWhitespace(rawHeadline) || 'Untitled';
    const url = safeHttpUrl(item?.link || item?.url || '', '');
    const source = item?.source || item?.author || item?.subreddit || sourceKind;
    const date = item?.date || item?.published_at || '';
    const score = item?.ranking ?? item?.rating ?? item?.score ?? '';
    const reason = item?.reason || '';
    const notes = [
        `Source type: ${sourceKind}`,
        source ? `Source: ${source}` : '',
        date ? `Date: ${date}` : '',
        score !== '' ? `Score: ${score}` : '',
        reason ? `Reason: ${reason}` : '',
    ].filter(Boolean).join('\n');

    return { title, url, notes, type: 'post' };
}

function showSourceSelectionModal(draft) {
    if (!elements.sourceSelectionModalOverlay) return;
    sourceSelectionDraft = { ...draft };
    elements.sourceSelectionTitle.value = draft.title || '';
    elements.sourceSelectionNotes.value = draft.notes || '';

    if (elements.sourceSelectionCategorySelector) {
        const catButtons = elements.sourceSelectionCategorySelector.querySelectorAll('.cat-opt');
        catButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === (draft.type || 'post'));
        });
    }

    elements.sourceSelectionModalOverlay.classList.add('show');
    elements.sourceSelectionTitle.focus();
}

function hideSourceSelectionModal() {
    if (elements.sourceSelectionModalOverlay) {
        elements.sourceSelectionModalOverlay.classList.remove('show');
    }
    sourceSelectionDraft = null;
}

async function saveSourceSelectionIdea() {
    if (!sourceSelectionDraft) return;
    if (!appData) appData = { pool: [], schedule: {}, ideas: [] };
    if (!Array.isArray(appData.ideas)) appData.ideas = [];

    const selectedType = elements.sourceSelectionCategorySelector?.querySelector('.cat-opt.active')?.dataset.type || 'post';
    const title = elements.sourceSelectionTitle.value.trim() || sourceSelectionDraft.title || 'Untitled Idea';
    const notes = elements.sourceSelectionNotes.value.trim();
    const url = sourceSelectionDraft.url || '';

    const newIdea = {
        id: generateId(),
        title,
        url,
        image: '',
        content: notes,
        notes,
        type: selectedType,
        createdAt: new Date().toISOString()
    };

    appData.ideas.unshift(newIdea);
    renderInspiration();
    await saveData();
    hideSourceSelectionModal();

    if (url) fetchMetadata(newIdea.id, url);
}

function markAsDone(headline) {
    doneHeadlines.add(headline);
    localStorage.setItem('done_articles', JSON.stringify(Array.from(doneHeadlines)));
    applyDoneOptimistic(headline);
    scheduleNewsRender();
}

function startNewsAutoRefresh() {
    stopNewsAutoRefresh();
    newsAutoRefreshTimer = setInterval(() => {
        if (currentView === 'sourcing') renderNews(true);
    }, NEWS_REFRESH_INTERVAL_MS);
}

function stopNewsAutoRefresh() {
    if (!newsAutoRefreshTimer) return;
    clearInterval(newsAutoRefreshTimer);
    newsAutoRefreshTimer = null;
}

function initSourcingFeedFilter() {
    if (!elements.sourcingFeedFilter) return;
    const select = elements.sourcingFeedFilter;
    select.innerHTML = '';

    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'ALL';
    select.appendChild(allOpt);

    SOURCING_FEEDS.forEach(feed => {
        const opt = document.createElement('option');
        opt.value = feed.id;
        opt.textContent = feed.label;
        select.appendChild(opt);
    });

    select.value = selectedSourcingFeed;
}

function createFeaturedCard(item, index) {
    const isDone = doneHeadlines.has(item.headline);
    const safeImageUrl = safeHttpUrl(item.image_url, '');
    const hasImage = safeImageUrl && !safeImageUrl.includes('placeholder');
    const safeLink = safeHttpUrl(item.link);
    const safeSource = escapeHtml(item.source || 'Unknown Source');
    const safeReason = escapeHtml(item.reason || '');
    const safeHeadline = escapeHtml(decodeEntities(item.headline || 'Untitled'));
    const ranking = toSafeNumber(item.ranking, 0);
    const safeDate = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const card = document.createElement('div');
    card.className = `card-wrapper ${isDone ? 'card-wrapper--done' : ''}`;
    card.dataset.headline = item.headline || '';

    const imageHtml = hasImage
        ? `<div class="featured-card__image" style="background-image: url('${escapeHtml(safeImageUrl)}'); background-size: cover; background-position: center;">`
        : `<div class="featured-card__image featured-card__image--fallback">
             <div class="featured-card__emoji-pattern" aria-hidden="true">
                <span>📰</span><span>🤖</span><span>⚡</span><span>🧠</span><span>📈</span><span>💬</span>
             </div>
             <span class="featured-card__image-icon">${['🔥', '⚡', '💔', '📢', '⚙️'][index] || '📰'}</span>`;

    card.innerHTML = `
        <a class="featured-card" href="${safeLink}" target="_blank" rel="noopener noreferrer">
            ${imageHtml}
                <span class="featured-card__source-badge">${safeSource}</span>
            </div>
            <div class="featured-card__body">
                <h3 class="featured-card__title">${safeHeadline}</h3>
                <p class="featured-card__reason">${safeReason}</p>
                <div class="featured-card__meta">
                    <span>${safeDate}</span>
                    <span class="featured-card__arrow">→</span>
                </div>
                <div class="featured-card__footer">
                    <div class="score-badge score-badge--featured ${getScoreClass(ranking)}">
                        ${ranking >= 85 ? '<span class="score-badge__icon">🔥</span>' : ''}
                        <span class="score-badge__value">${ranking}</span>
                        ${getScoreInternalHtml(item)}
                    </div>
                    <div class="card-pills-actions">
                        ${!isDone ? getDoneButtonHtml('done-button--inline') : ''}
                        <button class="send-selection-btn send-selection-btn--inline" title="Send to Selection">
                            <span class="send-selection-btn__icon">↗</span>
                            <span class="send-selection-btn__label">Selection</span>
                        </button>
                    </div>
                </div>
            </div>
        </a>
    `;

    const doneBtn = card.querySelector('.done-button');
    if (doneBtn) doneBtn.onclick = (e) => { e.preventDefault(); markAsDone(item.headline); };
    const sendBtn = card.querySelector('.send-selection-btn');
    if (sendBtn) sendBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSourceSelectionModal(buildSelectionDraftFromSource(item, 'article'));
    };
    return card;
}

function createSimpleCard(item, index) {
    const isDone = doneHeadlines.has(item.headline);
    const safeImageUrl = safeHttpUrl(item.image_url, '');
    const hasImage = safeImageUrl && !safeImageUrl.includes('placeholder');
    const safeLink = safeHttpUrl(item.link);
    const safeHeadline = escapeHtml(decodeEntities(item.headline || 'Untitled'));
    const safeReason = escapeHtml(item.reason || '');
    const safeSource = escapeHtml(item.source || 'Unknown Source');
    const ranking = toSafeNumber(item.ranking, 0);
    const safeDate = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const card = document.createElement('div');
    card.className = `card-wrapper ${isDone ? 'card-wrapper--done' : ''}`;
    card.dataset.headline = item.headline || '';

    card.innerHTML = `
        <div class="simple-card">
            <a class="simple-card__main" href="${safeLink}" target="_blank" rel="noopener noreferrer">
                <div class="simple-card__thumb ${hasImage ? 'has-image' : ''}" ${hasImage ? `style="background-image: url('${escapeHtml(safeImageUrl)}');"` : ''}>
                    ${hasImage ? '' : '📰'}
                </div>
                <div class="simple-card__content">
                    <div class="simple-card__title">${safeHeadline}</div>
                    <p class="simple-card__reason">${safeReason}</p>
                    <div class="simple-card__meta">
                        <span>${safeSource} • ${safeDate}</span>
                    </div>
                </div>
                <span class="simple-card__arrow">→</span>
            </a>
            <div class="simple-card__footer">
                <div class="score-pill ${getScoreClass(ranking)}">
                    ${ranking >= 85 ? '<span class="score-pill__icon">🔥</span>' : ''}
                    <span>${ranking}</span>
                    ${getScoreInternalHtml(item)}
                </div>
                <div class="card-pills-actions">
                    ${!isDone ? getDoneButtonHtml('done-button--inline done-button--icon') : ''}
                    ${getSendToSelectionButtonHtml('send-selection-btn--inline send-selection-btn--icon')}
                </div>
            </div>
        </div>
    `;

    const doneBtn = card.querySelector('.done-button');
    if (doneBtn) doneBtn.onclick = (e) => { e.preventDefault(); markAsDone(item.headline); };
    const sendBtn = card.querySelector('.send-selection-btn');
    if (sendBtn) sendBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSourceSelectionModal(buildSelectionDraftFromSource(item, 'article'));
    };
    return card;
}

function createPoolItem(item) {
    const isDone = doneHeadlines.has(item.headline);
    const safeImageUrl = safeHttpUrl(item.image_url, '');
    const hasImage = safeImageUrl && !safeImageUrl.includes('placeholder');
    const safeLink = safeHttpUrl(item.link);
    const safeReason = escapeHtml(item.reason || '');
    const safeHeadline = escapeHtml(decodeEntities(item.headline || 'Untitled'));
    const safeSource = escapeHtml(item.source || 'Unknown Source');
    const ranking = toSafeNumber(item.ranking, 0);
    const safeDate = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const card = document.createElement('div');
    card.className = `card-wrapper pool-wrapper ${isDone ? 'card-wrapper--done' : ''}`;
    card.dataset.headline = item.headline || '';

    card.innerHTML = `
        <div class="pool-item">
            <a class="pool-item__main" href="${safeLink}" target="_blank" rel="noopener noreferrer" title="${safeReason}">
                <div class="pool-item__thumb ${hasImage ? 'has-image' : ''}" ${hasImage ? `style="background-image: url('${escapeHtml(safeImageUrl)}');"` : ''}>
                    ${hasImage ? '' : '📰'}
                </div>
                <div class="pool-item__content">
                    <div class="pool-item__title">${safeHeadline}</div>
                    <div class="pool-item__meta">
                        <span>${safeSource} • ${safeDate}</span>
                    </div>
                </div>
            </a>
            <div class="pool-item__footer">
                <div class="score-pill score-pill--small ${getScoreClass(ranking)}">
                    <span>${ranking}</span>
                    ${getScoreInternalHtml(item)}
                </div>
                <div class="card-pills-actions">
                    ${!isDone ? getDoneButtonHtml('done-button--inline done-button--icon') : ''}
                    ${getSendToSelectionButtonHtml('send-selection-btn--inline send-selection-btn--icon')}
                </div>
            </div>
        </div>
    `;

    const doneBtn = card.querySelector('.done-button');
    if (doneBtn) doneBtn.onclick = (e) => { e.preventDefault(); markAsDone(item.headline); };
    const sendBtn = card.querySelector('.send-selection-btn');
    if (sendBtn) sendBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSourceSelectionModal(buildSelectionDraftFromSource(item, 'article'));
    };
    return card;
}

function formatCompact(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function createXPostItem(item) {
    const card = document.createElement('a');
    card.className = 'x-post';
    card.href = safeHttpUrl(item.link);
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    const safeAuthor = escapeHtml(item.author || 'Unknown');
    const safeHeadline = escapeHtml(decodeEntities(item.headline || 'Untitled'));
    const likes = toSafeNumber(item.likes, 0);
    const views = toSafeNumber(item.views, 0);
    const reposts = toSafeNumber(item.reposts, 0);
    card.innerHTML = `
        <div class="x-post__header">
            <span class="x-post__author">${safeAuthor}</span>
        </div>
        <div class="x-post__title">${safeHeadline}</div>
        <div class="x-post__metrics">
            <span class="x-metric" title="Likes">❤️ ${formatCompact(likes)}</span>
            <span class="x-metric" title="Views">👁 ${formatCompact(views)}</span>
            <span class="x-metric" title="Reposts">🔁 ${formatCompact(reposts)}</span>
        </div>
    `;
    return card;
}

function createRedditPostItem(item) {
    const card = document.createElement('a');
    card.className = 'reddit-post';
    card.href = safeHttpUrl(item.link);
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    const safeSubreddit = escapeHtml(item.subreddit || 'unknown');
    const safeHeadline = escapeHtml(decodeEntities(item.headline || 'Untitled'));
    const score = toSafeNumber(item.score, 0);
    const comments = toSafeNumber(item.comments, 0);
    card.innerHTML = `
        <div class="reddit-post__header">
            <span class="reddit-post__subreddit">r/${safeSubreddit}</span>
        </div>
        <div class="reddit-post__title">${safeHeadline}</div>
        <div class="reddit-post__metrics">
            <span class="reddit-metric" title="Score">⬆ ${formatCompact(score)}</span>
            <span class="reddit-metric" title="Comments">💬 ${formatCompact(comments)}</span>
        </div>
    `;
    return card;
}

function renderInspiration() {
    if (!elements.inspirationGrid) return;
    elements.inspirationGrid.innerHTML = '';

    appData.ideas.forEach(idea => {
        const card = document.createElement('div');
        card.className = 'inspiration-card';

        let domain = '';
        let favicon = '';
        if (idea.url) {
            try {
                domain = new URL(idea.url).hostname.replace('www.', '');
                favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
            } catch (e) {
                domain = 'Reference';
            }
        }

        const safeId = escapeHtml(idea.id || '');
        const safeType = ['post', 'reel', 'promo'].includes(idea.type) ? idea.type : 'post';
        const typeIcon = safeType === 'reel' ? '🎬' : safeType === 'promo' ? '📢' : '📷';
        const hasExtra = (idea.notes && idea.notes.trim()) || (idea.extraLinks && idea.extraLinks.trim());
        const safeTitle = escapeHtml(idea.title || 'Untitled Idea');
        const safeMainUrl = safeHttpUrl(idea.url, '');
        const safeMainUrlText = escapeHtml(idea.url || '');
        const safePreviewImage = safeHttpUrl(idea.image, '');
        const safeFavicon = safeHttpUrl(favicon, '');
        const safeDomain = escapeHtml(domain);

        card.innerHTML = `
            ${safeFavicon || safePreviewImage ? `
                <div class="ins-preview">
                    ${safePreviewImage ? `<img src="${safePreviewImage}" class="ins-thumb" alt="preview">` : ''}
                    ${safeFavicon ? `<img src="${safeFavicon}" class="ins-favicon" alt="icon">` : ''}
                    <span class="ins-domain">${safeDomain}</span>
                </div>
            ` : ''}
            <div class="ins-content">
                <div class="ins-type-badge ${safeType}">${typeIcon} ${safeType}</div>
                <div class="ins-title">${safeTitle}</div>
                ${safeMainUrl ? `<a href="${safeMainUrl}" target="_blank" rel="noopener noreferrer" class="ins-url">${safeMainUrlText}</a>` : ''}
                ${hasExtra ? `
                    <div class="ins-extra-indicators">
                        ${idea.notes ? `<span title="Has Notes">📝</span>` : ''}
                        ${idea.extraLinks ? `<span title="Has Extra links">🔗</span>` : ''}
                    </div>
                ` : ''}
            </div>
            <div class="ins-actions">
                <button class="ins-edit-btn" data-idea-id="${safeId}" data-action="edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="ins-send-btn" data-idea-id="${safeId}" data-action="send">Send to Staging</button>
                <button class="ins-del-btn" data-idea-id="${safeId}" data-action="delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;">
                        <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
        const editBtn = card.querySelector('[data-action="edit"]');
        const sendBtn = card.querySelector('[data-action="send"]');
        const deleteBtn = card.querySelector('[data-action="delete"]');
        if (editBtn) editBtn.addEventListener('click', () => openEditInspiration(idea.id));
        if (sendBtn) sendBtn.addEventListener('click', () => moveIdeaToPool(idea.id));
        if (deleteBtn) deleteBtn.addEventListener('click', () => deleteIdea(idea.id));
        elements.inspirationGrid.appendChild(card);
    });
}

let tempInspirationData = {
    value: '',
    type: 'post'
};

function showInspirationModal(initialValue) {
    tempInspirationData.value = initialValue;
    tempInspirationData.type = 'post'; // Default

    // If it looks like a URL, try to pre-fill name or at least set context
    elements.insModalTitle.value = '';
    if (initialValue.includes('http') || initialValue.includes('.')) {
        // Basic cleanup for placeholder
        try {
            const url = initialValue.startsWith('http') ? initialValue : 'https://' + initialValue;
            const domain = new URL(url).hostname.replace('www.', '');
            elements.insModalTitle.placeholder = `Ref: ${domain}`;
        } catch (e) { }
    } else {
        elements.insModalTitle.value = initialValue;
    }

    // Reset selector
    const options = elements.insModalCategorySelector.querySelectorAll('.cat-opt');
    options.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.type === 'post');
    });

    elements.inspirationModalOverlay.classList.add('show');
    elements.insModalTitle.focus();
}

function hideInspirationModal() {
    elements.inspirationModalOverlay.classList.remove('show');
}

async function addInspiration() {
    const title = elements.insModalTitle.value.trim() || elements.insModalTitle.placeholder;
    let rawValue = tempInspirationData.value.trim();
    const type = tempInspirationData.type;

    let url = '';
    // Decide if it's a URL or just text
    if (rawValue.includes('http') || rawValue.includes('.')) {
        url = rawValue;
        if (!url.includes('://')) url = 'https://' + url;
    }

    // Critical Safety Check - Force allocation if missing
    if (!appData) appData = { ideas: [] };
    if (!appData.ideas) appData.ideas = [];

    const newIdea = {
        id: generateId(),
        title: title,
        url: url,
        image: '', // Will fetch in background
        content: url ? '' : rawValue,
        type: type,
        createdAt: new Date().toISOString()
    };

    appData.ideas.unshift(newIdea);
    renderInspiration();
    hideInspirationModal();
    elements.inspirationMainInput.value = '';

    // Attempt to fetch metadata background
    if (url) {
        fetchMetadata(newIdea.id, url);
    }

    await saveData();
    switchTab('scheduler');
}

async function fetchMetadata(ideaId, url) {
    try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if (data.status === 'success' && data.data.image) {
            const index = appData.ideas.findIndex(i => i.id === ideaId);
            if (index !== -1) {
                appData.ideas[index].image = data.data.image.url;
                renderInspiration(); // Re-render to show image
                await saveData();
            }
        }
    } catch (e) {
        console.warn("Error fetching link metadata:", e);
    }
}

async function deleteIdea(id) {
    appData.ideas = appData.ideas.filter(i => i.id !== id);
    renderInspiration();
    await saveData();
}

async function moveIdeaToPool(id) {
    const idea = appData.ideas.find(i => i.id === id);
    if (!idea) return;

    // Combine main notes with description for the simpler pool card if they exist
    let description = idea.title;
    if (idea.notes) {
        description += `\n---\nNotes: ${idea.notes}`;
    }

    // Create a new card in the pool
    const newCard = {
        id: generateId(),
        type: idea.type || 'post', // Use the idea's selected type
        description: description,
        url: idea.url, // Store the reference link
        extraLinks: idea.extraLinks || '', // Also carry over extra links
        status: CARD_STATUS.SCHEDULED,
        createdAt: new Date().toISOString()
    };

    appData.pool.unshift(newCard);

    // Remove from ideas board
    appData.ideas = appData.ideas.filter(i => i.id !== id);

    renderInspiration();
    renderPool();
    await saveData();
}

// Inspiration Edit Modal Logic
let currentlyEditingIdeaId = null;

function openEditInspiration(id) {
    const idea = appData.ideas.find(i => i.id === id);
    if (!idea) return;

    currentlyEditingIdeaId = id;
    elements.insEditTitle.value = idea.title || '';
    elements.insEditMainUrl.value = idea.url || '';
    elements.insEditNotes.value = idea.notes || '';
    elements.insEditExtraLinks.value = idea.extraLinks || '';

    // Set Category
    const options = elements.insEditCategorySelector.querySelectorAll('.cat-opt');
    options.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.type === (idea.type || 'post'));
    });

    elements.insEditModalOverlay.classList.add('show');
}

function hideInsEditModal() {
    elements.insEditModalOverlay.classList.remove('show');
    currentlyEditingIdeaId = null;
}

async function saveInspirationEdit() {
    if (!currentlyEditingIdeaId) return;
    const index = appData.ideas.findIndex(i => i.id === currentlyEditingIdeaId);
    if (index === -1) return;

    const idea = appData.ideas[index];
    const oldUrl = idea.url;
    const newUrl = elements.insEditMainUrl.value.trim();

    idea.title = elements.insEditTitle.value.trim() || 'Untitled Idea';
    idea.url = newUrl;
    idea.notes = elements.insEditNotes.value.trim();
    idea.extraLinks = elements.insEditExtraLinks.value.trim();
    idea.type = elements.insEditCategorySelector.querySelector('.active')?.dataset.type || 'post';

    // If main URL changed, refetch metadata background
    if (newUrl !== oldUrl && newUrl) {
        fetchMetadata(idea.id, newUrl);
    }

    renderInspiration();
    hideInsEditModal();
    await saveData();
}

window.moveIdeaToPool = moveIdeaToPool;
window.deleteIdea = deleteIdea;
window.openEditInspiration = openEditInspiration;


function renderHistory() {
    const dates = getWeekDates(globalOffset);
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Update Header
    if (elements.weekIndicator) {
        elements.weekIndicator.textContent = `${months[startDate.getMonth()]} ${startDate.getDate()} - ${months[endDate.getMonth()]} ${endDate.getDate()}`;
    }

    // Clear Grid
    elements.historyGrid.innerHTML = '';
    elements.historyGrid.className = 'history-week-grid';

    // Logic: Render 7 columns, just like Scheduler but read-only and filtering for POSTED
    dates.forEach(date => {
        const dateKey = getDateKey(date);
        const dayCards = appData.schedule[dateKey] || []; // default to empty

        // Filter for PUBLISHED cards only
        const postedCards = dayCards.filter(c => c && c.status === CARD_STATUS.POSTED);

        // Create Column
        const column = document.createElement('div');
        column.className = 'day-column';
        // Optional: Highlight current day in history too?
        if (isToday(date)) column.classList.add('today');

        // Header
        column.innerHTML = `
            <div class="day-header">
                <div class="day-info">
                    <span class="day-name">${getDayName(date)}</span>
                    <span class="day-date">${formatDateShort(date)}</span>
                </div>
                <div class="day-progress complete">
                    ${postedCards.length} Published
                </div>
            </div>
            <div class="day-slots history-slots"></div>
        `;

        const slotsContainer = column.querySelector('.day-slots');

        // Render Cards
        if (postedCards.length > 0) {
            postedCards.forEach(card => {
                const type = Object.values(CONTENT_TYPES).find(t => t.id === card.type);
                const cardEl = document.createElement('div');
                // Reuse .content-card class for consistent styling
                cardEl.className = `content-card ${card.type}`;
                // Don't make draggable in history
                cardEl.draggable = false;

                cardEl.innerHTML = `
                    <div class="card-description" style="pointer-events: none; margin-top: 0;">${escapeHtml(card.description || '')}</div>
                `;

                // Add margins since slots container might lack gaps compared to drag grid
                cardEl.style.marginBottom = '8px';
                slotsContainer.appendChild(cardEl);
            });
        } else {
            // Empty state for day
            const emptyEl = document.createElement('div');
            emptyEl.className = 'empty-slot';
            emptyEl.style.border = 'none'; // Clean look
            // emptyEl.textContent = 'No posts';
            slotsContainer.appendChild(emptyEl);
        }

        elements.historyGrid.appendChild(column);
    });
}

// ===========================
// Dashboard & Analytics
// ===========================
let contentMixChart = null;
let activityTrendChart = null;

function renderDashboard() {
    renderCalendar();
    renderKPIs();
    renderCharts();
}

function renderKPIs() {
    const today = new Date();
    const targetMonth = dashboardMonth.getMonth();
    const targetYear = dashboardMonth.getFullYear();

    let totalScheduledMonth = 0;
    let totalScoreSum = 0;
    let totalDaysPassed = 0;

    // Iterate day by day for accurate checks
    const totalDaysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();

    for (let day = 1; day <= totalDaysInMonth; day++) {
        // Construct date object for this specific day
        const dateToCheck = new Date(targetYear, targetMonth, day);
        const dateKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Skip days before the first record of data if in the very first month of app lifetime
        // (Just a cleaner way to avoid 0% for days we literally didn't have the app)
        const dayCards = (appData.schedule[dateKey] || []).filter(c => c !== null);
        if (totalScheduledMonth === 0 && dayCards.length === 0) continue;

        // Zero out time for pure date comparison
        dateToCheck.setHours(0, 0, 0, 0);
        const todayZero = new Date();
        todayZero.setHours(0, 0, 0, 0);

        // Check content for this day
        totalScheduledMonth += dayCards.length;

        // Logic: Calculate "Score" for PASSSED days only
        if (dateToCheck < todayZero) {
            totalDaysPassed++;

            // Daily Goal is 5. 
            // If they did 3, score is 60%. If they did 5+, score is 100%.
            const dailyCount = dayCards.length;
            const dailyScore = Math.min(100, (dailyCount / 5) * 100);

            totalScoreSum += dailyScore;
        }
    }

    elements.totalPostsValue.textContent = totalScheduledMonth;

    // Final Metric: Average of Daily Scores for Passed Days
    let completionRate = 100; // Default to 100% start of month

    if (totalDaysPassed > 0) {
        completionRate = Math.round(totalScoreSum / totalDaysPassed);
    }

    // Update UI
    elements.completionRateValue.innerHTML = `
        ${completionRate}%
        <div style="font-size: 0.75rem; color: var(--text-tertiary); font-weight: 400; margin-top: 4px;">
            Avg of ${totalDaysPassed} days passed
        </div>
    `;
}

function renderCalendar() {
    const year = dashboardMonth.getFullYear();
    const month = dashboardMonth.getMonth();

    // Update Header
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    elements.currentMonthLabel.textContent = `${monthNames[month]} ${year}`;

    elements.monthCalendar.innerHTML = '';

    // Day Headers
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(day => {
        const d = document.createElement('div');
        d.className = 'cal-day-header';
        d.textContent = day;
        elements.monthCalendar.appendChild(d);
    });

    // Calendar Days
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    // Empty slots before first day
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-day empty';
        elements.monthCalendar.appendChild(empty);
    }

    // Days
    for (let i = 1; i <= lastDate; i++) {
        // Use local date format for key to match schedule state
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const cards = appData.schedule[dateStr] || [];

        let dotsHTML = '';
        cards.forEach(c => {
            if (c) {
                if (c.type === 'post') { dotsHTML += '<div class="activity-dot post"></div>'; }
                else if (c.type === 'reel') { dotsHTML += '<div class="activity-dot reel"></div>'; }
                else if (c.type === 'promo') { dotsHTML += '<div class="activity-dot promo"></div>'; }
            }
        });

        // Goal met indicator (e.g., >= 5 items)
        let isSuccess = cards.filter(c => c !== null).length >= 5;

        const cell = document.createElement('div');
        cell.className = `cal-day ${isSuccess ? 'success' : ''}`;

        cell.innerHTML = `
            <div class="cal-date">${i}</div>
            <div class="cal-activity-dots">${dotsHTML}</div>
        `;

        elements.monthCalendar.appendChild(cell);
    }
}

function renderCharts() {
    const ctxMix = document.getElementById('contentMixChart');
    const ctxTrend = document.getElementById('activityTrendChart');

    if (!ctxMix || !ctxTrend) return;

    // Aggregate Data
    let posts = 0, promos = 0, reels = 0;
    Object.values(appData.schedule).forEach(cards => {
        if (Array.isArray(cards)) {
            cards.forEach(c => {
                if (c) {
                    if (c.type === 'post') posts++;
                    else if (c.type === 'promo') promos++;
                    else if (c.type === 'reel') reels++;
                }
            });
        }
    });

    // Mix Chart (Stacked Bar)
    if (contentMixChart) contentMixChart.destroy();
    contentMixChart = new Chart(ctxMix, {
        type: 'bar',
        data: {
            labels: ['Total Content'],
            datasets: [
                {
                    label: 'Posts',
                    data: [posts],
                    backgroundColor: '#007AFF',
                    borderRadius: 6
                },
                {
                    label: 'Promos',
                    data: [promos],
                    backgroundColor: '#5856D6',
                    borderRadius: 6
                },
                {
                    label: 'Reels',
                    data: [reels],
                    backgroundColor: '#FF2D55',
                    borderRadius: 6
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    titleColor: '#000000',
                    bodyColor: '#3C3C43',
                    borderColor: 'rgba(0, 0, 0, 0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                },
                y: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { display: false },
                    border: { display: false }
                }
            }
        }
    });

    // Trend Chart (Line)
    if (activityTrendChart) activityTrendChart.destroy();

    // Calculate weekly volume for trend
    const weeklyVolume = [0, 0, 0, 0];
    Object.keys(appData.schedule).forEach(dateKey => {
        const d = new Date(dateKey + 'T12:00:00');
        const week = Math.floor((d.getDate() - 1) / 7);
        if (week >= 0 && week < 4) {
            weeklyVolume[week] += appData.schedule[dateKey].filter(c => c !== null).length;
        }
    });

    activityTrendChart = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Volume',
                data: weeklyVolume,
                borderColor: '#34C759',
                backgroundColor: 'rgba(52, 199, 89, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 5,
                pointBackgroundColor: '#34C759',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Legend moved to header
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { color: '#8E8E93' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#8E8E93' }
                }
            }
        }
    });
}
// ===========================
// Event Listeners
// ===========================
function setupEventListeners() {
    // Add card buttons
    elements.addPost.addEventListener('click', () => createCard(CONTENT_TYPES.POST));
    elements.addPromo.addEventListener('click', () => createCard(CONTENT_TYPES.PROMO));
    elements.addReel.addEventListener('click', () => createCard(CONTENT_TYPES.REEL));

    // Notes auto-save
    elements.permanentNotes.addEventListener('input', () => {
        showNotesSaving();
        clearTimeout(window.notesTimeout);
        window.notesTimeout = setTimeout(saveNotes, 1000);
    });

    // Tabs
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // News Listeners
    initSourcingFeedFilter();

    if (elements.sourcingFeedFilter) {
        elements.sourcingFeedFilter.addEventListener('change', (e) => {
            selectedSourcingFeed = e.target.value || 'all';
            sourcingArticlesDirty = true;
            renderNews(true);
        });
    }

    if (elements.showDoneNews) {
        elements.showDoneNews.addEventListener('change', (e) => {
            showDoneNews = e.target.checked;
            renderNews(false);
        });
    }
    if (elements.resetNewsBtn) {
        elements.resetNewsBtn.addEventListener('click', () => {
            doneHeadlines.clear();
            localStorage.removeItem('done_articles');
            sourcingFeedCache.clear();
            sourcingArticlesDirty = true;
            renderNews(true);
        });
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && currentView === 'sourcing') {
            renderNews(true);
        }
    });

    // Global Week Navigation (ONLY for History now)
    if (elements.weekPrev) {
        elements.weekPrev.addEventListener('click', () => {
            globalOffset--;
            if (currentView === 'history') renderHistory();
        });
    }
    if (elements.weekNext) {
        elements.weekNext.addEventListener('click', () => {
            globalOffset++;
            if (currentView === 'history') renderHistory();
        });
    }
    if (elements.jumpToday) {
        elements.jumpToday.addEventListener('click', () => {
            globalOffset = 0;
            dashboardMonth = new Date();
            if (currentView === 'history') renderHistory();
        });
    }

    // Context Menu Actions
    elements.menuDelete.addEventListener('click', handleMenuDelete);
    elements.menuEdit.addEventListener('click', handleMenuEdit);

    // Inspiration
    if (elements.inspirationMainInput) {
        elements.inspirationMainInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && elements.inspirationMainInput.value.trim()) {
                e.preventDefault();
                showInspirationModal(elements.inspirationMainInput.value);
            }
        });
    }

    // Inspiration Modal Listeners
    if (elements.insModalSaveBtn) {
        elements.insModalSaveBtn.addEventListener('click', addInspiration);
    }
    if (elements.insModalCancelBtn) {
        elements.insModalCancelBtn.addEventListener('click', hideInspirationModal);
    }
    if (elements.insModalCloseBtn) {
        elements.insModalCloseBtn.addEventListener('click', hideInspirationModal);
    }
    if (elements.insModalTitle) {
        elements.insModalTitle.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addInspiration();
        });
    }
    if (elements.insModalCategorySelector) {
        const catButtons = elements.insModalCategorySelector.querySelectorAll('.cat-opt');
        catButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                catButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                tempInspirationData.type = btn.dataset.type;
            });
        });
    }

    // Inspiration Edit Modal Listeners
    if (elements.insEditModalSaveBtn) {
        elements.insEditModalSaveBtn.addEventListener('click', saveInspirationEdit);
    }
    if (elements.insEditModalCancelBtn) {
        elements.insEditModalCancelBtn.addEventListener('click', hideInsEditModal);
    }
    if (elements.insEditModalCloseBtn) {
        elements.insEditModalCloseBtn.addEventListener('click', hideInsEditModal);
    }
    if (elements.insEditCategorySelector) {
        const catButtons = elements.insEditCategorySelector.querySelectorAll('.cat-opt');
        catButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                catButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    if (elements.sourceSelectionCategorySelector) {
        const catButtons = elements.sourceSelectionCategorySelector.querySelectorAll('.cat-opt');
        catButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                catButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // Modal Actions
    elements.modalCloseBtn.addEventListener('click', hideModal);
    elements.modalCancelBtn.addEventListener('click', hideModal);
    elements.modalSaveBtn.addEventListener('click', saveModalEdit);

    // Close modal on click outside
    elements.editModalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.editModalOverlay) {
            hideModal();
        }
    });

    // Delete Modal Actions
    elements.deleteConfirmBtn.addEventListener('click', confirmDelete);
    elements.deleteCancelBtn.addEventListener('click', hideDeleteModal);
    elements.deleteModalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.deleteModalOverlay) {
            hideDeleteModal();
        }
    });

    if (elements.stagingCardDeleteBtn) {
        elements.stagingCardDeleteBtn.addEventListener('click', async () => {
            if (!activeStagingCardId) return;
            await deleteCard(activeStagingCardId, true);
            hideStagingCardModal();
        });
    }
    if (elements.stagingCardReturnBtn) {
        elements.stagingCardReturnBtn.addEventListener('click', async () => {
            if (!activeStagingCardId) return;
            await returnStagingCardToSelection(activeStagingCardId);
            hideStagingCardModal();
        });
    }
    if (elements.stagingCardCancelBtn) {
        elements.stagingCardCancelBtn.addEventListener('click', hideStagingCardModal);
    }
    if (elements.stagingCardModalOverlay) {
        elements.stagingCardModalOverlay.addEventListener('click', (e) => {
            if (e.target === elements.stagingCardModalOverlay) {
                hideStagingCardModal();
            }
        });
    }

    elements.menuMoveToPool.addEventListener('click', handleMenuMoveToPool);

    if (elements.clearPoolBtn) {
        elements.clearPoolBtn.addEventListener('click', clearPool);
    }

    if (elements.sourceSelectionSaveBtn) {
        elements.sourceSelectionSaveBtn.addEventListener('click', saveSourceSelectionIdea);
    }
    if (elements.sourceSelectionCancelBtn) {
        elements.sourceSelectionCancelBtn.addEventListener('click', hideSourceSelectionModal);
    }
    if (elements.sourceSelectionModalCloseBtn) {
        elements.sourceSelectionModalCloseBtn.addEventListener('click', hideSourceSelectionModal);
    }
    if (elements.sourceSelectionModalOverlay) {
        elements.sourceSelectionModalOverlay.addEventListener('click', (e) => {
            if (e.target === elements.sourceSelectionModalOverlay) {
                hideSourceSelectionModal();
            }
        });
    }

    // Export Data
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportData);
    }
}

function exportData() {
    const backup = {
        appData: appData,
        permanentNotes: permanentNotes,
        timestamp: new Date().toISOString()
    };

    // Create downloadable blob
    const dataStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create temp link and click it
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", `daily_tracker_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
}

// ===========================
// Initialize
// ===========================
async function init() {
    await loadData();
    setupEventListeners();
    if (currentView === 'sourcing') startNewsAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
