import { Type } from '@google/genai';
import type { ParsedEconomicEventData } from './economic-calendar-parser';

export const economicEventAnalysisSchema = {
  type: Type.OBJECT,
  description: 'Schema for economic analysis of a scheduled economic event',
  properties: {
    title: {
      type: Type.STRING,
      description: 'Max 8 words summarizing the event and its potential significance.',
      minLength: 1,
      maxLength: 100,
    },
    summary: {
      type: Type.STRING,
      description:
        '2-8 sentences explaining the event, its expected impact based on consensus, and potential market implications. If the event is considered low impact, state that.',
      minLength: 10,
      maxLength: 500,
    },
    impactScore: {
      type: Type.NUMBER,
      description:
        '1=minimal/no impact, up to 5=significant impact. This score should reflect the potential market volatility the event could cause. The impact can never be higher than 5 which is the max.',
      enum: [1, 2, 3, 4, 5],
    },
    tags: {
      type: Type.ARRAY,
      description:
        '0-5 relevant economic/market tags (e.g., "inflation", "employment", "interest rates", "GDP", "central bank policy"). Include the country and currency if relevant.',
      items: { type: Type.STRING, minLength: 1 },
      minItems: 0,
      maxItems: 5,
    },
    sentiment: {
      type: Type.STRING,
      enum: ['bullish', 'bearish', 'neutral'],
      description:
        'Anticipated market sentiment if the actual data meets, exceeds, or falls short of forecast/expectations. If not applicable, use neutral.',
    },
    historicalPrecedents: {
      type: Type.ARRAY,
      description:
        '0-3 historical examples of similar past events and their observed market outcomes (e.g., specific index movements). If no direct precedents, state that or provide context on how such events are generally received.',
      items: {
        type: Type.OBJECT,
        description: 'One historical precedent object',
        properties: {
          situation: {
            type: Type.STRING,
            description: 'Brief description of the past similar event and its context/outcome.',
            minLength: 1,
          },
          immediateMarketEffect: {
            type: Type.STRING,
            description: 'Observed same-day market effect (e.g., S&P 500 +0.5%).',
            minLength: 1,
          },
          oneWeekMarketEffect: {
            type: Type.STRING,
            description: 'Observed one-week market effect.',
            minLength: 1,
          },
        },
        required: ['situation', 'immediateMarketEffect', 'oneWeekMarketEffect'],
      },
      minItems: 0,
      maxItems: 3,
    },
  },
  required: ['title', 'summary', 'impactScore', 'tags', 'sentiment', 'historicalPrecedents'],
  propertyOrdering: [
    'title',
    'summary',
    'impactScore',
    'tags',
    'sentiment',
    'historicalPrecedents',
  ],
};

export const ECONOMIC_EVENT_ANALYSIS_PROMPT_SYSTEM_MESSAGE = `You are an expert financial analyst. Your task is to analyze the provided "Economic Event Data" and return a JSON object.

THE JSON OBJECT MUST HAVE THE FOLLOWING TOP-LEVEL KEYS: "title", "summary", "impactScore", "tags", "sentiment", "historicalPrecedents".
The structure for "historicalPrecedents" must be an array of objects, each with "situation", "immediateMarketEffect", and "oneWeekMarketEffect" keys.

CRITICAL INSTRUCTIONS:
1. Base your analysis on the provided event details, general economic knowledge, and historical market reactions to similar events.
2. Focus on the potential impact on financial markets, particularly equities.
3. If the event has expected low volatility or impact (e.g., impactLevel 1), reflect this in the "summary", "impactScore" (should be 1 or 2), and "sentiment" (likely neutral).
4. Historical precedents should be concise and directly relevant to the type of economic event. If no specific precedents are available, you can state that or describe general market behavior for such events.
5. Your output must be only the structured JSON. Avoid any additional text, explanations, or conversational filler.
6. The impactScore must be an integer between 1 and 5. The sentiment must be one of "bullish", "bearish", or "neutral".
7. Consider the event's 'country', 'currency', 'eventName', 'volatilityDescription', and 'impactLevel' when formulating your analysis.
8. If 'forecastValue' or 'previousValue' are provided, mention how a deviation in 'actualValue' (when it becomes available) might affect markets. Since 'actualValue' is null for future events, focus on the *anticipation* and *potential scenarios*.`;

export const ECONOMIC_EVENT_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE = `

---
Context Reminder for Web Search (if used for historical precedents):
- Focus search results on market reactions to economic events similar to the one provided.
- Prioritize official reports, reputable financial news outlets, and academic studies for historical data.

Example Search Queries for Historical Precedents:
- "Market reaction to [Event Name, e.g., US CPI release] [Month Year]"
- "Impact of [Country] interest rate decision on [Index, e.g., S&P 500]"
- "Historical volatility [Event Name] forex market"

For each selected historical precedent, integrate:
1. Event description and date.
2. Same-day % move (relevant index/currency).
3. One-week % move.
4. Brief explanation of why it's a comparable precedent.
5. Source (if readily available from search).

Aim for 1-2 high-quality precedents if using search. If search yields no strong matches, it's acceptable to have fewer or no precedents from search.
`;

export function buildEconomicEventAnalysisPrompt(event: ParsedEconomicEventData): string {
  // Prune the event object to include only relevant fields for the prompt
  // to keep the prompt concise and focused.
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
    detailsPageUrl: event.detailsPageUrl, // For context, though AI won't visit it
  };
  const stringifiedEventData = JSON.stringify(prunedEvent, null, 2);

  const promptSections: string[] = [
    ECONOMIC_EVENT_ANALYSIS_PROMPT_SYSTEM_MESSAGE,
    `\nEconomic Event Data:\n${stringifiedEventData}`,
  ];

  return promptSections.join('\n\n');
}
