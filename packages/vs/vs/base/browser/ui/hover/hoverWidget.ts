/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import 'vs/css!./hoverWidget';
import { localize } from 'vs/nls';

const $ = dom.$;

export const enum HoverPosition {
  LEFT,
  RIGHT,
  BELOW,
  ABOVE,
}

export class HoverWidget extends Disposable {
  public readonly containerDomNode: HTMLElement;
  public readonly contentsDomNode: HTMLElement;
  public readonly scrollbar: DomScrollableElement;

  constructor() {
    super();

    this.containerDomNode = document.createElement('div');
    this.containerDomNode.className = 'monaco-hover';
    this.containerDomNode.tabIndex = 0;
    this.containerDomNode.setAttribute('role', 'tooltip');

    this.contentsDomNode = document.createElement('div');
    this.contentsDomNode.className = 'monaco-hover-content';

    this.scrollbar = this._register(
      new DomScrollableElement(this.contentsDomNode, {
        consumeMouseWheelIfScrollbarIsNeeded: true,
      }),
    );
    this.containerDomNode.appendChild(this.scrollbar.getDomNode());
  }

  public onContentsChanged(): void {
    this.scrollbar.scanDomNode();
  }
}

export class HoverAction extends Disposable {
  public static render(
    parent: HTMLElement,
    actionOptions: { label: string; iconClass?: string; run: (target: HTMLElement) => void; commandId: string },
    keybindingLabel: string | null,
  ) {
    return new HoverAction(parent, actionOptions, keybindingLabel);
  }

  public readonly actionLabel: string;
  public readonly actionKeybindingLabel: string | null;

  private readonly actionContainer: HTMLElement;
  private readonly action: HTMLElement;

  private constructor(
    parent: HTMLElement,
    actionOptions: { label: string; iconClass?: string; run: (target: HTMLElement) => void; commandId: string },
    keybindingLabel: string | null,
  ) {
    super();

    this.actionLabel = actionOptions.label;
    this.actionKeybindingLabel = keybindingLabel;

    this.actionContainer = dom.append(parent, $('div.action-container'));
    this.actionContainer.setAttribute('tabindex', '0');

    this.action = dom.append(this.actionContainer, $('a.action'));
    this.action.setAttribute('role', 'button');
    if (actionOptions.iconClass) {
      dom.append(this.action, $(`span.icon.${actionOptions.iconClass}`));
    }
    const label = dom.append(this.action, $('span'));
    label.textContent = keybindingLabel ? `${actionOptions.label} (${keybindingLabel})` : actionOptions.label;

    this._store.add(new ClickAction(this.actionContainer, actionOptions.run));
    this._store.add(new KeyDownAction(this.actionContainer, actionOptions.run, [KeyCode.Enter, KeyCode.Space]));
    this.setEnabled(true);
  }

  public setEnabled(enabled: boolean): void {
    if (enabled) {
      this.actionContainer.classList.remove('disabled');
      this.actionContainer.removeAttribute('aria-disabled');
    } else {
      this.actionContainer.classList.add('disabled');
      this.actionContainer.setAttribute('aria-disabled', 'true');
    }
  }
}

export function getHoverAccessibleViewHint(shouldHaveHint?: boolean, keybinding?: string | null): string | undefined {
  return shouldHaveHint && keybinding
    ? localize('acessibleViewHint', 'Inspect this in the accessible view with {0}.', keybinding)
    : shouldHaveHint
      ? localize(
          'acessibleViewHintNoKbOpen',
          'Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.',
        )
      : '';
}

export class ClickAction extends Disposable {
  constructor(container: HTMLElement, run: (container: HTMLElement) => void) {
    super();
    this._register(
      dom.addDisposableListener(container, dom.EventType.CLICK, e => {
        e.stopPropagation();
        e.preventDefault();
        run(container);
      }),
    );
  }
}

export class KeyDownAction extends Disposable {
  constructor(container: HTMLElement, run: (container: HTMLElement) => void, keyCodes: KeyCode[]) {
    super();
    this._register(
      dom.addDisposableListener(container, dom.EventType.KEY_DOWN, e => {
        const event = new StandardKeyboardEvent(e);
        if (keyCodes.some(keyCode => event.equals(keyCode))) {
          e.stopPropagation();
          e.preventDefault();
          run(container);
        }
      }),
    );
  }
}
