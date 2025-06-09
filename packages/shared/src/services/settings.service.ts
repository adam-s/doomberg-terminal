import { Disposable } from 'vs/base/common/lifecycle';
import {
  createDecorator,
  IInstantiationService,
} from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from '@shared/services/log.service';
import { LocalAsyncStorageService } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';
import { Emitter, Event } from 'vs/base/common/event';

export type AsyncStorageSchema = {
  active: boolean;
  openSidePanels: number[];
};

export type SidePanelStatusEvent = {
  status: 'open' | 'close';
  windowId: number;
};

export interface ISettingsService {
  _serviceBrand: undefined;
  start: () => Promise<void>;
  isActive: () => Promise<boolean>;
  setActive: (active: boolean) => Promise<void>;
  onDidChangeActive: Event<boolean>;
  isSidePanelOpen: (windowId?: number) => Promise<boolean>;
  onDidSidePanelOpenOrClose: Event<SidePanelStatusEvent>;
  setSidePanelStatus: (open: boolean, windowId: number) => Promise<void>;
  getOpenSidePanels: () => Promise<number[]>;
}

export const ISettingsService = createDecorator<ISettingsService>('settingsService');

export class SettingsService extends Disposable implements ISettingsService {
  declare readonly _serviceBrand: undefined;

  private readonly _localAsyncStorage: LocalAsyncStorageService<AsyncStorageSchema>;
  private readonly _openSidePanelWindows: Set<number> = new Set();

  private readonly _onDidChangeActive: Emitter<boolean> = this._register(new Emitter<boolean>());
  readonly onDidChangeActive = this._onDidChangeActive.event;

  private readonly _onDidSidePanelOpenOrClose: Emitter<SidePanelStatusEvent> = this._register(
    new Emitter<SidePanelStatusEvent>(),
  );
  readonly onDidSidePanelOpenOrClose = this._onDidSidePanelOpenOrClose.event;

  constructor(
    @ILogService private readonly _logService: ILogService,
    @IInstantiationService
    private readonly _instantiationService: IInstantiationService,
  ) {
    super();

    this._localAsyncStorage = this._instantiationService.createInstance(
      LocalAsyncStorageService<AsyncStorageSchema>,
    );

    this._registerListeners();
  }

  _registerListeners() {}

  async start() {}

  public async isActive(): Promise<boolean> {
    return await this._localAsyncStorage.get('active', true);
  }

  public async setActive(value: boolean): Promise<void> {
    const active = await this._localAsyncStorage.get('active', true);
    if (active !== value) {
      await this._localAsyncStorage.set('active', value);
      this._onDidChangeActive.fire(value);
    }
  }

  public async isSidePanelOpen(windowId?: number): Promise<boolean> {
    const openSidePanels = await this._localAsyncStorage.get('openSidePanels', []);
    if (typeof windowId === 'number') {
      // Check specific window
      return openSidePanels.includes(windowId);
    }
    // Check if any panel is open
    return openSidePanels.length > 0;
  }

  public async setSidePanelStatus(open: boolean, windowId: number): Promise<void> {
    const openSidePanels = await this._localAsyncStorage.get('openSidePanels', []);
    const index = openSidePanels.indexOf(windowId);

    if (open && index === -1) {
      openSidePanels.push(windowId);
      await this._localAsyncStorage.set('openSidePanels', openSidePanels);
      this._onDidSidePanelOpenOrClose.fire({
        status: 'open',
        windowId,
      });
    } else if (!open && index !== -1) {
      openSidePanels.splice(index, 1);
      await this._localAsyncStorage.set('openSidePanels', openSidePanels);
      this._onDidSidePanelOpenOrClose.fire({
        status: 'close',
        windowId,
      });
    }
  }

  public async getOpenSidePanels(): Promise<number[]> {
    return await this._localAsyncStorage.get('openSidePanels', []);
  }
}
