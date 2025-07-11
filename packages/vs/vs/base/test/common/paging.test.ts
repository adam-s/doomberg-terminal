/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, assert } from 'vitest';
import { disposableTimeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { CancellationError, isCancellationError } from 'vs/base/common/errors';
import { IPager, PagedModel } from 'vs/base/common/paging';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

function getPage(pageIndex: number, cancellationToken: CancellationToken): Promise<number[]> {
  if (cancellationToken.isCancellationRequested) {
    return Promise.reject(new CancellationError());
  }

  return Promise.resolve([0, 1, 2, 3, 4].map(i => i + pageIndex * 5));
}

class TestPager implements IPager<number> {
  readonly firstPage = [0, 1, 2, 3, 4];
  readonly pageSize = 5;
  readonly total = 100;
  readonly getPage: (pageIndex: number, cancellationToken: CancellationToken) => Promise<number[]>;

  constructor(getPageFn?: (pageIndex: number, cancellationToken: CancellationToken) => Promise<number[]>) {
    this.getPage = getPageFn || getPage;
  }
}

describe('PagedModel', () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  it('isResolved', () => {
    const pager = new TestPager();
    const model = new PagedModel(pager);

    assert(model.isResolved(0));
    assert(model.isResolved(1));
    assert(model.isResolved(2));
    assert(model.isResolved(3));
    assert(model.isResolved(4));
    assert(!model.isResolved(5));
    assert(!model.isResolved(6));
    assert(!model.isResolved(7));
    assert(!model.isResolved(8));
    assert(!model.isResolved(9));
    assert(!model.isResolved(10));
    assert(!model.isResolved(99));
  });

  it('resolve single', async () => {
    const pager = new TestPager();
    const model = new PagedModel(pager);

    assert(!model.isResolved(5));

    await model.resolve(5, CancellationToken.None);
    assert(model.isResolved(5));
  });

  it('resolve page', async () => {
    const pager = new TestPager();
    const model = new PagedModel(pager);

    assert(!model.isResolved(5));
    assert(!model.isResolved(6));
    assert(!model.isResolved(7));
    assert(!model.isResolved(8));
    assert(!model.isResolved(9));
    assert(!model.isResolved(10));

    await model.resolve(5, CancellationToken.None);
    assert(model.isResolved(5));
    assert(model.isResolved(6));
    assert(model.isResolved(7));
    assert(model.isResolved(8));
    assert(model.isResolved(9));
    assert(!model.isResolved(10));
  });

  it('resolve page 2', async () => {
    const pager = new TestPager();
    const model = new PagedModel(pager);

    assert(!model.isResolved(5));
    assert(!model.isResolved(6));
    assert(!model.isResolved(7));
    assert(!model.isResolved(8));
    assert(!model.isResolved(9));
    assert(!model.isResolved(10));

    await model.resolve(10, CancellationToken.None);
    assert(!model.isResolved(5));
    assert(!model.isResolved(6));
    assert(!model.isResolved(7));
    assert(!model.isResolved(8));
    assert(!model.isResolved(9));
    assert(model.isResolved(10));
  });

  it('preemptive cancellation works', async function () {
    const pager = new TestPager(() => {
      assert(false);
    });

    const model = new PagedModel(pager);

    try {
      await model.resolve(5, CancellationToken.Cancelled);
      return assert(false);
    } catch (err) {
      return assert(isCancellationError(err));
    }
  });

  it('cancellation works', function () {
    const pager = new TestPager(
      (_, token) =>
        new Promise((_, e) => {
          store.add(token.onCancellationRequested(() => e(new CancellationError())));
        }),
    );

    const model = new PagedModel(pager);
    const tokenSource = store.add(new CancellationTokenSource());

    const promise = model.resolve(5, tokenSource.token).then(
      () => assert(false),
      err => assert(isCancellationError(err)),
    );

    setTimeout(() => tokenSource.cancel(), 10);

    return promise;
  });

  it('same page cancellation works', function () {
    let state = 'idle';

    const pager = new TestPager((pageIndex, token) => {
      state = 'resolving';

      return new Promise((_, e) => {
        store.add(
          token.onCancellationRequested(() => {
            state = 'idle';
            e(new CancellationError());
          }),
        );
      });
    });

    const model = new PagedModel(pager);

    assert.strictEqual(state, 'idle');

    const tokenSource1 = new CancellationTokenSource();
    const promise1 = model.resolve(5, tokenSource1.token).then(
      () => assert(false),
      err => assert(isCancellationError(err)),
    );

    assert.strictEqual(state, 'resolving');

    const tokenSource2 = new CancellationTokenSource();
    const promise2 = model.resolve(6, tokenSource2.token).then(
      () => assert(false),
      err => assert(isCancellationError(err)),
    );

    assert.strictEqual(state, 'resolving');

    store.add(
      disposableTimeout(() => {
        assert.strictEqual(state, 'resolving');
        tokenSource1.cancel();
        assert.strictEqual(state, 'resolving');

        store.add(
          disposableTimeout(() => {
            assert.strictEqual(state, 'resolving');
            tokenSource2.cancel();
            assert.strictEqual(state, 'idle');
          }, 10),
        );
      }, 10),
    );

    return Promise.all([promise1, promise2]);
  });
});
