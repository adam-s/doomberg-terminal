export function runChatGPTContentScript(): void {
  // Content script for monitoring ChatGPT DOM changes
  // This script runs in the context of the ChatGPT tab

  const PORT_NAME = 'chatgpt-content-script-port';
  let port: chrome.runtime.Port | null = null;

  enum ChangeType {
    NEW = 'NEW',
    UPDATED = 'UPDATED',
    DELETED = 'DELETED',
  }

  interface IElementData {
    tagName: string;
    outerHTML: string;
  }

  interface IContentScriptMessage {
    changeType: ChangeType;
    articleId: string;
    element: IElementData;
  }

  // Interface for events passed internally before serialization
  interface IInternalElementChangeEvent {
    element: HTMLElement; // For NEW/UPDATED, this is the markdownContainer. For DELETED article, this is the article HTMLElement.
    changeType: ChangeType;
    articleId: string; // Ensure articleId is always a string when an event is formed.
  }

  function connectPort(): void {
    if (port) {
      try {
        port.disconnect();
      } catch (e) {
        // Ignore if already disconnected
      }
      port = null;
    }

    try {
      port = chrome.runtime.connect({ name: PORT_NAME });
      port.onDisconnect.addListener(() => {
        port = null;
      });
    } catch (error) {
      console.error('[ChatGPT Content Script] Failed to connect port:', error);
      port = null;
    }
  }

  function emitElementChangeEvent(event: IInternalElementChangeEvent): void {
    let htmlToSend: string =
      event.changeType === ChangeType.DELETED
        ? '' // Send empty content for a deleted article
        : event.element.innerHTML; // For NEW/UPDATED, this is the markdownContainer's content

    if (event.changeType !== ChangeType.DELETED && htmlToSend) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlToSend, 'text/html');
        const allElements = doc.body.querySelectorAll('*');
        allElements.forEach(el => {
          if (el.hasAttribute('class')) {
            el.removeAttribute('class');
          }
        });
        htmlToSend = doc.body.innerHTML;
      } catch (error) {
        console.error('[ChatGPT Content Script] Error stripping attributes:', error);
        // Proceed with original htmlToSend if stripping fails
      }

      // Attempt to parse for specific link and text, and reformat htmlToSend
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlToSend, 'text/html'); // Parse the potentially class-stripped HTML

        const elementsToReplace = doc.body.querySelectorAll('span[data-state="closed"]');

        elementsToReplace.forEach(elementToReplaceInstance => {
          // Cast to HTMLElement to satisfy querySelector, though querySelectorAll returns NodeListOf<Element>
          const currentSearchRoot = elementToReplaceInstance as HTMLElement;
          const linkEl = currentSearchRoot.querySelector('a[href]');
          if (!linkEl) {
            return;
          }

          const opacityOneSpan = linkEl.querySelector('span[style*="opacity: 1"]');
          if (!opacityOneSpan) {
            return;
          }

          const textContentSpan = opacityOneSpan.querySelector('span'); // First span child of opacityOneSpan
          if (!textContentSpan) {
            return;
          }

          const href = linkEl.getAttribute('href');
          const text = textContentSpan.textContent?.trim();

          if (href && text) {
            const newSpanHTML = `<span class="markdown-link"><a href="${href}" target="_blank" rel="noopener">${text}</a></span>`;
            const tempDiv = doc.createElement('span');
            tempDiv.innerHTML = newSpanHTML;
            const newElementNode = tempDiv.firstChild;

            if (newElementNode && elementToReplaceInstance.parentNode) {
              // Ensure newElementNode is treated as Node for replaceChild
              elementToReplaceInstance.parentNode.replaceChild(
                newElementNode as Node,
                elementToReplaceInstance as Node,
              );
            }
          }
        });

        // Update htmlToSend with the content of the (potentially modified) document
        htmlToSend = doc.body.innerHTML;
      } catch (error) {
        console.error(
          '[ChatGPT Content Script] Error parsing link and text for custom formatting:',
          error,
        );
        // If parsing for custom format fails, htmlToSend remains as it was (class-stripped or original)
      }
    }

    const serializableEvent: IContentScriptMessage = {
      changeType: event.changeType,
      articleId: event.articleId,
      element: {
        tagName: event.element.tagName, // tagName of markdownContainer or deleted article
        outerHTML: htmlToSend, // Content of markdownContainer or empty for deleted article
      },
    };

    if (!port) {
      connectPort();
    }

    if (port) {
      try {
        port.postMessage(serializableEvent);
      } catch (error) {
        console.error('[ChatGPT Content Script] Error sending message:', error);
        if (
          error instanceof Error &&
          error.message.includes('Attempting to use a disconnected port object')
        ) {
          port = null;
          connectPort();
        }
      }
    }
  }

  function initializeChatGPTMonitoring(): void {
    connectPort();

    const ARTICLE_SELECTOR = 'article[data-testid*="conversation-turn"]';
    const MARKDOWN_CONTAINER_SELECTOR = 'div.markdown';
    const OBSERVED_ARTICLES: Set<HTMLElement> = new Set();

    const processInitialArticleContent = (articleElement: HTMLElement): void => {
      const articleId = articleElement.dataset.testid;
      if (!articleId) {
        console.warn(
          '[ChatGPT Content Script] Article missing data-testid in processInitialArticleContent:',
          articleElement,
        );
        return;
      }
      const markdownContainer = articleElement.querySelector<HTMLElement>(
        MARKDOWN_CONTAINER_SELECTOR,
      );

      if (markdownContainer) {
        emitElementChangeEvent({
          element: markdownContainer,
          changeType: ChangeType.NEW,
          articleId: articleId,
        });
      }
    };

    const articleContentObserver = new MutationObserver((mutationsList: MutationRecord[]) => {
      const articlesToUpdate: Map<string, HTMLElement> = new Map(); // articleId (string) -> markdownContainer (HTMLElement)

      for (const mutation of mutationsList) {
        let owningArticleElement: HTMLElement | null = null;
        if (mutation.target.nodeType === Node.ELEMENT_NODE) {
          owningArticleElement = (mutation.target as HTMLElement).closest<HTMLElement>(
            ARTICLE_SELECTOR,
          );
        } else if (mutation.target.parentElement) {
          owningArticleElement =
            mutation.target.parentElement.closest<HTMLElement>(ARTICLE_SELECTOR);
        }

        if (!owningArticleElement || !OBSERVED_ARTICLES.has(owningArticleElement)) {
          continue;
        }

        const articleId = owningArticleElement.dataset.testid;
        if (!articleId) {
          console.warn(
            '[ChatGPT Content Script] Article missing data-testid in articleContentObserver:',
            owningArticleElement,
          );
          continue;
        }

        // If we haven't already decided to update this article in this batch,
        // find its markdown container and mark it for update.
        if (!articlesToUpdate.has(articleId)) {
          const markdownContainer = owningArticleElement.querySelector<HTMLElement>(
            MARKDOWN_CONTAINER_SELECTOR,
          );
          if (markdownContainer) {
            articlesToUpdate.set(articleId, markdownContainer);
          }
        }
      }

      articlesToUpdate.forEach((markdownContainer, articleId) => {
        emitElementChangeEvent({
          element: markdownContainer,
          changeType: ChangeType.UPDATED,
          articleId: articleId,
        });
      });
    });

    const setupObservationForArticle = (articleElement: HTMLElement): void => {
      if (OBSERVED_ARTICLES.has(articleElement)) {
        return;
      }
      processInitialArticleContent(articleElement);
      articleContentObserver.observe(articleElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      OBSERVED_ARTICLES.add(articleElement);
    };

    const newArticleDetector = new MutationObserver((mutationsList: MutationRecord[]) => {
      for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const addedElement = node as HTMLElement;
              if (addedElement.matches(ARTICLE_SELECTOR)) {
                setupObservationForArticle(addedElement);
              }
              addedElement
                .querySelectorAll<HTMLElement>(ARTICLE_SELECTOR)
                .forEach(setupObservationForArticle);
            }
          });

          mutation.removedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const removedElement = node as HTMLElement;
              if (removedElement.matches(ARTICLE_SELECTOR)) {
                const articleId = removedElement.dataset.testid;
                if (articleId) {
                  OBSERVED_ARTICLES.delete(removedElement);
                  emitElementChangeEvent({
                    element: removedElement,
                    changeType: ChangeType.DELETED,
                    articleId: articleId,
                  });
                }
              }
              removedElement.querySelectorAll<HTMLElement>(ARTICLE_SELECTOR).forEach(articleEl => {
                const articleId = articleEl.dataset.testid;
                if (articleId && OBSERVED_ARTICLES.has(articleEl)) {
                  OBSERVED_ARTICLES.delete(articleEl);
                  emitElementChangeEvent({
                    element: articleEl,
                    changeType: ChangeType.DELETED,
                    articleId: articleId,
                  });
                }
              });
            }
          });
        }
      }
    });

    const initializeObservers = (): void => {
      document.querySelectorAll<HTMLElement>(ARTICLE_SELECTOR).forEach(setupObservationForArticle);
      const articlesParentHost = document.body;
      newArticleDetector.observe(articlesParentHost, { childList: true, subtree: true });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeObservers);
    } else {
      initializeObservers();
    }
  }

  // Initialize the monitoring when script loads
  initializeChatGPTMonitoring();
}
