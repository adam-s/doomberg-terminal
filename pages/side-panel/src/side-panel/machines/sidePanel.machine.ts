import { setup, assign, fromCallback, stopChild, fromPromise } from 'xstate';
import { ISettingsService } from '@shared/services/settings.service';
import { monitorRobinhoodTabs } from './tabMonitor';
import { IDisposable } from 'vs/base/common/lifecycle';

interface ActiveListenerInput {
  settingsService: ISettingsService;
}

type ActiveListenerEvents = { type: 'ACTIVE' } | { type: 'STOPPED' };

export interface SidePanelContext {
  active: boolean;
  activeListenerRef: unknown | undefined;
  windowAttachedRef: unknown | undefined;
  settingsService: ISettingsService;
  activeTab: chrome.tabs.Tab | undefined;
  windowId: number;
}

export type SidePanelEvent =
  | { type: 'ACTIVE' }
  | { type: 'STOPPED' }
  | { type: 'WINDOW_ATTACHED'; value: chrome.tabs.Tab }
  | { type: 'WINDOW_DETACHED' };

export interface SidePanelInput {
  settingsService: ISettingsService;
  windowId: number;
}

interface WindowAttachedActorInput {
  windowId: number;
}

const windowAttached = fromCallback<SidePanelEvent, WindowAttachedActorInput>(({ sendBack }) => {
  return monitorRobinhoodTabs((isAttached, tab) => {
    sendBack({
      type: isAttached ? 'WINDOW_ATTACHED' : 'WINDOW_DETACHED',
      value: tab,
    });
  });
});
export const sidePanelMachine = setup({
  types: {
    context: {} as SidePanelContext,
    events: {} as SidePanelEvent,
    input: {} as SidePanelInput,
  },
  actors: {
    activeListener: fromCallback<ActiveListenerEvents, ActiveListenerInput>(
      ({ sendBack, input }) => {
        let disposable: IDisposable;

        const manager = async () => {
          const settingsService = input.settingsService;
          const updateState = (active: boolean) => {
            sendBack({ type: active ? 'ACTIVE' : 'STOPPED' });
          };

          const isActive = await settingsService.isActive();
          updateState(isActive);

          disposable = settingsService.onDidChangeActive(updateState);
        };
        manager();

        return () => {
          disposable?.dispose();
        };
      },
    ),
    windowAttached,
    openRobinhood: fromPromise(async () => {
      const url = 'https://robinhood.com/';

      // Check ALL windows for Robinhood tabs first
      const allWindows = await chrome.windows.getAll({ populate: true });
      for (const window of allWindows) {
        const robinhoodTab = window.tabs?.find(tab => tab.url?.startsWith(url));
        if (robinhoodTab) {
          // Focus the window and tab if found
          await chrome.windows.update(window.id!, { focused: true });
          await chrome.tabs.update(robinhoodTab.id!, { active: true });
          return robinhoodTab;
        }
      }

      // Only create new tab if no existing one found
      return chrome.tabs.create({ url });
    }),
  },
  actions: {
    spawnActiveListener: assign({
      activeListenerRef: ({ spawn, context }) =>
        spawn('activeListener', {
          id: 'activeListener',
          input: {
            settingsService: context.settingsService,
          },
        }),
    }),
    spawnWindowAttachedListener: assign({
      windowAttachedRef: ({ spawn, context }) =>
        spawn('windowAttached', {
          id: 'windowAttached',
          input: {
            windowId: context.windowId,
          },
        }),
    }),
  },
}).createMachine({
  id: 'sidePanel',
  initial: 'ActiveSpawner',
  context: ({ input }) => ({
    active: false,
    activeListenerRef: undefined,
    windowAttachedRef: undefined,
    robinhoodContentRef: undefined,
    settingsService: input.settingsService,
    activeTab: undefined,
    windowId: input.windowId,
  }),
  on: {
    ACTIVE: {
      target: '.Active',
      actions: assign({ active: true }),
    },
    STOPPED: {
      target: '.Stopped',
      actions: [assign({ active: false })],
    },
  },
  states: {
    ActiveSpawner: {
      entry: 'spawnActiveListener',
    },
    Active: {
      initial: 'Initial',
      entry: ['spawnWindowAttachedListener'],
      on: {
        WINDOW_ATTACHED: {
          guard: ({ event, context }) => {
            if (!context.activeTab || context.activeTab.id !== event.value.id) return true;
            return false;
          },
          target: '.WindowAttached',
          actions: [
            assign({
              activeTab: ({ event }) => {
                return event.value;
              },
            }),
          ],
        },
        WINDOW_DETACHED: {
          target: '.Detached',
          actions: [
            assign(() => ({
              activeTab: undefined,
            })),
          ],
        },
      },
      states: {
        Initial: {
          entry: () => {
            console.log('entered Initial');
          },
        },
        WindowAttached: {},
        Detached: {
          invoke: {
            src: 'openRobinhood',
            onError: {
              actions: (context, error) => {
                console.error('Failed to open Robinhood:', error);
              },
            },
          },
        },
      },
    },
    Stopped: {
      entry: [
        stopChild('robinhoodContent'),
        stopChild('windowAttached'),
        assign({
          windowAttachedRef: undefined, // Also clear the reference
          activeTab: undefined,
        }),
      ],
    },
  },
});
