import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AsyncStorageSchema, SettingsService } from '../settings.service';
import { ILogService } from '@shared/services/log.service';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { LocalAsyncStorageService } from '@shared/storage/localAsyncStorage/localAsyncStorage.service';

describe('SettingsService', () => {
  let settingsService: SettingsService;
  let logServiceMock: ILogService;
  let instantiationServiceMock: IInstantiationService;
  let localAsyncStorageMock: LocalAsyncStorageService<AsyncStorageSchema>;

  beforeEach(() => {
    logServiceMock = {} as ILogService;

    localAsyncStorageMock = {
      get: vi.fn().mockResolvedValue(false),
      set: vi.fn().mockResolvedValue(undefined),
    } as unknown as LocalAsyncStorageService<AsyncStorageSchema>;

    instantiationServiceMock = {
      createInstance: vi.fn().mockReturnValue(localAsyncStorageMock),
    } as unknown as IInstantiationService;

    settingsService = new SettingsService(logServiceMock, instantiationServiceMock);
  });

  it('should update active state to true', async () => {
    await settingsService.setActive(true);
    expect(localAsyncStorageMock.set).toHaveBeenCalledWith('active', true);
  });

  it('should emit onDidChangeActive when active state changes', async () => {
    const listener = vi.fn();
    settingsService.onDidChangeActive(listener);

    await settingsService.setActive(true);

    expect(listener).toHaveBeenCalledWith(true);
  });

  it('should not emit onDidChangeActive when active state does not change', async () => {
    localAsyncStorageMock.get = vi.fn().mockResolvedValue(false);

    const listener = vi.fn();
    settingsService.onDidChangeActive(listener);

    await settingsService.setActive(false);

    expect(listener).not.toHaveBeenCalled();
  });
});
