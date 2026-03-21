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
const ACTIVE_TAB_KEY = 'contentSchedulerActiveTab';
const DONE_ARTICLES_KEY = 'done_articles';
const PENDING_EXTENSION_IDEAS_KEY = 'contentSchedulerPendingExtensionIdeas';
const LEGACY_MIGRATION_OWNER_KEY = 'contentSchedulerLegacyOwnerUid';
const EXTENSION_IMPORT_EVENT = 'DAILY_TRACKER_EXTENSION_IMPORT';
const EXTENSION_IMPORT_ACK_EVENT = 'DAILY_TRACKER_EXTENSION_IMPORT_ACK';

function createEmptyAppData() {
    return {
        pool: [],
        schedule: {},
        ideas: []
    };
}

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
let appData = createEmptyAppData();
let permanentNotes = '';
let draggedCard = null;
let globalOffset = 0;
let currentDate = new Date();
let activeStagingCardId = null;
let sourceSelectionDraft = null;
let currentUser = null;
let pendingExtensionIdeas = [];
let isLoadingUserData = false;
let isHandlingAuthAction = false;
let isAuthStateResolving = true;

// ===========================
// News Ticker State
// ===========================
let showDoneNews = false;
let doneHeadlines = new Set();
const SOURCING_FEEDS = [
    {
        id: 'all',
        label: 'ALL',
        kind: 'aggregate',
        feedIds: ['ai-general', 'anthropic-claude', 'openai-chatgpt', 'robotics', 'technology']
    },
    {
        id: 'ai-general',
        label: 'AI General',
        kind: 'news',
        url: 'https://rss.app/feeds/v1.1/ow6LmNtmgkH0e876.json'
    },
    {
        id: 'anthropic-claude',
        label: 'Anthropic - Claude',
        kind: 'news',
        url: 'https://rss.app/feeds/v1.1/iGJMgVDHBRIPxraA.json'
    },
    {
        id: 'openai-chatgpt',
        label: 'OpenAI - ChatGPT',
        kind: 'news',
        url: 'https://rss.app/feeds/v1.1/Q48RJR9Y86VLB48k.json'
    },
    {
        id: 'robotics',
        label: 'Robotics',
        kind: 'news',
        url: 'https://rss.app/feeds/v1.1/cUiUbXPU5KD7L6u1.json'
    },
    {
        id: 'technology',
        label: 'Technology',
        kind: 'news',
        url: 'https://rss.app/feeds/v1.1/tK7d10xMOEoFXoDr.json'
    },
];
const INSTAGRAM_VIRAL_FEED = {
    id: 'instagram-viral',
    url: 'https://rss.app/feeds/v1.1/_rJZ1VcmwRQcUDWY7.json',
    format: 'json'
};
const DEFAULT_X_FEED_CONFIG = {
    rssUrl: 'https://rss.app/feeds/v1.1/_hL57mgTsWKN2ldbw.json',
    rssFormat: 'json',
    bridgeEnabled: false,
    bridgeUrl: `${window.location.origin}/rss-bridge/`,
    context: 'By keyword or hashtag',
    query: '"artificial intelligence" OR AI OR ChatGPT OR OpenAI OR Anthropic OR Claude OR Gemini OR robotics',
    maxResults: 12,
    hideReplies: true,
    hideRetweets: true,
    hidePinned: true,
    onlyMedia: false,
    hideProfilePictures: true,
    hideTweetImages: false,
    hideExternalLinkPreview: false,
    useTweetIdAsTitle: false
};
const REDDIT_VIRAL_FEED = {
    id: 'reddit-viral',
    url: `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://old.reddit.com/user/diligent_run882/m/ai/.rss')}`,
    format: 'rss2json'
};
const SIDEBAR_CORS_PROXY_URL = 'https://api.allorigins.win/raw?url=';
const IMAGE_PROXY_URL = 'https://images.weserv.nl/?url=';
const DAILY_TRACKER_DATASET_URL = new URL('data.json', window.location.href).toString();
const SIDEBAR_ITEM_LIMIT = 25;
let selectedSourcingFeed = 'all';
const sourcingFeedCache = new Map();
const sidebarFeedCache = new Map();
let sourcingArticlesCache = [];
let publishedTrackerDataCache = null;
let sourcingArticlesDirty = true;
let lastSourcingFeedFailures = [];
const NEWS_REFRESH_INTERVAL_MS = 120000;
let newsAutoRefreshTimer = null;
let isNewsRefreshing = false;

function ensureAppDataIntegrity() {
    if (!appData || typeof appData !== 'object') {
        appData = createEmptyAppData();
    }
    if (!Array.isArray(appData.pool)) appData.pool = [];
    if (!appData.schedule || typeof appData.schedule !== 'object') appData.schedule = {};
    if (!Array.isArray(appData.ideas)) appData.ideas = [];
    return appData;
}

function getXFeedRuntimeConfig() {
    return {
        ...DEFAULT_X_FEED_CONFIG,
        ...(window.DAILY_TRACKER_X_FEED || {})
    };
}

function buildXRssFeedConfig() {
    const runtimeConfig = getXFeedRuntimeConfig();
    const rssUrl = typeof runtimeConfig.rssUrl === 'string'
        ? runtimeConfig.rssUrl.trim()
        : '';
    if (!rssUrl) return null;

    return {
        id: `x-rss:${rssUrl}`,
        url: rssUrl,
        format: runtimeConfig.rssFormat || 'json'
    };
}

function buildXBridgeFeedConfig() {
    const runtimeConfig = getXFeedRuntimeConfig();

    if (!runtimeConfig.bridgeEnabled) return null;

    const rawBridgeUrl = typeof runtimeConfig.bridgeUrl === 'string'
        ? runtimeConfig.bridgeUrl.trim()
        : '';
    if (!rawBridgeUrl) return null;

    const context = runtimeConfig.context || 'By keyword or hashtag';
    const endpoint = new URL(rawBridgeUrl, window.location.href);
    endpoint.searchParams.set('action', 'display');
    endpoint.searchParams.set('bridge', 'TwitterV2Bridge');
    endpoint.searchParams.set('format', 'Json');
    endpoint.searchParams.set('context', context);

    if (context === 'By username') {
        const username = String(runtimeConfig.username || '').trim().replace(/^@/, '');
        if (!username) return null;
        endpoint.searchParams.set('u', username);
    } else if (context === 'By list ID') {
        const listId = String(runtimeConfig.listId || '').trim();
        if (!listId) return null;
        endpoint.searchParams.set('listid', listId);
    } else {
        const query = String(runtimeConfig.query || '').trim();
        if (!query) return null;
        endpoint.searchParams.set('query', query);
    }

    const maxResults = Math.max(1, Math.min(100, Number(runtimeConfig.maxResults) || SIDEBAR_ITEM_LIMIT));
    endpoint.searchParams.set('maxresults', String(maxResults));

    if (runtimeConfig.hideReplies) endpoint.searchParams.set('norep', 'on');
    if (runtimeConfig.hideRetweets) endpoint.searchParams.set('noretweet', 'on');
    if (runtimeConfig.hidePinned) endpoint.searchParams.set('nopinned', 'on');
    if (runtimeConfig.onlyMedia) endpoint.searchParams.set('imgonly', 'on');
    if (runtimeConfig.hideProfilePictures) endpoint.searchParams.set('nopic', 'on');
    if (runtimeConfig.hideTweetImages) endpoint.searchParams.set('noimg', 'on');
    if (runtimeConfig.hideExternalLinkPreview) endpoint.searchParams.set('noexternallink', 'on');
    if (runtimeConfig.useTweetIdAsTitle) endpoint.searchParams.set('idastitle', 'on');

    return {
        id: `x-viral:${endpoint.toString()}`,
        url: endpoint.toString(),
        format: 'rss-bridge-json'
    };
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
    authGate: document.getElementById('authGate'),
    authGateTitle: document.getElementById('authGateTitle'),
    authGateDescription: document.getElementById('authGateDescription'),
    authStatus: document.getElementById('authStatus'),
    loginBtn: document.getElementById('loginBtn'),
    authUser: document.getElementById('authUser'),
    authActionBtn: document.getElementById('authActionBtn'),
    exportBtn: document.getElementById('exportBtn'),
    // News Tab Elements
    showDoneNews: document.getElementById('showDoneNews'),
    refreshNewsBtn: document.getElementById('refreshNewsBtn'),
    newsRefreshStatus: document.getElementById('newsRefreshStatus'),
    resetNewsBtn: document.getElementById('resetNewsBtn'),
    sourcingFeedFilter: document.getElementById('sourcingFeedFilter'),
    newsMainScroll: document.getElementById('newsMainScroll'),
    newsMainActiveLabel: document.getElementById('newsMainActiveLabel'),
    newsMainActiveCount: document.getElementById('newsMainActiveCount'),
    featuredStoriesGroup: document.getElementById('featuredStoriesGroup'),
    moreStoriesGroup: document.getElementById('moreStoriesGroup'),
    bufferStoriesGroup: document.getElementById('bufferStoriesGroup'),
    featuredGrid: document.getElementById('featuredGrid'),
    simpleGrid: document.getElementById('simpleGrid'),
    poolListNews: document.getElementById('poolListNews'),
    xViralList: document.getElementById('xViralList'),
    instagramViralList: document.getElementById('instagramViralList'),
    redditViralList: document.getElementById('redditViralList'),
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

function normalizeUrlCandidate(value) {
    let output = decodeEntities(String(value ?? '').trim());
    if (!output) return '';

    for (let i = 0; i < 2; i += 1) {
        if (!/^https?%3a/i.test(output) && !/^https?%253a/i.test(output)) break;
        try {
            output = decodeURIComponent(output);
        } catch {
            break;
        }
    }

    if (output.startsWith('//')) {
        output = `https:${output}`;
    }

    return output;
}

function safeHttpUrl(url, fallback = '#') {
    const candidate = normalizeUrlCandidate(url);
    if (!candidate) return fallback;
    try {
        const parsed = new URL(candidate, window.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;

        if (parsed.hostname === 'old.reddit.com' || parsed.hostname === 'reddit.com') {
            parsed.hostname = 'www.reddit.com';
        }

        return parsed.href;
    } catch {
        return fallback;
    }
}

function toSafeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function htmlToPlainText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html || '';
    return normalizeWhitespace(temp.textContent || temp.innerText || '');
}

function getDisplayImageUrl(url, fallback = '') {
    const normalized = safeHttpUrl(url, '');
    if (!normalized) return fallback;

    try {
        const parsed = new URL(normalized);
        const source = `${parsed.host}${parsed.pathname}${parsed.search}`;
        return `${IMAGE_PROXY_URL}${encodeURIComponent(source)}`;
    } catch {
        return fallback;
    }
}

function safeGetLocalStorageItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.error(`Failed to read localStorage key "${key}"`, e);
        return null;
    }
}

function safeSetLocalStorageItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.error(`Failed to write localStorage key "${key}"`, e);
        return false;
    }
}

function safeRemoveLocalStorageItem(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (e) {
        console.error(`Failed to remove localStorage key "${key}"`, e);
        return false;
    }
}

