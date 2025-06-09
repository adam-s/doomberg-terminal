import { convertHtmlToMarkdown } from 'dom-to-semantic-markdown';
import { TruthSocialStatus } from './truth-social.types';
import { Type } from '@google/genai';

export const economicAnalysisSchema = {
  type: Type.OBJECT,
  description: 'Schema for economic analysis of a presidential post',
  properties: {
    title: {
      type: Type.STRING,
      description: 'Max 8 words summarizing the post',
      minLength: 1,
      maxLength: 100,
    },
    summary: {
      type: Type.STRING,
      description: '2-8 sentences, or state no economic relevance',
      minLength: 10,
      maxLength: 500,
    },
    impactScore: {
      type: Type.NUMBER,
      description:
        '1=minimal/no impact, up to 5=significant impact. The impact can never be higher than 5 which is the max',
      enum: [1, 2, 3, 4, 5],
    },
    tags: {
      type: Type.ARRAY,
      description: '0-5 economic/market-relevant tags',
      items: { type: Type.STRING, minLength: 1 },
      minItems: 0,
      maxItems: 5,
    },
    sentiment: {
      type: Type.STRING,
      enum: ['bullish', 'bearish', 'neutral'],
      description: 'Market-focused sentiment',
    },
    historicalPrecedents: {
      type: Type.ARRAY,
      description: '0-5 historical examples', // Adjusted from 2-5 to allow 0 based on prompt instructions
      items: {
        type: Type.OBJECT,
        description: 'One historical precedent object',
        properties: {
          situation: {
            type: Type.STRING,
            description: 'Brief but specific historical scenario',
            minLength: 1,
          },
          immediateMarketEffect: {
            type: Type.STRING,
            description: 'Same-day market effect (e.g., % move)',
            minLength: 1,
          },
          oneWeekMarketEffect: {
            type: Type.STRING,
            description: 'One-week market effect',
            minLength: 1,
          },
        },
        required: ['situation', 'immediateMarketEffect', 'oneWeekMarketEffect'],
        propertyOrdering: ['situation', 'immediateMarketEffect', 'oneWeekMarketEffect'],
      },
      minItems: 0,
      maxItems: 5,
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

// Removed large commented-out JSON block

export const ECONOMIC_ANALYSIS_PROMPT_SYSTEM_MESSAGE = `You are an expert financial analyst specialized in assessing the economic impact of presidential statements on stock markets. Your task is to analyze the provided "Full Post Data" (including any "Accompanying Media Content" or "Link Content") and return a JSON object.

THE JSON OBJECT MUST HAVE THE FOLLOWING TOP-LEVEL KEYS: "title", "summary", "impactScore", "tags", "sentiment", "historicalPrecedents".
The structure for "historicalPrecedents" must be an array of objects, each with "situation", "immediateMarketEffect", and "oneWeekMarketEffect" keys.

CRITICAL INSTRUCTIONS:
1. Base your analysis strictly on historical facts and actual market reactions to similar past events. NEVER fabricate or guess historical data.
2. Differentiate clearly between mere political rhetoric and actionable policy announcements. Actionable policy historically has more sustained market effects.
3. For economically neutral or unclear content, explicitly state the lack of direct economic relevance in the "summary" field. The "impactScore" should be 1, "sentiment" neutral, and "tags" can be empty or reflect neutrality.
4. Historical precedents must specify relevant dates, index/sector movements (e.g., S&P 500, NASDAQ), and brief contexts. If no relevant precedents exist, "historicalPrecedents" should be an empty array or contain a single entry stating no precedents.
5. Your output should include only the structured JSON. Avoid additional text or explanations.
6. The impactScore must be an integer between 1 and 5, where 1 indicates minimal/no impact and 5 indicates significant impact. The sentiment must be one of "bullish", "bearish", or "neutral".`;

export const ECONOMIC_ANALYSIS_SEARCH_PROMPT_APPEND_MESSAGE = `

---
Context Reminder:
- Focus every search result on events directly analogous to the provided presidential social-media post, linking market reactions back to the post’s economic signal.

Special Web-Search Booster:
- Use the web_search_preview tool with high context to find **all major market-moving news** from the past 20 years, across these broad categories that relate to the post's content:
  • Macro (rate decisions, inflation releases)  
  • Credit (rating actions, debt/debt-ceiling events)  
  • Geopolitical (trade actions, sanctions, conflicts)  
  • Corporate (mega-cap earnings surprises, M&A)  
  • Regulatory & Policy (tariffs, legislation, executive orders)

- Employ **broad, exploratory queries** such as:
  - “largest S&P 500 daily swings December 2024 to May 2025”  
  - “credit rating downgrade market reaction May 2025”  
  - “major geopolitical event stock market sell-off 2025”  
  - “top volatility drivers Q1 2025 equity markets”  
  - “biggest corporate earnings surprise stock moves early 2025”

- For each selected event, extract and integrate into 'historicalPrecedents':
  1. **Event description** (headline or brief summary)  
  2. **Date**  
  3. **Same-day % move** (index or sector)  
  4. **One-week % move**  
  5. **Why it parallels the post** (“This echoes the post's theme because…”)  
  6. **Source citation** and publication date

- Aim for **2-5 high-impact events**. If exact figures are missing, note “approx.” or “no precise figure available” rather than inventing data.
`;

interface PrunedMediaAttachment {
  type: string;
  url: string;
  preview_url?: string;
  external_video_id?: string;
  description?: string | null;
  duration?: number;
}

interface PrunedAccount {
  username: string;
  display_name: string;
  verified: boolean;
  location?: string;
  website?: string;
}

interface PrunedStatus {
  id: string;
  created_at: string;
  content: string;
  url: string;
  account: PrunedAccount;
  media_attachments?: PrunedMediaAttachment[];
  card?: {
    url: string;
    title?: string;
    description?: string;
    type?: string;
    provider_name?: string;
    image?: string;
  };
  tags?: unknown[];
}

export function pruneStatusForPrompt(status: TruthSocialStatus): PrunedStatus {
  const pruned: PrunedStatus = {
    id: status.id,
    created_at: status.created_at,
    content: status.content,
    url: status.url,
    account: {
      username: status.account?.username ?? '',
      display_name: status.account?.display_name ?? '',
      verified: Boolean(status.account?.verified),
      location: status.account?.location,
      website: status.account?.website,
    },
  };

  if (Array.isArray(status.media_attachments) && status.media_attachments.length > 0) {
    pruned.media_attachments = status.media_attachments.map(att => {
      const prunedAtt: PrunedMediaAttachment = {
        type: att.type,
        url: att.url,
      };
      if (att.preview_url) prunedAtt.preview_url = att.preview_url;
      if (att.external_video_id) prunedAtt.external_video_id = att.external_video_id;
      if (att.description) prunedAtt.description = att.description;
      if (att.type === 'video' && att.meta?.original?.duration) {
        prunedAtt.duration = att.meta.original.duration;
      }
      return prunedAtt;
    });
  }

  if (status.card && status.card.url) {
    pruned.card = {
      url: status.card.url,
      title: status.card.title,
      description: status.card.description,
      type: status.card.type,
      provider_name: status.card.provider_name,
      image: status.card.image ?? undefined,
    };
  }

  if (Array.isArray(status.tags) && status.tags.length > 0) {
    pruned.tags = status.tags;
  }

  return pruned;
}

export function buildEconomicAnalysisPrompt(
  status: TruthSocialStatus,
  mediaTranscript?: string,
): string {
  const plainTextFromStatusContent = status.content
    ? convertHtmlToMarkdown(status.content).trim()
    : '';
  const hasActualTextContent = !!plainTextFromStatusContent;
  const hasActualMediaContent = !!(mediaTranscript && mediaTranscript.trim() !== '');

  const prunedStatus = pruneStatusForPrompt(status);
  const stringifiedStatus = JSON.stringify(prunedStatus, null, 2);

  const promptSections: string[] = [
    `${ECONOMIC_ANALYSIS_PROMPT_SYSTEM_MESSAGE}`,
    `\nFull Post Data:\n${stringifiedStatus}`,
  ];

  if (hasActualMediaContent) {
    promptSections.push(`\nAccompanying Media Content:\n${mediaTranscript}`);
    promptSections.push(
      `- Assess the economic relevance of the media content explicitly. If the media content is not economically relevant, focus on the textual content.`,
    );
  }

  if (!hasActualTextContent && !hasActualMediaContent) {
    promptSections.push(
      `\nNote: The post appears to lack significant textual or media content. If no economic relevance can be determined, clearly state this in the analysis.`,
    );
  }

  return promptSections.join('\n\n');
}
