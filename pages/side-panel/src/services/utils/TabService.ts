import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Disposable } from 'vs/base/common/lifecycle';

export interface ITabService {
  readonly _serviceBrand: undefined;
  openTab(url: string, active?: boolean): Promise<number>;
  closeTab(tabId: number): Promise<void>;
  waitForTabLoad(tabId: number): Promise<void>;
}

export const ITabService = createDecorator<ITabService>('tabService');

export class TabService extends Disposable implements ITabService {
  declare readonly _serviceBrand: undefined;

  private readonly openTabIds = new Set<number>();

  constructor() {
    super();
  }

  public async openTab(url: string, active: boolean = false): Promise<number> {
    const tab = await chrome.tabs.create({ url, active });
    if (typeof tab.id !== 'number') {
      throw new Error('Tab creation failed: no id returned');
    }
    const tabId = tab.id;
    this.openTabIds.add(tabId);
    await this.waitForTabLoad(tabId);
    return tabId;
  }

  public async closeTab(tabId: number): Promise<void> {
    try {
      await chrome.tabs.remove(tabId);
    } catch (error) {
      console.warn(`[TabService] Could not close tab ${tabId}:`, error);
    } finally {
      this.openTabIds.delete(tabId);
    }
  }

  public async waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error(`Timeout waiting for tab ${tabId} to load`));
      }, 30000);

      const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId !== tabId) {
          return;
        }
        if (changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  public override dispose(): void {
    this.openTabIds.forEach(id => {
      chrome.tabs.remove(id).catch(() => {});
    });
    this.openTabIds.clear();
    super.dispose();
  }
}
