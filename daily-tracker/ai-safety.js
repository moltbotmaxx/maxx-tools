const FEED_URLS = [
    'https://rss.app/feeds/1FY0ugZC3knghvvL.xml',
    'https://rss.app/feeds/JMbNxa8xGDcmpSTc.xml',
    'https://rss.app/feeds/Zyy4J7XWhoLMzBmL.xml'
];
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const DECISIONS_STORAGE_KEY = 'aiSafetySourcingDecisionsV1';
let loadedArticles = [];
let sourcingDecisions = loadSourcingDecisions();

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

            <div class="ai-safety-workspace">
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

                <aside class="accepted-column" aria-labelledby="acceptedColumnTitle">
                    <div class="accepted-column__header">
                        <div>
                            <span class="accepted-column__eyebrow">Selection</span>
                            <h2 id="acceptedColumnTitle">Accepted</h2>
                        </div>
                        <span id="acceptedCount" class="accepted-column__count">0</span>
                    </div>
                    <div id="acceptedList" class="accepted-list" aria-live="polite"></div>
                </aside>
            </div>
        </main>
    `;
}

function normalizeStoredArticle(article) {
    if (!article || typeof article !== 'object') return null;
    const link = getSafeUrl(article.link);
    if (!link) return null;

    return {
        id: String(article.id || link),
        title: String(article.title || 'Untitled story'),
        description: String(article.description || ''),
        link,
        image: getSafeUrl(article.image),
        source: String(article.source || getSourceName(link)),
        publishedAt: String(article.publishedAt || ''),
        acceptedAt: String(article.acceptedAt || '')
    };
}

function loadSourcingDecisions() {
    try {
        const saved = JSON.parse(localStorage.getItem(DECISIONS_STORAGE_KEY) || '{}');
        const acceptedByLink = new Map();
        const accepted = Array.isArray(saved.accepted) ? saved.accepted : [];
        accepted.map(normalizeStoredArticle).filter(Boolean).forEach(article => {
            if (!acceptedByLink.has(article.link)) acceptedByLink.set(article.link, article);
        });

        const rejected = new Set(
            (Array.isArray(saved.rejected) ? saved.rejected : [])
                .map(link => getSafeUrl(link))
                .filter(Boolean)
        );

        return { accepted: Array.from(acceptedByLink.values()), rejected };
    } catch (error) {
        console.warn('Unable to restore AI Safety sourcing decisions:', error);
        return { accepted: [], rejected: new Set() };
    }
}

function persistSourcingDecisions() {
    try {
        localStorage.setItem(DECISIONS_STORAGE_KEY, JSON.stringify({
            accepted: sourcingDecisions.accepted,
            rejected: Array.from(sourcingDecisions.rejected)
        }));
    } catch (error) {
        console.warn('Unable to save AI Safety sourcing decisions:', error);
    }
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

function mergeArticles(feedArticles) {
    const uniqueArticles = new Map();

    feedArticles.flat().forEach(article => {
        if (!uniqueArticles.has(article.link)) {
            uniqueArticles.set(article.link, article);
        }
    });

    return Array.from(uniqueArticles.values()).sort((first, second) => {
        const firstDate = new Date(first.publishedAt).getTime() || 0;
        const secondDate = new Date(second.publishedAt).getTime() || 0;
        return secondDate - firstDate;
    });
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
    const card = document.createElement('article');
    card.className = 'ai-safety-card';

    const link = document.createElement('a');
    link.className = 'ai-safety-card__link';
    link.href = article.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${article.title} — ${article.source}`);

    const decisions = document.createElement('div');
    decisions.className = 'ai-safety-card__decisions';

    const rejectButton = document.createElement('button');
    rejectButton.type = 'button';
    rejectButton.className = 'decision-button decision-button--reject';
    rejectButton.dataset.action = 'reject';
    rejectButton.setAttribute('aria-label', `Reject: ${article.title}`);
    rejectButton.title = 'Reject';
    rejectButton.textContent = '×';
    rejectButton.addEventListener('click', () => rejectArticle(article));

    const acceptButton = document.createElement('button');
    acceptButton.type = 'button';
    acceptButton.className = 'decision-button decision-button--accept';
    acceptButton.dataset.action = 'accept';
    acceptButton.setAttribute('aria-label', `Accept: ${article.title}`);
    acceptButton.title = 'Accept';
    acceptButton.textContent = '✓';
    acceptButton.addEventListener('click', () => acceptArticle(article));

    decisions.append(rejectButton, acceptButton);

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
    card.append(link, decisions);
    return card;
}

