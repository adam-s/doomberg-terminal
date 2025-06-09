import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ITabService } from '../utils/TabService';
import { runChatGPTContentScript } from './chatgpt-content-script';
import { IObservable, observableValue } from 'vs/base/common/observable';
import { injectedTextPasteAndSend } from '../utils/injectedTextPasteAndSend';
import { ITextContextService } from '@shared/services/text-context.service';
import { IConnectionManager } from '@shared/ipc/message/ConnectionManger';
import { parseDocumentId } from '@shared/utils/utils';
import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';

const CHATGPT_URL = 'https://chatgpt.com/?model=gpt-4o&temporary-chat=true&hints=search';

export const IChatGPTService = createDecorator<IChatGPTService>('chatGPTService');

export interface IChatGPTArticleSnapshot {
  articleId: string;
  htmlContent: string;
}

export interface IChatGPTService extends IDisposable {
  readonly _serviceBrand: undefined;
  openChatGPTTab(): Promise<number>;
  sendTextToChatGPT(text: string, isFirstMessage?: boolean): Promise<void>;
  startNewChat(): Promise<number>;
  openTabWithContextButton(url: string): Promise<number>;
  readonly onChatGPTArticleSnapshot: IObservable<IChatGPTArticleSnapshot | undefined>;
}

export class ChatGPTService extends Disposable implements IChatGPTService {
  public readonly _serviceBrand: undefined;
  private readonly _activePorts: Map<number, chrome.runtime.Port>;
  private readonly _onChatGPTArticleSnapshot = observableValue<IChatGPTArticleSnapshot | undefined>(
    'chatGPTArticleSnapshot',
    undefined,
  );
  public readonly onChatGPTArticleSnapshot: IObservable<IChatGPTArticleSnapshot | undefined> =
    this._onChatGPTArticleSnapshot;

  // ========================================
  // 1. INITIALIZATION (Called during service creation)
  // ========================================

  public constructor(
    @IConnectionManager private readonly _connectionManager: IConnectionManager,
    @ITextContextService private readonly _textContextService: ITextContextService,
    @ITabService private readonly _tabService: ITabService,
  ) {
    super();
    this._activePorts = new Map<number, chrome.runtime.Port>();
    this._initializePortListener();
    this._registerMultiplexedContextListener();
  }

  private _initializePortListener(): void {
    chrome.runtime.onConnect.addListener((port: chrome.runtime.Port) => {
      if (port.name === 'chatgpt-content-script-port') {
        const senderTabId = port.sender?.tab?.id;
        if (typeof senderTabId === 'number') {
          this._activePorts.set(senderTabId, port);
          port.onMessage.addListener((message: unknown) => {
            this._handleContentScriptMessage(message);
          });
          port.onDisconnect.addListener(() => {
            this._activePorts.delete(senderTabId);
          });
        } else {
          port.disconnect();
        }
      }
    });
  }