function readJsonFromLocalStorage(key, fallback) {
    const raw = safeGetLocalStorageItem(key);
    if (raw === null) return fallback;
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error(`Failed to parse localStorage key "${key}"`, e);
        return fallback;
    }
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
// Firebase Imports & Config
// ===========================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    GoogleAuthProvider,
    browserLocalPersistence,
    browserPopupRedirectResolver,
    browserSessionPersistence,
    indexedDBLocalPersistence,
    initializeAuth,
    onAuthStateChanged,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
const auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    popupRedirectResolver: browserPopupRedirectResolver
});
const googleProvider = new GoogleAuthProvider();

// ===========================
// Data Management
// ===========================

function getUserScopedKey(baseKey, user = currentUser) {
    return user?.uid ? `${baseKey}:${user.uid}` : baseKey;
}

function getUserStorageKeys(user = currentUser) {
    return {
        data: getUserScopedKey(STORAGE_KEY, user),
        notes: getUserScopedKey(NOTES_KEY, user),
        done: getUserScopedKey(DONE_ARTICLES_KEY, user)
    };
}

function getUserDocRef(user = currentUser) {
    if (!user?.uid) return null;
    return doc(db, "daily-tracker-data", user.uid);
}

function getLocalSnapshotForUser(user = currentUser) {
    const keys = getUserStorageKeys(user);
    const cachedDone = readJsonFromLocalStorage(keys.done, []);
    return {
        appData: readJsonFromLocalStorage(keys.data, null),
        permanentNotes: safeGetLocalStorageItem(keys.notes) || '',
        doneHeadlines: Array.isArray(cachedDone) ? cachedDone : []
    };
}

function getLegacyLocalSnapshot() {
    const cachedDone = readJsonFromLocalStorage(DONE_ARTICLES_KEY, []);
    return {
        appData: readJsonFromLocalStorage(STORAGE_KEY, null),
        permanentNotes: safeGetLocalStorageItem(NOTES_KEY) || '',
        doneHeadlines: Array.isArray(cachedDone) ? cachedDone : []
    };
}

function canClaimLegacyLocalSnapshot(user = currentUser) {
    if (!user?.uid) return false;
    const claimedBy = safeGetLocalStorageItem(LEGACY_MIGRATION_OWNER_KEY);
    return !claimedBy || claimedBy === user.uid;
}

function claimLegacyLocalSnapshot(user = currentUser) {
    if (user?.uid) safeSetLocalStorageItem(LEGACY_MIGRATION_OWNER_KEY, user.uid);
}

function applyLoadedState(snapshot = {}) {
    appData = snapshot.appData || createEmptyAppData();
    ensureAppDataIntegrity();

    permanentNotes = typeof snapshot.permanentNotes === 'string' ? snapshot.permanentNotes : '';

    const headlines = Array.isArray(snapshot.doneHeadlines) ? snapshot.doneHeadlines : [];
    doneHeadlines = new Set(
        headlines
            .map(normalizeStoredDoneMarker)
            .filter(Boolean)
    );

    if (elements.permanentNotes) elements.permanentNotes.value = permanentNotes;
}

function resetInMemoryState() {
    applyLoadedState({
        appData: createEmptyAppData(),
        permanentNotes: '',
        doneHeadlines: []
    });
}

function persistUserLocalCache(user = currentUser) {
    if (!user?.uid) return false;

    permanentNotes = elements.permanentNotes ? elements.permanentNotes.value : permanentNotes;
    const keys = getUserStorageKeys(user);

    const wroteData = safeSetLocalStorageItem(keys.data, JSON.stringify(appData));
    const wroteNotes = safeSetLocalStorageItem(keys.notes, permanentNotes);
    const wroteDone = safeSetLocalStorageItem(keys.done, JSON.stringify(Array.from(doneHeadlines)));

    return wroteData && wroteNotes && wroteDone;
}

function loadPendingExtensionIdeasBuffer() {
    const cached = readJsonFromLocalStorage(PENDING_EXTENSION_IDEAS_KEY, []);
    pendingExtensionIdeas = Array.isArray(cached) ? cached : [];
}

function persistPendingExtensionIdeasBuffer() {
    if (!pendingExtensionIdeas.length) {
        safeRemoveLocalStorageItem(PENDING_EXTENSION_IDEAS_KEY);
        return;
    }
    safeSetLocalStorageItem(PENDING_EXTENSION_IDEAS_KEY, JSON.stringify(pendingExtensionIdeas));
}

function normalizeImportedIdea(rawIdea) {
    if (!rawIdea || typeof rawIdea !== 'object') return null;

    const title = normalizeWhitespace(rawIdea.title || rawIdea.notes || rawIdea.content || '');
    if (!title) return null;

    const type = ['post', 'reel', 'promo'].includes(rawIdea.type) ? rawIdea.type : 'post';
    const notes = typeof rawIdea.notes === 'string'
        ? rawIdea.notes
        : (typeof rawIdea.content === 'string' ? rawIdea.content : '');

    return {
        id: normalizeWhitespace(rawIdea.id) || generateId(),
        title,
        url: safeHttpUrl(rawIdea.url, ''),
        image: typeof rawIdea.image === 'string' ? rawIdea.image : '',
        content: notes,
        notes,
        extraLinks: typeof rawIdea.extraLinks === 'string' ? rawIdea.extraLinks : '',
        type,
        createdAt: typeof rawIdea.createdAt === 'string' ? rawIdea.createdAt : new Date().toISOString()
    };
}

function queuePendingExtensionIdeas(rawIdeas = []) {
    const existingIds = new Set(
        pendingExtensionIdeas
            .map(idea => normalizeWhitespace(idea?.id))
            .filter(Boolean)
    );
    const acceptedIdeas = [];

    rawIdeas.forEach(rawIdea => {
        const idea = normalizeImportedIdea(rawIdea);
        if (!idea || existingIds.has(idea.id)) return;
        existingIds.add(idea.id);
        acceptedIdeas.push(idea);
    });

    if (acceptedIdeas.length) {
        pendingExtensionIdeas = [...acceptedIdeas, ...pendingExtensionIdeas];
        persistPendingExtensionIdeasBuffer();
    }

    return acceptedIdeas;
}

function mergeIdeasIntoAppData(ideas = []) {
    const existingIds = new Set(
        appData.ideas
            .map(idea => normalizeWhitespace(idea?.id))
            .filter(Boolean)
    );
    let addedCount = 0;

    [...ideas].reverse().forEach(idea => {
        if (!idea || existingIds.has(idea.id)) return;
        existingIds.add(idea.id);
        appData.ideas.unshift(idea);
        addedCount += 1;
    });

    return addedCount;
}

async function drainPendingExtensionIdeas() {
    if (!currentUser?.uid || !pendingExtensionIdeas.length || isLoadingUserData) return 0;

    const queuedIdeas = pendingExtensionIdeas.slice();
    pendingExtensionIdeas = [];
    persistPendingExtensionIdeasBuffer();

    const addedCount = mergeIdeasIntoAppData(queuedIdeas);
    if (!addedCount) return 0;

    renderInspiration();
    await saveData();
    return addedCount;
}

async function handleExtensionImportEvent(event) {
    if (event.source !== window) return;
    if (event.data?.type !== EXTENSION_IMPORT_EVENT) return;

    const acceptedIdeas = queuePendingExtensionIdeas(Array.isArray(event.data.ideas) ? event.data.ideas : []);
    let importedCount = 0;

    if (acceptedIdeas.length && currentUser?.uid && !isLoadingUserData) {
        importedCount = await drainPendingExtensionIdeas();
    }

    window.postMessage({
        type: EXTENSION_IMPORT_ACK_EVENT,
        acceptedCount: acceptedIdeas.length,
        importedCount
    }, '*');
}

function getUserLabel(user = currentUser) {
    if (!user) return '';
    return normalizeWhitespace(user.displayName || user.email || 'Signed in');
}

function updateAuthButtons({ busy = false, signedIn = !!currentUser } = {}) {
    const isResolving = isAuthStateResolving && !signedIn;

    if (elements.authActionBtn) {
        elements.authActionBtn.disabled = busy || isResolving;
        elements.authActionBtn.textContent = busy
            ? (signedIn ? 'Signing out...' : 'Connecting...')
            : isResolving
                ? 'Checking...'
                : (signedIn ? 'Logout' : 'Sign In');
    }

    if (elements.loginBtn) {
        elements.loginBtn.disabled = busy || isResolving;
        elements.loginBtn.textContent = busy
            ? 'Connecting...'
            : isResolving
                ? 'Checking session...'
                : 'Sign in with Google';
    }

    if (elements.exportBtn) {
        elements.exportBtn.disabled = !signedIn || busy || isResolving;
    }
}

function updateAuthUI() {
    if (elements.authUser) {
        if (currentUser) {
            elements.authUser.textContent = getUserLabel(currentUser);
            elements.authUser.title = currentUser.email || getUserLabel(currentUser);
            elements.authUser.hidden = false;
        } else {
            elements.authUser.textContent = '';
            elements.authUser.hidden = true;
        }
    }

    updateAuthButtons({ busy: isHandlingAuthAction, signedIn: !!currentUser });
}

function setAuthGate(mode = 'signin', statusText = '') {
    const isVisible = mode !== 'hidden';
    const copy = mode === 'resolving'
        ? {
            title: 'Restoring your workspace',
            description: 'Checking your saved session before showing the sign-in prompt.',
            showLogin: false
        }
        : mode === 'error'
            ? {
                title: 'We could not load your workspace',
                description: 'Try again or sign in again to continue.',
                showLogin: true
            }
            : {
                title: 'Sign in to load your workspace',
                description: 'Each Google account gets its own Daily Tracker data inside Firestore.',
                showLogin: true
            };

    if (elements.authGate) {
        elements.authGate.classList.toggle('show', isVisible);
        elements.authGate.dataset.mode = mode;
    }
    if (elements.authGateTitle) {
        elements.authGateTitle.textContent = copy.title;
    }
    if (elements.authGateDescription) {
        elements.authGateDescription.textContent = copy.description;
    }
    if (elements.authStatus) {
        elements.authStatus.textContent = statusText;
    }
    if (elements.loginBtn) {
        elements.loginBtn.hidden = !copy.showLogin;
    }
}

function getFriendlyAuthErrorMessage(error) {
    const code = error?.code || '';
    const host = window.location.hostname || '';
    const isLocalhost = ['localhost', '127.0.0.1'].includes(host);

    if (code === 'auth/configuration-not-found') {
        const localhostHint = isLocalhost
            ? ' Also add `localhost` in Firebase Authentication > Settings > Authorized domains.'
            : '';
        return `Firebase Auth is not configured for Google sign-in yet. Enable Authentication in the Firebase console, turn on the Google provider under Sign-in method, and make sure this domain is authorized.${localhostHint}`;
    }

    if (code === 'auth/unauthorized-domain') {
        return `This domain is not authorized for Firebase Auth: ${window.location.origin}. Add it in Firebase Authentication > Settings > Authorized domains.`;
    }

    if (code === 'auth/popup-blocked') {
        return 'The browser blocked the Google sign-in popup. Allow popups for this site and try again.';
    }

    if (code === 'auth/popup-closed-by-user') {
        return 'The Google sign-in popup was closed before finishing.';
    }

    return error?.message || 'Google sign-in failed.';
}

