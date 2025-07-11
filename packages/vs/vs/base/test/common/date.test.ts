/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, assert, it } from 'vitest';
import { strictEqual } from 'assert';
import { fromNow, getDurationString } from 'vs/base/common/date';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

describe('Date', () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  describe('fromNow', () => {
    it('appendAgoLabel', () => {
      strictEqual(fromNow(Date.now() - 35000), '35 secs');
      strictEqual(fromNow(Date.now() - 35000, false), '35 secs');
      strictEqual(fromNow(Date.now() - 35000, true), '35 secs ago');
    });
    it('useFullTimeWords', () => {
      strictEqual(fromNow(Date.now() - 35000), '35 secs');
      strictEqual(fromNow(Date.now() - 35000, undefined, false), '35 secs');
      strictEqual(fromNow(Date.now() - 35000, undefined, true), '35 seconds');
    });
    it('disallowNow', () => {
      strictEqual(fromNow(Date.now() - 5000), 'now');
      strictEqual(fromNow(Date.now() - 5000, undefined, undefined, false), 'now');
      strictEqual(fromNow(Date.now() - 5000, undefined, undefined, true), '5 secs');
    });
  });

  describe('getDurationString', () => {
    it('basic', () => {
      strictEqual(getDurationString(1), '1ms');
      strictEqual(getDurationString(999), '999ms');
      strictEqual(getDurationString(1000), '1s');
      strictEqual(getDurationString(1000 * 60 - 1), '59.999s');
      strictEqual(getDurationString(1000 * 60), '1 mins');
      strictEqual(getDurationString(1000 * 60 * 60 - 1), '60 mins');
      strictEqual(getDurationString(1000 * 60 * 60), '1 hrs');
      strictEqual(getDurationString(1000 * 60 * 60 * 24 - 1), '24 hrs');
      strictEqual(getDurationString(1000 * 60 * 60 * 24), '1 days');
    });
    it('useFullTimeWords', () => {
      strictEqual(getDurationString(1, true), '1 milliseconds');
      strictEqual(getDurationString(999, true), '999 milliseconds');
      strictEqual(getDurationString(1000, true), '1 seconds');
      strictEqual(getDurationString(1000 * 60 - 1, true), '59.999 seconds');
      strictEqual(getDurationString(1000 * 60, true), '1 minutes');
      strictEqual(getDurationString(1000 * 60 * 60 - 1, true), '60 minutes');
      strictEqual(getDurationString(1000 * 60 * 60, true), '1 hours');
      strictEqual(getDurationString(1000 * 60 * 60 * 24 - 1, true), '24 hours');
      strictEqual(getDurationString(1000 * 60 * 60 * 24, true), '1 days');
    });
  });
});