  private _registerMultiplexedContextListener(): void {
    // Set up multiplexing for textContextService's onContextRequested event
    const contextRequestedEvent = this._connectionManager.multiplex<ITextContextService>(
      'textContextService',
      'onContextRequested',
      async (payload, ctx) => {
        const parsed = parseDocumentId(ctx);
        const activeTabId = await new Promise<number>(resolve =>
          chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            resolve(tabs[0]?.id ?? 0);
          }),
        );

        if (parsed?.frameId !== 0 || parsed.tabId !== activeTabId) return false;
        return true;
      },
    );

    contextRequestedEvent(async ({ payload, ctx }) => {
      console.log('########', ctx);
      console.log(
        'SidePanelApp: Received context requested message from client:',
        payload.slice(0, 100) + '...',
      );

      try {
        // Convert HTML payload to semantic markdown
        const semanticMarkdown = convertHtmlToMarkdown(payload);

        // Create context message for ChatGPT
        const contextMessage = `Here is the context from the current page:\n\n${semanticMarkdown}\n\nPlease use this context to help answer any questions.`;

        // Send the processed context to ChatGPT
        await this.sendTextToChatGPT(contextMessage);
      } catch (error) {
        console.error('[ChatGPTService] Failed to process context and send to ChatGPT:', error);
      }
    });
  }

  // ========================================
  // 2. PUBLIC API METHODS (Called by clients)
  // ========================================

  public async openChatGPTTab(): Promise<number> {
    // First, check for existing ChatGPT tabs before creating new ones
    const existingTabId = await this._findExistingChatGPTTab();

    if (existingTabId !== undefined) {
      try {
        // Make the existing tab active and refresh it to start a new chat
        await chrome.tabs.update(existingTabId, { active: true, url: CHATGPT_URL });

        // Wait for tab to finish loading after refresh
        await this._waitForTabLoaded(existingTabId);

        return existingTabId;
      } catch (error) {
        console.error('[ChatGPTService] Failed to activate existing ChatGPT tab:', error);
        // Fall through to create new tab if activation fails
      }
    }

    // If no existing tab found or activation failed, create a new one
    const tabId = await this._tabService.openTab(CHATGPT_URL, true);

    // Wait for tab to finish loading before injecting context button
    await this._waitForTabLoaded(tabId);

    return tabId;
  }

  public async openTabWithContextButton(url: string): Promise<number> {
    let originalTabId: number | undefined;

    // Remember the current active tab for restoration after quick focus
    try {
      const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      originalTabId = currentTabs[0]?.id;
    } catch (error) {
      console.error('[ChatGPTService] Failed to get current active tab:', error);
    }

    // First, check for existing tabs with the same URL
    const existingTabId = await this._findExistingTabByUrl(url);

    if (existingTabId !== undefined) {
      try {
        // Make the existing tab active
        await chrome.tabs.update(existingTabId, { active: true });

        // Inject context button into the existing tab
        this._textContextService.injectContextButton();

        // Return to original tab if we didn't start on ChatGPT and we have an original tab
        if (originalTabId !== undefined && originalTabId !== existingTabId) {
          const originalTab = await chrome.tabs.get(originalTabId);
          if (originalTab.url && !originalTab.url.includes('chatgpt.com')) {
            try {
              await chrome.tabs.update(originalTabId, { active: true });
            } catch (error) {
              console.error('[ChatGPTService] Failed to return to original tab:', error);
            }
          }
        }

        return existingTabId;
      } catch (error) {
        console.error('[ChatGPTService] Failed to activate existing tab:', error);
        // Fall through to create new tab if activation fails
      }
    }

    // Create new tab and make it active
    const newTab = await chrome.tabs.create({
      url: url,
      active: true,
    });

    console.log('New tab created:', newTab);

    if (newTab.id) {
      // Wait for tab to finish loading
      await this._waitForTabLoaded(newTab.id);

      // Inject context button into the new tab
      this._textContextService.injectContextButton();

      // Return to original tab if we didn't start on ChatGPT and we have an original tab
      if (originalTabId !== undefined && originalTabId !== newTab.id) {
        try {
          const originalTab = await chrome.tabs.get(originalTabId);
          if (originalTab.url && !originalTab.url.includes('chatgpt.com')) {
            await chrome.tabs.update(originalTabId, { active: true });
          }
        } catch (error) {
          console.error('[ChatGPTService] Failed to return to original tab:', error);
        }
      }
    }

    return newTab.id!;
  }

  public async sendTextToChatGPT(text: string): Promise<void> {
    let tabId: number | undefined;
    let originalTabId: number | undefined;

    // Remember the current active tab for restoration after quick focus
    try {
      const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      originalTabId = currentTabs[0]?.id;
    } catch (error) {
      console.error('[ChatGPTService] Failed to get current active tab:', error);
    }

    // First, check for existing ChatGPT tabs before creating new ones
    tabId = await this._findExistingChatGPTTab();

    // If we found an existing tab, use it without making it active initially
    if (tabId !== undefined) {
      try {
        // Ensure content script is injected
        await this._injectContentScript(tabId);
      } catch (error) {
        console.error('[ChatGPTService] Failed to prepare existing ChatGPT tab:', error);
        tabId = undefined; // Reset to create a new tab
      }
    }

    // If no existing tab found or preparation failed, create a new one
    if (tabId === undefined) {
      try {
        // Create new tab in background (not focused)
        const newTab = await chrome.tabs.create({
          url: CHATGPT_URL,
          active: false,
        });

        if (!newTab.id) {
          throw new Error('Failed to create new ChatGPT tab');
        }

        tabId = newTab.id;

        // Wait for tab to finish loading
        await this._waitForTabLoaded(tabId);

        // Inject content script for the new tab
        await this._injectContentScript(tabId);
      } catch (error) {
        console.error('[ChatGPTService] Failed to open ChatGPT tab for sending text:', error);
        throw new Error('Failed to open ChatGPT tab to send message.');
      }
    }

    // At this point, tabId should be valid
    if (tabId === undefined) {
      console.error(
        '[ChatGPTService] No valid tabId could be obtained or created to send text to ChatGPT.',
      );
      throw new Error('No valid ChatGPT tab found to send the message.');
    }

    try {
      // Briefly focus on ChatGPT tab to ensure proper text submission
      await chrome.tabs.update(tabId, { active: true });

      // Execute the self-contained injectedTextPasteAndSend script in the MAIN world
      // to interact directly with the page's DOM.
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: injectedTextPasteAndSend,
        args: [text],
        world: 'MAIN',
      });

      // Return to original tab if we have an original tab
      if (originalTabId !== undefined && originalTabId !== tabId) {
        try {
          await chrome.tabs.update(originalTabId, { active: true });
        } catch (error) {
          console.error('[ChatGPTService] Failed to return to original tab:', error);
        }
      }
    } catch (error) {
      console.error(
        '[ChatGPTService] Failed to execute injectedTextPasteAndSend script in ChatGPT tab:',
        error,
      );
      // Return to original tab even if there was an error
      if (originalTabId !== undefined && originalTabId !== tabId) {
        try {
          await chrome.tabs.update(originalTabId, { active: true });
        } catch (returnError) {
          console.error(
            '[ChatGPTService] Failed to return to original tab after error:',
            returnError,
          );
        }
      }
      throw new Error('Failed to send message to ChatGPT tab via script injection.');
    }
  }

  public async startNewChat(): Promise<number> {
    let tabId: number | undefined;

    // Check if we have an active ChatGPT tab
    if (this._activePorts.size > 0) {
      tabId = this._activePorts.keys().next().value as number | undefined;

      if (tabId !== undefined) {
        try {
          // Refresh the existing tab with the ChatGPT URL to start a new chat
          await chrome.tabs.update(tabId, { url: CHATGPT_URL });

          // Re-inject the content script after the page refreshes
          // Wait a bit for the page to start loading
          setTimeout(async () => {
            const injectionSuccess = await this._injectContentScript(tabId!);
            if (!injectionSuccess) {
              console.warn(
                '[ChatGPTService] Failed to inject content script after starting new chat',
              );
            }
          }, 1000);

          return tabId;
        } catch (error) {
          console.error('[ChatGPTService] Failed to refresh existing ChatGPT tab:', error);
          // If refreshing fails, fall back to opening a new tab
        }
      }
    }

    // If no active tab or refresh failed, open a new tab
    return await this.openChatGPTTab();
  }

  // ========================================
  // 3. TAB MANAGEMENT HELPERS (Called by public methods)
  // ========================================

  private async _findExistingTabByUrl(url: string): Promise<number | undefined> {
    try {
      // Query all tabs to find existing tabs with the same URL
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && tab.url === url && tab.id) {
          return tab.id;
        }
      }

      return undefined;
    } catch (error) {
      console.error('[ChatGPTService] Failed to find existing tab by URL:', error);
      return undefined;
    }
  }

  private async _findExistingChatGPTTab(): Promise<number | undefined> {
    try {
      // Query all tabs to find existing ChatGPT tabs
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.url && tab.url === CHATGPT_URL && tab.id) {
          return tab.id;
        }
      }

      return undefined;
    } catch (error) {
      console.error('[ChatGPTService] Failed to find existing ChatGPT tab:', error);
      return undefined;
    }
  }

  private async _waitForTabLoaded(tabId: number): Promise<void> {
    return new Promise(resolve => {
      const onUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onUpdated);
          resolve();
        }
      };

      // Check if tab is already loaded
      chrome.tabs.get(tabId, tab => {
        if (tab.status === 'complete') {
          resolve();
        } else {
          chrome.tabs.onUpdated.addListener(onUpdated);
        }
      });
    });
  }

  // ========================================
  // 4. CONTENT SCRIPT MANAGEMENT (Called during tab operations)
  // ========================================

  private async _injectContentScript(tabId: number): Promise<boolean> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: runChatGPTContentScript,
        world: 'ISOLATED',
        injectImmediately: true,
      });
      return true;
    } catch (error) {
      console.error('[ChatGPTService] Content script injection failed:', error);
      return false;
    }
  }

  // ========================================
  // 5. MESSAGE HANDLING (Called by content scripts)
  // ========================================

  private _handleContentScriptMessage(message: unknown): void {
    if (
      typeof message === 'object' &&
      message !== null &&
      'articleId' in message &&
      'element' in message &&
      typeof (message as { articleId: unknown }).articleId === 'string' &&
      typeof (message as { element: unknown }).element === 'object' &&
      (message as { element: { outerHTML?: unknown } }).element &&
      typeof (message as { element: { outerHTML?: unknown } }).element.outerHTML === 'string'
    ) {
      const articleId = (message as { articleId: string }).articleId;
      const htmlContent = (message as { element: { outerHTML: string } }).element.outerHTML;
      this._onChatGPTArticleSnapshot.set({ articleId, htmlContent }, undefined);
    }
  }

  // ========================================
  // 6. CLEANUP (Called during service disposal)
  // ========================================

  public override dispose(): void {
    this._activePorts.forEach((port: chrome.runtime.Port) => {
      try {
        port.disconnect();
      } catch {
        // Ignore errors if port already disconnected
      }
    });
    this._activePorts.clear();
    super.dispose();
  }
}
