import fs from 'fs';
import path from 'path';
import { type RawOpenInterestData } from '../../data-layer/openInterest/openInterest.model';

export class OpenInterestService {
  private openInterestPath = path.join(__dirname, '../../../src/data/openInterest');

  async storeRawData(date: string, symbol: string, data: RawOpenInterestData): Promise<void> {
    const symbolPath = path.join(this.openInterestPath, date, symbol);
    fs.mkdirSync(symbolPath, { recursive: true });

    await Promise.all([
      fs.promises.writeFile(path.join(symbolPath, 'chain.json'), JSON.stringify(data.chain)),
      fs.promises.writeFile(
        path.join(symbolPath, 'instruments.json'),
        JSON.stringify(data.instruments),
      ),
      fs.promises.writeFile(
        path.join(symbolPath, 'marketData.json'),
        JSON.stringify(data.marketData),
      ),
    ]);
  }

  async getRawData(date: string, symbol: string): Promise<RawOpenInterestData | null> {
    try {
      const symbolPath = path.join(this.openInterestPath, date, symbol);
      const [chain, instruments, marketData] = await Promise.all([
        fs.promises.readFile(path.join(symbolPath, 'chain.json'), 'utf-8').then(JSON.parse),
        fs.promises.readFile(path.join(symbolPath, 'instruments.json'), 'utf-8').then(JSON.parse),
        fs.promises.readFile(path.join(symbolPath, 'marketData.json'), 'utf-8').then(JSON.parse),
      ]);
      return { chain, instruments, marketData };
    } catch {
      return null;
    }
  }
}

export const openInterestService = new OpenInterestService();
