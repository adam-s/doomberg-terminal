/**
 * Options for a chat completion call.
 *
 * @property model     Optional OpenAI model to use.
 * @property tools     Optional tools to be used by the model, e.g., web_search_preview.
 * @property [key]     Any other OpenAI chat parameters (e.g. `temperature`, `top_p`, etc.).
 */
export interface ChatOptions {
  model?: string;
  tools?: { type: string; [key: string]: unknown }[];
  [key: string]: unknown;
}

/**
 * Result from an OpenAI chat-like API call.
 *
 * @property content    The textual content of the response.
 * @property modelUsed  The model that was used to generate the response.
 */
export interface OpenAIChatResult {
  content: string;
  modelUsed: string;
}

// ADDED: New interfaces for the /v1/responses API endpoint

/**
 * Represents the text content part of an OpenAI response message.
 */
interface OpenAIOutputTextContent {
  type: 'output_text';
  text: string;
  annotations?: Array<Record<string, unknown>>; // Using Record for flexible annotation structure
}

/**
 * Represents a message item in the 'output' array of the /v1/responses API.
 */
interface OpenAIResponseMessageOutput {
  type: 'message';
  id: string;
  status: string;
  role: 'assistant'; // Typically we are interested in assistant's messages
  content: OpenAIOutputTextContent[];
}

/**
 * Represents a web search call item in the 'output' array of the /v1/responses API.
 */
interface OpenAIWebSearchCallOutput {
  type: 'web_search_call';
  id: string;
  status: string;
  // Other web_search_call specific fields can be added here if needed
}

/**
 * Union type for the different kinds of items that can appear in the 'output' array
 * of the /v1/responses API.
 */
type OpenAIResponsesOutputItem = OpenAIResponseMessageOutput | OpenAIWebSearchCallOutput;

/**
 * Represents the overall structure of a response from the OpenAI /v1/responses API.
 */
interface OpenAIResponsesApi {
  id: string;
  object: 'response';
  created_at: number;
  status: string;
  error: null | Record<string, unknown>; // Error object if an error occurred
  model: string;
  output: OpenAIResponsesOutputItem[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    // More detailed usage fields can be added if necessary
  };
  // Other top-level fields from the API response can be added here
}

// === Low-level HTTP helper ===

async function openAIRequest(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }
  return response;
}

// === Chat ===

/**
 * Call the OpenAI /v1/responses endpoint.
 * This function now handles all chat-like interactions, including those that might use tools.
 * Streaming functionality has been removed.
 *
 * @param input The primary text input for the model.
 * @param apiKey Your OpenAI API key.
 * @param model The OpenAI model to use (default: 'gpt-4o').
 * @param options Additional options for the API call, including 'tools'.
 * @returns A promise that resolves to an OpenAIChatResult.
 */
export async function createChatCompletion(
  input: string,
  apiKey: string,
  model = 'gpt-4.1-mini',
  options: ChatOptions = {},
): Promise<OpenAIChatResult> {
  if (!input.trim()) {
    throw new Error('Input cannot be empty for chat completion.');
  }
  if (!apiKey.trim()) {
    throw new Error('OpenAI API key cannot be empty.');
  }

  const { model: modelOverride, tools, ...rest } = options;
  const effectiveModel = modelOverride ?? model;

  const requestBody: Record<string, unknown> = {
    model: effectiveModel,
    input: input,
    ...rest,
  };

  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }

  const response = await openAIRequest('https://api.openai.com/v1/responses', apiKey, requestBody);
  const jsonResponse = (await response.json()) as OpenAIResponsesApi;

  if (jsonResponse.error) {
    const errorMessage = `OpenAI API error: ${typeof jsonResponse.error === 'object' ? JSON.stringify(jsonResponse.error) : String(jsonResponse.error)}`;
    console.error(errorMessage, jsonResponse); // Log the full error object for debugging
    throw new Error(errorMessage);
  }

  const messageOutput = jsonResponse.output?.find(
    (item): item is OpenAIResponseMessageOutput =>
      item.type === 'message' && item.role === 'assistant',
  );

  const textContentItem = messageOutput?.content?.find(
    (contentItem): contentItem is OpenAIOutputTextContent => contentItem.type === 'output_text',
  );

  const textContent = textContentItem?.text;

  if (textContent === undefined || textContent === null) {
    console.error(
      'Invalid response structure from /v1/responses or no text content found:',
      jsonResponse,
    );
    throw new Error('Invalid response structure from /v1/responses or no text content found.');
  }

  return {
    content: textContent,
    modelUsed: jsonResponse.model,
  };
}

/**
 * Convenience wrapper for simple text generation using the /v1/responses endpoint.
 *
 * @param input The text input for the model.
 * @param apiKey Your OpenAI API key.
 * @param model The OpenAI model to use (default: 'gpt-4o').
 * @param options Additional options for the API call.
 * @returns A promise that resolves to the generated text content as a string.
 */
export const generateTextViaOpenAIAPI = async (
  input: string,
  apiKey: string,
  model = 'gpt-4.1-mini',
  options?: ChatOptions,
): Promise<string> => {
  const result = await createChatCompletion(input, apiKey, model, options);
  return result.content;
};
