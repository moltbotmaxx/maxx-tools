const EXTENSION_QUEUE_KEY = 'dailyTrackerIdeaQueue';

function safeHttpUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
        const parsed = new URL(url);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
    } catch {
        return '';
    }
}

function prettifySlugPart(part) {
    if (!part) return '';
    try {
        const decoded = decodeURIComponent(part);
        const normalized = decoded
            .replace(/[-_+]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : '';
    } catch {
        return '';
    }
}

function isNumericLike(value) {
    return /^\d+$/.test((value || '').trim());
}

function isLowSignalTitle(value) {
    const text = (value || '').trim();
    if (!text) return true;
    if (text.length <= 2) return true;
    if (/^\d+[smhdw]$/i.test(text)) return true;
    if (/^\d+\s?(sec|min|mins|hr|hrs|hour|hours|day|days|week|weeks|mo|mos)$/i.test(text)) return true;
    if (/^\d{1,2}:\d{2}(\s?[AP]M)?$/i.test(text)) return true;
    return false;
}

function titleFromUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        for (let i = segments.length - 1; i >= 0; i -= 1) {
            const segment = segments[i];
            if (!segment || isNumericLike(segment) || segment.toLowerCase() === 'status') continue;
            const fromPath = prettifySlugPart(segment);
            if (fromPath) return fromPath;
        }

        const hostname = parsed.hostname.replace(/^www\./, '');
        const hostLabel = hostname.split('.').slice(0, -1).join('.') || hostname;
        const fromHost = prettifySlugPart(hostLabel);
        return fromHost || hostname;
    } catch {
        return '';
    }
}

function resolvePopupTitle(tab) {
    const tabTitle = (tab?.title || '').trim();
    const cleanUrl = safeHttpUrl(tab?.url);
    const urlTitle = titleFromUrl(cleanUrl);

    if (!tabTitle || tabTitle === cleanUrl) return urlTitle;
    if (tabTitle.includes('://') && urlTitle) return urlTitle;
    if (isLowSignalTitle(tabTitle) && urlTitle) return urlTitle;
    return tabTitle || urlTitle;
}

function buildQueuedIdea({ title, notes, type, url }) {
    return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        title,
        url: safeHttpUrl(url),
        notes,
        content: notes,
        type,
        image: '',
        createdAt: new Date().toISOString()
    };
}

function getQueuedIdeas() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get({ [EXTENSION_QUEUE_KEY]: [] }, items => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            const queue = Array.isArray(items[EXTENSION_QUEUE_KEY]) ? items[EXTENSION_QUEUE_KEY] : [];
            resolve(queue);
        });
    });
}

function setQueuedIdeas(queue) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [EXTENSION_QUEUE_KEY]: queue.slice(0, 250) }, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve();
        });
    });
}

async function queueIdea(idea) {
    const queue = await getQueuedIdeas();
    queue.unshift(idea);
    await setQueuedIdeas(queue);
}

let currentTab = null;
let selectedType = 'post';
const statusEl = document.getElementById('status');
const titleInput = document.getElementById('title');
const notesInput = document.getElementById('notes');
const saveBtn = document.getElementById('saveBtn');

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    currentTab = tabs[0];
    titleInput.value = resolvePopupTitle(currentTab);
    titleInput.focus();
    titleInput.select();
});

document.getElementById('categorySelector').addEventListener('click', e => {
    if (e.target.classList.contains('cat-opt')) {
        document.querySelectorAll('.cat-opt').forEach(opt => opt.classList.remove('active'));
        e.target.classList.add('active');
        selectedType = e.target.dataset.type;
    }
});

document.getElementById('saveBtn').addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const notes = notesInput.value.trim();

    if (!title) {
        statusEl.textContent = 'Title is required';
        statusEl.className = 'status error';
        titleInput.focus();
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Queueing...';
    statusEl.textContent = 'Saving in this browser...';
    statusEl.className = 'status';

    try {
        await queueIdea(buildQueuedIdea({
            title,
            notes,
            type: selectedType,
            url: currentTab?.url
        }));

        statusEl.textContent = 'Queued. Open Daily Tracker to import it.';
        statusEl.className = 'status success';
        setTimeout(() => window.close(), 1400);
    } catch (err) {
        console.error(err);
        statusEl.textContent = 'Error queueing idea. Check console.';
        statusEl.className = 'status error';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Retry Save';
    }
});

titleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
    }
});

notesInput.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
    }
});
