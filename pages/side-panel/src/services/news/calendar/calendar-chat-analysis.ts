import type { ParsedEconomicEventData } from './economic-calendar-parser';
import { EconomicImpactLevel } from '@shared/features/calendar/calendar.types';

// --- Locally Defined Prompts for Markdown Output ---
const CHAT_ANALYSIS_SYSTEM_MESSAGE = `You are an expert financial analyst. Your task is to analyze the provided "Economic Event Data" and return a well-structured Markdown analysis.

THE MARKDOWN OUTPUT SHOULD INCLUDE THE FOLLOWING SECTIONS:
- ## [Event Name] - Analysis
- **Summary**: A concise explanation of the event (2-4 sentences), its general significance, and what to watch for.
- **Potential Market Impact**: Discuss the potential for market volatility. Clearly state if the event is expected to have low, medium, or high impact based on the input data (especially 'impactLevel'). Explain why.
- **Scenario Analysis (based on Forecast/Previous)**: If forecast or previous values are provided, briefly discuss how potential deviations in the actual data (when it becomes available) could influence markets.
- **Market Sentiment**: Briefly describe the general market sentiment (e.g., cautious, optimistic, neutral) leading up to this event or how sentiment might shift based on outcomes.
- **Key Economic Factors**: List 3-5 key economic factors or indicators related to this event (e.g., inflation, employment, GDP growth, central bank policy).
- **Historical Context (Optional)**: If relevant, briefly mention 1-2 past similar events and their general market outcomes in a narrative format. If no direct precedents, you can state that or describe general market behavior.
- **Sources (Optional)**: If external sources or web searches were used to gather information for historical context or other parts of the analysis, list them here. Each source must be on a new line and follow the format: \`[SourceLink]: <URL>\`.

CRITICAL INSTRUCTIONS:
1. Base your analysis on the provided event details, general economic knowledge, and historical market reactions to similar events.
2. Focus on the potential impact on financial markets, particularly equities.
3. If the event has expected low volatility or impact (e.g., based on 'impactLevel' 1 or 2 in the input data), clearly state this in the "Potential Market Impact" section and ensure the overall tone reflects this.
4. Your output must be **only Markdown**. Avoid any additional text, explanations, or conversational filler outside the Markdown structure.
5. Consider all fields in the "Economic Event Data" when formulating your analysis.
6. Be objective and data-driven in your language.
7. If you use external sources or web search, you **must** list them under the "Sources" section using the specified format: \`[SourceLink]: <URL>\`. If no external sources were used, omit the "Sources" section.`;

const CHAT_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE = `

---
Context Reminder for Web Search (if used for Historical Context or other information):
- Focus search results on narrative market reactions to economic events similar to the one provided, or factual data supporting the analysis.
- Prioritize official reports, reputable financial news outlets, and academic studies.
- For each piece of information derived from a search, ensure the source URL is cited in the "Sources" section at the end of your Markdown response, using the format: \`[SourceLink]: <URL>\`.

Example Search Queries for Historical Context:
- "Market reaction to [Event Name, e.g., US CPI release] [Month Year]"
- "Impact of [Country] interest rate decision on [Index, e.g., S&P 500] narrative"
- "Historical context [Event Name] forex market"

If using search for historical context, integrate findings narratively into the "Historical Context" section and cite your sources.
- Briefly describe the past event and its date/period.
- Summarize the observed market effect in a sentence or two.
- Briefly explain its relevance as a comparable event.
- If search yields no strong narrative matches, it's acceptable to omit the "Historical Context" section or state that direct parallels are limited.
- **Crucially, list all web sources used under the "Sources" section using the format: \`[SourceLink]: <URL>\` for each.**
`;

function buildBaseChatAnalysisPrompt(event: ParsedEconomicEventData): string {
  const prunedEvent = {
    eventName: event.eventName,
    eventDate: event.eventDate,
    time: event.time,
    country: event.country,
    currency: event.currency,
    volatilityDescription: event.volatilityDescription,
    impactLevel: event.impactLevel,
    forecastValue: event.forecastValue,
    previousValue: event.previousValue,
  };
  const stringifiedEventData = JSON.stringify(prunedEvent, null, 2);

  const promptSections: string[] = [
    CHAT_ANALYSIS_SYSTEM_MESSAGE,
    `\nEconomic Event Data:\n${stringifiedEventData}`,
  ];

  return promptSections.join('\n\n');
}

/**
 * Generates a detailed prompt string for analyzing the given economic event.
 * This prompt is intended to be sent to an AI model.
 * @param event The parsed economic event data.
 * @returns The analysis prompt string.
 */
export function getCalendarEventAnalysisPrompt(event: ParsedEconomicEventData): string {
  // console.log( // If logging is needed, it would be a simple console.log, not via _logService
  //   `[getCalendarEventAnalysisPrompt] Generating analysis prompt for event:`,
  //   event.eventName,
  //   event.originalEventId,
  // );

  let prompt = buildBaseChatAnalysisPrompt(event);

  const isHighImpactEvent =
    event.impactLevel !== undefined && event.impactLevel >= EconomicImpactLevel.MEDIUM;

  if (isHighImpactEvent) {
    // console.log( // If logging is needed
    //   `[getCalendarEventAnalysisPrompt] High impact event (${event.impactLevel}). Appending search guidance to prompt.`,
    // );
    prompt += CHAT_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE;
  }

  // console.log( // If logging is needed
  //   `[getCalendarEventAnalysisPrompt] Prepared analysis prompt string for event ${event.originalEventId}. Length: ${prompt.length}`,
  // );
  return prompt;
}
