/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { describe, it, assert } from 'vitest';
import * as uuid from 'vs/base/common/uuid';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

describe('UUID', () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  it('generation', () => {
    const asHex = uuid.generateUuid();
    assert.strictEqual(asHex.length, 36);
    assert.strictEqual(asHex[14], '4');
    assert.ok(
      asHex[19] === '8' ||
        asHex[19] === '9' ||
        asHex[19] === 'a' ||
        asHex[19] === 'b',
    );
  });

  it('self-check', function () {
    const t1 = Date.now();
    while (Date.now() - t1 < 50) {
      const value = uuid.generateUuid();
      assert.ok(uuid.isUUID(value));
    }
  });
});
