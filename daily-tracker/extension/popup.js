const API_KEY = "AIzaSyD9Q9b_RkQ5KCUSoNdqs8W2C3jrB6Q_pCQ";
const PROJECT_ID = "daily-tracker-ee82c";
const DOC_PATH = "daily-tracker-data/global-tracker-data";

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

function titleFromUrl(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        const lastSegment = segments[segments.length - 1] || '';
        const fromPath = prettifySlugPart(lastSegment);
        if (fromPath) return fromPath;

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
    if (tabTitle.length < 5 && urlTitle) return urlTitle;
    return tabTitle || urlTitle;
}

let currentTab = null;
let selectedType = 'post';
const statusEl = document.getElementById('status');
const titleInput = document.getElementById('title');
const notesInput = document.getElementById('notes');
const saveBtn = document.getElementById('saveBtn');

// Tab Logic
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    currentTab = tabs[0];
    titleInput.value = resolvePopupTitle(currentTab);
    titleInput.focus();
    titleInput.select();
});

// Category Selector
document.getElementById('categorySelector').addEventListener('click', (e) => {
    if (e.target.classList.contains('cat-opt')) {
        document.querySelectorAll('.cat-opt').forEach(opt => opt.classList.remove('active'));
        e.target.classList.add('active');
        selectedType = e.target.dataset.type;
    }
});

// Save Logic
document.getElementById('saveBtn').addEventListener('click', async () => {
    const title = titleInput.value.trim();
    const notes = notesInput.value.trim();

    if (!title) {
        statusEl.textContent = "Title is required";
        statusEl.className = "status error";
        titleInput.focus();
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    statusEl.textContent = "Saving to Firebase...";
    statusEl.className = "status";

    try {
        // 1. Fetch current data
        const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${DOC_PATH}?key=${API_KEY}`);
        if (!res.ok) throw new Error("Failed to fetch data");
        const doc = await res.json();

        const appData = doc.fields?.appData?.mapValue?.fields;
        if (!appData) throw new Error("Invalid document shape");
        const ideas = appData.ideas?.arrayValue?.values || [];

        // 2. Prepare new idea
        const newIdea = {
            mapValue: {
                fields: {
                    id: { stringValue: Date.now().toString(36) + Math.random().toString(36).substr(2) },
                    title: { stringValue: title },
                    url: { stringValue: safeHttpUrl(currentTab?.url) },
                    notes: { stringValue: notes },
                    type: { stringValue: selectedType },
                    createdAt: { stringValue: new Date().toISOString() },
                    image: { stringValue: "" } // Placeholder
                }
            }
        };

        // 3. Append to ideas
        ideas.unshift(newIdea);

        // 4. Update document (Full patch for Firestore REST API simplicity)
        const updateData = {
            fields: {
                appData: doc.fields.appData,
                permanentNotes: doc.fields.permanentNotes,
                lastUpdated: { stringValue: new Date().toISOString() }
            }
        };
        // Update the ideas array inside appData
        updateData.fields.appData.mapValue.fields.ideas = { arrayValue: { values: ideas } };

        const saveRes = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${DOC_PATH}?key=${API_KEY}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });

        if (saveRes.ok) {
            statusEl.textContent = "Saved successfully!";
            statusEl.className = "status success";
            setTimeout(() => window.close(), 1500);
        } else {
            const saveErrText = await saveRes.text();
            throw new Error(`Failed to save: ${saveErrText}`);
        }
    } catch (err) {
        console.error(err);
        statusEl.textContent = "Error saving. Check console.";
        statusEl.className = "status error";
        saveBtn.disabled = false;
        saveBtn.textContent = "Retry Save";
    }
});

titleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
    }
});

notesInput.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
    }
});
