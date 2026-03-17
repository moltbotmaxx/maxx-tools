const EXTENSION_QUEUE_KEY = 'dailyTrackerIdeaQueue';
const EXTENSION_IMPORT_EVENT = 'DAILY_TRACKER_EXTENSION_IMPORT';
const EXTENSION_IMPORT_ACK_EVENT = 'DAILY_TRACKER_EXTENSION_IMPORT_ACK';

let queueFlushTimer = null;
let queueFlushInFlight = false;

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

function resolveSmartTitle(data) {
  const directTitle = (data?.title || '').trim();
  if (directTitle && !directTitle.includes('://') && !isLowSignalTitle(directTitle)) return directTitle;

  const linkText = (data?.linkText || '').trim();
  if (linkText && !isLowSignalTitle(linkText)) return linkText;

  const urlTitle = titleFromUrl(safeHttpUrl(data?.url));
  if (urlTitle) return urlTitle;

  return directTitle;
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

function isDailyTrackerAppPage() {
  return Boolean(
    document.getElementById('inspirationGrid') &&
    document.getElementById('weekGrid') &&
    document.getElementById('syncStatus')
  );
}

async function flushQueuedIdeasToApp() {
  if (!isDailyTrackerAppPage() || queueFlushInFlight) return;

  const ideas = await getQueuedIdeas();
  if (!ideas.length) return;

  queueFlushInFlight = true;
  const sentIds = new Set(ideas.map(idea => idea?.id).filter(Boolean));

  let timeoutId = null;
  const ackHandler = async event => {
    if (event.source !== window) return;
    if (event.data?.type !== EXTENSION_IMPORT_ACK_EVENT) return;

    window.clearTimeout(timeoutId);
    window.removeEventListener('message', ackHandler);
    queueFlushInFlight = false;

    try {
      const currentQueue = await getQueuedIdeas();
      const remainingQueue = currentQueue.filter(idea => !sentIds.has(idea?.id));
      await setQueuedIdeas(remainingQueue);
    } catch (e) {
      console.error('Failed to clear imported clipper queue', e);
    }
  };

  timeoutId = window.setTimeout(() => {
    window.removeEventListener('message', ackHandler);
    queueFlushInFlight = false;
  }, 4000);

  window.addEventListener('message', ackHandler);
  window.postMessage({ type: EXTENSION_IMPORT_EVENT, ideas }, '*');
}

function scheduleQueueFlush(delay = 300) {
  if (!isDailyTrackerAppPage()) return;
  window.clearTimeout(queueFlushTimer);
  queueFlushTimer = window.setTimeout(() => {
    flushQueuedIdeasToApp().catch(err => {
      queueFlushInFlight = false;
      console.error('Failed to flush clipper queue into Daily Tracker', err);
    });
  }, delay);
}

if (isDailyTrackerAppPage()) {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => scheduleQueueFlush(700), { once: true });
  } else {
    scheduleQueueFlush(700);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[EXTENSION_QUEUE_KEY]) {
      scheduleQueueFlush(150);
    }
  });
}

chrome.runtime.onMessage.addListener(request => {
  if (request.action === 'open-clipper-modal') {
    createClipperModal(request.data);
  }
});

function createClipperModal(data) {
  if (document.getElementById('dt-clipper-container')) return;

  const container = document.createElement('div');
  container.id = 'dt-clipper-container';
  const shadowRoot = container.attachShadow({ mode: 'open' });

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
    input::selection, textarea::selection {
      background: rgba(0, 122, 255, 0.32);
      color: #0A2540;
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

  shadowRoot.querySelector('.close-btn').onclick = closeModal;
  overlay.onclick = event => {
    if (event.target === overlay) closeModal();
  };

  const catOpts = shadowRoot.querySelectorAll('.cat-opt');
  catOpts.forEach(opt => {
    opt.onclick = () => {
      catOpts.forEach(option => option.classList.remove('active'));
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
      statusEl.textContent = 'Title is required';
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Queueing...';

    try {
      await queueIdea(buildQueuedIdea({
        title,
        notes,
        type: selectedType,
        url: data?.url
      }));

      statusEl.textContent = 'Queued. Open Daily Tracker to import it.';
      scheduleQueueFlush(150);
      setTimeout(closeModal, 1400);
    } catch (e) {
      console.error('Clipper queue failed', e);
      statusEl.textContent = 'Error queueing idea. Check console.';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Retry Save';
    }
  };

  shadowRoot.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
    }
  });

  shadowRoot.querySelector('#dt-title').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      shadowRoot.querySelector('#dt-save').click();
    }
  });

  shadowRoot.querySelector('#dt-notes').addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      shadowRoot.querySelector('#dt-save').click();
    }
  });

  shadowRoot.querySelector('#dt-title').focus();
  shadowRoot.querySelector('#dt-title').select();

  function closeModal() {
    container.remove();
  }
}
