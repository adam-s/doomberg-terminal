/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, assert } from 'vitest';
import { Lazy } from 'vs/base/common/lazy';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

describe('Lazy', () => {
  it('lazy values should only be resolved once', () => {
    let counter = 0;
    const value = new Lazy(() => ++counter);

    assert.strictEqual(value.hasValue, false);
    assert.strictEqual(value.value, 1);
    assert.strictEqual(value.hasValue, true);
    assert.strictEqual(value.value, 1); // make sure we did not evaluate again
  });

  it('lazy values handle error case', () => {
    let counter = 0;
    const value = new Lazy(() => {
      throw new Error(`${++counter}`);
    });

    assert.strictEqual(value.hasValue, false);
    assert.throws(() => value.value, /\b1\b/);
    assert.strictEqual(value.hasValue, true);
    assert.throws(() => value.value, /\b1\b/);
  });

  ensureNoDisposablesAreLeakedInTestSuite();
});
