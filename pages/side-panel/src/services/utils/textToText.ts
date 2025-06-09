import { ITextToTextService } from '@src/side-panel/worker/textToText.ts/textToText.service';

/**
 * Generates text based on a prompt using the TextToTextService.
 * @param prompt The input string prompt for the text generation model.
 * @param textToTextService An instance of ITextToTextService.
 * @param options Optional parameters for text generation, e.g., max_new_tokens.
 * @returns A promise that resolves to the generated text string.
 */
export const generateTextFromPrompt = async (
  prompt: string,
  textToTextService: ITextToTextService,
  options?: { max_new_tokens?: number },
): Promise<string> => {
  if (!prompt || prompt.trim() === '') {
    throw new Error('Prompt cannot be empty.');
  }
  try {
    const generatedText: string = await textToTextService.generateText(prompt, options);
    return generatedText;
  } catch (error: unknown) {
    const errorMessage: string = error instanceof Error ? error.message : String(error);
    throw new Error(`Error generating text from prompt: ${errorMessage}`);
  }
};
