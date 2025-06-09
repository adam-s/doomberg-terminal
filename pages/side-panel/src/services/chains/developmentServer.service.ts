import { IObservable, autorun } from 'vs/base/common/observable';
import { OptionsData } from './optionData.service';

interface ServerPayload {
  type: 'chains' | 'instruments' | 'marketData';
  payload: unknown;
  timestamp: Date;
  symbol: string;
}

const isDevelopment = process.env.NODE_ENV === 'development';
const serverUrl = 'http://localhost:3000/data';

// Track posted types per symbol
const postedTypes = new Map<string, Set<string>>();

async function sendToDevServer(payload: ServerPayload): Promise<void> {
  if (!isDevelopment) {
    return;
  }

  // Get or create set for this symbol
  let symbolTypes = postedTypes.get(payload.symbol);
  if (!symbolTypes) {
    symbolTypes = new Set<string>();
    postedTypes.set(payload.symbol, symbolTypes);
  }

  // Only skip if not market data and already posted for this symbol
  if (payload.type !== 'marketData' && symbolTypes.has(payload.type)) {
    return;
  }

  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Dev server responded with error:', response.status, errorText);
      return;
    }

    symbolTypes.add(payload.type);
  } catch (error) {
    console.error('Error posting to dev server:', error);
  }
}

export async function postDataToDevServer(
  marketData: Map<string, unknown>,
  chain: unknown,
  lastTradePrice: unknown,
  instruments: Record<string, unknown>,
  symbol: string, // Add symbol parameter
): Promise<void> {
  if (chain) {
    await sendToDevServer({
      type: 'chains',
      payload: { chain },
      timestamp: new Date(),
      symbol,
    });
  }

  if (Object.keys(instruments).length > 0) {
    await sendToDevServer({
      type: 'instruments',
      payload: { instruments },
      timestamp: new Date(),
      symbol,
    });
  }

  await sendToDevServer({
    type: 'marketData',
    payload: {
      marketData: Object.fromEntries(marketData),
      lastTradePrice,
    },
    timestamp: new Date(),
    symbol,
  });
}

export function clearDevServerState(): void {
  postedTypes.clear();
}

export function registerDevDataAutorun(
  optionsData$: IObservable<OptionsData | undefined>,
  symbol: string,
) {
  return autorun(async reader => {
    const data = optionsData$.read(reader);
    if (data) {
      const { marketData, chainData, lastTradePrice, instruments } = data;
      await postDataToDevServer(marketData, chainData, lastTradePrice, instruments, symbol);
    }
  });
}
