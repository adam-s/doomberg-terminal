import { Disposable } from 'vs/base/common/lifecycle';

export interface IFrame
  extends Readonly<
    Pick<
      chrome.webNavigation.GetAllFrameResultDetails,
      | 'processId'
      | 'frameId'
      | 'url'
      | 'documentId'
      | 'documentLifecycle'
      | 'errorOccurred'
      | 'frameType'
      | 'parentDocumentId'
      | 'parentFrameId'
    >
  > {}

export class Frame extends Disposable implements IFrame {
  private _processId: number;
  private _frameId: number;
  private _url: string;
  private _documentId: string;
  private _documentLifecycle: DocumentLifecycle;
  private _errorOccurred: boolean;
  private _frameType: FrameType;
  private _parentDocumentId?: string;
  private _parentFrameId: number;

  constructor(config: IFrame) {
    super();
    this._processId = config.processId;
    this._frameId = config.frameId;
    this._url = config.url;
    this._documentId = config.documentId;
    this._documentLifecycle = config.documentLifecycle;
    this._errorOccurred = config.errorOccurred;
    this._frameType = config.frameType;
    this._parentDocumentId = config.parentDocumentId;
    this._parentFrameId = config.parentFrameId;
  }

  // Getters for private properties
  get processId() {
    return this._processId;
  }

  get frameId() {
    return this._frameId;
  }

  get url() {
    return this._url;
  }

  get documentId() {
    return this._documentId;
  }

  get documentLifecycle() {
    return this._documentLifecycle;
  }

  get errorOccurred() {
    return this._errorOccurred;
  }

  get frameType() {
    return this._frameType;
  }

  get parentDocumentId() {
    return this._parentDocumentId;
  }

  get parentFrameId() {
    return this._parentFrameId;
  }

  updateFrame({
    url,
    documentId,
    documentLifecycle,
    errorOccurred,
    frameType,
    parentDocumentId,
    parentFrameId,
  }: Partial<IFrame>) {
    // Update all the properties that are provided
    if (url !== undefined) this._url = url;
    if (documentId !== undefined) this._documentId = documentId;
    if (documentLifecycle !== undefined) this._documentLifecycle = documentLifecycle;
    if (errorOccurred !== undefined) this._errorOccurred = errorOccurred;
    if (frameType !== undefined) this._frameType = frameType;
    if (parentDocumentId !== undefined) this._parentDocumentId = parentDocumentId;
    if (parentFrameId !== undefined) this._parentFrameId = parentFrameId;
  }

  public dispose(): void {
    // Cleanup logic when disposing of the frame
    super.dispose();
  }
}