async function signInWithGoogle() {
    if (isHandlingAuthAction) return;

    isHandlingAuthAction = true;
    updateAuthButtons({ busy: true, signedIn: false });
    setAuthGate('resolving', 'Opening Google sign-in...');

    try {
        await signInWithPopup(auth, googleProvider);
    } catch (e) {
        console.error('Google sign-in failed', e);
        setAuthGate('signin', getFriendlyAuthErrorMessage(e));
    } finally {
        isHandlingAuthAction = false;
        updateAuthUI();
    }
}

async function logoutCurrentUser() {
    if (isHandlingAuthAction || !currentUser) return;

    isHandlingAuthAction = true;
    updateAuthButtons({ busy: true, signedIn: true });
    setAuthGate('resolving', 'Signing out...');

    try {
        await signOut(auth);
    } catch (e) {
        console.error('Sign-out failed', e);
        setAuthGate('hidden', '');
    } finally {
        isHandlingAuthAction = false;
        updateAuthUI();
    }
}

async function handleAuthAction() {
    if (currentUser) {
        await logoutCurrentUser();
        return;
    }

    await signInWithGoogle();
}

async function loadData() {
    if (!currentUser?.uid) {
        resetInMemoryState();
        render();
        updateSyncStatus('offline', 'Sign in required');
        return;
    }

    updateSyncStatus('pending');
    const userDocRef = getUserDocRef(currentUser);
    const localSnapshot = getLocalSnapshotForUser(currentUser);

    try {
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            applyLoadedState({
                appData: data.appData || localSnapshot.appData || createEmptyAppData(),
                permanentNotes: data.permanentNotes || localSnapshot.permanentNotes || '',
                doneHeadlines: Array.isArray(data.doneHeadlines) ? data.doneHeadlines : localSnapshot.doneHeadlines
            });
            persistUserLocalCache(currentUser);
            updateSyncStatus('online');
        } else if (localSnapshot.appData || localSnapshot.permanentNotes || localSnapshot.doneHeadlines.length) {
            applyLoadedState(localSnapshot);
            await saveData();
        } else if (canClaimLegacyLocalSnapshot(currentUser)) {
            const legacySnapshot = getLegacyLocalSnapshot();
            const hasLegacyData = legacySnapshot.appData || legacySnapshot.permanentNotes || legacySnapshot.doneHeadlines.length;

            if (hasLegacyData) {
                applyLoadedState(legacySnapshot);
                claimLegacyLocalSnapshot(currentUser);
                await saveData();
            } else {
                applyLoadedState({
                    appData: createEmptyAppData(),
                    permanentNotes: '',
                    doneHeadlines: []
                });
                updateSyncStatus('online');
            }
        } else {
            applyLoadedState({
                appData: createEmptyAppData(),
                permanentNotes: '',
                doneHeadlines: []
            });
            updateSyncStatus('online');
        }
    } catch (e) {
        console.error("Error loading Firestore data:", e);
        if (localSnapshot.appData || localSnapshot.permanentNotes || localSnapshot.doneHeadlines.length) {
            applyLoadedState(localSnapshot);
        } else {
            applyLoadedState({
                appData: createEmptyAppData(),
                permanentNotes: '',
                doneHeadlines: []
            });
        }
        updateSyncStatus('offline', 'Firestore unavailable');
    }

    ensureAppDataIntegrity();
    if (elements.permanentNotes) elements.permanentNotes.value = permanentNotes;
    render();

    if (currentView === 'sourcing') {
        renderNews();
        startNewsAutoRefresh();
    } else if (currentView === 'selection') {
        renderInspiration();
    }
}

async function saveData() {
    if (!currentUser?.uid) {
        updateSyncStatus('offline', 'Sign in required');
        return;
    }

    permanentNotes = elements.permanentNotes ? elements.permanentNotes.value : permanentNotes;
    const localPersisted = persistUserLocalCache(currentUser);
    updateSyncStatus('pending');

    try {
        await setDoc(getUserDocRef(currentUser), {
            appData,
            permanentNotes,
            doneHeadlines: Array.from(doneHeadlines),
            lastUpdated: new Date().toISOString()
        });
        updateSyncStatus('online');
    } catch (e) {
        console.error("Firestore sync error:", e);
        updateSyncStatus('offline', localPersisted ? 'Local cache active' : 'Local cache failed');
    }
}

function updateSyncStatus(status, errorMsg = '') {
    if (!elements.syncStatus) return;

    elements.syncStatus.classList.remove('online', 'offline', 'pending');
    elements.syncStatus.classList.add(status);

    if (status === 'online') {
        elements.syncText.textContent = 'Synced';
        elements.syncStatus.title = currentUser?.email
            ? `Synced as ${currentUser.email}`
            : 'Cloud sync active';
    } else if (status === 'pending') {
        elements.syncText.textContent = 'Saving...';
        elements.syncStatus.title = currentUser?.email
            ? `Saving changes for ${currentUser.email}`
            : 'Saving changes...';
    } else if (status === 'offline') {
        elements.syncText.textContent = errorMsg === 'Sign in required' ? 'Login' : 'Offline';
        elements.syncStatus.title = errorMsg || 'Sync unavailable';
    }
}

