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
        const data = {
            title: tab.title,
            url: info.linkUrl || tab.url,
            selection: info.selectionText || ""
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
