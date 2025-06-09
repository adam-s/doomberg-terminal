// Data service boilerplate template
import { Disposable } from 'vs/base/common/lifecycle';
import {
  createDecorator,
  IInstantiationService,
} from 'vs/platform/instantiation/common/instantiation';

export interface IExampleDataService {
  readonly _serviceBrand: undefined;
  get: (symbol: string, config?: Partial<ExampleDataConfig>) => Promise<ExampleData>;
  dispose(): void;
}

export interface ExampleData {
  start(): Promise<void>;
  dispose(): void;
}

export interface ExampleDataConfig {
  maxHistorySize: number;
  parameterA?: number;
}

export const IExampleDataService = createDecorator<IExampleDataService>('exampleDataService');

export class ExampleDataService extends Disposable implements IExampleDataService {
  declare readonly _serviceBrand: undefined;
  private readonly dataMap = new Map<string, ExampleData>();
  private readonly defaultConfig: ExampleDataConfig = {
    maxHistorySize: 100,
  };

  constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
    super();
  }

  private constructConfig(config?: Partial<ExampleDataConfig>): ExampleDataConfig {
    return {
      ...this.defaultConfig,
      ...config,
    };
  }

  public async get(symbol: string, config?: Partial<ExampleDataConfig>): Promise<ExampleData> {
    if (!this.dataMap.has(symbol)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const finalConfig = this.constructConfig(config);
      // Replace with actual data instantiation logic
      const data: ExampleData = {
        async start() {},
        dispose() {},
      };
      await data.start();
      this.dataMap.set(symbol, data);
    }
    return this.dataMap.get(symbol)!;
  }

  public override dispose(): void {
    this.dataMap.forEach(data => data.dispose());
    this.dataMap.clear();
    super.dispose();
  }
}
