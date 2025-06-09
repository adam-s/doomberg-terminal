export const injectedInterceptorScript = (): void => {
  // put pure functions here
  const alreadyInjected = (): boolean => {
    const win = window as unknown as { fetch: typeof window.fetch };
    return (
      typeof win.fetch === 'function' && win.fetch.name === 'fetchWithSseInterceptor_RobbinDaHood'
    );
  };

  interface SseMessage {
    eventType: string;
    payload: unknown;
  }

  interface RawFileUploadApiResponse {
    status?: string;
    file_id?: string;
    // Allow other properties as the full structure isn't strictly defined here
    [key: string]: unknown;
  }

  const parseSseEvent = (sseEventString: string): SseMessage | null => {
    if (!sseEventString.trim()) {
      return null;
    }
    const lines = sseEventString.split('\n');
    let eventType = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    const rawPayload = dataLines.join('\n');
    try {
      const payload = rawPayload === '[DONE]' ? '[DONE]' : JSON.parse(rawPayload);
      return { eventType, payload };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error parsing SSE JSON payload:', rawPayload, error);
      return { eventType, payload: { error: 'Failed to parse JSON', originalData: rawPayload } };
    }
  };

  const handleConversationResponse = async (response: Response): Promise<Response> => {
    if (!response.body) {
      return response;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const stream = new ReadableStream({
      async start(controller) {
        const processChunk = async (): Promise<void> => {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const eventStrings = buffer.split(/\n\n/g);
            buffer = eventStrings.pop() || '';
            for (const eventString of eventStrings) {
              const sseMessage = parseSseEvent(eventString);
              if (sseMessage) {
                window.postMessage({ source: 'CHATGPT_SSE_INTERCEPTOR', ...sseMessage }, '*');
              }
            }
            controller.enqueue(value);
            await processChunk();
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Error processing stream chunk:', error);
            controller.error(error);
          }
        };
        await processChunk();
      },
    });
    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  const handleFileUpload = async (response: Response): Promise<Response> => {
    response
      .clone()
      .json()
      .then((data: RawFileUploadApiResponse) => {
        // Check for specific success conditions
        if (data.status === 'success' && data.file_id) {
          window.postMessage({ source: 'CHATGPT_FILE_UPLOAD_CONFIRMED', payload: data }, '*');
        } else {
          window.postMessage({ source: 'CHATGPT_FILE_UPLOAD_FAILED', payload: data }, '*');
        }
      })
      .catch(error => {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error during file upload processing';
        window.postMessage(
          { source: 'CHATGPT_FILE_UPLOAD_ERROR', payload: { message: errorMessage } },
          '*',
        );
      });
    return response;
  };

  const interceptFetch = (origFetch: typeof fetch) =>
    async function fetchWithSseInterceptor_RobbinDaHood(
      resource: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      if (typeof resource === 'string' && init?.method === 'POST') {
        if (resource.endsWith('/backend-api/conversation')) {
          const response = await origFetch(resource, init);
          return handleConversationResponse(response);
        }
        if (resource.includes('/backend-api/files')) {
          const response = await origFetch(resource, init);
          return handleFileUpload(response);
        }
      }
      return origFetch(resource, init);
    };

  if (alreadyInjected()) return;
  const originalFetch = window.fetch;
  (window as unknown as { fetch: typeof window.fetch }).fetch = interceptFetch(originalFetch);
};
