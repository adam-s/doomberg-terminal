import { Disposable } from 'vs/base/common/lifecycle';
import { Frame, IFrame } from '@root/background/src/services/windows/frame.model';

export interface ITab
  extends Pick<
    chrome.tabs.Tab,
    | 'id'
    | 'index'
    | 'openerTabId'
    | 'title'
    | 'url'
    | 'pendingUrl'
    | 'pinned'
    | 'highlighted'
    | 'windowId'
    | 'active'
    | 'favIconUrl'
    | 'incognito'
    | 'selected'
    | 'audible'
    | 'discarded'
    | 'autoDiscardable'
    | 'mutedInfo'
    | 'width'
    | 'height'
    | 'sessionId'
    | 'groupId'
    | 'lastAccessed'
    | 'status'
  > {
  dispose: () => void;
}

export class Tab extends Disposable implements ITab {
  readonly id: number;
  private _index: number;
  private _openerTabId?: number;
  private _windowId: number;
  private _incognito: boolean;
  private _selected: boolean;
  private _discarded: boolean;
  private _autoDiscardable: boolean;
  private _groupId: number;
  private _title?: string;
  private _url?: string;
  private _pendingUrl?: string;
  private _pinned: boolean;
  private _highlighted: boolean;
  private _active: boolean;
  private _favIconUrl?: string;
  private _audible?: boolean;
  private _mutedInfo?: chrome.tabs.MutedInfo;
  private _width?: number;
  private _height?: number;
  private _sessionId?: string;
  private _lastAccessed?: number;
  private _status?: string;

  private readonly frames = new Map<string, Frame>();

  constructor(config: ITab) {
    super();
    this.id = config.id ?? -1;
    this._index = config.index;
    this._openerTabId = config.openerTabId;
    this._windowId = config.windowId;
    this._incognito = config.incognito;
    this._selected = config.selected;
    this._discarded = config.discarded;
    this._autoDiscardable = config.autoDiscardable;
    this._groupId = config.groupId;
    this._title = config.title;
    this._url = config.url;
    this._pendingUrl = config.pendingUrl;
    this._pinned = config.pinned;
    this._highlighted = config.highlighted;
    this._active = config.active;
    this._favIconUrl = config.favIconUrl;
    this._audible = config.audible;
    this._mutedInfo = config.mutedInfo;
    this._width = config.width;
    this._height = config.height;
    this._sessionId = config.sessionId;
    this._lastAccessed = config.lastAccessed;
    this._status = config.status;
  }

  async start() {}

  createFrame(frameConfiguration: IFrame) {
    const frame = new Frame(frameConfiguration);
    this.frames.set(frame.documentId, frame);
  }

  updateFrame(frameConfiguration: IFrame) {
    const frame = this.frames.get(frameConfiguration.documentId);
    if (frame) {
      frame.updateFrame(frameConfiguration);
    }
  }

  createOrUpdate(frameConfiguration: IFrame) {
    const existingFrame = this.frames.get(frameConfiguration.documentId);
    if (existingFrame) {
      existingFrame.updateFrame(frameConfiguration);
    } else {
      this.createFrame(frameConfiguration);
    }
  }

  // Property getters
  get index() {
    return this._index;
  }

  get openerTabId() {
    return this._openerTabId;
  }

  get windowId() {
    return this._windowId;
  }

  get incognito() {
    return this._incognito;
  }

  get selected() {
    return this._selected;
  }

  get discarded() {
    return this._discarded;
  }

  get autoDiscardable() {
    return this._autoDiscardable;
  }

  get groupId() {
    return this._groupId;
  }

  get title() {
    return this._title;
  }

  get url() {
    return this._url;
  }

  get pendingUrl() {
    return this._pendingUrl;
  }

  get pinned() {
    return this._pinned;
  }

  get highlighted() {
    return this._highlighted;
  }

  get active() {
    return this._active;
  }

  get favIconUrl() {
    return this._favIconUrl;
  }

  get audible() {
    return this._audible;
  }

  get mutedInfo() {
    return this._mutedInfo;
  }

  get width() {
    return this._width;
  }

  get height() {
    return this._height;
  }

  get sessionId() {
    return this._sessionId;
  }

  get lastAccessed() {
    return this._lastAccessed;
  }

  get status() {
    return this._status;
  }

  // Method to update the tab properties
  updateTab({
    index,
    openerTabId,
    windowId,
    incognito,
    selected,
    discarded,
    autoDiscardable,
    groupId,
    title,
    url,
    pendingUrl,
    pinned,
    highlighted,
    active,
    favIconUrl,
    audible,
    mutedInfo,
    width,
    height,
    sessionId,
    lastAccessed,
    status,
  }: Partial<ITab>) {
    if (index !== undefined) this._index = index;
    if (openerTabId !== undefined) this._openerTabId = openerTabId;
    if (windowId !== undefined) this._windowId = windowId;
    if (incognito !== undefined) this._incognito = incognito;
    if (selected !== undefined) this._selected = selected;
    if (discarded !== undefined) this._discarded = discarded;
    if (autoDiscardable !== undefined) this._autoDiscardable = autoDiscardable;
    if (groupId !== undefined) this._groupId = groupId;
    if (title !== undefined) this._title = title;
    if (url !== undefined) this._url = url;
    if (pendingUrl !== undefined) this._pendingUrl = pendingUrl;
    if (pinned !== undefined) this._pinned = pinned;
    if (highlighted !== undefined) this._highlighted = highlighted;
    if (active !== undefined) this._active = active;
    if (favIconUrl !== undefined) this._favIconUrl = favIconUrl;
    if (audible !== undefined) this._audible = audible;
    if (mutedInfo !== undefined) this._mutedInfo = mutedInfo;
    if (width !== undefined) this._width = width;
    if (height !== undefined) this._height = height;
    if (sessionId !== undefined) this._sessionId = sessionId;
    if (lastAccessed !== undefined) this._lastAccessed = lastAccessed;
    if (status !== undefined) this._status = status;
  }

  public dispose(): void {
    // This needs to be called when removed
    super.dispose();
  }
}
