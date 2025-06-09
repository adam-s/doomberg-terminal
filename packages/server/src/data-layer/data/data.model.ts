import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

const BaseDataSchema = z.object({
  type: z.enum(['chains', 'instruments', 'marketData']),
  timestamp: z.date().or(z.string()),
  symbol: z.string(),
});

export const ChainDataSchema = BaseDataSchema.extend({
  type: z.literal('chains'),
  payload: z.object({
    chain: z.unknown(),
  }),
});

export const InstrumentDataSchema = BaseDataSchema.extend({
  type: z.literal('instruments'),
  payload: z.object({
    instruments: z.record(z.string(), z.unknown()),
  }),
});

export const MarketDataSchema = BaseDataSchema.extend({
  type: z.literal('marketData'),
  payload: z.object({
    marketData: z.record(z.string(), z.unknown()),
    lastTradePrice: z.unknown(),
  }),
});

export const DataSchema = z.discriminatedUnion('type', [
  ChainDataSchema,
  InstrumentDataSchema,
  MarketDataSchema,
]);

export type Data =
  | {
      symbol: string;
      type: 'chains';
      timestamp: string | Date;
      payload: {
        chain?: unknown;
      };
    }
  | {
      symbol: string;
      type: 'instruments';
      timestamp: string | Date;
      payload: {
        instruments: Record<string, unknown>;
      };
    }
  | {
      symbol: string;
      type: 'marketData';
      timestamp: string | Date;
      payload: {
        marketData: Record<string, unknown>;
        lastTradePrice?: number;
      };
    };

export type ChainData = z.infer<typeof ChainDataSchema>;
export type InstrumentData = z.infer<typeof InstrumentDataSchema>;
export type MarketData = z.infer<typeof MarketDataSchema>;

export const StoreDataSchema = z.object({
  body: DataSchema,
});
