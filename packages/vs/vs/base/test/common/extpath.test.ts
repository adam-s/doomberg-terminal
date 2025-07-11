/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, assert } from 'vitest';
import { CharCode } from 'vs/base/common/charCode';
import * as extpath from 'vs/base/common/extpath';
import { isWindows } from 'vs/base/common/platform';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

describe('Paths', () => {
  it('toForwardSlashes', () => {
    assert.strictEqual(extpath.toSlashes('\\\\server\\share\\some\\path'), '//server/share/some/path');
    assert.strictEqual(extpath.toSlashes('c:\\test'), 'c:/test');
    assert.strictEqual(extpath.toSlashes('foo\\bar'), 'foo/bar');
    assert.strictEqual(extpath.toSlashes('/user/far'), '/user/far');
  });

  it('getRoot', () => {
    assert.strictEqual(extpath.getRoot('/user/far'), '/');
    assert.strictEqual(extpath.getRoot('\\\\server\\share\\some\\path'), '//server/share/');
    assert.strictEqual(extpath.getRoot('//server/share/some/path'), '//server/share/');
    assert.strictEqual(extpath.getRoot('//server/share'), '/');
    assert.strictEqual(extpath.getRoot('//server'), '/');
    assert.strictEqual(extpath.getRoot('//server//'), '/');
    assert.strictEqual(extpath.getRoot('c:/user/far'), 'c:/');
    assert.strictEqual(extpath.getRoot('c:user/far'), 'c:');
    assert.strictEqual(extpath.getRoot('http://www'), '');
    assert.strictEqual(extpath.getRoot('http://www/'), 'http://www/');
    assert.strictEqual(extpath.getRoot('file:///foo'), 'file:///');
    assert.strictEqual(extpath.getRoot('file://foo'), '');
  });

  (!isWindows ? it.skip : it)('isUNC', () => {
    assert.ok(!extpath.isUNC('foo'));
    assert.ok(!extpath.isUNC('/foo'));
    assert.ok(!extpath.isUNC('\\foo'));
    assert.ok(!extpath.isUNC('\\\\foo'));
    assert.ok(extpath.isUNC('\\\\a\\b'));
    assert.ok(!extpath.isUNC('//a/b'));
    assert.ok(extpath.isUNC('\\\\server\\share'));
    assert.ok(extpath.isUNC('\\\\server\\share\\'));
    assert.ok(extpath.isUNC('\\\\server\\share\\path'));
  });

  it('isValidBasename', () => {
    assert.ok(!extpath.isValidBasename(null));
    assert.ok(!extpath.isValidBasename(''));
    assert.ok(extpath.isValidBasename('test.txt'));
    assert.ok(!extpath.isValidBasename('/test.txt'));

    if (isWindows) {
      assert.ok(!extpath.isValidBasename('\\test.txt'));
      assert.ok(!extpath.isValidBasename('aux'));
      assert.ok(!extpath.isValidBasename('Aux'));
      assert.ok(!extpath.isValidBasename('LPT0'));
      assert.ok(!extpath.isValidBasename('aux.txt'));
      assert.ok(!extpath.isValidBasename('com0.abc'));
      assert.ok(extpath.isValidBasename('LPT00'));
      assert.ok(extpath.isValidBasename('aux1'));
      assert.ok(extpath.isValidBasename('aux1.txt'));
      assert.ok(extpath.isValidBasename('aux1.aux.txt'));

      assert.ok(!extpath.isValidBasename('test.txt.'));
      assert.ok(!extpath.isValidBasename('test.txt..'));
      assert.ok(!extpath.isValidBasename('test.txt '));
      assert.ok(!extpath.isValidBasename('test.txt\t'));
      assert.ok(!extpath.isValidBasename('tes:t.txt'));
      assert.ok(!extpath.isValidBasename('tes"t.txt'));
    } else {
      assert.ok(extpath.isValidBasename('\\test.txt'));
    }
  });

  it('sanitizeFilePath', () => {
    if (isWindows) {
      assert.strictEqual(extpath.sanitizeFilePath('.', 'C:\\the\\cwd'), 'C:\\the\\cwd');
      assert.strictEqual(extpath.sanitizeFilePath('', 'C:\\the\\cwd'), 'C:\\the\\cwd');

      assert.strictEqual(extpath.sanitizeFilePath('C:', 'C:\\the\\cwd'), 'C:\\');
      assert.strictEqual(extpath.sanitizeFilePath('C:\\', 'C:\\the\\cwd'), 'C:\\');
      assert.strictEqual(extpath.sanitizeFilePath('C:\\\\', 'C:\\the\\cwd'), 'C:\\');

      assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\my.txt', 'C:\\the\\cwd'), 'C:\\folder\\my.txt');
      assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\my', 'C:\\the\\cwd'), 'C:\\folder\\my');
      assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\..\\my', 'C:\\the\\cwd'), 'C:\\my');
      assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\my\\', 'C:\\the\\cwd'), 'C:\\folder\\my');
      assert.strictEqual(extpath.sanitizeFilePath('C:\\folder\\my\\\\\\', 'C:\\the\\cwd'), 'C:\\folder\\my');

      assert.strictEqual(extpath.sanitizeFilePath('my.txt', 'C:\\the\\cwd'), 'C:\\the\\cwd\\my.txt');
      assert.strictEqual(extpath.sanitizeFilePath('my.txt\\', 'C:\\the\\cwd'), 'C:\\the\\cwd\\my.txt');

      assert.strictEqual(
        extpath.sanitizeFilePath('\\\\localhost\\folder\\my', 'C:\\the\\cwd'),
        '\\\\localhost\\folder\\my',
      );
      assert.strictEqual(
        extpath.sanitizeFilePath('\\\\localhost\\folder\\my\\', 'C:\\the\\cwd'),
        '\\\\localhost\\folder\\my',
      );
    } else {
      assert.strictEqual(extpath.sanitizeFilePath('.', '/the/cwd'), '/the/cwd');
      assert.strictEqual(extpath.sanitizeFilePath('', '/the/cwd'), '/the/cwd');
      assert.strictEqual(extpath.sanitizeFilePath('/', '/the/cwd'), '/');

      assert.strictEqual(extpath.sanitizeFilePath('/folder/my.txt', '/the/cwd'), '/folder/my.txt');
      assert.strictEqual(extpath.sanitizeFilePath('/folder/my', '/the/cwd'), '/folder/my');
      assert.strictEqual(extpath.sanitizeFilePath('/folder/../my', '/the/cwd'), '/my');
      assert.strictEqual(extpath.sanitizeFilePath('/folder/my/', '/the/cwd'), '/folder/my');
      assert.strictEqual(extpath.sanitizeFilePath('/folder/my///', '/the/cwd'), '/folder/my');

      assert.strictEqual(extpath.sanitizeFilePath('my.txt', '/the/cwd'), '/the/cwd/my.txt');
      assert.strictEqual(extpath.sanitizeFilePath('my.txt/', '/the/cwd'), '/the/cwd/my.txt');
    }
  });

  it('isRootOrDriveLetter', () => {
    if (isWindows) {
      assert.ok(extpath.isRootOrDriveLetter('c:'));
      assert.ok(extpath.isRootOrDriveLetter('D:'));
      assert.ok(extpath.isRootOrDriveLetter('D:/'));
      assert.ok(extpath.isRootOrDriveLetter('D:\\'));
      assert.ok(!extpath.isRootOrDriveLetter('D:\\path'));
      assert.ok(!extpath.isRootOrDriveLetter('D:/path'));
    } else {
      assert.ok(extpath.isRootOrDriveLetter('/'));
      assert.ok(!extpath.isRootOrDriveLetter('/path'));
    }
  });

  it('hasDriveLetter', () => {
    if (isWindows) {
      assert.ok(extpath.hasDriveLetter('c:'));
      assert.ok(extpath.hasDriveLetter('D:'));
      assert.ok(extpath.hasDriveLetter('D:/'));
      assert.ok(extpath.hasDriveLetter('D:\\'));
      assert.ok(extpath.hasDriveLetter('D:\\path'));
      assert.ok(extpath.hasDriveLetter('D:/path'));
    } else {
      assert.ok(!extpath.hasDriveLetter('/'));
      assert.ok(!extpath.hasDriveLetter('/path'));
    }
  });

  it('getDriveLetter', () => {
    if (isWindows) {
      assert.strictEqual(extpath.getDriveLetter('c:'), 'c');
      assert.strictEqual(extpath.getDriveLetter('D:'), 'D');
      assert.strictEqual(extpath.getDriveLetter('D:/'), 'D');
      assert.strictEqual(extpath.getDriveLetter('D:\\'), 'D');
      assert.strictEqual(extpath.getDriveLetter('D:\\path'), 'D');
      assert.strictEqual(extpath.getDriveLetter('D:/path'), 'D');
    } else {
      assert.ok(!extpath.getDriveLetter('/'));
      assert.ok(!extpath.getDriveLetter('/path'));
    }
  });

  it('isWindowsDriveLetter', () => {
    assert.ok(!extpath.isWindowsDriveLetter(0));
    assert.ok(!extpath.isWindowsDriveLetter(-1));
    assert.ok(extpath.isWindowsDriveLetter(CharCode.A));
    assert.ok(extpath.isWindowsDriveLetter(CharCode.z));
  });

  it('indexOfPath', () => {
    assert.strictEqual(extpath.indexOfPath('/foo', '/bar', true), -1);
    assert.strictEqual(extpath.indexOfPath('/foo', '/FOO', false), -1);
    assert.strictEqual(extpath.indexOfPath('/foo', '/FOO', true), 0);
    assert.strictEqual(extpath.indexOfPath('/some/long/path', '/some/long', false), 0);
    assert.strictEqual(extpath.indexOfPath('/some/long/path', '/PATH', true), 10);
  });

  it('parseLineAndColumnAware', () => {
    let res = extpath.parseLineAndColumnAware('/foo/bar');
    assert.strictEqual(res.path, '/foo/bar');
    assert.strictEqual(res.line, undefined);
    assert.strictEqual(res.column, undefined);

    res = extpath.parseLineAndColumnAware('/foo/bar:33');
    assert.strictEqual(res.path, '/foo/bar');
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 1);

    res = extpath.parseLineAndColumnAware('/foo/bar:33:34');
    assert.strictEqual(res.path, '/foo/bar');
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 34);

    res = extpath.parseLineAndColumnAware('C:\\foo\\bar');
    assert.strictEqual(res.path, 'C:\\foo\\bar');
    assert.strictEqual(res.line, undefined);
    assert.strictEqual(res.column, undefined);

    res = extpath.parseLineAndColumnAware('C:\\foo\\bar:33');
    assert.strictEqual(res.path, 'C:\\foo\\bar');
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 1);

    res = extpath.parseLineAndColumnAware('C:\\foo\\bar:33:34');
    assert.strictEqual(res.path, 'C:\\foo\\bar');
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 34);

    res = extpath.parseLineAndColumnAware('/foo/bar:abb');
    assert.strictEqual(res.path, '/foo/bar:abb');
    assert.strictEqual(res.line, undefined);
    assert.strictEqual(res.column, undefined);
  });

  it('randomPath', () => {
    let res = extpath.randomPath('/foo/bar');
    assert.ok(res);

    res = extpath.randomPath('/foo/bar', 'prefix-');
    assert.ok(res.indexOf('prefix-'));

    const r1 = extpath.randomPath('/foo/bar');
    const r2 = extpath.randomPath('/foo/bar');

    assert.notStrictEqual(r1, r2);

    const r3 = extpath.randomPath('', '', 3);
    assert.strictEqual(r3.length, 3);

    const r4 = extpath.randomPath();
    assert.ok(r4);
  });

  ensureNoDisposablesAreLeakedInTestSuite();
});
