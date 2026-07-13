const FEED_URL = 'https://rss.app/feeds/_WLxGXSKpJ6rpFx3G.xml';
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

function addStylesheet() {
    const stylesheetUrl = new URL('ai-safety.css', import.meta.url).href;
    if (document.querySelector(`link[href="${stylesheetUrl}"]`)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesheetUrl;
    document.head.appendChild(link);
}

function renderShell() {
    document.documentElement.lang = 'en';
    document.title = 'AI Safety | Schedulr';
    document.body.className = 'ai-safety-page';
    document.body.innerHTML = `
        <main class="ai-safety-shell">
            <header class="ai-safety-header">
                <div class="ai-safety-brand" aria-label="AI Safety news">
                    <span class="ai-safety-mark" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                            <path d="M12 3 4.5 6.2v5.5c0 4.7 3.1 7.6 7.5 9.3 4.4-1.7 7.5-4.6 7.5-9.3V6.2L12 3Z"/>
                            <path d="m8.8 12 2.1 2.1 4.4-4.5"/>
                        </svg>
                    </span>
                    <span>
                        <span class="ai-safety-eyebrow">Sourcing</span>
                        <h1>AI Safety</h1>
                    </span>
                </div>
            </header>

            <section id="aiSafetyGallery" class="ai-safety-gallery" aria-live="polite" aria-busy="true">
                ${Array.from({ length: 9 }, () => `
                    <article class="ai-safety-card ai-safety-card--skeleton" aria-hidden="true">
                        <div class="ai-safety-card__image"></div>
                        <div class="ai-safety-card__body">
                            <span></span><strong></strong><p></p>
                        </div>
                    </article>
                `).join('')}
            </section>
        </main>
    `;
}

function getText(parent, selector) {
    return parent.querySelector(selector)?.textContent?.trim() || '';
}

function getDescriptionData(item) {
    const rawDescription = getText(item, 'description');
    if (!rawDescription) return { description: '', image: '' };

    const documentFragment = new DOMParser().parseFromString(rawDescription, 'text/html');
    const image = documentFragment.querySelector('img')?.getAttribute('src') || '';
    documentFragment.querySelectorAll('img, iframe, script, style').forEach(node => node.remove());
    const description = documentFragment.body.textContent?.replace(/\s+/g, ' ').trim() || '';
    return { description, image };
}

function getSafeUrl(value, fallback = '') {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : fallback;
    } catch {
        return fallback;
    }
}

function getSourceName(link) {
    try {
        return new URL(link).hostname.replace(/^www\./, '');
    } catch {
        return 'AI Safety';
    }
}

function parseFeed(xmlText) {
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('The news feed returned invalid XML.');

    return Array.from(xml.querySelectorAll('item')).map((item, index) => {
        const { description, image: descriptionImage } = getDescriptionData(item);
        const mediaNode = Array.from(item.children).find(node => node.localName === 'content' && node.prefix === 'media');
        const link = getSafeUrl(getText(item, 'link'));
        const publishedAt = getText(item, 'pubDate');

        return {
            id: getText(item, 'guid') || link || String(index),
            title: getText(item, 'title') || 'Untitled story',
            description,
            link,
            image: getSafeUrl(mediaNode?.getAttribute('url') || descriptionImage),
            source: getSourceName(link),
            publishedAt
        };
    }).filter(article => article.link);
}

function formatDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';

    return new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    }).format(date);
}

function createCard(article) {
    const link = document.createElement('a');
    link.className = 'ai-safety-card';
    link.href = article.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${article.title} — ${article.source}`);

    const imageWrap = document.createElement('div');
    imageWrap.className = article.image
        ? 'ai-safety-card__image'
        : 'ai-safety-card__image ai-safety-card__image--fallback';

    if (article.image) {
        const image = document.createElement('img');
        image.src = article.image;
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => {
            image.remove();
            imageWrap.classList.add('ai-safety-card__image--fallback');
        }, { once: true });
        imageWrap.appendChild(image);
    }

    const source = document.createElement('span');
    source.className = 'ai-safety-card__source';
    source.textContent = article.source;
    imageWrap.appendChild(source);

    const body = document.createElement('div');
    body.className = 'ai-safety-card__body';

    const title = document.createElement('h2');
    title.className = 'ai-safety-card__title';
    title.textContent = article.title;
    body.appendChild(title);

    if (article.description) {
        const description = document.createElement('p');
        description.className = 'ai-safety-card__description';
        description.textContent = article.description;
        body.appendChild(description);
    }

    const footer = document.createElement('div');
    footer.className = 'ai-safety-card__footer';

    const date = document.createElement('time');
    date.dateTime = article.publishedAt;
    date.textContent = formatDate(article.publishedAt);

    const arrow = document.createElement('span');
    arrow.className = 'ai-safety-card__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';

    footer.append(date, arrow);
    body.appendChild(footer);
    link.append(imageWrap, body);
    return link;
}

function renderArticles(articles) {
    const gallery = document.getElementById('aiSafetyGallery');
    if (!gallery) return;

    gallery.replaceChildren(...articles.map(createCard));
    gallery.setAttribute('aria-busy', 'false');
}

function renderError() {
    const gallery = document.getElementById('aiSafetyGallery');
    if (!gallery) return;

    const message = document.createElement('p');
    message.className = 'ai-safety-error';
    message.textContent = 'The AI Safety news feed is temporarily unavailable.';
    gallery.replaceChildren(message);
    gallery.setAttribute('aria-busy', 'false');
}

async function loadFeed({ preserveOnError = false } = {}) {
    try {
        const response = await fetch(FEED_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Feed request failed with ${response.status}.`);
        const articles = parseFeed(await response.text());
        if (!articles.length) throw new Error('The feed did not return any stories.');
        renderArticles(articles);
    } catch (error) {
        console.error('Unable to load AI Safety feed:', error);
        if (!preserveOnError) renderError();
    }
}

addStylesheet();
renderShell();
loadFeed();
window.setInterval(() => loadFeed({ preserveOnError: true }), REFRESH_INTERVAL_MS);