async function saveNotes() {
    permanentNotes = elements.permanentNotes.value;
    await saveData();
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
let currentView = getInitialViewFromStorage();
let dashboardMonth = new Date();

function getInitialViewFromStorage() {
    try {
        const stored = localStorage.getItem(ACTIVE_TAB_KEY);
        const allowedViews = ['sourcing', 'selection', 'scheduler', 'metrics', 'history'];
        return allowedViews.includes(stored) ? stored : 'sourcing';
    } catch {
        return 'sourcing';
    }
}

function switchTab(viewId) {
    const allowedViews = new Set(['sourcing', 'selection', 'scheduler', 'metrics', 'history']);
    if (!allowedViews.has(viewId)) viewId = 'sourcing';

    currentView = viewId;
    try {
        localStorage.setItem(ACTIVE_TAB_KEY, viewId);
    } catch (e) {
        console.warn('Failed to persist active tab', e);
    }

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

    if (!currentUser?.uid || isLoadingUserData) {
        stopNewsAutoRefresh();
        return;
    }

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

window.addEventListener('beforeunload', () => {
    try {
        localStorage.setItem(ACTIVE_TAB_KEY, currentView);
    } catch (e) {
        console.warn('Failed to persist active tab on unload', e);
    }
});

// ===========================
// News Rendering Logic
// ===========================
function getSelectedFeedConfigs() {
    const selected = SOURCING_FEEDS.find(f => f.id === selectedSourcingFeed);
    const fallback = SOURCING_FEEDS[0];
    const active = selected || fallback;

    if (active.kind === 'aggregate') {
        const ids = Array.isArray(active.feedIds) ? active.feedIds : [];
        const feeds = ids
            .map(id => SOURCING_FEEDS.find(feed => feed.id === id))
            .filter(feed => feed?.kind === 'news' && feed.url);
        return feeds.length ? feeds : SOURCING_FEEDS.filter(feed => feed.kind === 'news' && feed.url);
    }

    return active?.kind === 'news' && active.url ? [active] : [];
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

const SOURCE_POWER_WORDS = [
    'secret', 'cheat sheet', 'hack', 'workflow', 'hidden', 'must-know',
    'best', 'top', 'only', 'breakthrough', 'revealed', 'viral', 'explained'
];

const SOURCE_ACTION_TRIGGERS = [
    'comment', 'save this', 'don\'t miss out', 'dm', 'keyword', 'template', 'free',
    'watch', 'see', 'try this', 'thread'
];

const SOURCE_PRACTICAL_TERMS = [
    'how to', 'template', 'prompt', 'workflow', 'step-by-step', 'guide',
    'checklist', 'framework', 'example', 'examples', 'playbook', 'tutorial',
    'use case', 'strategy', 'automation', 'tool', 'launch', 'agent'
];

const SOURCE_THEME_TERMS = [
    'ai', 'artificial intelligence', 'llm', 'model', 'models', 'openai', 'chatgpt',
    'anthropic', 'claude', 'gemini', 'deepmind', 'robotics', 'robot', 'chip',
    'gpu', 'nvidia', 'startup', 'software', 'app', 'automation', 'platform',
    'developer', 'api', 'inference', 'video model', 'image model'
];

const SOURCE_URGENCY_WORDS = [
    'moving fast', 'stay ahead', 'ahead of the curve', 'left behind', 'now', 'today',
    'just in', 'new', 'latest', 'first look'
];

const SOURCE_SAVEABLE_KEYWORDS = [
    'top', 'tips', 'steps', 'ways', 'guide', 'checklist', 'framework',
    'mistakes', 'lessons', 'examples', 'thread', 'roundup', 'resources'
];

const SOURCE_VISUAL_KEYWORDS = [
    'video', 'image', 'photo', 'demo', 'design', 'prototype',
    'device', 'app', 'ui', 'animation', 'before and after', 'showcase',
    'screen recording', 'screenshot'
];

const SOURCE_QUALITY = {
    'theverge.com': 95,
    'techcrunch.com': 90,
    'wired.com': 88,
    'openai.com': 96,
    'anthropic.com': 96,
    'googleblog.com': 90,
    'arstechnica.com': 88,
    'mit.edu': 92,
    'reuters.com': 96,
    'apnews.com': 95,
    'cnbc.com': 84,
    'axios.com': 80,
    'microsoft.com': 88,
    'blog.google': 86,
    'substack.com': 68,
    'reddit.com': 58,
    'x.com': 56
};

const SOURCING_SCORE_PROFILES = {
    news: {
        recencyHalfLifeHours: 38,
        freshnessFloor: 18,
        interest: { relevance: 0.38, utility: 0.22, hook: 0.14, clarity: 0.14, shareability: 0.12 },
        quality: { sourceQuality: 0.32, clarity: 0.22, utility: 0.16, media: 0.08, contentDepth: 0.22 },
        confidence: { sourceQuality: 0.28, clarity: 0.2, contentDepth: 0.26, media: 0.08, socialProofConfidence: 0.08, freshness: 0.1 },
        traction: { shareability: 0.42, hook: 0.24, socialProof: 0.08, media: 0.12, freshness: 0.14 },
        virality: { traction: 0.36, freshness: 0.28, hook: 0.14, shareability: 0.12, interest: 0.1 },
        fit: { interest: 0.42, quality: 0.3, utility: 0.12, confidence: 0.16 },
        final: { virality: 0.34, fit: 0.38, freshness: 0.12, confidence: 0.16 }
    },
    instagram: {
        recencyHalfLifeHours: 42,
        freshnessFloor: 16,
        interest: { relevance: 0.28, utility: 0.2, hook: 0.18, clarity: 0.14, shareability: 0.2 },
        quality: { media: 0.28, clarity: 0.18, utility: 0.12, contentDepth: 0.18, sourceQuality: 0.1, socialProof: 0.14 },
        confidence: { socialProofConfidence: 0.32, contentDepth: 0.2, clarity: 0.16, media: 0.16, freshness: 0.08, sourceQuality: 0.08 },
        traction: { socialProof: 0.34, shareability: 0.2, hook: 0.18, media: 0.16, freshness: 0.12 },
        virality: { traction: 0.4, freshness: 0.18, hook: 0.14, shareability: 0.12, media: 0.08, interest: 0.08 },
        fit: { interest: 0.34, quality: 0.28, confidence: 0.24, utility: 0.14 },
        final: { virality: 0.36, fit: 0.3, freshness: 0.1, confidence: 0.12, traction: 0.12 }
    },
    reddit: {
        recencyHalfLifeHours: 30,
        freshnessFloor: 14,
        interest: { relevance: 0.32, utility: 0.2, hook: 0.16, clarity: 0.16, shareability: 0.16 },
        quality: { contentDepth: 0.24, clarity: 0.18, utility: 0.14, sourceQuality: 0.08, socialProof: 0.2, media: 0.16 },
        confidence: { socialProofConfidence: 0.38, contentDepth: 0.2, clarity: 0.14, freshness: 0.12, sourceQuality: 0.06, media: 0.1 },
        traction: { socialProof: 0.4, shareability: 0.16, hook: 0.16, freshness: 0.14, discussion: 0.14 },
        virality: { traction: 0.42, freshness: 0.18, hook: 0.12, shareability: 0.12, interest: 0.08, media: 0.08 },
        fit: { interest: 0.32, quality: 0.28, confidence: 0.26, utility: 0.14 },
        final: { virality: 0.34, fit: 0.28, freshness: 0.1, confidence: 0.14, traction: 0.14 }
    },
    x: {
        recencyHalfLifeHours: 20,
        freshnessFloor: 12,
        interest: { relevance: 0.3, utility: 0.16, hook: 0.22, clarity: 0.14, shareability: 0.18 },
        quality: { clarity: 0.18, media: 0.18, contentDepth: 0.16, sourceQuality: 0.08, socialProof: 0.24, utility: 0.16 },
        confidence: { socialProofConfidence: 0.34, clarity: 0.16, contentDepth: 0.16, media: 0.14, freshness: 0.12, sourceQuality: 0.08 },
        traction: { socialProof: 0.38, hook: 0.18, shareability: 0.16, freshness: 0.16, media: 0.12 },
        virality: { traction: 0.42, freshness: 0.16, hook: 0.14, shareability: 0.12, media: 0.08, interest: 0.08 },
        fit: { interest: 0.3, quality: 0.28, confidence: 0.28, utility: 0.14 },
        final: { virality: 0.36, fit: 0.26, freshness: 0.08, confidence: 0.14, traction: 0.16 }
    }
};

function countKeywordHits(text, keywords) {
    const normalized = (text || '').toLowerCase();
    let hits = 0;
    keywords.forEach((word) => {
        if (normalized.includes(word)) hits += 1;
    });
    return hits;
}

function getSourcingScoreProfile(sourceType = 'news') {
    return SOURCING_SCORE_PROFILES[sourceType] || SOURCING_SCORE_PROFILES.news;
}

function scoreFreshness(hoursAgo, sourceType = 'news') {
    const profile = getSourcingScoreProfile(sourceType);
    const hours = Math.max(0, Number(hoursAgo) || 0);
    const halfLife = Math.max(1, Number(profile.recencyHalfLifeHours) || 36);
    const floor = clampScore(profile.freshnessFloor ?? 12);
    const decayed = floor + (100 - floor) * Math.exp((-Math.log(2) * hours) / halfLife);
    return clampScore(decayed);
}

function scoreHookPotential(headline) {
    const hits = countKeywordHits(headline, SOURCE_POWER_WORDS);
    const urgencyHits = countKeywordHits(headline, SOURCE_URGENCY_WORDS);
    const hasNumber = /\b\d+\b/.test(headline);
    const hasQuestion = /\?/.test(headline);
    const hasContrast = /\b(vs|versus|beats|loses|wins|finally|instead)\b/i.test(headline);
    const bonus = (hasNumber ? 10 : 0) + (hasQuestion ? 8 : 0) + (hasContrast ? 10 : 0);
    return clampScore(hits * 10 + urgencyHits * 10 + bonus + 24);
}

function scorePracticalValue(headline, reason) {
    const text = `${headline || ''} ${reason || ''}`.toLowerCase();
    const themeHits = countKeywordHits(text, SOURCE_THEME_TERMS);
    const actionableHits = countKeywordHits(text, SOURCE_PRACTICAL_TERMS);
    return clampScore(themeHits * 6 + actionableHits * 12 + 24);
}

function scoreSaveability(headline, reason) {
    const text = `${headline || ''} ${reason || ''}`.toLowerCase();
    const hits = countKeywordHits(text, SOURCE_SAVEABLE_KEYWORDS);
    const hasListShape = /\b\d+\s*(ways|steps|tips|lessons|reasons|tools)\b/.test(text);
    const hasChecklist = /\b(checklist|framework|template)\b/.test(text);
    return clampScore(hits * 10 + (hasListShape ? 20 : 0) + (hasChecklist ? 18 : 0) + 20);
}

function scoreActionTriggerPotential(headline, reason) {
    const text = `${headline || ''} ${reason || ''}`.toLowerCase();
    const hits = countKeywordHits(text, SOURCE_ACTION_TRIGGERS);
    const commentKeywordPattern = /\bcomment\s+[a-z0-9_-]{3,}\b/.test(text);
    return clampScore(hits * 14 + (commentKeywordPattern ? 18 : 0) + 20);
}

function scoreVisualPotential(headline, hasImage) {
    const hits = countKeywordHits(headline, SOURCE_VISUAL_KEYWORDS);
    const imageBonus = hasImage ? 72 : 28;
    return clampScore(imageBonus + hits * 9);
}

function scoreContentDepth(headline, reason) {
    const safeHeadline = normalizeWhitespace(headline || '');
    const safeReason = normalizeWhitespace(reason || '');
    const headlineLength = safeHeadline.length;
    const reasonLength = safeReason.length;
    const hasExplainerSignal = /\b(how|why|what|breakdown|analysis|thread|guide|explained)\b/i.test(`${safeHeadline} ${safeReason}`);

    let score = 26;
    if (headlineLength >= 40 && headlineLength <= 110) score += 18;
    else if (headlineLength >= 24) score += 10;

    if (reasonLength >= 40) score += 14;
    if (reasonLength >= 90) score += 16;
    if (reasonLength >= 160) score += 10;
    if (hasExplainerSignal) score += 8;

    return clampScore(score);
}

function scoreHeadlineClarity(headline) {
    const length = (headline || '').trim().length;
    if (length === 0) return 0;
    if (length >= 45 && length <= 95) return 95;
    if (length >= 30 && length < 45) return 78;
    if (length > 95 && length <= 125) return 72;
    return 55;
}

function scoreSourceQuality(link) {
    let host = '';
    try {
        host = new URL(link).hostname.replace('www.', '').toLowerCase();
    } catch {
        host = '';
    }
    if (!host) return 64;
    return SOURCE_QUALITY[host] || 68;
}

function scoreTopicalRelevance(headline, reason, source = '') {
    const text = `${headline || ''} ${reason || ''} ${source || ''}`.toLowerCase();
    const themeHits = countKeywordHits(text, SOURCE_THEME_TERMS);
    const hasCoreAiPhrase = /\b(ai|artificial intelligence|llm|chatgpt|openai|claude|anthropic|gemini|robotics?)\b/i.test(text);
    return clampScore(themeHits * 8 + (hasCoreAiPhrase ? 22 : 0) + 34);
}

function normalizeExternalRankSignal(value) {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    if (raw > 100) return clampScore(Math.log10(raw + 1) * 32);
    return clampScore(raw);
}

function getSocialProofMetrics(sourceType, socialProof = {}) {
    const explicitRank = normalizeExternalRankSignal(
        socialProof.viralScore
        ?? socialProof.virality
        ?? socialProof.ranking
        ?? socialProof.rating
    );
    const scoreCount = Math.max(0, toSafeNumber(socialProof.score, 0));
    const commentCount = Math.max(0, toSafeNumber(socialProof.comments, 0));
    const sampleSize = scoreCount + commentCount * 6;
    const discussion = commentCount > 0
        ? clampScore(Math.log10(commentCount + 1) * 26 + Math.min(20, (commentCount / Math.max(1, scoreCount)) * 120))
        : 0;

    if (scoreCount > 0 || commentCount > 0) {
        const engagementMagnitude = clampScore(
            Math.log10(scoreCount + 1) * 24
            + Math.log10(commentCount + 1) * 18
            + Math.min(16, (commentCount / Math.max(1, scoreCount)) * 120)
        );
        const shrink = 1 - Math.exp(-sampleSize / (sourceType === 'reddit' ? 2200 : 1400));
        const prior = explicitRank ?? 56;

        return {
            signal: clampScore(prior * (1 - shrink) + engagementMagnitude * shrink),
            confidence: clampScore(38 + shrink * 62),
            discussion,
            sampleSize
        };
    }

    if (explicitRank !== null) {
        return {
            signal: explicitRank,
            confidence: clampScore(58 + Math.min(18, explicitRank * 0.12)),
            discussion,
            sampleSize
        };
    }

    return {
        signal: null,
        confidence: null,
        discussion,
        sampleSize
    };
}

function weightedScore(features, weights) {
    let totalWeight = 0;
    let weightedTotal = 0;

    Object.entries(weights || {}).forEach(([key, weight]) => {
        const value = Number(features?.[key]);
        if (!Number.isFinite(value)) return;
        totalWeight += weight;
        weightedTotal += value * weight;
    });

    if (totalWeight <= 0) return 0;
    return clampScore(weightedTotal / totalWeight);
}

function applySourcingScoreGuardrails(overall, virality, fit, features, sourceType = 'news') {
    let adjustedOverall = overall;
    let adjustedFit = fit;

    if (features.interest < 42) adjustedOverall = Math.min(adjustedOverall, 64);
    if (features.relevance < 32) adjustedOverall = Math.min(adjustedOverall, 56);
    if (features.quality < 44) adjustedOverall = Math.min(adjustedOverall, 68);
    if (features.confidence < 40) adjustedOverall = Math.min(adjustedOverall, 70);
    if (sourceType !== 'news' && features.traction < 38 && features.freshness < 42) {
        adjustedOverall = Math.min(adjustedOverall, 64);
    }
    if (sourceType === 'news' && features.sourceQuality < 58 && features.utility < 48) {
        adjustedFit = Math.min(adjustedFit, 64);
        adjustedOverall = Math.min(adjustedOverall, 66);
    }
    if (features.interest >= 80 && features.quality >= 74 && features.confidence >= 68) {
        adjustedOverall = clampScore(adjustedOverall + 4);
    }

    return {
        overall: Math.max(1, clampScore(adjustedOverall)),
        virality: Math.max(1, clampScore(virality)),
        fit: Math.max(1, clampScore(adjustedFit))
    };
}

function scoreSourcingItem({
    headline = '',
    reason = '',
    link = '',
    imageUrl = '',
    publishedAt = '',
    source = '',
    sourceType = 'news',
    socialProof = {}
} = {}) {
    const publishedTime = new Date(publishedAt || new Date().toISOString()).getTime();
    const hoursAgo = Number.isFinite(publishedTime)
        ? Math.max(0, (Date.now() - publishedTime) / (1000 * 60 * 60))
        : 0;
    const hasImage = Boolean(imageUrl);
    const freshness = scoreFreshness(hoursAgo, sourceType);
    const hook = scoreHookPotential(headline);
    const utility = scorePracticalValue(headline, reason);
    const shareability = clampScore(scoreSaveability(headline, reason) * 0.6 + scoreActionTriggerPotential(headline, reason) * 0.4);
    const relevance = scoreTopicalRelevance(headline, reason, source);
    const media = scoreVisualPotential(headline, hasImage);
    const clarity = scoreHeadlineClarity(headline);
    const sourceQuality = scoreSourceQuality(link);
    const contentDepth = scoreContentDepth(headline, reason);
    const socialMetrics = getSocialProofMetrics(sourceType, socialProof);

    const features = {
        freshness,
        hook,
        utility,
        shareability,
        relevance,
        media,
        clarity,
        sourceQuality,
        contentDepth,
        socialProof: socialMetrics.signal,
        socialProofConfidence: socialMetrics.confidence,
        discussion: socialMetrics.discussion
    };

    const profile = getSourcingScoreProfile(sourceType);
    const interest = weightedScore(features, profile.interest);
    const quality = weightedScore(features, profile.quality);
    const confidence = weightedScore({ ...features, interest, quality }, profile.confidence);
    const traction = weightedScore({ ...features, interest, quality, confidence }, profile.traction);
    const richFeatures = {
        ...features,
        interest,
        quality,
        confidence,
        traction
    };
    const virality = weightedScore(richFeatures, profile.virality);
    const fit = weightedScore({ ...richFeatures, virality }, profile.fit);
    const overallBase = weightedScore({ ...richFeatures, virality, fit }, profile.final);
    const guardrailed = applySourcingScoreGuardrails(overallBase, virality, fit, richFeatures, sourceType);

    return {
        ranking: guardrailed.overall,
        rating: guardrailed.overall,
        virality: guardrailed.virality,
        fit: guardrailed.fit,
        details: {
            ...richFeatures,
            freshness,
            recency: freshness,
            virality: guardrailed.virality,
            fit: guardrailed.fit,
            final: guardrailed.overall,
            sampleSize: socialMetrics.sampleSize,
            sourceType
        }
    };
}

function buildRankingReason(existingReason, rankingDetails) {
    const base = normalizeWhitespace(existingReason || '');
    const leadFactors = [
        ['Int', rankingDetails.interest],
        ['Qual', rankingDetails.quality],
        ['Fresh', rankingDetails.freshness],
        ['Tra', rankingDetails.traction],
        ['Conf', rankingDetails.confidence]
    ]
        .filter(([, value]) => Number.isFinite(value))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, value]) => `${label}${Math.round(value)}`)
        .join(' ');

    const detail = leadFactors ? `Why: ${leadFactors}` : 'Why: balanced virality and fit';
    if (!base) return detail;
    return `${base.slice(0, 155)} • ${detail}`.slice(0, 220);
}

