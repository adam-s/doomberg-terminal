import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Server } from '@shared/ipc/server';
import { createPortWorker2SidePanel } from '../ipc/createPortWorker2SidePanel';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { MathService } from '@shared/services/math.service';
import { ImageToTextService, IMAGE_TO_TEXT_SERVICE_ID } from './imageToText.service';

export class ImageToTextWorkerApp extends Disposable {
  private static readonly CLASS_NAME = 'ImageToTextWorkerApp';
  private readonly disposables: DisposableStore;
  private readonly server: Server;

  public constructor() {
    super();
    this.disposables = this._register(new DisposableStore());
    const onConn = createPortWorker2SidePanel();
    this.server = this.disposables.add(new Server(onConn));
  }

  public async start(): Promise<void> {
    const math = new MathService();
    const mathChannel = ProxyChannel.fromService(math, this.disposables);
    this.server.registerChannel('mathService', mathChannel);

    // Register ImageToTextService
    const imageToTextService = new ImageToTextService();
    const imageToTextChannel = ProxyChannel.fromService(imageToTextService, this.disposables);
    this.server.registerChannel(IMAGE_TO_TEXT_SERVICE_ID, imageToTextChannel);

    // eslint-disable-next-line no-console
    console.log(`${ImageToTextWorkerApp.CLASS_NAME} started`);
  }

  public dispose(): void {
    super.dispose();
  }
}
