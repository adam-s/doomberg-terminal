import { GoogleGenAI } from '@google/genai';

/**
 * Google Search tool configuration for Gemini API.
 */
export interface GoogleSearchTool {
  googleSearch: Record<string, unknown>;
}

/**
 * Options for a Gemini completion call.
 *
 * @property model     Optional Google Gemini model to use.
 * @property tools     Optional tools to be used by the model, including Google Search.
 * @property enableGoogleSearch     Convenience flag to enable Google Search tool.
 * @property temperature Optional temperature for sampling.
 * @property topP Optional top-p for sampling.
 * @property topK Optional top-k for sampling.
 * @property maxOutputTokens Optional maximum number of output tokens.
 * @property enforceSchemaAndJsonOutput Optional flag to enforce JSON output based on a schema.
 * @property responseSchema Optional schema to enforce for JSON output. Required if enforceSchemaAndJsonOutput is true.
 * @property [key]     Any other Gemini parameters.
 */
export interface GeminiOptions {
  model?: string;
  tools?: GoogleSearchTool[];
  enableGoogleSearch?: boolean;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  enforceSchemaAndJsonOutput?: boolean;
  responseSchema?: Record<string, unknown>; // Added new option for passing the schema
  [key: string]: unknown;
}

/**
 * Result from a Google Gemini API call.
 *
 * @property content    The textual content of the response.
 * @property modelUsed  The model that was used to generate the response.
 */
export interface GeminiChatResult {
  content: string;
  modelUsed: string;
}

/**
 * Call the Google Gemini API to generate content.
 *
 * @param input The primary text input for the model.
 * @param apiKey Your Google Gemini API key.
 * @param model The Gemini model to use (default: 'gemini-2.0-flash').
 * @param options Additional options for the API call.
 * @returns A promise that resolves to a GeminiChatResult.
 */
export async function createGeminiCompletion(
  input: string,
  apiKey: string,
  model = 'gemini-2.0-flash',
  options: GeminiOptions = {},
): Promise<GeminiChatResult> {
  if (!input.trim()) {
    throw new Error('Input cannot be empty for Gemini completion.');
  }
  if (!apiKey.trim()) {
    throw new Error('Google Gemini API key cannot be empty.');
  }

  const {
    model: modelOverride,
    tools,
    enableGoogleSearch,
    temperature,
    enforceSchemaAndJsonOutput,
    responseSchema, // Destructure new option
    ...restOptions
  } = options;
  const effectiveModel = modelOverride ?? model;

  let ai: GoogleGenAI;
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (error) {
    console.error('Error initializing Google GenAI client:', error);
    throw new Error('Failed to initialize Google GenAI client.');
  }

  try {
    const configuredTools: GoogleSearchTool[] = [];

    if (enableGoogleSearch) {
      configuredTools.push({ googleSearch: {} });
    }

    if (tools && tools.length > 0) {
      configuredTools.push(...tools);
    }

    const configToSet: {
      responseMimeType?: 'application/json';
      responseSchema?: Record<string, unknown>; // Updated type
      tools?: GoogleSearchTool[];
      temperature?: number;
      topP?: number;
      topK?: number;
      maxOutputTokens?: number;
      [key: string]: unknown;
    } = {
      temperature: temperature ?? 0.0,
    };

    if (options.topP !== undefined) configToSet.topP = options.topP;
    if (options.topK !== undefined) configToSet.topK = options.topK;
    if (options.maxOutputTokens !== undefined)
      configToSet.maxOutputTokens = options.maxOutputTokens;

    if (enforceSchemaAndJsonOutput) {
      if (!responseSchema) {
        throw new Error(
          'enforceSchemaAndJsonOutput is true, but no responseSchema was provided in options.',
        );
      }
      configToSet.responseMimeType = 'application/json';
      configToSet.responseSchema = responseSchema; // Use passed-in schema
    }

    if (configuredTools.length > 0) {
      configToSet.tools = configuredTools;
    }

    Object.assign(configToSet, restOptions);

    const requestConfig = {
      model: effectiveModel,
      contents: [{ parts: [{ text: input }] }],
      generationConfig: configToSet,
    };

    // Type assertion for generateContent result if necessary, or ensure 'text' is properly handled
    const result = await ai.models.generateContent(requestConfig);

    // Assuming result.response.candidates[0].content.parts[0].text is the path
    // More robust check for text property
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== 'string' || !text.trim()) {
      // Check if text is a non-empty string
      console.error('Invalid response structure from Gemini API or no text content found:', result);
      throw new Error('Invalid response structure from Gemini API or no text content found.');
    }

    return {
      content: text,
      modelUsed: effectiveModel,
    };
  } catch (error) {
    console.error('Error calling Google Gemini API:', error);
    if (error instanceof Error) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
    throw new Error('An unknown error occurred while calling the Gemini API.');
  }
}

/**
 * Convenience wrapper for simple text generation using the Google Gemini API.
 *
 * @param input The text input for the model.
 * @param apiKey Your Google Gemini API key.
 * @param model The Gemini model to use (default: 'gemini-2.0-flash').
 * @param options Additional options for the API call.
 * @returns A promise that resolves to the generated text content as a string.
 */
export const generateTextViaGeminiAPI = async (
  input: string,
  apiKey: string,
  model = 'gemini-2.0-flash',
  options?: GeminiOptions,
): Promise<string> => {
  const result = await createGeminiCompletion(input, apiKey, model, options);
  return result.content;
};
