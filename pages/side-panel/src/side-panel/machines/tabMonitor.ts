export type TabMonitorCallback = (
  isAttached: boolean,
  tab?: chrome.tabs.Tab,
  documentId?: string,
) => void;

export function monitorRobinhoodTabs(callback: TabMonitorCallback) {
  let currentWindowId: number | undefined;

  const updateState = async (newState: boolean, tab?: chrome.tabs.Tab) => {
    callback(newState, tab);
  };

  const checkForRobinhoodTab = (windowId: number) => {
    chrome.tabs.query({ windowId, url: '*://*.robinhood.com/*' }, tabs => {
      if (tabs.length === 0) {
        updateState(false);
        return;
      }

      // Simply use the first available tab
      updateState(true, tabs[0]);
    });
  };

  const handlers = {
    onTabCreated: (tab: chrome.tabs.Tab) => {
      if (tab.windowId === currentWindowId && tab.url?.includes('robinhood.com')) {
        updateState(true, tab);
      }
    },
    onTabRemoved: (tabId: number, info: chrome.tabs.TabRemoveInfo) => {
      if (info.windowId === currentWindowId) {
        checkForRobinhoodTab(currentWindowId!);
      }
    },
    onTabUpdated: (_: number, __: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (tab.windowId === currentWindowId) {
        checkForRobinhoodTab(currentWindowId!);
      }
    },
    onTabAttached: (_: number, info: chrome.tabs.TabAttachInfo) => {
      if (info.newWindowId === currentWindowId) {
        checkForRobinhoodTab(currentWindowId!);
      }
    },
    onTabDetached: (_: number, info: chrome.tabs.TabDetachInfo) => {
      if (info.oldWindowId === currentWindowId) {
        checkForRobinhoodTab(currentWindowId!);
      }
    },
  };

  // Initialize monitoring
  chrome.windows.getCurrent({ populate: false }, window => {
    if (!window.id) return;
    currentWindowId = window.id;
    checkForRobinhoodTab(currentWindowId);

    chrome.tabs.onCreated.addListener(handlers.onTabCreated);
    chrome.tabs.onRemoved.addListener(handlers.onTabRemoved);
    chrome.tabs.onUpdated.addListener(handlers.onTabUpdated);
    chrome.tabs.onAttached.addListener(handlers.onTabAttached);
    chrome.tabs.onDetached.addListener(handlers.onTabDetached);
  });

  return () => {
    if (currentWindowId) {
      chrome.tabs.onCreated.removeListener(handlers.onTabCreated);
      chrome.tabs.onRemoved.removeListener(handlers.onTabRemoved);
      chrome.tabs.onUpdated.removeListener(handlers.onTabUpdated);
      chrome.tabs.onAttached.removeListener(handlers.onTabAttached);
      chrome.tabs.onDetached.removeListener(handlers.onTabDetached);
    }
    currentWindowId = undefined;
  };
}
