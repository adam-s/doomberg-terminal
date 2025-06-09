export const injectedGetChatGptStreamedResponse = async (): Promise<string> => {
  // put pure functions here
  interface ChatGptSseMessageData {
    source: 'CHATGPT_SSE_INTERCEPTOR';
    eventType: string;
    payload: unknown;
  }

  interface SpecificDeltaPayload {
    p: '/message/content/parts/0';
    o: 'append';
    v: string;
    [key: string]: unknown; // Allow other properties
  }

  interface GeneralDeltaPayload {
    v: string;
    [key: string]: unknown; // Allow other properties
  }

  interface PatchDeltaPayload {
    o: 'patch';
    p: string;
    v: unknown[]; // Array of operations
    [key: string]: unknown; // Allow other properties
  }

  const isChatGptSseMessageData = (data: unknown): data is ChatGptSseMessageData => {
    if (typeof data !== 'object' || data === null) {
      return false;
    }
    // Using 'in' for property checks is safer before casting
    return (
      'source' in data &&
      (data as { source: unknown }).source === 'CHATGPT_SSE_INTERCEPTOR' &&
      'eventType' in data &&
      typeof (data as { eventType: unknown }).eventType === 'string' &&
      'payload' in data
    );
  };

  const isSpecificDeltaPayload = (payload: unknown): payload is SpecificDeltaPayload => {
    if (typeof payload !== 'object' || payload === null) return false;
    const p = payload as Partial<SpecificDeltaPayload>; // Use Partial for safer property access
    return p.p === '/message/content/parts/0' && p.o === 'append' && typeof p.v === 'string';
  };

  const isGeneralDeltaPayload = (payload: unknown): payload is GeneralDeltaPayload => {
    if (typeof payload !== 'object' || payload === null) return false;
    // Check for 'v' property being a string, and ensure it's not a more specific type already handled.
    // The order of checks in extractTextFromDeltaPayload is crucial.
    return typeof (payload as { v?: unknown }).v === 'string';
  };

  const isPatchDeltaPayload = (payload: unknown): payload is PatchDeltaPayload => {
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }
    const p = payload as Partial<PatchDeltaPayload>;
    return p.o === 'patch' && typeof p.p === 'string' && Array.isArray(p.v);
  };

  const extractTextFromDeltaPayload = (payload: unknown): string => {
    // Order of checks:
    // 1. Most specific: SpecificDeltaPayload
    // 2. Composite type: PatchDeltaPayload (which contains other types)
    // 3. General text carrier: GeneralDeltaPayload

    if (isSpecificDeltaPayload(payload)) {
      return payload.v;
    }

    if (isPatchDeltaPayload(payload)) {
      let concatenatedText = '';
      for (const operation of payload.v) {
        // Recursively call extractTextFromDeltaPayload for each operation in the patch
        concatenatedText += extractTextFromDeltaPayload(operation);
      }
      return concatenatedText;
    }

    if (isGeneralDeltaPayload(payload)) {
      return payload.v;
    }

    return ''; // Return empty string if payload is not a recognized text-carrying type
  };

  return new Promise<string>((resolve, reject) => {
    let fullResponse = '';
    const timeoutDuration = 60000;
    const finishedSuccessfullyMarker = 'finished_successfully';
    const handler = (e: MessageEvent): void => {
      if (
        e.source === window &&
        e.data && // Check if e.data exists
        isChatGptSseMessageData(e.data) // Validate the structure of e.data
      ) {
        // e.data is now confirmed to be ChatGptSseMessageData
        const { eventType, payload } = e.data;

        if (payload === '[DONE]') {
          clearTimeout(timeoutHandle);
          window.removeEventListener('message', handler);
          if (fullResponse.endsWith(finishedSuccessfullyMarker)) {
            fullResponse = fullResponse.slice(0, -finishedSuccessfullyMarker.length);
          }

          let textToParse = fullResponse.trim();

          // Remove markdown code block fences
          if (textToParse.startsWith('```json')) {
            textToParse = textToParse.substring(7).trim();
          } else if (textToParse.startsWith('```')) {
            textToParse = textToParse.substring(3).trim();
          }
          if (textToParse.endsWith('```')) {
            textToParse = textToParse.substring(0, textToParse.length - 3).trim();
          }

          const firstBraceIndex = textToParse.indexOf('{');
          if (firstBraceIndex === -1) {
            console.error(
              '[injectedGetChatGptStreamedResponse] No opening brace found in response:',
              textToParse,
            );
            reject(new Error('No JSON object found (no opening brace).'));
            return;
          }

          let balance = 0;
          let endIndex = -1;
          // Find the end of the first complete JSON object
          for (let i = firstBraceIndex; i < textToParse.length; i++) {
            if (textToParse[i] === '{') {
              balance++;
            } else if (textToParse[i] === '}') {
              balance--;
              if (balance === 0) {
                endIndex = i;
                break;
              }
            }
          }

          if (endIndex !== -1) {
            const potentialJsonString = textToParse.substring(firstBraceIndex, endIndex + 1);
            try {
              // Validate that this substring is parsable JSON
              JSON.parse(potentialJsonString);
              resolve(potentialJsonString);
            } catch (parseError) {
              const error = parseError as Error;
              console.error(
                '[injectedGetChatGptStreamedResponse] Failed to parse extracted JSON object:',
                error.message,
                'String was:',
                potentialJsonString,
                'Original response fragment:',
                fullResponse.substring(0, 500) + (fullResponse.length > 500 ? '...' : ''),
              );
              reject(new Error(`Extracted content is not valid JSON: ${error.message}`));
            }
          } else {
            console.error(
              '[injectedGetChatGptStreamedResponse] No matching closing brace for the main JSON object:',
              textToParse.substring(0, 500) + (textToParse.length > 500 ? '...' : ''),
            );
            reject(new Error('No matching closing brace for JSON object.'));
          }
          return;
        }
        // eslint-disable-next-line no-console
        switch (eventType) {
          case 'delta': {
            const textPiece = extractTextFromDeltaPayload(payload);
            fullResponse += textPiece;
            break;
          }
          // You can handle other eventTypes here if needed
          default: {
            // Ignore unhandled event types such as 'start', 'ping', 'complete', etc.
            break;
          }
        }
      }
    };
    const timeoutHandle = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error(`Timeout waiting for ChatGPT response (${timeoutDuration / 1000}s).`));
    }, timeoutDuration);
    window.addEventListener('message', handler);
    // eslint-disable-next-line no-console
    console.log('Listening for SSE messages from ChatGPT...');
  });
};