function normalizeFeedItemToArticle(item, index = 0, options = {}) {
    const sourceType = options.sourceType || 'news';
    const link = safeHttpUrl(item?.url || '');
    const publishedAt = item?.date_published || item?.date_modified || new Date().toISOString();
    const publishedDate = toIsoDateString(publishedAt);
    const headline = decodeEntities(item?.title || 'Untitled');
    const reason = normalizeWhitespace(item?.content_text || '').slice(0, 220);
    const source = getFeedSourceLabel(item, link);
    const imageUrl = getDisplayImageUrl(item?.image || item?.attachments?.[0]?.url || '', '');
    const scores = scoreSourcingItem({
        headline,
        reason,
        link,
        imageUrl,
        publishedAt,
        source,
        sourceType,
        socialProof: {
            ranking: item?.ranking,
            virality: item?.virality,
            viralScore: item?.viral_score,
            score: item?.score
        }
    });

    return {
        headline,
        link,
        source,
        date: publishedDate,
        published_at: publishedAt,
        ranking: scores.ranking,
        rating: scores.rating,
        virality: scores.virality,
        fit: scores.fit,
        score_breakdown: scores.details,
        reason: buildRankingReason(reason, scores.details),
        image_url: imageUrl
    };
}

function applySourcingScoresToArticle(article, options = {}) {
    const sourceType = options.sourceType || 'news';
    const scores = scoreSourcingItem({
        headline: article?.headline || '',
        reason: article?.reason || '',
        link: article?.link || '',
        imageUrl: article?.image_url || article?.image || '',
        publishedAt: article?.published_at || article?.date || new Date().toISOString(),
        source: article?.source || '',
        sourceType,
        socialProof: {
            ranking: options.socialProof?.ranking ?? article?.ranking,
            rating: options.socialProof?.rating ?? article?.rating,
            virality: options.socialProof?.virality ?? article?.virality,
            viralScore: options.socialProof?.viralScore ?? article?.viral_score,
            score: options.socialProof?.score ?? article?.score,
            comments: options.socialProof?.comments ?? article?.comments
        }
    });

    return {
        ...article,
        ranking: scores.ranking,
        rating: scores.rating,
        virality: scores.virality,
        fit: scores.fit,
        score_breakdown: scores.details,
        reason: buildRankingReason(article?.reason || '', scores.details)
    };
}

function parseXAuthorMetadata(item, fallbackSource = '') {
    const authorName = normalizeWhitespace(
        item?.authors?.[0]?.name
        || item?.author?.name
        || item?.author
        || fallbackSource
        || ''
    );
    const handleMatch = authorName.match(/@([A-Za-z0-9_]+)/);
    const handle = handleMatch ? handleMatch[1] : '';
    const fullName = normalizeWhitespace(authorName.replace(/\(@[A-Za-z0-9_]+\)/g, '').replace(/^@/, ''));

    return {
        author: handle,
        full_name: fullName
    };
}

function normalizeXFeedItemToArticle(item, index = 0) {
    const link = safeHttpUrl(item?.url || '');
    const publishedAt = item?.date_published || item?.date_modified || new Date().toISOString();
    const headline = decodeEntities(item?.title || 'Untitled');
    const reason = normalizeWhitespace(item?.content_text || '').slice(0, 220);
    const imageUrl = getDisplayImageUrl(item?.image || item?.attachments?.[0]?.url || '', '');
    const metadata = parseXAuthorMetadata(item, 'X');

    return applySourcingScoresToArticle({
        headline,
        link,
        source: 'X',
        author: metadata.author,
        full_name: metadata.full_name || metadata.author || 'X',
        published_at: publishedAt,
        date: toIsoDateString(publishedAt),
        reason: reason || headline,
        image_url: imageUrl
    }, {
        sourceType: 'x',
        socialProof: {
            ranking: item?.ranking,
            virality: item?.virality,
            viralScore: item?.viral_score,
            score: item?.score
        }
    });
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

function getLegacyDoneHeadlineKey(value) {
    const normalized = normalizeWhitespace(decodeEntities(value || '')).toLowerCase();
    return normalized ? `legacy-headline:${normalized}` : '';
}

function getSourcingItemKey(item = {}) {
    const rawLink = normalizeUrlCandidate(item?.link || item?.url || '');
    const link = rawLink && !rawLink.startsWith('#')
        ? safeHttpUrl(rawLink, '')
        : '';
    if (link) return `link:${link}`;

    const headline = normalizeWhitespace(decodeEntities(item?.headline || item?.title || '')).toLowerCase();
    if (!headline) return '';

    const source = normalizeWhitespace(item?.source || item?.author || item?.subreddit || '').toLowerCase();
    return source ? `headline:${headline}|source:${source}` : `headline:${headline}`;
}

function normalizeStoredDoneMarker(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^(link:|headline:|legacy-headline:)/.test(raw)) return raw;
    return getLegacyDoneHeadlineKey(raw);
}

function isSourcingItemDone(item = {}) {
    const itemKey = getSourcingItemKey(item);
    if (itemKey && doneHeadlines.has(itemKey)) return true;

    const legacyKey = getLegacyDoneHeadlineKey(item?.headline || item?.title || '');
    return legacyKey ? doneHeadlines.has(legacyKey) : false;
}

function getNewsSectionCardCount(sectionId) {
    if (sectionId === 'featured') {
        return elements.featuredGrid?.querySelectorAll('.card-wrapper').length || 0;
    }
    if (sectionId === 'more') {
        return elements.simpleGrid?.querySelectorAll('.card-wrapper').length || 0;
    }
    if (sectionId === 'buffer') {
        return elements.poolListNews?.querySelectorAll('.card-wrapper').length || 0;
    }
    return 0;
}

function getNewsSectionMeta() {
    return [
        {
            id: 'featured',
            label: '🔥 Featured Stories',
            element: elements.featuredStoriesGroup
        },
        {
            id: 'more',
            label: '📋 More Stories',
            element: elements.moreStoriesGroup
        },
        {
            id: 'buffer',
            label: '📰 Buffer',
            element: elements.bufferStoriesGroup
        }
    ].filter(section => section.element);
}

function updateStickyNewsHeader() {
    if (!elements.newsMainActiveLabel || !elements.newsMainActiveCount) return;

    const sections = getNewsSectionMeta();
    if (!sections.length) return;

    const scrollTop = elements.newsMainScroll?.scrollTop || 0;
    let activeSection = sections[0];

    sections.forEach((section) => {
        const sectionTop = section.element?.offsetTop || 0;
        if (scrollTop + 24 >= sectionTop) {
            activeSection = section;
        }
    });

    elements.newsMainActiveLabel.textContent = activeSection.label;
    elements.newsMainActiveCount.textContent = `${getNewsSectionCardCount(activeSection.id)} articles`;
}

