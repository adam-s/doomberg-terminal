/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, assert } from 'vitest';
import { isPointWithinTriangle } from 'vs/base/common/numbers';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

describe('isPointWithinTriangle', () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  it('should return true if the point is within the triangle', () => {
    const result = isPointWithinTriangle(0.25, 0.25, 0, 0, 1, 0, 0, 1);
    assert.ok(result);
  });

  it('should return false if the point is outside the triangle', () => {
    const result = isPointWithinTriangle(2, 2, 0, 0, 1, 0, 0, 1);
    assert.ok(!result);
  });

  it('should return true if the point is on the edge of the triangle', () => {
    const result = isPointWithinTriangle(0.5, 0, 0, 0, 1, 0, 0, 1);
    assert.ok(result);
  });
});
