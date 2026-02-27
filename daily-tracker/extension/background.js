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
    if (text.toLowerCase() === "reply" || text.toLowerCase() === "share") return true;
    return false;
}

function toLeadWords(text, maxWords = 4) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, maxWords)
        .join(' ')
        .trim();
}

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function isTweetStatusUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl || '');
        const host = parsed.hostname.replace(/^www\./, '');
        const isX = host === 'x.com' || host === 'twitter.com';
        return isX && /\/status\/\d+/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

async function fetchTweetLeadTitle(rawUrl) {
    if (!isTweetStatusUrl(rawUrl)) return '';
    try {
        const endpoint = `https://publish.twitter.com/oembed?omit_script=true&dnt=true&url=${encodeURIComponent(rawUrl)}`;
        const res = await fetch(endpoint);
        if (!res.ok) return '';
        const payload = await res.json();
        const html = String(payload?.html || '');
        const stripped = html.replace(/<[^>]+>/g, ' ');
        const clean = decodeHtmlEntities(stripped).replace(/\s+/g, ' ').trim();
        return toLeadWords(clean, 4);
    } catch {
        return '';
    }
}

function buildTitleFromUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        const url = new URL(rawUrl);
        const segments = url.pathname.split('/').filter(Boolean);
        for (let i = segments.length - 1; i >= 0; i -= 1) {
            const segment = segments[i];
            if (!segment || isNumericLike(segment) || segment.toLowerCase() === 'status') continue;
            const fromPath = prettifySlugPart(segment);
            if (fromPath) return fromPath;
        }

        const hostname = url.hostname.replace(/^www\./, '');
        const hostLabel = hostname.split('.').slice(0, -1).join('.') || hostname;
        const prettyHost = prettifySlugPart(hostLabel);
        return prettyHost || hostname;
    } catch {
        return '';
    }
}

async function resolveCaptureTitle({ linkText, selectionText, pageTitle, linkUrl, pageUrl }) {
    const cleanLinkText = (linkText || '').trim();
    if (cleanLinkText && !isLowSignalTitle(cleanLinkText)) return cleanLinkText;

    const tweetLeadTitle = await fetchTweetLeadTitle(linkUrl || pageUrl);
    if (tweetLeadTitle) return tweetLeadTitle;

    const cleanSelection = (selectionText || '').trim();
    if (cleanSelection && cleanSelection.length <= 90 && !isLowSignalTitle(cleanSelection)) {
        return cleanSelection;
    }

    const urlBasedTitle = buildTitleFromUrl(linkUrl || pageUrl);
    if (urlBasedTitle) return urlBasedTitle;

    const cleanPageTitle = (pageTitle || '').trim();
    if (cleanPageTitle && !isLowSignalTitle(cleanPageTitle)) return cleanPageTitle;
    return toLeadWords(cleanPageTitle, 4);
}

// Create Context Menu items on install
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "add-to-daily-tasks",
        title: "Add to Daily Tasks",
        contexts: ["selection", "link", "page"]
    });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "add-to-daily-tasks") {
        const resolvedTitle = await resolveCaptureTitle({
            linkText: info.linkText,
            selectionText: info.selectionText,
            pageTitle: tab.title,
            linkUrl: info.linkUrl,
            pageUrl: tab.url
        });

        const data = {
            title: resolvedTitle,
            url: info.linkUrl || tab.url,
            selection: info.selectionText || "",
            linkText: info.linkText || ""
        };

        // Helper to send message
        const sendCapture = () => {
            chrome.tabs.sendMessage(tab.id, {
                action: "open-clipper-modal",
                data: data
            }).catch(err => {
                console.error("Content script still not ready, injecting manually...");
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content-script.js"]
                }).then(() => {
                    // Try again after injection
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tab.id, {
                            action: "open-clipper-modal",
                            data: data
                        });
                    }, 100);
                }).catch(e => console.error("Manual injection failed:", e));
            });
        };

        // Don't run on restricted pages
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
            console.warn("Scripting restricted on this page.");
            return;
        }

        sendCapture();
    }
});
