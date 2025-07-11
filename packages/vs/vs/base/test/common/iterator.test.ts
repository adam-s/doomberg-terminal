/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, assert } from 'vitest';
import { Iterable } from 'vs/base/common/iterator';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

describe('Iterable', function () {
  ensureNoDisposablesAreLeakedInTestSuite();

  const customIterable = new (class {
    *[Symbol.iterator]() {
      yield 'one';
      yield 'two';
      yield 'three';
    }
  })();

  it('first', function () {
    assert.strictEqual(Iterable.first([]), undefined);
    assert.strictEqual(Iterable.first([1]), 1);
    assert.strictEqual(Iterable.first(customIterable), 'one');
    assert.strictEqual(Iterable.first(customIterable), 'one'); // fresh
  });

  it('wrap', function () {
    assert.deepStrictEqual([...Iterable.wrap(1)], [1]);
    assert.deepStrictEqual([...Iterable.wrap([1, 2, 3])], [1, 2, 3]);
  });
});