function createAcceptedCard(article) {
    const card = document.createElement('article');
    card.className = 'accepted-card';

    const link = document.createElement('a');
    link.className = 'accepted-card__link';
    link.href = article.link;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${article.title} — ${article.source}`);

    const imageWrap = document.createElement('div');
    imageWrap.className = article.image
        ? 'accepted-card__image'
        : 'accepted-card__image accepted-card__image--fallback';

    if (article.image) {
        const image = document.createElement('img');
        image.src = article.image;
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => {
            image.remove();
            imageWrap.classList.add('accepted-card__image--fallback');
        }, { once: true });
        imageWrap.appendChild(image);
    }

    const content = document.createElement('div');
    content.className = 'accepted-card__content';

    const source = document.createElement('span');
    source.className = 'accepted-card__source';
    source.textContent = article.source;

    const title = document.createElement('h3');
    title.className = 'accepted-card__title';
    title.textContent = article.title;

    const date = document.createElement('time');
    date.className = 'accepted-card__date';
    date.dateTime = article.publishedAt;
    date.textContent = formatDate(article.publishedAt);

    content.append(source, title, date);
    link.append(imageWrap, content);

    const restoreButton = document.createElement('button');
    restoreButton.type = 'button';
    restoreButton.className = 'accepted-card__restore';
    restoreButton.setAttribute('aria-label', `Return to sourcing: ${article.title}`);
    restoreButton.title = 'Return to sourcing';
    restoreButton.textContent = '↩';
    restoreButton.addEventListener('click', () => restoreAcceptedArticle(article.link));

    card.append(link, restoreButton);
    return card;
}

function acceptArticle(article) {
    sourcingDecisions.rejected.delete(article.link);
    sourcingDecisions.accepted = [
        { ...article, acceptedAt: new Date().toISOString() },
        ...sourcingDecisions.accepted.filter(item => item.link !== article.link)
    ];
    persistSourcingDecisions();
    renderWorkspace();
}

function rejectArticle(article) {
    sourcingDecisions.rejected.add(article.link);
    sourcingDecisions.accepted = sourcingDecisions.accepted.filter(item => item.link !== article.link);
    persistSourcingDecisions();
    renderWorkspace();
}

function restoreAcceptedArticle(articleLink) {
    sourcingDecisions.accepted = sourcingDecisions.accepted.filter(item => item.link !== articleLink);
    sourcingDecisions.rejected.delete(articleLink);
    persistSourcingDecisions();
    renderWorkspace();
}

function renderAcceptedArticles() {
    const acceptedList = document.getElementById('acceptedList');
    const acceptedCount = document.getElementById('acceptedCount');
    if (!acceptedList || !acceptedCount) return;

    const currentArticles = new Map(loadedArticles.map(article => [article.link, article]));
    const acceptedArticles = sourcingDecisions.accepted.map(savedArticle => ({
        ...savedArticle,
        ...(currentArticles.get(savedArticle.link) || {}),
        acceptedAt: savedArticle.acceptedAt
    }));

    acceptedCount.textContent = String(acceptedArticles.length);

    if (!acceptedArticles.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'accepted-list__empty';
        emptyState.textContent = 'Accepted stories will appear here.';
        acceptedList.replaceChildren(emptyState);
        return;
    }

    acceptedList.replaceChildren(...acceptedArticles.map(createAcceptedCard));
}

function renderArticles(articles) {
    const gallery = document.getElementById('aiSafetyGallery');
    if (!gallery) return;

    if (!articles.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'ai-safety-error';
        emptyState.textContent = 'No pending stories.';
        gallery.replaceChildren(emptyState);
    } else {
        gallery.replaceChildren(...articles.map(createCard));
    }
    gallery.setAttribute('aria-busy', 'false');
}

function renderWorkspace() {
    const acceptedLinks = new Set(sourcingDecisions.accepted.map(article => article.link));
    const pendingArticles = loadedArticles.filter(article => (
        !acceptedLinks.has(article.link) && !sourcingDecisions.rejected.has(article.link)
    ));

    renderArticles(pendingArticles);
    renderAcceptedArticles();
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
        const results = await Promise.allSettled(FEED_URLS.map(async feedUrl => {
            const response = await fetch(feedUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Feed request failed with ${response.status}.`);
            return parseFeed(await response.text());
        }));
        const successfulFeeds = results
            .filter(result => result.status === 'fulfilled')
            .map(result => result.value);

        if (!successfulFeeds.length) throw new Error('All AI Safety feeds failed to load.');

        loadedArticles = mergeArticles(successfulFeeds);
        if (!loadedArticles.length) throw new Error('The feed did not return any stories.');
        renderWorkspace();
    } catch (error) {
        console.error('Unable to load AI Safety feed:', error);
        if (!preserveOnError) renderError();
    }
}

addStylesheet();
renderShell();
renderAcceptedArticles();
loadFeed();
window.setInterval(() => loadFeed({ preserveOnError: true }), REFRESH_INTERVAL_MS);
