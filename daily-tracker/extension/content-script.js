const API_KEY = "AIzaSyD9Q9b_RkQ5KCUSoNdqs8W2C3jrB6Q_pCQ";
const PROJECT_ID = "daily-tracker-ee82c";
const DOC_PATH = "daily-tracker-data/global-tracker-data";

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function resolveSmartTitle(data) {
  const directTitle = (data?.title || '').trim();
  if (directTitle && !directTitle.includes('://')) return directTitle;

  const linkText = (data?.linkText || '').trim();
  if (linkText) return linkText;

  const urlTitle = titleFromUrl(safeHttpUrl(data?.url));
  if (urlTitle) return urlTitle;

  return directTitle;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "open-clipper-modal") {
    createClipperModal(request.data);
  }
});

function createClipperModal(data) {
  // Check if already exists
  if (document.getElementById('dt-clipper-container')) return;

  const container = document.createElement('div');
  container.id = 'dt-clipper-container';
  const shadowRoot = container.attachShadow({ mode: 'open' });

  // Styles
  const style = document.createElement('style');
  style.textContent = `
    :host {
      --accent-primary: #007AFF;
      --bg-primary: #F5F5F7;
      --text-primary: #1D1D1F;
      --text-secondary: #86868B;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      z-index: 9999999999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal {
      width: 360px;
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .header h2 {
      margin: 0;
      font-size: 1.2rem;
      color: var(--text-primary);
    }
    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: var(--text-secondary);
    }
    .field {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
    input, textarea, select {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #D2D2D7;
      border-radius: 10px;
      font-size: 0.95rem;
      color: var(--text-primary);
      background: #FFFFFF;
      box-sizing: border-box;
      outline: none;
      transition: all 0.2s;
    }
    input:focus, textarea:focus {
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
    }
    .category-selector {
      display: flex;
      gap: 10px;
    }
    .cat-opt {
      flex: 1;
      padding: 10px 8px;
      border: 1px solid #D2D2D7;
      background: #FFFFFF;
      color: var(--text-primary);
      border-radius: 8px;
      cursor: pointer;
      text-align: center;
      font-size: 0.85rem;
      font-weight: 500;
      transition: all 0.2s;
    }
    .cat-opt:hover {
      background: #F5F5F7;
      border-color: #86868B;
    }
    .cat-opt.active {
      background: var(--accent-primary);
      color: white;
      border-color: var(--accent-primary);
    }
    .btn-save {
      width: 100%;
      background: var(--accent-primary);
      color: white;
      border: none;
      padding: 14px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      margin-top: 10px;
      transition: all 0.2s;
    }
    .btn-save:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }
    .status {
      text-align: center;
      margin-top: 12px;
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-weight: 500;
    }
  `;

  shadowRoot.appendChild(style);

  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';

  let selectedType = 'post';
  const safeTitle = escapeHtml(resolveSmartTitle(data));
  const safeSelection = escapeHtml(data?.selection ? `Quote: ${data.selection}` : '');

  modal.innerHTML = `
    <div class="header">
      <h2>Capture Idea</h2>
      <button class="close-btn">&times;</button>
    </div>
    <div class="field">
      <label>Name</label>
      <input type="text" id="dt-title" value="${safeTitle}">
    </div>
    <div class="field">
      <label>Category</label>
      <div class="category-selector">
        <div class="cat-opt active" data-type="post">Post</div>
        <div class="cat-opt" data-type="reel">Reel</div>
        <div class="cat-opt" data-type="promo">Promo</div>
      </div>
    </div>
    <div class="field">
      <label>Notes</label>
      <textarea id="dt-notes" rows="3">${safeSelection}</textarea>
    </div>
    <button class="btn-save" id="dt-save">Save to Daily Tracker</button>
    <div class="status" id="dt-status"></div>
  `;

  shadowRoot.appendChild(overlay);
  overlay.appendChild(modal);
  document.body.appendChild(container);

  // Modal Events
  shadowRoot.querySelector('.close-btn').onclick = closeModal;
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

  const catOpts = shadowRoot.querySelectorAll('.cat-opt');
  catOpts.forEach(opt => {
    opt.onclick = () => {
      catOpts.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      selectedType = opt.dataset.type;
    };
  });

  shadowRoot.querySelector('#dt-save').onclick = async () => {
    const title = shadowRoot.querySelector('#dt-title').value.trim();
    const notes = shadowRoot.querySelector('#dt-notes').value.trim();
    const statusEl = shadowRoot.querySelector('#dt-status');
    const saveBtn = shadowRoot.querySelector('#dt-save');

    if (!title) {
      statusEl.textContent = "Title is required";
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${DOC_PATH}?key=${API_KEY}`);
      const docJson = await res.json();

      let appDataFields = docJson.fields.appData.mapValue.fields;
      let ideas = appDataFields.ideas.arrayValue.values || [];

      const newIdea = {
        mapValue: {
          fields: {
            id: { stringValue: Math.random().toString(36).substr(2, 9) },
            title: { stringValue: title },
            url: { stringValue: safeHttpUrl(data.url) },
            notes: { stringValue: notes },
            type: { stringValue: selectedType },
            createdAt: { stringValue: new Date().toISOString() },
            image: { stringValue: "" }
          }
        }
      };

      ideas.unshift(newIdea);

      const updateData = {
        fields: {
          appData: docJson.fields.appData,
          permanentNotes: docJson.fields.permanentNotes,
          lastUpdated: { stringValue: new Date().toISOString() }
        }
      };
      updateData.fields.appData.mapValue.fields.ideas = { arrayValue: { values: ideas } };

      const saveRes = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${DOC_PATH}?key=${API_KEY}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
      });

      if (saveRes.ok) {
        statusEl.textContent = "Saved successfully!";
        setTimeout(closeModal, 1500);
      } else {
        throw new Error();
      }
    } catch (e) {
      statusEl.textContent = "Error saving. Check console.";
      saveBtn.disabled = false;
      saveBtn.textContent = "Retry Save";
    }
  };

  shadowRoot.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  });

  shadowRoot.querySelector('#dt-title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      shadowRoot.querySelector('#dt-save').click();
    }
  });

  shadowRoot.querySelector('#dt-notes').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      shadowRoot.querySelector('#dt-save').click();
    }
  });

  shadowRoot.querySelector('#dt-title').focus();
  shadowRoot.querySelector('#dt-title').select();

  function closeModal() {
    container.remove();
  }
}
