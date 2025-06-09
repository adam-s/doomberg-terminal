import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { IWindow, Window } from '@root/background/src/services/windows/window.model';
import { ITab, Tab } from '@root/background/src/services/windows/tab.model.';
import { Disposable } from 'vs/base/common/lifecycle';

function isWindow(window: unknown): window is IWindow {
  return (
    typeof window === 'object' &&
    window !== null &&
    'id' in window &&
    typeof (window as { id: unknown }).id === 'number'
  );
}

function isTab(tab: unknown): tab is ITab {
  return (
    typeof tab === 'object' &&
    tab !== null &&
    'id' in tab &&
    typeof (tab as { id: unknown }).id === 'number'
  );
}

export interface IWindowsService {
  readonly _serviceBrand: undefined;
  readonly onCreatedWindow: Event<{ window: Window; atStart?: boolean }>;
  readonly onRemovedWindow: Event<{ window: Window }>;
  readonly onCreatedTab: Event<{ tab: Tab; atStart?: boolean }>;
  readonly onUpdatedTab: Event<{ tabId: number; changeInfo: Partial<ITab>; tab: Tab }>;
  readonly onRemovedTab: Event<{ tab: Tab }>;
  readonly onActivatedTab: Event<{ tabId: number; windowId: number }>;
  readonly onAttachedTab: Event<{ tabId: number; newWindowId: number; newPosition: number }>;
  readonly onDetachedTab: Event<{ tabId: number; oldWindowId: number; oldPosition: number }>;
  readonly onMovedTab: Event<{
    tabId: number;
    windowId: number;
    fromIndex: number;
    toIndex: number;
  }>;
  readonly onHighlightedTab: Event<{ windowId: number; tabIds: number[] }>;
  readonly onReplacedTab: Event<{ addedTabId: number; removedTabId: number }>;

  start: () => void;
}

export const IWindowsService = createDecorator<IWindowsService>('windowsService');

export class WindowsService extends Disposable implements IWindowsService {
  declare readonly _serviceBrand: undefined;

  private readonly _onCreatedWindow = this._register(
    new Emitter<{ window: Window; atStart?: boolean }>(),
  );
  readonly onCreatedWindow = this._onCreatedWindow.event;

  private readonly _onRemovedWindow = this._register(new Emitter<{ window: Window }>());
  readonly onRemovedWindow = this._onRemovedWindow.event;

  private readonly _onCreatedTab = this._register(new Emitter<{ tab: Tab; atStart?: boolean }>());
  readonly onCreatedTab = this._onCreatedTab.event;

  private readonly _onUpdatedTab = this._register(
    new Emitter<{ tabId: number; changeInfo: Partial<ITab>; tab: Tab }>(),
  );
  readonly onUpdatedTab = this._onUpdatedTab.event;

  private readonly _onRemovedTab = this._register(new Emitter<{ tab: Tab }>());
  readonly onRemovedTab = this._onRemovedTab.event;

  private readonly _onActivatedTab = this._register(
    new Emitter<{ tabId: number; windowId: number }>(),
  );
  readonly onActivatedTab = this._onActivatedTab.event;

  private readonly _onAttachedTab = this._register(
    new Emitter<{ tabId: number; newWindowId: number; newPosition: number }>(),
  );
  readonly onAttachedTab = this._onAttachedTab.event;

  private readonly _onDetachedTab = this._register(
    new Emitter<{ tabId: number; oldWindowId: number; oldPosition: number }>(),
  );
  readonly onDetachedTab = this._onDetachedTab.event;

  private readonly _onMovedTab = this._register(
    new Emitter<{ tabId: number; windowId: number; fromIndex: number; toIndex: number }>(),
  );
  readonly onMovedTab = this._onMovedTab.event;

  private readonly _onHighlightedTab = this._register(
    new Emitter<{ windowId: number; tabIds: number[] }>(),
  );
  readonly onHighlightedTab = this._onHighlightedTab.event;

  private readonly _onReplacedTab = this._register(
    new Emitter<{ addedTabId: number; removedTabId: number }>(),
  );
  readonly onReplacedTab = this._onReplacedTab.event;

  private readonly windows = new Map<number, Window>();
  private readonly tabs = new Map<number, Tab>();

  constructor() {
    super();
    this.initializeListeners();
  }

  async start() {
    // Initialize state
    await this.setWindows();
    await this.setTabs();
  }

  async setWindows() {
    const windows = await chrome.windows.getAll();
    for (const windowConfiguration of windows) {
      if (isWindow(windowConfiguration)) {
        this.createWindow(windowConfiguration, true);
      }
    }
  }

  async setTabs() {
    const tabs = await chrome.tabs.query({});
    for (const tabConfiguration of tabs) {
      if (isTab(tabConfiguration) && tabConfiguration.id !== undefined) {
        await this.createTab(tabConfiguration, true);
      } else {
        // Handle the case where tabConfiguration.id is undefined (if necessary)
        console.warn('Tab configuration without a valid ID:', tabConfiguration);
      }
    }
  }

