import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Server } from '@shared/ipc/server';
import { createPortWorker2SidePanel } from '../ipc/createPortWorker2SidePanel';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { MathService } from '@shared/services/math.service';
import { AsrService, IASR_SERVICE_ID } from './asr.service';

export class AsrWorkerApp extends Disposable {
  private readonly disposables: DisposableStore;
  private readonly server: Server;

  public constructor() {
    super();
    this.disposables = this._register(new DisposableStore());
    const onConn = createPortWorker2SidePanel();
    this.server = this.disposables.add(new Server(onConn));
  }

  public async start(): Promise<void> {
    // Register MathService
    const math = new MathService();
    const mathChannel = ProxyChannel.fromService(math, this.disposables);
    this.server.registerChannel('mathService', mathChannel);

    // Register AsrService
    const asrService = new AsrService();
    const asrChannel = ProxyChannel.fromService(asrService, this.disposables);
    this.server.registerChannel(IASR_SERVICE_ID, asrChannel);

    // eslint-disable-next-line no-console
  }

  public dispose(): void {
    super.dispose();
  }
}
