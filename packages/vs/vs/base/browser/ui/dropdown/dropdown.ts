/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextMenuProvider } from 'vs/base/browser/contextmenu';
import { $, addDisposableListener, append, EventHelper, EventType, isMouseEvent } from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EventType as GestureEventType, Gesture } from 'vs/base/browser/touch';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import type { IManagedHover } from 'vs/base/browser/ui/hover/hover';
import { getBaseLayerHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate2';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { IMenuOptions } from 'vs/base/browser/ui/menu/menu';
import { ActionRunner, IAction } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IDisposable } from 'vs/base/common/lifecycle';
import 'vs/css!./dropdown';

export interface ILabelRenderer {
  (container: HTMLElement): IDisposable | null;
}

interface IBaseDropdownOptions {
  label?: string;
  labelRenderer?: ILabelRenderer;
}

class BaseDropdown extends ActionRunner {
  private _element: HTMLElement;
  private boxContainer?: HTMLElement;
  private _label?: HTMLElement;
  private contents?: HTMLElement;

  private visible: boolean | undefined;
  private _onDidChangeVisibility = this._register(new Emitter<boolean>());
  readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

  private hover: IManagedHover | undefined;

  constructor(container: HTMLElement, options: IBaseDropdownOptions) {
    super();

    this._element = append(container, $('.monaco-dropdown'));

    this._label = append(this._element, $('.dropdown-label'));

    let labelRenderer = options.labelRenderer;
    if (!labelRenderer) {
      labelRenderer = (container: HTMLElement): IDisposable | null => {
        container.textContent = options.label || '';

        return null;
      };
    }

    for (const event of [EventType.CLICK, EventType.MOUSE_DOWN, GestureEventType.Tap]) {
      this._register(addDisposableListener(this.element, event, e => EventHelper.stop(e, true))); // prevent default click behaviour to trigger
    }

    for (const event of [EventType.MOUSE_DOWN, GestureEventType.Tap]) {
      this._register(
        addDisposableListener(this._label, event, e => {
          if (isMouseEvent(e) && (e.detail > 1 || e.button !== 0)) {
            // prevent right click trigger to allow separate context menu (https://github.com/microsoft/vscode/issues/151064)
            // prevent multiple clicks to open multiple context menus (https://github.com/microsoft/vscode/issues/41363)
            return;
          }

          if (this.visible) {
            this.hide();
          } else {
            this.show();
          }
        }),
      );
    }

    this._register(
      addDisposableListener(this._label, EventType.KEY_UP, e => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
          EventHelper.stop(e, true); // https://github.com/microsoft/vscode/issues/57997

          if (this.visible) {
            this.hide();
          } else {
            this.show();
          }
        }
      }),
    );

    const cleanupFn = labelRenderer(this._label);
    if (cleanupFn) {
      this._register(cleanupFn);
    }

    this._register(Gesture.addTarget(this._label));
  }

  get element(): HTMLElement {
    return this._element;
  }

  get label() {
    return this._label;
  }

  set tooltip(tooltip: string) {
    if (this._label) {
      if (!this.hover && tooltip !== '') {
        this.hover = this._register(
          getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), this._label, tooltip),
        );
      } else if (this.hover) {
        this.hover.update(tooltip);
      }
    }
  }

  show(): void {
    if (!this.visible) {
      this.visible = true;
      this._onDidChangeVisibility.fire(true);
    }
  }

  hide(): void {
    if (this.visible) {
      this.visible = false;
      this._onDidChangeVisibility.fire(false);
    }
  }

  isVisible(): boolean {
    return !!this.visible;
  }

  protected onEvent(_e: Event, activeElement: HTMLElement): void {
    this.hide();
  }

  override dispose(): void {
    super.dispose();
    this.hide();

    if (this.boxContainer) {
      this.boxContainer.remove();
      this.boxContainer = undefined;
    }

    if (this.contents) {
      this.contents.remove();
      this.contents = undefined;
    }

    if (this._label) {
      this._label.remove();
      this._label = undefined;
    }
  }
}

export interface IActionProvider {
  getActions(): readonly IAction[];
}

export interface IDropdownMenuOptions extends IBaseDropdownOptions {
  contextMenuProvider: IContextMenuProvider;
  readonly actions?: IAction[];
  readonly actionProvider?: IActionProvider;
  menuClassName?: string;
  menuAsChild?: boolean; // scope down for #99448
  readonly skipTelemetry?: boolean;
}

export class DropdownMenu extends BaseDropdown {
  private _menuOptions: IMenuOptions | undefined;
  private _actions: readonly IAction[] = [];

  constructor(
    container: HTMLElement,
    private readonly _options: IDropdownMenuOptions,
  ) {
    super(container, _options);

    this.actions = _options.actions || [];
  }

  set menuOptions(options: IMenuOptions | undefined) {
    this._menuOptions = options;
  }

  get menuOptions(): IMenuOptions | undefined {
    return this._menuOptions;
  }

  private get actions(): readonly IAction[] {
    if (this._options.actionProvider) {
      return this._options.actionProvider.getActions();
    }

    return this._actions;
  }

  private set actions(actions: readonly IAction[]) {
    this._actions = actions;
  }

  override show(): void {
    super.show();

    this.element.classList.add('active');

    this._options.contextMenuProvider.showContextMenu({
      getAnchor: () => this.element,
      getActions: () => this.actions,
      getActionsContext: () => (this.menuOptions ? this.menuOptions.context : null),
      getActionViewItem: (action, options) =>
        this.menuOptions && this.menuOptions.actionViewItemProvider
          ? this.menuOptions.actionViewItemProvider(action, options)
          : undefined,
      getKeyBinding: action =>
        this.menuOptions && this.menuOptions.getKeyBinding ? this.menuOptions.getKeyBinding(action) : undefined,
      getMenuClassName: () => this._options.menuClassName || '',
      onHide: () => this.onHide(),
      actionRunner: this.menuOptions ? this.menuOptions.actionRunner : undefined,
      anchorAlignment: this.menuOptions ? this.menuOptions.anchorAlignment : AnchorAlignment.LEFT,
      domForShadowRoot: this._options.menuAsChild ? this.element : undefined,
      skipTelemetry: this._options.skipTelemetry,
    });
  }

  override hide(): void {
    super.hide();
  }

  private onHide(): void {
    this.hide();
    this.element.classList.remove('active');
  }
}