  private initializeListeners() {
    // Window events
    chrome.windows.onCreated.addListener(this.handleWindowCreated.bind(this));
    chrome.windows.onFocusChanged.addListener(this.handleWindowFocusChanged.bind(this));
    chrome.windows.onRemoved.addListener(this.handleWindowRemoved.bind(this));

    // Tab events
    chrome.tabs.onCreated.addListener(this.handleTabCreated.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));
    chrome.tabs.onAttached.addListener(this.handleTabAttached.bind(this));
    chrome.tabs.onDetached.addListener(this.handleTabDetached.bind(this));
    chrome.tabs.onMoved.addListener(this.handleTabMoved.bind(this));
    chrome.tabs.onHighlighted.addListener(this.handleTabHighlighted.bind(this));
    chrome.tabs.onReplaced.addListener(this.handleTabReplaced.bind(this));
  }

  // Window event handlers
  private handleWindowCreated(windowConfiguration: chrome.windows.Window) {
    if (isWindow(windowConfiguration)) {
      this.createWindow(windowConfiguration, false);
    }
  }

  private handleWindowFocusChanged(windowId: number) {
    const isNoWindowFocused = windowId === chrome.windows.WINDOW_ID_NONE;

    this.windows.forEach((win, id) => {
      const shouldBeFocused = !isNoWindowFocused && id === windowId;
      const windowInstance = win as Window;

      if (windowInstance.focused !== shouldBeFocused) {
        windowInstance.updateWindow({ focused: shouldBeFocused });
      }
    });
  }

  private handleWindowRemoved(windowId: number) {
    const removedWindow = this.windows.get(windowId);
    if (removedWindow !== undefined) {
      removedWindow.dispose(); // Clean up resources
      this.windows.delete(windowId);
      this._onRemovedWindow.fire({ window: removedWindow });
    }
  }

  // Tab event handlers
  private handleTabCreated(tabConfiguration: chrome.tabs.Tab) {
    if (isTab(tabConfiguration) && tabConfiguration.id !== undefined) {
      this.createTab(tabConfiguration, false);
    }
  }

  private handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo /** tab: chrome.tabs.Tab */,
  ) {
    const existingTab = this.tabs.get(tabId);
    if (existingTab) {
      existingTab.updateTab(changeInfo as Partial<ITab>);
      this._onUpdatedTab.fire({ tabId, changeInfo: changeInfo as Partial<ITab>, tab: existingTab });
    }
  }

  private handleTabRemoved(tabId: number /** removeInfo: chrome.tabs.TabRemoveInfo */) {
    const removedTab = this.tabs.get(tabId);
    if (removedTab) {
      removedTab.dispose(); // Clean up resources
      this.tabs.delete(tabId);
      this._onRemovedTab.fire({ tab: removedTab });
    }
  }

  private handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo) {
    const { tabId, windowId } = activeInfo;
    const activatedTab = this.tabs.get(tabId);

    if (activatedTab) {
      activatedTab.updateTab({ active: true });
      this.tabs.forEach(tab => {
        if (tab.windowId === windowId && tab.id !== tabId) {
          tab.updateTab({ active: false });
        }
      });
      this._onActivatedTab.fire(activeInfo);
    }
  }

  private handleTabAttached(tabId: number, attachInfo: chrome.tabs.TabAttachInfo) {
    const attachedTab = this.tabs.get(tabId);

    if (attachedTab) {
      attachedTab.updateTab({ windowId: attachInfo.newWindowId, index: attachInfo.newPosition });
      this._onAttachedTab.fire({ tabId, ...attachInfo });
    }
  }

  private handleTabDetached(tabId: number, detachInfo: chrome.tabs.TabDetachInfo) {
    const detachedTab = this.tabs.get(tabId);

    if (detachedTab) {
      detachedTab.updateTab({ windowId: detachInfo.oldWindowId, index: detachInfo.oldPosition });
      this._onDetachedTab.fire({ tabId, ...detachInfo });
    }
  }

  private handleTabMoved(tabId: number, moveInfo: chrome.tabs.TabMoveInfo) {
    const movedTab = this.tabs.get(tabId);

    if (movedTab) {
      movedTab.updateTab({ index: moveInfo.toIndex });
      this._onMovedTab.fire({ tabId, ...moveInfo });
    }
  }

  private handleTabHighlighted(highlightInfo: chrome.tabs.TabHighlightInfo) {
    highlightInfo.tabIds.forEach(tabId => {
      const highlightedTab = this.tabs.get(tabId);
      if (highlightedTab) {
        highlightedTab.updateTab({ highlighted: true });
      }
    });

    this.tabs.forEach(tab => {
      if (tab.windowId === highlightInfo.windowId && !highlightInfo.tabIds.includes(tab.id!)) {
        tab.updateTab({ highlighted: false });
      }
    });

    this._onHighlightedTab.fire(highlightInfo);
  }

  private handleTabReplaced(addedTabId: number, removedTabId: number) {
    // Remove the old tab from your records
    const removedTab = this.tabs.get(removedTabId);
    if (removedTab) {
      removedTab.dispose(); // Clean up resources associated with the old tab
      this.tabs.delete(removedTabId);
    }

    // Add the new tab to your records
    chrome.tabs.get(addedTabId, tab => {
      if (tab && isTab(tab)) {
        const newTabInstance = new Tab(tab);
        this.tabs.set(addedTabId, newTabInstance);
        this._onReplacedTab.fire({ addedTabId, removedTabId });
      }
    });
  }

  private createWindow(windowConfiguration: IWindow, atStart = false) {
    const window = new Window(windowConfiguration);
    this.windows.set(window.id, window);
    this._onCreatedWindow.fire({ window, atStart });
  }

  private async createTab(tabConfiguration: ITab, atStart = false) {
    const tab = new Tab(tabConfiguration);
    this.tabs.set(tab.id!, tab);
    await tab.start();
    this._onCreatedTab.fire({ tab, atStart });
  }
}
