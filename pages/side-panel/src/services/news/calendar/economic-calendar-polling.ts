import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from '@shared/services/log.service';
import { IEconomicCalendarService } from './economic-calendar.service'; // Assuming methods from previous suggestion are here

const DEFAULT_POLLING_INTERVAL_MS = 60 * 1000; // 1 minute

export class EconomicCalendarPolling extends Disposable {
  private _pollingIntervalId: number | undefined;

  public constructor(
    private readonly _economicCalendarService: IEconomicCalendarService,
    @ILogService private readonly _logService: ILogService,
  ) {
    super();
  }

  public startPolling(intervalMilliseconds: number = DEFAULT_POLLING_INTERVAL_MS): void {
    if (this._pollingIntervalId !== undefined) {
      this._logService.warn('[EconomicCalendarPolling] Polling is already active.');
      return;
    }

    this._logService.info(
      `[EconomicCalendarPolling] Starting polling every ${intervalMilliseconds / 1000} seconds.`,
    );
    // Initial poll immediately, then set interval
    this._pollEconomicEvents().catch((error: unknown) => {
      this._logService.error('[EconomicCalendarPolling] Error during initial poll:', error);
    });

    this._pollingIntervalId = window.setInterval(() => {
      this._pollEconomicEvents().catch((error: unknown) => {
        this._logService.error('[EconomicCalendarPolling] Error during scheduled poll:', error);
      });
    }, intervalMilliseconds);
  }

  public stopPolling(): void {
    if (this._pollingIntervalId !== undefined) {
      window.clearInterval(this._pollingIntervalId);
      this._pollingIntervalId = undefined;
      this._logService.info('[EconomicCalendarPolling] Stopped polling.');
    }
  }

  private async _pollEconomicEvents(): Promise<void> {
    this._logService.trace('[EconomicCalendarPolling] Starting economic event polling cycle.');
    try {
      // These methods are assumed to be on IEconomicCalendarService as per prior discussion
      const eventsToUpdate = await this._economicCalendarService.getEventsRequiringUpdateCheck();

      if (eventsToUpdate.length === 0) {
        this._logService.trace(
          '[EconomicCalendarPolling] No economic events require an update check at this time.',
        );
        return;
      }

      this._logService.info(
        `[EconomicCalendarPolling] Found ${eventsToUpdate.length} economic event(s) to check for updates.`,
      );

      for (const event of eventsToUpdate) {
        try {
          await this._economicCalendarService.attemptEventDataRefresh(event.id);
        } catch (error: unknown) {
          this._logService.error(
            `[EconomicCalendarPolling] Error attempting to refresh data for event ID ${event.id}:`,
            error,
          );
        }
      }
      this._logService.trace('[EconomicCalendarPolling] Economic event polling cycle finished.');
    } catch (error: unknown) {
      this._logService.error(
        '[EconomicCalendarPolling] Critical error during economic event polling cycle:',
        error,
      );
    }
  }

  public override dispose(): void {
    this.stopPolling();
    super.dispose();
  }
}
