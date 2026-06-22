// Service worker MV3 — click icon extension mở/focus tab dashboard full-tab.
// Không có default_popup trong manifest nên onClicked bắn được bình thường.

const DASHBOARD_PATH = 'index.html';

function getDashboardUrl() {
  return chrome.runtime.getURL(DASHBOARD_PATH);
}

chrome.action.onClicked.addListener(async () => {
  const dashboardUrl = getDashboardUrl();

  const tabs = await chrome.tabs.query({ url: dashboardUrl });
  if (tabs.length > 0 && tabs[0].id !== undefined) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: dashboardUrl });
});
