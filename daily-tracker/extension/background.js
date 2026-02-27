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

function buildTitleFromUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        const url = new URL(rawUrl);
        const segments = url.pathname.split('/').filter(Boolean);
        const lastSegment = segments[segments.length - 1] || '';
        const fromPath = prettifySlugPart(lastSegment);
        if (fromPath) return fromPath;

        const hostname = url.hostname.replace(/^www\./, '');
        const hostLabel = hostname.split('.').slice(0, -1).join('.') || hostname;
        const prettyHost = prettifySlugPart(hostLabel);
        return prettyHost || hostname;
    } catch {
        return '';
    }
}

function resolveCaptureTitle({ linkText, selectionText, pageTitle, linkUrl, pageUrl }) {
    const cleanLinkText = (linkText || '').trim();
    if (cleanLinkText) return cleanLinkText;

    const cleanSelection = (selectionText || '').trim();
    if (cleanSelection && cleanSelection.length <= 90) return cleanSelection;

    const urlBasedTitle = buildTitleFromUrl(linkUrl || pageUrl);
    if (urlBasedTitle) return urlBasedTitle;

    return (pageTitle || '').trim();
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
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "add-to-daily-tasks") {
        const resolvedTitle = resolveCaptureTitle({
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