function formatSidebarDate(value) {
    const d = new Date(value || '');
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildSidebarFeedRequestUrls(feedConfig, ts = Date.now()) {
    const sourceUrl = `${feedConfig.url}${feedConfig.url.includes('?') ? '&' : '?'}t=${ts}`;
    const proxyUrl = `${SIDEBAR_CORS_PROXY_URL}${encodeURIComponent(sourceUrl)}`;

    if (feedConfig?.format === 'rss2json') {
        return [sourceUrl];
    }

    if (feedConfig?.format === 'rss-bridge-json') {
        return [sourceUrl];
    }

    if (feedConfig?.format === 'rss') {
        return [proxyUrl, sourceUrl];
    }

    return [sourceUrl, proxyUrl];
}

function parseRedditRssItems(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) {
        throw new Error('Invalid Reddit RSS response');
    }

    return Array.from(doc.querySelectorAll('entry')).map((entry) => {
        const title = decodeEntities(entry.querySelector('title')?.textContent || '');
        if (!title) return null;

        const link = entry.querySelector('link')?.getAttribute('href') || '';
        const publishedAt = entry.querySelector('published')?.textContent
            || entry.querySelector('updated')?.textContent
            || new Date().toISOString();
        const subredditLabel = entry.querySelector('category')?.getAttribute('label')
            || entry.querySelector('category')?.getAttribute('term')
            || 'r/reddit';
        const subreddit = subredditLabel.replace(/^r\//, '');
        const author = normalizeWhitespace(entry.querySelector('author > name')?.textContent || '');
        const thumbnail = entry.querySelector('media\\:thumbnail, thumbnail')?.getAttribute('url') || '';
        const rawContent = entry.querySelector('content')?.textContent || '';
        const reason = htmlToPlainText(rawContent)
            .replace(/\[link\]|\[comments\]|submitted by/gi, '')
            .slice(0, 220);

        return applySourcingScoresToArticle({
            headline: title,
            link: safeHttpUrl(link, '#'),
            source: subredditLabel,
            subreddit,
            author,
            published_at: publishedAt,
            date: toIsoDateString(publishedAt),
            reason,
            image_url: safeHttpUrl(decodeEntities(thumbnail), '')
        }, { sourceType: 'reddit' });
    }).filter(Boolean);
}

function parseRedditRss2JsonItems(json) {
    if (json?.status !== 'ok' || !Array.isArray(json?.items)) {
        throw new Error(json?.message || 'Invalid Reddit rss2json response');
    }

    return json.items.map((item) => {
        const publishedAt = item?.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
        const subreddit = normalizeWhitespace(item?.categories?.[0] || 'reddit');
        const rawReason = item?.description || item?.content || '';

        return applySourcingScoresToArticle({
            headline: decodeEntities(item?.title || ''),
            link: safeHttpUrl(item?.link || '', '#'),
            source: `r/${subreddit}`,
            subreddit,
            author: normalizeWhitespace(item?.author || ''),
            published_at: publishedAt,
            date: toIsoDateString(publishedAt),
            reason: htmlToPlainText(rawReason).replace(/\[link\]|\[comments\]|submitted by/gi, '').slice(0, 220),
            image_url: getDisplayImageUrl(item?.thumbnail || item?.enclosure?.thumbnail || '')
        }, {
            sourceType: 'reddit',
            socialProof: {
                score: item?.score,
                comments: item?.comments
            }
        });
    }).filter(item => item.headline && item.link);
}

function getRssBridgeHandle(authorName = '', vendorFields = {}) {
    const vendorUsername = normalizeWhitespace(vendorFields?.username || '').replace(/^@/, '');
    if (vendorUsername) return vendorUsername;
    const match = normalizeWhitespace(authorName).match(/@([A-Za-z0-9_]+)/);
    return match ? match[1] : '';
}

function getRssBridgeDisplayName(authorName = '', vendorFields = {}) {
    const vendorName = normalizeWhitespace(vendorFields?.fullname || '');
    if (vendorName) return vendorName;
    return normalizeWhitespace(authorName)
        .replace(/^RT:\s*/i, '')
        .replace(/\s*\(@[^)]+\)\s*$/, '')
        .trim();
}

function getRssBridgeAttachmentUrl(item) {
    if (!Array.isArray(item?.attachments)) return '';
    const preferred = item.attachments.find((attachment) => {
        return typeof attachment?.mime_type === 'string' && attachment.mime_type.startsWith('image/');
    }) || item.attachments[0];
    return safeHttpUrl(preferred?.url || '', '');
}

function parseRssBridgeJsonItems(json) {
    if (!Array.isArray(json?.items)) {
        throw new Error('Invalid RSS-Bridge JSON response');
    }

    return json.items.map((item) => {
        const link = safeHttpUrl(item?.url || '', '#');
        const publishedAt = item?.date_modified || item?.date_published || new Date().toISOString();
        const contentHtml = item?.content_html || '';
        const reason = normalizeWhitespace(item?.content_text || htmlToPlainText(contentHtml)).slice(0, 220);
        const vendorFields = item?._rssbridge && typeof item._rssbridge === 'object' ? item._rssbridge : {};
        const authorName = normalizeWhitespace(item?.author?.name || '');
        const handle = getRssBridgeHandle(authorName, vendorFields);
        const displayName = getRssBridgeDisplayName(authorName, vendorFields);
        const headline = decodeEntities(item?.title || reason || 'Untitled');
        const imageUrl = getDisplayImageUrl(getRssBridgeAttachmentUrl(item), '');
        return applySourcingScoresToArticle({
            headline,
            link,
            source: 'X',
            author: handle,
            full_name: displayName,
            published_at: publishedAt,
            date: toIsoDateString(publishedAt),
            reason,
            image_url: imageUrl,
        }, { sourceType: 'x' });
    }).filter(item => item.headline && item.link);
}

function buildPublishedDatasetRequestUrl(ts = Date.now()) {
    return `${DAILY_TRACKER_DATASET_URL}${DAILY_TRACKER_DATASET_URL.includes('?') ? '&' : '?'}t=${ts}`;
}

async function fetchPublishedTrackerData(forceRefresh = false) {
    if (!forceRefresh && publishedTrackerDataCache) {
        return publishedTrackerDataCache;
    }

    const res = await fetch(buildPublishedDatasetRequestUrl(), { cache: 'no-store' });
    if (!res.ok) {
        throw new Error(`Published dataset failed with ${res.status}`);
    }

    publishedTrackerDataCache = await res.json();
    return publishedTrackerDataCache;
}

function normalizeStaticXSidebarItem(item) {
    const headline = normalizeWhitespace(item?.headline || item?.title || item?.text || item?.reason || '');
    const link = safeHttpUrl(item?.link || item?.url || '', '#');
    if (!headline || !link) return null;

    const publishedAtSource = item?.published_at || item?.created_at || item?.date || new Date().toISOString();
    const publishedDate = new Date(publishedAtSource);
    const publishedAt = Number.isNaN(publishedDate.getTime())
        ? new Date().toISOString()
        : publishedDate.toISOString();
    const imageUrl = getDisplayImageUrl(
        item?.image_url || item?.image || item?.media_url || item?.preview_image || '',
        ''
    );
    const reason = normalizeWhitespace(item?.reason || item?.text || '').slice(0, 220);
    return applySourcingScoresToArticle({
        headline,
        link,
        source: 'X',
        author: normalizeWhitespace(item?.author || item?.username || item?.handle || '').replace(/^@/, ''),
        full_name: normalizeWhitespace(item?.full_name || item?.display_name || ''),
        published_at: publishedAt,
        date: toIsoDateString(publishedAt),
        reason: reason || headline,
        image_url: imageUrl
    }, {
        sourceType: 'x',
        socialProof: {
            ranking: item?.ranking,
            virality: item?.virality,
            viralScore: item?.viral_score,
            score: item?.score
        }
    });
}

function sortSourcingItemsByScore(a, b) {
    if ((b.ranking || 0) !== (a.ranking || 0)) return (b.ranking || 0) - (a.ranking || 0);
    if ((b.virality || 0) !== (a.virality || 0)) return (b.virality || 0) - (a.virality || 0);
    const da = new Date(a.published_at || a.date || 0).getTime();
    const db = new Date(b.published_at || b.date || 0).getTime();
    return db - da;
}

async function fetchStaticXSidebarItems(forceRefresh = false) {
    const cacheId = 'x-viral-static';
    if (!forceRefresh && sidebarFeedCache.has(cacheId)) {
        return sidebarFeedCache.get(cacheId);
    }

    const dataset = await fetchPublishedTrackerData(forceRefresh);
    const items = Array.isArray(dataset?.x_viral?.items)
        ? dataset.x_viral.items.map((item) => normalizeStaticXSidebarItem(item)).filter(Boolean)
        : [];

    if (items.length) {
        sidebarFeedCache.set(cacheId, items);
    }

    return items;
}

async function fetchSidebarFeed(feedConfig, forceRefresh = false) {
    if (!feedConfig?.url) return [];
    if (!forceRefresh && sidebarFeedCache.has(feedConfig.id)) {
        return sidebarFeedCache.get(feedConfig.id);
    }

    const candidates = buildSidebarFeedRequestUrls(feedConfig);
    let lastError = null;

    for (const url of candidates) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) {
                throw new Error(`Sidebar feed ${feedConfig.id} failed with ${res.status}`);
            }

            const text = await res.text();
            const items = feedConfig.format === 'rss'
                ? parseRedditRssItems(text)
                : feedConfig.format === 'rss2json'
                    ? parseRedditRss2JsonItems(JSON.parse(text))
                    : feedConfig.format === 'rss-bridge-json'
                        ? parseRssBridgeJsonItems(JSON.parse(text))
                : (() => {
                    const json = JSON.parse(text);
                    return Array.isArray(json?.items) ? json.items : [];
                })();

            if (!items.length) {
                throw new Error(`Sidebar feed ${feedConfig.id} returned no items`);
            }

            sidebarFeedCache.set(feedConfig.id, items);
            return items;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error(`Sidebar feed ${feedConfig.id} failed`);
}

async function fetchInstagramSidebarItems(forceRefresh = false) {
    const items = await fetchSidebarFeed(INSTAGRAM_VIRAL_FEED, forceRefresh);
    return dedupeArticlesByLink(
        items.map((item, index) => normalizeFeedItemToArticle(item, index, { sourceType: 'instagram' }))
    )
        .sort(sortSourcingItemsByScore)
        .slice(0, SIDEBAR_ITEM_LIMIT);
}

async function fetchRedditSidebarItems(forceRefresh = false) {
    const items = await fetchSidebarFeed(REDDIT_VIRAL_FEED, forceRefresh);
    return items
        .sort(sortSourcingItemsByScore)
        .slice(0, SIDEBAR_ITEM_LIMIT);
}

async function fetchXSidebarItems(forceRefresh = false, feedConfig = buildXBridgeFeedConfig()) {
    const rssFeedConfig = buildXRssFeedConfig();
    if (rssFeedConfig) {
        try {
            const rssItems = await fetchSidebarFeed(rssFeedConfig, forceRefresh);
            const normalizedRssItems = dedupeArticlesByLink(
                rssItems.map((item, index) => normalizeXFeedItemToArticle(item, index)).filter(Boolean)
            );

            if (normalizedRssItems.length) {
                return normalizedRssItems
                    .sort(sortSourcingItemsByScore)
                    .slice(0, SIDEBAR_ITEM_LIMIT);
            }
        } catch (error) {
            console.warn('Failed to load RSS.app X feed:', error);
        }
    }

    try {
        const staticItems = await fetchStaticXSidebarItems(forceRefresh);
        if (staticItems.length) {
            return staticItems
                .sort(sortSourcingItemsByScore)
                .slice(0, SIDEBAR_ITEM_LIMIT);
        }
    } catch (error) {
        console.warn('Failed to load static X feed:', error);
    }

    if (!feedConfig) return [];
    const items = await fetchSidebarFeed(feedConfig, forceRefresh);
    return items
        .sort(sortSourcingItemsByScore)
        .slice(0, SIDEBAR_ITEM_LIMIT);
}

function renderSidebarEmpty(container, text) {
    if (!container) return;
    container.innerHTML = `<div class="sourcing-empty">${escapeHtml(text)}</div>`;
}

function renderSidebarList(container, items, createItem, emptyText) {
    if (!container) return;
    if (!items.length) {
        renderSidebarEmpty(container, emptyText);
        return;
    }

    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    items.forEach((item, index) => frag.appendChild(createItem(item, index)));
    container.appendChild(frag);
}

