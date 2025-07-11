/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, assert, beforeEach } from 'vitest';
import * as collections from 'vs/base/common/collections';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

describe('Collections', () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  it('groupBy', () => {
    const group1 = 'a',
      group2 = 'b';
    const value1 = 1,
      value2 = 2,
      value3 = 3;
    const source = [
      { key: group1, value: value1 },
      { key: group1, value: value2 },
      { key: group2, value: value3 },
    ];

    const grouped = collections.groupBy(source, x => x.key);

    // Group 1
    assert.strictEqual(grouped[group1].length, 2);
    assert.strictEqual(grouped[group1][0].value, value1);
    assert.strictEqual(grouped[group1][1].value, value2);

    // Group 2
    assert.strictEqual(grouped[group2].length, 1);
    assert.strictEqual(grouped[group2][0].value, value3);
  });

  describe('SetWithKey', () => {
    let setWithKey: collections.SetWithKey<{ someProp: string }>;

    const initialValues = ['a', 'b', 'c'].map(s => ({ someProp: s }));
    beforeEach(() => {
      setWithKey = new collections.SetWithKey<{ someProp: string }>(initialValues, value => value.someProp);
    });

    it('size', () => {
      assert.strictEqual(setWithKey.size, 3);
    });

    it('add', () => {
      setWithKey.add({ someProp: 'd' });
      assert.strictEqual(setWithKey.size, 4);
      assert.strictEqual(setWithKey.has({ someProp: 'd' }), true);
    });

    it('delete', () => {
      assert.strictEqual(setWithKey.has({ someProp: 'b' }), true);
      setWithKey.delete({ someProp: 'b' });
      assert.strictEqual(setWithKey.size, 2);
      assert.strictEqual(setWithKey.has({ someProp: 'b' }), false);
    });

    it('has', () => {
      assert.strictEqual(setWithKey.has({ someProp: 'a' }), true);
      assert.strictEqual(setWithKey.has({ someProp: 'b' }), true);
    });

    it('entries', () => {
      const entries = Array.from(setWithKey.entries());
      assert.deepStrictEqual(
        entries,
        initialValues.map(value => [value, value]),
      );
    });

    it('keys and values', () => {
      const keys = Array.from(setWithKey.keys());
      const values = Array.from(setWithKey.values());
      assert.deepStrictEqual(keys, initialValues);
      assert.deepStrictEqual(values, initialValues);
    });

    it('clear', () => {
      setWithKey.clear();
      assert.strictEqual(setWithKey.size, 0);
    });

    it('forEach', () => {
      const values: any[] = [];
      setWithKey.forEach(value => values.push(value));
      assert.deepStrictEqual(values, initialValues);
    });

    it('iterator', () => {
      const values: any[] = [];
      for (const value of setWithKey) {
        values.push(value);
      }
      assert.deepStrictEqual(values, initialValues);
    });

    it('toStringTag', () => {
      assert.strictEqual(setWithKey[Symbol.toStringTag], 'SetWithKey');
    });
  });
});
