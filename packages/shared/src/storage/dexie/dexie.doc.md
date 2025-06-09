**Dexie Data Access Layer Documentation**

---

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Introduction](#introduction)
- [Installation \& Setup](#installation--setup)
- [Defining Database Plugins](#defining-database-plugins)
  - [User Plugin](#user-plugin)
  - [Stock Plugin](#stock-plugin)
- [Creating the Application Database](#creating-the-application-database)
- [BaseDataAccessObject](#basedataaccessobject)
- [Data Access Objects (DAOs)](#data-access-objects-daos)
  - [UserDataAccessObject](#userdataaccessobject)
  - [StockDataAccessObject](#stockdataaccessobject)
- [Service Layer Example](#service-layer-example)
  - [UserService](#userservice)
  - [Using the DAO in Tests](#using-the-dao-in-tests)
- [Pagination with Pager](#pagination-with-pager)
  - [Configuration Options](#configuration-options)
  - [Example Usage](#example-usage)
- [Helper Utilities](#helper-utilities)
  - [fastForward](#fastforward)
- [Putting It All Together](#putting-it-all-together)
- [Appendix: Full Code Listings](#appendix-full-code-listings)

---

## Introduction

This documentation covers the design and usage of a Dexie-based data access layer, including:

* Defining database plugins for automatic schema versioning
* Creating a typed application database via `createAppDatabase`
* Implementing BaseDataAccessObject for CRUD operations
* Extending DAOs for domain models (e.g., users, stocks)
* Building a service layer that uses DAOs
* Implementing paginated queries with the `Pager` utility

> **Prerequisites**: Basic familiarity with TypeScript, Dexie.js, and IndexedDB.

---

## Installation & Setup

Install required dependencies:

```bash
npm install dexie fake-indexeddb
npm install --save-dev vitest
```

Import Dexie and related types:

```ts
import { Dexie, Table, Collection } from 'dexie';
```

Enable in-memory IndexedDB for tests:

```ts
import 'fake-indexeddb/auto';
```

---

## Defining Database Plugins

Plugins drive schema generation and DAO registration. Each plugin defines:

* `tableName`: the IndexedDB store name
* `schema`: versioned store definitions
* `modelClass`: a class representing the record structure
* `daoClass`: the DAO to instantiate for that store

### User Plugin

```ts
// UserDataAccessObject.ts
export const userSchema = {
  1: '++id, username',
};

export interface IUserModel {
  id: string;
  username: string;
  profileUrl?: string;
}

export class UserDataAccessObject extends BaseDataAccessObject<IUserModel, string> {
  constructor(db: Dexie) {
    super(db.table('users'), 'users');
  }
  static plugin: DatabasePlugin<IUserModel, string> = {
    tableName: 'users',
    schema: userSchema,
    modelClass: class UserModel implements IUserModel {
      id!: string;
      username!: string;
      profileUrl?: string;
    },
    daoClass: UserDataAccessObject,
  };
}
```

### Stock Plugin

```ts
// StockDataAccessObject.ts
export const stockSchema = {
  1: '++id, ticker',
};

export interface IStockModel {
  id: string;
  ticker: string;
}

export class StockDataAccessObject extends BaseDataAccessObject<IStockModel, string> {
  constructor(db: Dexie) {
    super(db.table('stocks'), 'stocks');
  }
  static plugin: DatabasePlugin<IStockModel, string> = {
    tableName: 'stocks',
    schema: stockSchema,
    modelClass: class StockModel implements IStockModel {
      id!: string;
      ticker!: string;
    },
    daoClass: StockDataAccessObject,
  };
}
```

---

## Creating the Application Database

Use `createAppDatabase` to assemble plugins, auto-version stores, and expose typed tables:

```ts
import { createAppDatabase } from './createAppDatabase';

const plugins = [
  UserDataAccessObject.plugin,
  StockDataAccessObject.plugin,
];

const db = createAppDatabase(plugins);

// Access tables with strong typing:
await db.users.add({ id: 'u1', username: 'alice' });
await db.stocks.add({ id: 's1', ticker: 'AAPL' });
```

Under the hood, `createAppDatabase`:

1. Gathers all version numbers from plugin schemas
2. Builds Dexie `.version(v).stores(...)` for each version
3. Defines `db.tableName` properties for each plugin

---

## BaseDataAccessObject

Provides generic CRUD operations:

```ts
export abstract class BaseDataAccessObject<T, K> {
  protected _table: Table<T, K>;
  constructor(table: Table<T, K>, tableName: string) {
    this._table = table;
  }

  async add(item: T): Promise<K> {
    return this._table.add(item);
  }

  async get(id: K): Promise<T | undefined> {
    return this._table.get(id);
  }

  async getAll(): Promise<T[]> {
    return this._table.toArray();
  }

  async update(id: K, changes: Partial<T>): Promise<number> {
    return this._table.update(id, changes as any);
  }

  async delete(id: K): Promise<void> {
    await this._table.delete(id);
  }

  async count(): Promise<number> {
    return this._table.count();
  }
}
```

---

## Data Access Objects (DAOs)

### UserDataAccessObject

```ts
class UserDataAccessObject extends BaseDataAccessObject<IUserModel, string> {
  get table(): Table<IUserModel, string> {
    return this._table;
  }
  // Additional domain-specific queries...
}
```

### StockDataAccessObject

```ts
class StockDataAccessObject extends BaseDataAccessObject<IStockModel, string> {
  get table(): Table<IStockModel, string> {
    return this._table;
  }
}
```

---

## Service Layer Example

Services orchestrate business logic on top of DAOs.

### UserService

```ts
import { generateUuid } from 'vs/base/common/uuid';

export class UserService {
  constructor(
    private logService: ILogService,
    private userDAO: UserDataAccessObject,
  ) {}

  async createUser(username: string): Promise<string> {
    const id = generateUuid();
    await this.userDAO.add({ id, username });
    this.logService.info(`Created user ${id}`);
    return id;
  }

  async getUser(id: string) {
    return this.userDAO.get(id);
  }

  // updateUser, deleteUser, listUsers...
}
```

### Using the DAO in Tests

```ts
// user.service.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyDatabase } from './MyDatabase';

beforeEach(async () => {
  db = new MyDatabase();
  await db.users.clear();
  await db.users.bulkAdd([...]);
});

test('create user', async () => {
  vi.spyOn(uuid, 'generateUuid').mockReturnValue('uuid-123');
  const id = await userService.createUser('bob');
  expect(id).toBe('uuid-123');
  const user = await db.users.get(id);
  expect(user).toEqual({ id, username: 'bob' });
});
```

---

## Pagination with Pager

The `Pager` utility enables cursor-based pagination over Dexie tables.

### Configuration Options

| Option              | Type                                | Default | Description                        |
| ------------------- | ----------------------------------- | ------- | ---------------------------------- |
| `table`             | `Table<T, number>`                  | —       | Dexie table instance               |
| `index`             | `keyof T & string`                  | —       | Indexed property to sort/filter by |
| `idProp`            | `keyof T & string`                  | `'id'`  | Primary key field                  |
| `criterionFunction` | `(item: T) => boolean`              | `undef` | Filter predicate                   |
| `sortOrder`         | `SortOrder.ASC` or `SortOrder.DESC` | `ASC`   | Ascending or descending            |
| `pageSize`          | `number`                            | `10`    | Number of items per page           |

### Example Usage

```ts
const pager = new Pager<Friend>({
  table: db.friends,
  index: 'lastName',
  criterionFunction: friend => friend.age > 21,
  idProp: 'id',
  sortOrder: SortOrder.ASC,
  pageSize: 5,
});

// Fetch first page
const page1 = await pager.nextPage();
console.log('Page 1:', page1);

// Reset and iterate asynchronously
pager.reset();
for await (const friend of pager) {
  console.log(friend);
}
```

---

## Helper Utilities

### fastForward

Skips items until the last returned record to avoid duplicates.

```ts
export function fastForward<T>(
  lastRow: T,
  primKey: keyof T | (keyof T)[],
  otherCriterion?: (item: T) => boolean,
): (item: T) => boolean { ... }
```

---

## Putting It All Together

```ts
// app.ts
import { createAppDatabase } from './createAppDatabase';
import { UserDataAccessObject } from './user/UserDataAccessObject';
import { StockDataAccessObject } from './stock/StockDataAccessObject';

const db = createAppDatabase([
  UserDataAccessObject.plugin,
  StockDataAccessObject.plugin,
]);

const userDAO = new UserDataAccessObject(db);
const stockDAO = new StockDataAccessObject(db);

// Now use DAOs in your services or UI components
```

---

## Appendix: Full Code Listings

> For full source code, refer to the `src/` directory:
>
> * `createAppDatabase.ts`
> * `BaseDataAccessObject.ts`
> * `DatabasePlugin.ts`
> * `UserDataAccessObject.ts`
> * `StockDataAccessObject.ts`
> * `Pager.ts`
> * `UserService.ts`

---

*End of Documentation*
