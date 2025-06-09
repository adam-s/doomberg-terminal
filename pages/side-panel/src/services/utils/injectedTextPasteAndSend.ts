export function injectedTextPasteAndSend(text: string): void {
  const PROMPT_TEXTAREA_SELECTOR = '#prompt-textarea';
  const SEND_BUTTON_SELECTOR = 'button[data-testid="send-button"]';
  const ELEMENT_WAIT_TIMEOUT_MS = 10000;
  const ELEMENT_WAIT_INTERVAL_MS = 100;
  const SEND_BUTTON_WAIT_TIMEOUT_MS = 15000;
  const SEND_BUTTON_WAIT_INTERVAL_MS = 200;

  /**
   * Waits for a DOM element matching selector to appear.
   */
  const waitForElement = (
    selector: string,
    timeout = ELEMENT_WAIT_TIMEOUT_MS,
    interval = ELEMENT_WAIT_INTERVAL_MS,
  ): Promise<HTMLElement> =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const check = (): void => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) {
          resolve(el);
        } else if (Date.now() - start < timeout) {
          setTimeout(check, interval);
        } else {
          reject(new Error(`[Injected Script] Element ${selector} not found within ${timeout}ms`));
        }
      };
      check();
    });

  /**
   * Waits for the send button to become enabled, then clicks it.
   */
  const waitForSendButtonAndClick = (
    selector: string,
    timeout = SEND_BUTTON_WAIT_TIMEOUT_MS,
    interval = SEND_BUTTON_WAIT_INTERVAL_MS,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const check = (): void => {
        const btn = document.querySelector(selector) as HTMLButtonElement | null;
        if (btn && !btn.disabled) {
          btn.click();
          resolve();
        } else if (Date.now() - start < timeout) {
          setTimeout(check, interval);
        } else {
          reject(
            new Error(`[Injected Script] Button ${selector} not clickable after ${timeout}ms`),
          );
        }
      };
      check();
    });

  /**
   * Inserts text at the current caret position in a contenteditable or textarea.
   */
  const insertTextAtCaret = (inputText: string): void => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return;
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(inputText);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);

    // Dispatch input event for frameworks that listen to it
    if (node.parentElement) {
      node.parentElement.dispatchEvent(
        new InputEvent('input', { bubbles: true, cancelable: true }),
      );
    }
  };

  // Orchestrator
  ((): void => {
    waitForElement(PROMPT_TEXTAREA_SELECTOR)
      .then(editor => {
        editor.focus();
        insertTextAtCaret(text);
        return waitForSendButtonAndClick(SEND_BUTTON_SELECTOR);
      })
      .catch(error => console.error('[Injected Script] text paste failed:', error));
  })();
}
