import { Disposable } from 'vs/base/common/lifecycle';
import {
  createDecorator,
  IInstantiationService,
} from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { sidePanelMachine } from '@src/side-panel/machines/sidePanel.machine';
import { type ActorRefFrom, createActor, type SnapshotFrom } from 'xstate';
import { ISettingsService } from '@shared/services/settings.service';

export interface ISidePanelMachineService {
  _serviceBrand: undefined;
  onSnapshot: Event<SnapshotFrom<typeof sidePanelMachine>>;
  state: SnapshotFrom<typeof sidePanelMachine>;
}

export const ISidePanelMachineService =
  createDecorator<ISidePanelMachineService>('sidePanelMachineService');

export class SidePanelMachineService
  extends Disposable
  implements ISidePanelMachineService
{
  declare readonly _serviceBrand: undefined;

  private readonly _onSnapshot: Emitter<SnapshotFrom<typeof sidePanelMachine>> =
    this._register(new Emitter<SnapshotFrom<typeof sidePanelMachine>>());
  readonly onSnapshot = this._onSnapshot.event;

  private readonly _machine: ActorRefFrom<typeof sidePanelMachine>;

  constructor(
    @IInstantiationService
    private readonly instantiationService: IInstantiationService,

    @ISettingsService private readonly _settingsService: ISettingsService,
  ) {
    super();

    this._machine = createActor(sidePanelMachine, {
      input: {
        settingsService: this._settingsService,
      },
    });

    this._settingsService.onDidChangeActive(active => {
      console.log('SidePanelMachineService', 'onDidChangeActive', active);
    });

    this._machine.subscribe(snapshot => {
      this._onSnapshot.fire(snapshot);
    });

    this._machine.start();
  }

  get state() {
    return this._machine.getSnapshot();
  }
}