function renderSourcingGridSection(container, items, createItem, emptyText) {
    if (!container) return;

    container.innerHTML = '';
    if (!items.length) {
        renderSidebarEmpty(container, emptyText);
        return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((item, index) => frag.appendChild(createItem(item, index)));
    container.appendChild(frag);
}

async function renderSidebarFeeds(forceRefresh = false) {
    const xFeedConfig = buildXBridgeFeedConfig();
    const tasks = [
        fetchInstagramSidebarItems(forceRefresh),
        fetchRedditSidebarItems(forceRefresh),
        fetchXSidebarItems(forceRefresh, xFeedConfig)
    ];

    const results = await Promise.allSettled(tasks);
    const instagramResult = results[0];
    const redditResult = results[1];
    const xResult = results[2];

    if (instagramResult.status === 'fulfilled') {
        renderSidebarList(elements.instagramViralList, instagramResult.value, createInstagramPostItem, 'No Instagram feed available');
    } else {
        console.error('Failed to load Instagram feed:', instagramResult.reason);
        renderSidebarEmpty(elements.instagramViralList, 'Instagram feed unavailable');
    }

    if (redditResult.status === 'fulfilled') {
        renderSidebarList(elements.redditViralList, redditResult.value, createRedditPostItem, 'No Reddit posts available');
    } else {
        console.error('Failed to load Reddit feed:', redditResult.reason);
        renderSidebarEmpty(elements.redditViralList, 'Reddit list unavailable');
    }

    if (xResult?.status === 'fulfilled') {
        renderSidebarList(elements.xViralList, xResult.value, createXPostItem, 'No X posts available');
    } else if (xResult) {
        console.error('Failed to load X feed:', xResult.reason);
        renderSidebarEmpty(elements.xViralList, 'X feed unavailable');
    }
}

function updateSourcingCountsFromDom() {
    if (showDoneNews) return;
    const countCards = (container) => {
        if (!container) return 0;
        return container.querySelectorAll('.card-wrapper').length;
    };
    if (elements.next6Count) elements.next6Count.textContent = `${countCards(elements.simpleGrid)} articles`;
    if (elements.poolCountNews) elements.poolCountNews.textContent = `${countCards(elements.poolListNews)} articles`;
    updateStickyNewsHeader();
}

function applyDoneOptimistic(item) {
    const itemKey = getSourcingItemKey(item);
    if (!itemKey) return;

    const selector = `.card-wrapper[data-article-key="${CSS.escape(itemKey)}"]`;
    const cards = document.querySelectorAll(selector);

    cards.forEach((card) => {
        card.classList.add('card-wrapper--done');
        const doneBtn = card.querySelector('.done-button');
        if (doneBtn) doneBtn.remove();

        if (!showDoneNews) {
            card.style.transition = 'opacity 120ms ease, transform 120ms ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.98)';
            setTimeout(() => {
                card.remove();
                updateSourcingCountsFromDom();
            }, 130);
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
    const selectedFeeds = getSelectedFeedConfigs().filter(feed => feed.kind === 'news');
    const feedResults = await Promise.allSettled(
        selectedFeeds.map(feed => fetchSourcingFeed(feed, forceRefresh))
    );

    const allArticles = [];
    const failedFeeds = [];

    feedResults.forEach((result, index) => {
        const feed = selectedFeeds[index];

        if (result.status === 'fulfilled') {
            result.value.forEach((item, itemIndex) => {
                allArticles.push(normalizeFeedItemToArticle(item, itemIndex));
            });
            return;
        }

        failedFeeds.push(feed?.label || feed?.id || 'Unknown feed');
        console.warn(`Failed to load sourcing feed "${feed?.id || 'unknown'}"`, result.reason);
    });

    lastSourcingFeedFailures = failedFeeds;
    if (!allArticles.length) {
        throw new Error(failedFeeds.length
            ? `Unable to load sourcing feeds: ${failedFeeds.join(', ')}`
            : 'Unable to load sourcing feeds');
    }

    sourcingArticlesCache = dedupeArticlesByLink(allArticles).sort(sortSourcingItemsByScore);
    sourcingArticlesDirty = false;
}

async function renderNews(forceRefresh = false) {
    try {
        if (forceRefresh || sourcingArticlesDirty || sourcingArticlesCache.length === 0) {
            await rebuildSourcingArticles(forceRefresh);
        }
    } catch (err) {
        console.error('Failed to load RSS feeds:', err);
        return false;
    }

    const activeArticles = showDoneNews
        ? sourcingArticlesCache
        : sourcingArticlesCache.filter(item => !isSourcingItemDone(item));

    const featuredArticles = activeArticles.slice(0, 12);
    const moreStories = activeArticles.slice(12, 36);
    const remaining = activeArticles.slice(36);
    const noPendingArticles = !showDoneNews && activeArticles.length === 0 && sourcingArticlesCache.length > 0;

    // Render counts
    if (elements.next6Count) elements.next6Count.textContent = `${moreStories.length} articles`;
    if (elements.poolCountNews) elements.poolCountNews.textContent = `${remaining.length} articles`;

    renderSourcingGridSection(
        elements.featuredGrid,
        featuredArticles,
        createFeaturedCard,
        noPendingArticles ? 'Everything in this feed is marked done.' : 'No featured stories available for this feed.'
    );
    renderSourcingGridSection(
        elements.simpleGrid,
        moreStories,
        (item, index) => createMagazineCard(item, index + 12),
        noPendingArticles ? 'Nothing pending beyond the featured picks.' : 'No more stories for this feed yet.'
    );
    renderSourcingGridSection(
        elements.poolListNews,
        remaining,
        (item, index) => createCompactTile(item, index + 36),
        noPendingArticles ? 'Buffer is clear for this feed.' : 'No buffer stories available yet.'
    );

    updateStickyNewsHeader();
    await renderSidebarFeeds(forceRefresh);
    return true;
}

function setNewsRefreshStatus(text, tone = 'neutral') {
    if (!elements.newsRefreshStatus) return;
    elements.newsRefreshStatus.textContent = text;
    elements.newsRefreshStatus.dataset.tone = tone;
}

async function refreshNewsNow(manual = false) {
    if (isNewsRefreshing) return;
    isNewsRefreshing = true;
    if (elements.refreshNewsBtn) {
        elements.refreshNewsBtn.disabled = true;
    }
    if (manual) setNewsRefreshStatus('Refreshing feeds...', 'neutral');

    // Force a true refresh from source, not from in-memory cache.
    sourcingFeedCache.clear();
    sidebarFeedCache.clear();
    publishedTrackerDataCache = null;
    sourcingArticlesDirty = true;
    const ok = await renderNews(true);

    if (manual) {
        if (ok) {
            const hhmm = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (lastSourcingFeedFailures.length) {
                const label = lastSourcingFeedFailures.length === 1 ? 'feed failed' : 'feeds failed';
                setNewsRefreshStatus(`Updated ${hhmm} · ${lastSourcingFeedFailures.length} ${label}`, 'warning');
            } else {
                setNewsRefreshStatus(`Updated ${hhmm}`, 'success');
            }
        } else {
            setNewsRefreshStatus('Refresh failed', 'error');
        }
    }

    if (elements.refreshNewsBtn) {
        elements.refreshNewsBtn.disabled = false;
    }
    isNewsRefreshing = false;
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

function getScoreBreakdown(item = {}) {
    const breakdown = item?.score_breakdown && typeof item.score_breakdown === 'object'
        ? item.score_breakdown
        : {};

    return {
        final: toSafeNumber(breakdown.final ?? item?.ranking ?? item?.rating, 0),
        virality: toSafeNumber(breakdown.virality ?? item?.virality, 0),
        fit: toSafeNumber(breakdown.fit ?? item?.fit, 0),
        interest: toSafeNumber(breakdown.interest, 0),
        quality: toSafeNumber(breakdown.quality, 0),
        freshness: toSafeNumber(breakdown.freshness ?? breakdown.recency, 0),
        traction: toSafeNumber(breakdown.traction ?? breakdown.socialProof, 0),
        confidence: toSafeNumber(breakdown.confidence ?? breakdown.socialProofConfidence, 0),
        hook: toSafeNumber(breakdown.hook, 0),
        utility: toSafeNumber(breakdown.utility, 0),
        relevance: toSafeNumber(breakdown.relevance, 0),
        socialProof: toSafeNumber(breakdown.socialProof, 0),
        sourceType: breakdown.sourceType || ''
    };
}

function buildScoreTooltipRow(label, value) {
    if (!Number.isFinite(value) || value <= 0) return '';
    return `
        <div class="score-tooltip__row">
            <span>${escapeHtml(label)}</span>
            <strong>${Math.round(value)}</strong>
        </div>
    `;
}

function getScoreInternalHtml(item) {
    const breakdown = getScoreBreakdown(item);
    const summaryRows = [
        buildScoreTooltipRow('Virality', breakdown.virality),
        buildScoreTooltipRow('Fit', breakdown.fit),
        buildScoreTooltipRow('Interest', breakdown.interest),
        buildScoreTooltipRow('Quality', breakdown.quality),
        buildScoreTooltipRow('Freshness', breakdown.freshness),
        buildScoreTooltipRow('Confidence', breakdown.confidence)
    ].filter(Boolean).join('');
    const signalRows = [
        buildScoreTooltipRow('Hook', breakdown.hook),
        buildScoreTooltipRow('Utility', breakdown.utility),
        buildScoreTooltipRow('Relevance', breakdown.relevance),
        buildScoreTooltipRow('Social Proof', breakdown.socialProof || breakdown.traction)
    ].filter(Boolean).join('');

    if (!summaryRows && !signalRows) return '';

    return `
        <div class="score-tooltip" role="tooltip">
            <div class="score-tooltip__title">Score breakdown</div>
            <div class="score-tooltip__section">
                ${summaryRows}
            </div>
            ${signalRows ? `
                <div class="score-tooltip__section score-tooltip__section--signals">
                    ${signalRows}
                </div>
            ` : ''}
        </div>
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

function getMagazineFallbackEmoji(index = 0) {
    const fallbackEmojis = ['📰', '⚡', '💡', '🌐', '🔬', '📊', '🎯', '🌍', '💬', '🔍', '📡', '🤖', '🧠', '📈'];
    return fallbackEmojis[index % fallbackEmojis.length];
}

function getItemImageUrl(item, fallback = '') {
    const rawUrl = item?.image_url || item?.image || item?.thumbnail || fallback || '';
    const normalized = safeHttpUrl(rawUrl, '');
    if (!normalized) return '';
    if (normalized.startsWith(IMAGE_PROXY_URL)) return normalized;
    return getDisplayImageUrl(normalized, '');
}

function getScorePillHtml(item, scoreValue = item?.ranking, includeInternalScore = true) {
    const ranking = toSafeNumber(scoreValue, 0);
    return `
        <div class="score-pill ${getScoreClass(ranking)}" tabindex="0" aria-label="Score ${ranking}">
            ${ranking >= 85 ? '<span class="score-pill__icon">🔥</span>' : ''}
            <span class="score-pill__value">${ranking}</span>
            ${includeInternalScore ? getScoreInternalHtml(item) : ''}
        </div>
    `;
}

function buildMetricChipHtml({ icon = '', value = '', title = '', tone = 'neutral' } = {}) {
    if (value === '' || value === null || value === undefined) return '';
    const toneClass = tone ? ` metric-chip--${tone}` : '';
    return `
        <span class="metric-chip${toneClass}" title="${escapeHtml(title)}">
            ${icon ? `<span class="metric-chip__icon">${escapeHtml(icon)}</span>` : ''}
            <span class="metric-chip__value">${escapeHtml(String(value))}</span>
        </span>
    `;
}

function buildMetricChipGroupHtml(metrics = []) {
    const chips = metrics
        .map(metric => buildMetricChipHtml(metric))
        .filter(Boolean)
        .join('');
    return chips ? `<div class="metric-chip-group">${chips}</div>` : '';
}

function buildScoreMetricStackHtml(item, metrics = [], options = {}) {
    const scoreHtml = getScorePillHtml(
        item,
        options.scoreValue ?? item?.ranking,
        options.includeInternalScore ?? true
    );
    const metricHtml = buildMetricChipGroupHtml(metrics);
    return metricHtml
        ? `<div class="score-metric-stack">${scoreHtml}${metricHtml}</div>`
        : scoreHtml;
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

async function markAsDone(item) {
    const itemKey = getSourcingItemKey(item) || getLegacyDoneHeadlineKey(item?.headline || item?.title || '');
    if (!itemKey) return;

    doneHeadlines.add(itemKey);
    persistUserLocalCache(currentUser);
    applyDoneOptimistic(item);
    await saveData();
    // Re-render shortly after optimistic fade-out so top sections refill from Buffer.
    setTimeout(() => {
        renderNews(false);
    }, 150);
}

function startNewsAutoRefresh() {
    stopNewsAutoRefresh();
    newsAutoRefreshTimer = setInterval(() => {
        if (currentView === 'sourcing') refreshNewsNow(false);
    }, NEWS_REFRESH_INTERVAL_MS);
}

function stopNewsAutoRefresh() {
    if (!newsAutoRefreshTimer) return;
    clearInterval(newsAutoRefreshTimer);
    newsAutoRefreshTimer = null;
}

function initSourcingFeedFilter() {
    if (!elements.sourcingFeedFilter) return;
    const nav = elements.sourcingFeedFilter;
    nav.innerHTML = '';

    SOURCING_FEEDS.forEach(feed => {
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = 'feed-tab-btn';
        tabBtn.dataset.feed = feed.id;
        tabBtn.textContent = feed.label;
        tabBtn.setAttribute('aria-pressed', feed.id === selectedSourcingFeed ? 'true' : 'false');
        if (feed.id === selectedSourcingFeed) tabBtn.classList.add('active');
        tabBtn.addEventListener('click', () => {
            if (selectedSourcingFeed === feed.id) return;
            selectedSourcingFeed = feed.id;
            sourcingArticlesDirty = true;
            initSourcingFeedFilter();
            renderNews(false);
        });
        nav.appendChild(tabBtn);
    });
}

function createFeaturedCard(item, index) {
    return createMagazineCard(item, index, { sourceKind: 'article' });
}

function createMagazineCard(item, index, options = {}) {
    const {
        variant = 'default',
        sourceKind = 'article',
        sourceLabel = item?.source || 'Unknown Source',
        reasonText = item?.reason || '',
        imageUrl = getItemImageUrl(item),
        dateValue = item?.published_at || item?.date,
        metricHtml = null,
        scoreValue = item?.ranking,
        includeInternalScore = true
    } = options;

    const card = document.createElement('div');
    const isDone = isSourcingItemDone(item);
    const safeImageUrl = getItemImageUrl({ image_url: imageUrl });
    const hasImage = safeImageUrl && !safeImageUrl.includes('placeholder');
    const safeLink = safeHttpUrl(item.link);
    const safeHeadline = escapeHtml(decodeEntities(item.headline || 'Untitled'));
    const safeReason = escapeHtml(normalizeWhitespace(reasonText).slice(0, 220));
    const safeSource = escapeHtml(sourceLabel);
    const safeDate = escapeHtml(formatSidebarDate(dateValue));
    const emoji = getMagazineFallbackEmoji(index);
    const cardClassName = ['magazine-card', variant !== 'default' ? `magazine-card--${variant}` : ''].filter(Boolean).join(' ');
    const wrapperClassName = ['card-wrapper', variant !== 'default' ? `card-wrapper--${variant}` : '', isDone ? 'card-wrapper--done' : ''].filter(Boolean).join(' ');
    const footerMetricHtml = metricHtml ?? getScorePillHtml(item, scoreValue, includeInternalScore);

    card.className = wrapperClassName;
    card.dataset.articleKey = getSourcingItemKey(item);

    const imageHtml = hasImage
        ? `<div class="magazine-card__image" style="background-image: url('${escapeHtml(safeImageUrl)}'); background-size: cover; background-position: center;">`
        : `<div class="magazine-card__image magazine-card__image--fallback">
             <div class="magazine-card__emoji-bg" aria-hidden="true">${emoji}</div>`;

    card.innerHTML = `
        <a class="${cardClassName}" href="${safeLink}" target="_blank" rel="noopener noreferrer">
            ${imageHtml}
                <span class="magazine-card__source-badge">${safeSource}</span>
            </div>
            <div class="magazine-card__body">
                <h3 class="magazine-card__title">${safeHeadline}</h3>
                ${safeReason ? `<p class="magazine-card__reason">${safeReason}</p>` : ''}
                <div class="magazine-card__footer">
                    <div class="magazine-card__meta">
                        ${safeDate ? `<span class="magazine-card__date">${safeDate}</span>` : '<span class="magazine-card__date magazine-card__date--ghost"></span>'}
                    </div>
                    <div class="magazine-card__actions">
                        ${footerMetricHtml}
                        <div class="card-pills-actions">
                            ${!isDone ? getDoneButtonHtml('done-button--inline done-button--icon') : ''}
                            ${getSendToSelectionButtonHtml('send-selection-btn--inline send-selection-btn--icon')}
                        </div>
                    </div>
                </div>
            </div>
        </a>
    `;

    const doneBtn = card.querySelector('.done-button');
    if (doneBtn) doneBtn.onclick = (e) => { e.preventDefault(); markAsDone(item); };
    const sendBtn = card.querySelector('.send-selection-btn');
    if (sendBtn) sendBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showSourceSelectionModal(buildSelectionDraftFromSource(item, sourceKind));
    };
    return card;
}

function createCompactTile(item, index) {
    return createMagazineCard(item, index, { sourceKind: 'article' });
}

function formatCompact(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
}

function createXPostItem(item, index) {
    const authorLabel = normalizeWhitespace(item.author || '').replace(/^@/, '');
    const displayLabel = normalizeWhitespace(item.full_name || item.source || '');
    const xMetrics = [];

    if (authorLabel) {
        xMetrics.push({ icon: '@', value: authorLabel, title: 'Author', tone: 'cool' });
    } else if (displayLabel) {
        xMetrics.push({ icon: '👤', value: displayLabel, title: 'Author', tone: 'cool' });
    }

    if (item.image_url) {
        xMetrics.push({ icon: '🖼', value: 'media', title: 'Includes image', tone: 'warm' });
    }

    return createMagazineCard(item, index, {
        variant: 'sidebar',
        sourceKind: 'x',
        sourceLabel: authorLabel ? `@${authorLabel}` : (displayLabel || 'X AI'),
        reasonText: item.reason,
        imageUrl: item.image_url || item.image || '',
        metricHtml: buildScoreMetricStackHtml(item, xMetrics)
    });
}

function createInstagramPostItem(item, index) {
    return createMagazineCard(item, index, {
        variant: 'sidebar',
        sourceKind: 'instagram',
        sourceLabel: item.source || 'Instagram',
        reasonText: item.reason,
        metricHtml: buildScoreMetricStackHtml(item, [
            { icon: '🔥', value: toSafeNumber(item.virality, 0), title: 'Virality', tone: 'hot' },
            { icon: '🎯', value: toSafeNumber(item.fit, 0), title: 'Fit', tone: 'warm' }
        ])
    });
}

function createRedditPostItem(item, index) {
    const redditMetrics = [];
    if (toSafeNumber(item.score, 0) > 0) {
        redditMetrics.push({ icon: '⬆', value: formatCompact(toSafeNumber(item.score, 0)), title: 'Score', tone: 'hot' });
    }
    if (toSafeNumber(item.comments, 0) > 0) {
        redditMetrics.push({ icon: '💬', value: formatCompact(toSafeNumber(item.comments, 0)), title: 'Comments', tone: 'cool' });
    }
    if (!redditMetrics.length && item.author) {
        redditMetrics.push({ icon: '👤', value: item.author.replace(/^\/u\//, ''), title: 'Author', tone: 'cool' });
    }

    return createMagazineCard(item, index, {
        variant: 'sidebar',
        sourceKind: 'reddit',
        sourceLabel: `r/${item.subreddit || 'unknown'}`,
        reasonText: item.reason,
        imageUrl: item.image_url,
        metricHtml: buildScoreMetricStackHtml(item, redditMetrics)
    });
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
    if (elements.authActionBtn) {
        elements.authActionBtn.addEventListener('click', handleAuthAction);
    }
    if (elements.loginBtn) {
        elements.loginBtn.addEventListener('click', signInWithGoogle);
    }

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

    if (elements.showDoneNews) {
        elements.showDoneNews.addEventListener('change', (e) => {
            showDoneNews = e.target.checked;
            renderNews(false);
        });
    }
    if (elements.refreshNewsBtn) {
        elements.refreshNewsBtn.addEventListener('click', () => {
            refreshNewsNow(true);
        });
    }
    if (elements.resetNewsBtn) {
        elements.resetNewsBtn.addEventListener('click', async () => {
            doneHeadlines.clear();
            persistUserLocalCache(currentUser);
            sourcingFeedCache.clear();
            sourcingArticlesDirty = true;
            await saveData();
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

    if (elements.newsMainScroll) {
        elements.newsMainScroll.addEventListener('scroll', updateStickyNewsHeader, { passive: true });
    }
    window.addEventListener('resize', updateStickyNewsHeader);

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
    if (elements.exportBtn) {
        elements.exportBtn.addEventListener('click', exportData);
    }
}

function exportData() {
    const backup = {
        user: currentUser ? {
            uid: currentUser.uid,
            email: currentUser.email || '',
            displayName: currentUser.displayName || ''
        } : null,
        appData,
        permanentNotes,
        doneHeadlines: Array.from(doneHeadlines),
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
async function setupAuthSession() {
    isAuthStateResolving = true;
    setAuthGate('resolving', 'Restoring session...');
    updateAuthUI();

    onAuthStateChanged(auth, async (user) => {
        isAuthStateResolving = false;

        if (!user) {
            currentUser = null;
            isLoadingUserData = false;
            stopNewsAutoRefresh();
            resetInMemoryState();
            render();
            updateAuthUI();
            updateSyncStatus('offline', 'Sign in required');
            setAuthGate('signin', 'Sign in with Google to load your workspace.');
            return;
        }

        currentUser = user;
        isLoadingUserData = true;
        updateAuthUI();
        setAuthGate('resolving', `Loading ${getUserLabel(user)}...`);

        try {
            await loadData();
            isLoadingUserData = false;
            await drainPendingExtensionIdeas();
            switchTab(currentView);
            setAuthGate('hidden', '');
        } catch (e) {
            console.error('Failed to hydrate signed-in user', e);
            setAuthGate('error', 'We could not load your workspace. Try refreshing.');
        } finally {
            isLoadingUserData = false;
            updateAuthUI();
        }
    });
}

async function init() {
    // Apply persisted tab immediately so refresh doesn't flash/reset to first tab.
    switchTab(currentView);
    loadPendingExtensionIdeasBuffer();
    setupEventListeners();
    window.addEventListener('message', handleExtensionImportEvent);
    await setupAuthSession();
}

document.addEventListener('DOMContentLoaded', init);
