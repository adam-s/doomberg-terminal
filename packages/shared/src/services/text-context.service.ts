import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';

export const ITextContextService = createDecorator<ITextContextService>('textContextService');

export interface ITextContextService {
  readonly _serviceBrand: undefined;
  readonly onContextRequested: Event<string>;
  getOuterHTML(): Promise<string>;
  injectContextButton(): void;
  removeContextButton(): void;
  // startPeriodicEmission(): void;
  // stopPeriodicEmission(): void;
}

export class TextContextService extends Disposable implements ITextContextService {
  public static readonly CHANNEL_NAME = 'textContextService' as const;

  readonly _serviceBrand: undefined;

  private readonly _onContextRequested = this._register(new Emitter<string>());
  readonly onContextRequested: Event<string> = this._onContextRequested.event;

  private _contextButton: HTMLButtonElement | undefined;
  private readonly _buttonId = 'robbin-da-hood-context-button';
  private _periodicEmissionTimer: number | undefined;
  private readonly _emissionInterval = 3000;

  constructor() {
    super();
    // this.injectContextButton();
    // this.startPeriodicEmission();

    // Handle page unload to cleanup properly
    this._register(
      this._addDisposableListener(window, 'beforeunload', () => {
        // this.stopPeriodicEmission();
      }),
    );

    // Handle visibility change to pause/resume emission
    // this._register(
    //   this._addDisposableListener(document, 'visibilitychange', () => {
    //     if (document.hidden) {
    //       this.stopPeriodicEmission();
    //     } else {
    //       this.startPeriodicEmission();
    //     }
    //   }),
    // );
  }

  // public startPeriodicEmission(): void {
  //   this.stopPeriodicEmission(); // Clear existing timer

  //   this._periodicEmissionTimer = window.setInterval(async () => {
  //     try {
  //       console.log('TextContextService emitting periodic context');
  //       const htmlContent = await this.getOuterHTML();
  //       this._onContextRequested.fire(htmlContent);
  //     } catch (error) {
  //       console.error('Error during periodic emission:', error);
  //     }
  //   }, this._emissionInterval);
  // }

  // public stopPeriodicEmission(): void {
  //   if (this._periodicEmissionTimer) {
  //     window.clearInterval(this._periodicEmissionTimer);
  //     this._periodicEmissionTimer = undefined;
  //   }
  // }

  public async getOuterHTML(): Promise<string> {
    return `${document.title} : ${document.body.outerHTML}`;
  }

  public injectContextButton(): void {
    if (this._contextButton || document.getElementById(this._buttonId)) {
      return; // Button already exists
    }

    // Create button element
    this._contextButton = document.createElement('button');
    this._contextButton.id = this._buttonId;
    this._contextButton.textContent = 'Use Context';

    // Apply fixed positioning styles
    Object.assign(this._contextButton.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: '999999',
      padding: '12px 20px',
      backgroundColor: '#0078d4',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      transition: 'all 0.2s ease',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });

    // Add hover effects
    this._contextButton.addEventListener('mouseenter', () => {
      if (this._contextButton) {
        this._contextButton.style.backgroundColor = '#106ebe';
        this._contextButton.style.transform = 'translateY(-1px)';
      }
    });

    this._contextButton.addEventListener('mouseleave', () => {
      if (this._contextButton) {
        this._contextButton.style.backgroundColor = '#0078d4';
        this._contextButton.style.transform = 'translateY(0)';
      }
    });

    // Add click handler
    this._contextButton.addEventListener('click', async () => {
      try {
        const htmlContent = await this.getOuterHTML();
        // Fire the event using VS Code style emitter
        this._onContextRequested.fire(htmlContent);
      } catch (error) {
        console.error('Error getting HTML content:', error);
      }
    });

    // Inject into page
    document.body.appendChild(this._contextButton);
  }

  public removeContextButton(): void {
    if (this._contextButton) {
      this._contextButton.remove();
      this._contextButton = undefined;
    }
  }

  private _addDisposableListener<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => void,
  ): IDisposable;
  private _addDisposableListener<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    listener: (this: Document, ev: DocumentEventMap[K]) => void,
  ): IDisposable;
  private _addDisposableListener(
    target: Window | Document,
    type: string,
    listener: EventListener,
  ): IDisposable {
    target.addEventListener(type, listener);
    return {
      dispose: () => target.removeEventListener(type, listener),
    };
  }

  public override dispose(): void {
    // this.stopPeriodicEmission();
    this.removeContextButton();
    super.dispose();
  }
}
