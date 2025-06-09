import { Disposable } from 'vs/base/common/lifecycle';

export interface IWindow
  extends Readonly<
    Pick<
      chrome.windows.Window,
      'id' | 'alwaysOnTop' | 'focused' | 'height' | 'incognito' | 'left' | 'state' | 'top' | 'type' | 'width'
    >
  > {}

export class Window extends Disposable implements IWindow {
  readonly id: number;
  readonly incognito: boolean;
  readonly type?: chrome.windows.windowTypeEnum;
  private _alwaysOnTop: boolean;
  private _focused: boolean;
  private _height?: number;
  private _left?: number;
  private _state?: chrome.windows.windowStateEnum;
  private _top?: number;
  private _width?: number;

  constructor(config: IWindow) {
    super();
    this.id = config.id ?? -1;
    this.incognito = config.incognito;
    this.type = config.type;
    this._alwaysOnTop = config.alwaysOnTop;
    this._focused = config.focused;
    this._height = config.height;
    this._left = config.left;
    this._state = config.state;
    this._top = config.top;
    this._width = config.width;
  }

  // add the rest of the property getters
  get alwaysOnTop() {
    return this._alwaysOnTop;
  }

  get focused() {
    return this._focused;
  }

  get height() {
    return this._height;
  }

  get left() {
    return this._left;
  }

  get state() {
    return this._state;
  }

  get top() {
    return this._top;
  }

  get width() {
    return this._width;
  }

  updateWindow({ alwaysOnTop, focused, height, left, state, top, width }: Partial<IWindow>) {
    // Add all the properties that are missing
    if (alwaysOnTop !== undefined) this._alwaysOnTop = alwaysOnTop;
    if (focused !== undefined) this._focused = focused;
    if (height !== undefined) this._height = height;
    if (left !== undefined) this._left = left;
    if (state !== undefined) this._state = state;
    if (top !== undefined) this._top = top;
    if (width !== undefined) this._width = width;
  }

  public dispose(): void {
    // This needs to be called when removed
    super.dispose();
  }
}
