export const injectedImagePasteAndSend = (
  imageBytes: number[],
  mimeType: string,
  statusJson: string,
): void => {
  // Put pure functions here / self-contained helpers

  // Constants
  const SP500_EFFECT_PROMPT = `Please analyze the post and provide a detailed analysis of the SP500 effect. Include any relevant information, trends, or insights that can be derived from the post. It should be plain text, 2 to 4 sentences`;
  const PROMPT_TEXTAREA_SELECTOR = '#prompt-textarea';
  const SEND_BUTTON_SELECTOR = 'button[data-testid="send-button"]';
  const FILE_UPLOAD_MESSAGE_SOURCES = [
    'CHATGPT_FILE_UPLOAD_CONFIRMED',
    'CHATGPT_FILE_UPLOAD_FAILED',
    'CHATGPT_FILE_UPLOAD_ERROR',
  ] as const;
  const MESSAGE_LISTENER_TIMEOUT_MS = 15000;
  const ELEMENT_WAIT_TIMEOUT_MS = 10000;
  const ELEMENT_WAIT_INTERVAL_MS = 100;
  const SEND_BUTTON_WAIT_TIMEOUT_MS = 15000;
  const SEND_BUTTON_WAIT_INTERVAL_MS = 200;

  // Interfaces
  type FileUploadMessageSource = (typeof FILE_UPLOAD_MESSAGE_SOURCES)[number];

  interface FileUploadMessageData {
    source: FileUploadMessageSource;
    payload: unknown; // This can be refined if the payload structure is known and consistent
  }

  // Type Guards
  const isFileUploadMessageData = (data: unknown): data is FileUploadMessageData => {
    if (typeof data !== 'object' || data === null) {
      return false;
    }
    // Using 'in' for property checks is safer before casting to a partial type
    if (
      !(
        'source' in data &&
        typeof (data as { source: unknown }).source === 'string' &&
        'payload' in data
      )
    ) {
      return false;
    }
    return (FILE_UPLOAD_MESSAGE_SOURCES as readonly string[]).includes(
      (data as { source: string }).source,
    );
  };

  // DOM/Async Utilities
  const waitForElement = (
    selector: string,
    timeout = ELEMENT_WAIT_TIMEOUT_MS,
    interval = ELEMENT_WAIT_INTERVAL_MS,
  ): Promise<HTMLElement> =>
    new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = (): void => {
        const element = document.querySelector(selector) as HTMLElement | null;
        if (element) {
          resolve(element);
        } else if (Date.now() - startTime < timeout) {
          setTimeout(check, interval);
        } else {
          reject(new Error(`[Injected Script] Element ${selector} not found within ${timeout}ms.`));
        }
      };
      check();
    });

  const waitForSendButtonAndClick = (
    buttonSelector: string,
    timeout = SEND_BUTTON_WAIT_TIMEOUT_MS,
    interval = SEND_BUTTON_WAIT_INTERVAL_MS,
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const startTime = Date.now();
      const check = (): void => {
        const button = document.querySelector(buttonSelector) as HTMLButtonElement | null;
        if (button && !button.disabled) {
          button.click();
          resolve();
        } else if (Date.now() - startTime < timeout) {
          setTimeout(check, interval);
        } else {
          reject(
            new Error(
              `[Injected Script] Button ${buttonSelector} not clickable after ${timeout}ms.`,
            ),
          );
        }
      };
      check();
    });

  const insertTextAtCaret = (text: string): void => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move caret after the inserted text
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    // Dispatch an input event to simulate user typing, if necessary for the target editor
    if (textNode.parentNode && textNode.parentNode instanceof HTMLElement) {
      textNode.parentNode.dispatchEvent(
        new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }),
      );
    }
  };

  // Core Logic Function
  const pasteImageAndHandlePrompt = async (
    editor: HTMLElement,
    currentImageBytes: number[],
    currentMimeType: string,
    currentStatusJson: string,
  ): Promise<void> => {
    editor.focus();
    const pageBlob = new Blob([new Uint8Array(currentImageBytes)], { type: currentMimeType });
    const fileExtension = currentMimeType.split('/')[1] || 'png';
    const imageFile = new File([pageBlob], `pasted_image.${fileExtension}`, {
      type: currentMimeType,
    });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(imageFile);
    editor.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }),
    );

    let messageHandlingResolved = false;

    const appendPromptText = async (): Promise<void> => {
      editor.focus(); // Ensure editor is focused before inserting text
      const prefix =
        editor.innerText && editor.innerText.length > 0 && !editor.innerText.endsWith('\n')
          ? '\n'
          : '';
      const fullPrompt = `${prefix}\n${currentStatusJson}\n\n${SP500_EFFECT_PROMPT}\n\n`;
      insertTextAtCaret(fullPrompt);
      // eslint-disable-next-line no-console
      console.log('[Injected Script] Prompt inserted.');
    };

    const handleMessage = (event: MessageEvent): void => {
      if (event.source === window && isFileUploadMessageData(event.data)) {
        if (messageHandlingResolved) return;
        messageHandlingResolved = true;
        window.removeEventListener('message', handleMessage);
        clearTimeout(messageTimeoutHandle);

        appendPromptText()
          .then(() => waitForSendButtonAndClick(SEND_BUTTON_SELECTOR))
          .catch(error =>
            console.error('[Injected Script] Error processing file upload message:', error),
          );
      }
    };

    window.addEventListener('message', handleMessage);
    const messageTimeoutHandle = setTimeout((): void => {
      if (messageHandlingResolved) return;
      messageHandlingResolved = true;
      window.removeEventListener('message', handleMessage);
      // eslint-disable-next-line no-console
      console.log(
        '[Injected Script] Timeout waiting for file upload confirmation. Proceeding with prompt.',
      );
      appendPromptText()
        .then(() => waitForSendButtonAndClick(SEND_BUTTON_SELECTOR))
        .catch(error =>
          console.error('[Injected Script] Error in message timeout handler:', error),
        );
    }, MESSAGE_LISTENER_TIMEOUT_MS);
  };

  // IIFE to orchestrate the process
  ((): void => {
    waitForElement(PROMPT_TEXTAREA_SELECTOR)
      .then(editor => pasteImageAndHandlePrompt(editor, imageBytes, mimeType, statusJson))
      .catch(err =>
        console.error('[Injected Script] Failed to execute image paste and send:', err),
      );
  })();
};
