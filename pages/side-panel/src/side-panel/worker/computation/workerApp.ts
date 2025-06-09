import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Server } from '@shared/ipc/server';
import { createPortWorker2SidePanel } from '../ipc/createPortWorker2SidePanel';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { MathService } from '@shared/services/math.service';
import { ComputationService, IComputationService } from './computationService';

export class WorkerApp extends Disposable {
  private readonly disposables = this._register(new DisposableStore());
  private readonly server: Server;

  constructor() {
    super();
    // now matches main-content: Server wants Event<{port, id}>
    const onConn = createPortWorker2SidePanel();
    this.server = this.disposables.add(new Server(onConn));
  }

  async start(): Promise<void> {
    // register your services exactly like in ContentMainApp
    const math = new MathService();
    const mathChannel = ProxyChannel.fromService(math, this.disposables);
    this.server.registerChannel('mathService', mathChannel);

    const computationService = new ComputationService();
    const computationChannel = ProxyChannel.fromService(computationService, this.disposables);
    this.server.registerChannel(IComputationService.toString(), computationChannel);
  }

  dispose() {
    super.dispose();
  }
}
