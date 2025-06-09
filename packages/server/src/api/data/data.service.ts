import { StatusCodes } from 'http-status-codes';
import fs from 'fs';
import path from 'path';

import type { Data } from '@src/data-layer/data/data.model';
import { ServiceResponse } from '@src/common/models/serviceResponse';
import { logger } from '@src/server';

export class DataService {
  private mockDataPath = path.join(__dirname, '../../../src/data/mock');
  private currentFolderIndexes: Map<string, number> = new Map();

  constructor() {
    this._initializeCurrentFolderIndexes();
  }

  private _initializeCurrentFolderIndexes(): void {
    if (!fs.existsSync(this.mockDataPath)) {
      fs.mkdirSync(this.mockDataPath, { recursive: true });
      return;
    }

    // Read all symbol folders
    const symbols = fs.readdirSync(this.mockDataPath);
    for (const symbol of symbols) {
      const symbolPath = path.join(this.mockDataPath, symbol);
      if (fs.statSync(symbolPath).isDirectory()) {
        const folders = fs
          .readdirSync(symbolPath)
          .map(f => parseInt(f, 10))
          .filter(n => !isNaN(n))
          .sort((a, b) => a - b);

        this.currentFolderIndexes.set(
          symbol,
          folders.length > 0 ? folders[folders.length - 1] + 1 : 1,
        );
      }
    }
  }

  async store(data: Data): Promise<ServiceResponse<Data | null>> {
    try {
      const { symbol } = data;
      const folderPath = this._ensureFolder(symbol);
      await this._writeData(folderPath, data);

      logger.info(
        `Data stored successfully for symbol ${symbol} in folder ${this.currentFolderIndexes.get(
          symbol,
        )}`,
      );
      return ServiceResponse.success('Data stored successfully', data);
    } catch (ex) {
      const errorMessage = `Error storing data: ${(ex as Error).message}`;
      logger.error(errorMessage);
      return ServiceResponse.failure(
        'An error occurred while storing data.',
        null,
        StatusCodes.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private _ensureFolder(symbol: string): string {
    const symbolPath = path.join(this.mockDataPath, symbol);
    if (!fs.existsSync(symbolPath)) {
      fs.mkdirSync(symbolPath, { recursive: true });
      this.currentFolderIndexes.set(symbol, 1);
    }

    const currentIndex = this.currentFolderIndexes.get(symbol) ?? 1;
    const folderPath = path.join(symbolPath, currentIndex.toString());

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    return folderPath;
  }

  private async _writeData(folderPath: string, data: Data): Promise<void> {
    switch (data.type) {
      case 'chains':
        await fs.promises.writeFile(
          path.join(folderPath, 'chain.json'),
          JSON.stringify({ chain: data.payload.chain }, null, 2),
        );
        break;

      case 'instruments':
        await fs.promises.writeFile(
          path.join(folderPath, 'instruments.json'),
          JSON.stringify({ instruments: data.payload.instruments }, null, 2),
        );
        break;

      case 'marketData': {
        const nextIndex = this._getNextIndex(folderPath);
        await fs.promises.writeFile(
          path.join(folderPath, `${nextIndex}.json`),
          JSON.stringify(
            {
              marketData: data.payload.marketData,
              lastTradePrice: data.payload.lastTradePrice,
              timestamp: data.timestamp,
            },
            null,
            2,
          ),
        );
        break;
      }
    }
  }

  private _getNextIndex(folderPath: string): number {
    const files = fs.readdirSync(folderPath);
    const numericFiles = files
      .map(file => parseInt(file, 10))
      .filter(num => !isNaN(num))
      .sort((a, b) => a - b);
    return numericFiles.length ? numericFiles[numericFiles.length - 1] + 1 : 1;
  }
}

export const dataService = new DataService();
