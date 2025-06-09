import { Disposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { JsonValue } from './serializable';

type ScriptFunction<Args extends JsonValue[] = [], Return extends JsonValue | void = void> = (
  ...args: Args
) => Return | Promise<Return>;

/**
 * Contract for executing serialized scripts within a tab context.
 * Args and Return types must be JSON-serializable (JsonValue).
 */
export interface IScriptInjectorService {
  readonly _serviceBrand: undefined;

  executeScript<Args extends JsonValue[] = [], Return extends JsonValue | void = void>(
    tabId: number,
    func: ScriptFunction<Args, Return>,
    args?: Args,
  ): Promise<Return>;
}

export const IScriptInjectorService =
  createDecorator<IScriptInjectorService>('scriptInjectorService');

export class ScriptInjectorService extends Disposable implements IScriptInjectorService {
  declare readonly _serviceBrand: undefined;

  public async executeScript<Args extends JsonValue[] = [], Return extends JsonValue | void = void>(
    tabId: number,
    func: ScriptFunction<Args, Return>,
    args?: Args,
  ): Promise<Return> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        world: 'MAIN',
        func: func as (...args: unknown[]) => unknown,
        args: args ?? [],
      });

      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message;
        console.error(`[ScriptInjectorService] Error injecting: ${msg}`);
        throw new Error(msg);
      }

      // If your script returns void (undefined), `as Return` covers that too.
      return results?.[0]?.result as Return;
    } catch (err) {
      console.error('[ScriptInjectorService] executeScript failed', err);
      throw err;
    }
  }
}
