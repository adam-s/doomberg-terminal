import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { AnalysisSentiment } from '@shared/features/news/NewsDataAccessObject';

/**
 * Interface for parsed analysis result structure.
 */
export interface IParsedAnalysisResult {
  title?: string;
  summary?: string;
  impactScore?: number;
  tags?: string[];
  sentiment?: string;
  historicalPrecedents?: Array<{
    situation: string;
    immediateMarketEffect: string;
    oneWeekMarketEffect: string;
  }>;
  [key: string]: unknown;
}

/**
 * Generates a title from HTML content.
 * If the content is empty or processing results in an empty title, a default title is returned.
 * @param htmlContent The HTML content string.
 * @param defaultTitle The default title to use if content is empty or processing yields no title.
 * @param maxLength The maximum length of the generated title.
 * @returns A string representing the generated or default title.
 */
export function generateTitleFromContent(
  htmlContent: string | undefined | null,
  defaultTitle: string,
  maxLength: number = 100,
): string {
  if (!htmlContent) {
    return defaultTitle;
  }
  const semanticMarkdown = convertHtmlToMarkdown(htmlContent).replace(/\s+/g, ' ').trim();
  if (!semanticMarkdown) {
    return defaultTitle;
  }

  const firstSentenceEnd = semanticMarkdown.search(/[.!?]/);
  let title =
    firstSentenceEnd !== -1
      ? semanticMarkdown.substring(0, firstSentenceEnd + 1)
      : semanticMarkdown;

  if (title.length > maxLength) {
    title = title.substring(0, maxLength - 3) + '...';
  }
  return title.trim() || defaultTitle;
}

/**
 * Maps a sentiment string to the AnalysisSentiment enum.
 * @param sentimentString The sentiment string (e.g., "bullish", "positive").
 * @param inputMapping An optional map to convert source-specific sentiment strings to canonical
 *                     'bullish', 'bearish', or 'neutral' before mapping to the enum.
 * @returns The corresponding AnalysisSentiment enum value, defaulting to NEUTRAL.
 */
export function mapSentimentToEnum(
  sentimentString?: string,
  inputMapping?: Record<string, 'bullish' | 'bearish' | 'neutral'>,
): AnalysisSentiment {
  if (!sentimentString) {
    return AnalysisSentiment.NEUTRAL;
  }

  let canonicalSentiment: string = sentimentString.toLowerCase();

  if (inputMapping && inputMapping[canonicalSentiment]) {
    canonicalSentiment = inputMapping[canonicalSentiment];
  }

  switch (canonicalSentiment) {
    case 'bullish':
      return AnalysisSentiment.BULLISH;
    case 'bearish':
      return AnalysisSentiment.BEARISH;
    case 'neutral':
      return AnalysisSentiment.NEUTRAL;
    default:
      // eslint-disable-next-line no-console
      console.warn(
        `[mapSentimentToEnum] Unrecognized sentiment string: "${sentimentString}", mapped to: "${canonicalSentiment}". Defaulting to NEUTRAL.`,
      );
      return AnalysisSentiment.NEUTRAL;
  }
}

/**
 * Parses a JSON string (optionally wrapped in markdown code block) into an IParsedAnalysisResult object.
 * Returns an empty object if parsing fails or no valid data is found.
 * @param jsonInput The JSON string to parse.
 * @returns An IParsedAnalysisResult object.
 */
export function parseAnalysisJson(jsonInput: string): IParsedAnalysisResult {
  try {
    // Remove markdown code block fences with improved regex handling
    // This handles whitespace and newlines around both opening and closing fences
    const cleanedJsonString = jsonInput
      .replace(/^```json\s*\n?/, '') // Remove opening fence and optional newline
      .replace(/\n?\s*```\s*$/, '') // Remove closing fence and surrounding whitespace/newlines
      .trim(); // Trim any remaining whitespace from the JSON content itself

    const parsed = JSON.parse(cleanedJsonString) as IParsedAnalysisResult;

    // Basic validation for key fields to ensure the object is somewhat as expected
    if (typeof parsed.title !== 'string' && parsed.title !== undefined) {
      console.warn('[parseAnalysisJson] Title is not a string or undefined:', parsed.title);
    }
    if (typeof parsed.summary !== 'string' && parsed.summary !== undefined) {
      console.warn('[parseAnalysisJson] Summary is not a string or undefined:', parsed.summary);
    }
    if (typeof parsed.impactScore !== 'number' && parsed.impactScore !== undefined) {
      console.warn(
        '[parseAnalysisJson] ImpactScore is not a number or undefined:',
        parsed.impactScore,
      );
    }

    return parsed;
  } catch (error) {
    console.error(
      '[parseAnalysisJson] Failed to parse analysis JSON:',
      error,
      'Raw string:',
      jsonInput,
    );
    // Return a default empty object structure to prevent downstream errors
    return {};
  }
}

/**
 * Formats a Date object into a 'YYYY-MM-DD' string.
 * @param date The Date object to format.
 * @returns A string representing the formatted date.
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Gets today's date as a 'YYYY-MM-DD' string.
 * @returns A string representing today's date.
 */
export function getTodaysDateString(): string {
  return formatDate(new Date());
}
