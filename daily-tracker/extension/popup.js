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

let currentTab = null;
let selectedType = 'post';

// Tab Logic
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    currentTab = tabs[0];
    document.getElementById('title').value = currentTab.title;
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
    const title = document.getElementById('title').value.trim();
    const notes = document.getElementById('notes').value.trim();
    const statusEl = document.getElementById('status');
    const saveBtn = document.getElementById('saveBtn');

    if (!title) {
        statusEl.textContent = "Title is required";
        statusEl.className = "status error";
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    statusEl.textContent = "Connecting to Firebase...";

    try {
        // 1. Fetch current data
        const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${DOC_PATH}?key=${API_KEY}`);
        if (!res.ok) throw new Error("Failed to fetch data");
        const doc = await res.json();

        let appData = doc.fields.appData.mapValue.fields;
        let ideas = appData.ideas.arrayValue.values || [];

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
            throw new Error("Failed to save");
        }
    } catch (err) {
        console.error(err);
        statusEl.textContent = "Error saving. Check console.";
        statusEl.className = "status error";
        saveBtn.disabled = false;
        saveBtn.textContent = "Retry Save";
    }
});
