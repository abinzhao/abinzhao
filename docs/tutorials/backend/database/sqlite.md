---
title: SQLite：约束、参数绑定与持久化 CRUD
description: 使用 Node 22.13+ 内置 node:sqlite，不安装第三方驱动，完成任务 CRUD 与事务验证。
---

# SQLite：约束、参数绑定与持久化 CRUD

## 学习目标与准备

先理解 [HTTP 的资源模型](../http/rest)。
本章先用命令行隔离数据层，避免把网络错误与 SQL 错误混在一起。
Node **22.13+** 可直接导入 `node:sqlite`，无需三方包或实验开关。
该版本仍会输出 ExperimentalWarning，API 稳定性不是生产承诺。
所有调用是同步的；小型教学应用可用，慢查询会阻塞事件循环。

```sh
node --version
mkdir sqlite-lab
cd sqlite-lab
```

## 机制：数据规则不应只存在于 JavaScript

DDL 定义表、列和约束；DML 才是 insert、update、delete 等数据操作。
主键标识实体，外键表达归属；唯一约束防止重复，CHECK 表达列值边界。
`STRICT` 让 SQLite 的类型规则更明确，但仍不能代替业务输入校验。
本例用 INTEGER 0/1 表示完成状态，不直接绑定 JavaScript boolean。
外键需在每个连接启用，不能在已开启事务中才改变设置。
即使 Node 默认启用，也显式设置并用实际非法插入验证。
SQLite 不会自动为所有外键子列建索引，因此创建 `(owner_id, id)` 索引。
该索引适合“按归属过滤、按 id 排序”，并不加速任意文本搜索。

事务把一组修改变成整体提交或整体回滚；不是“执行成功后再补偿”。
`BEGIN IMMEDIATE` 提前取得写锁，避免读完后升级写锁的某些竞争。
SQLite 通常同一时刻只有一个写事务；WAL 改善读写并发，不提供多写并发。
`busy_timeout` 是等待锁的上限，不是修复长事务的办法。
事务里不要等待 HTTP、用户输入或外部服务。

## 操作：完整 tasks.mjs

文件数据库位于脚本旁 `tasks.db`，不会因启动目录变化而换库。
传给 exec 的 SQL 全是开发者常量；用户值只通过 prepare 的 `?` 绑定。
表名、排序方向等 SQL 结构不能靠参数绑定，动态结构必须白名单选择。

```js [tasks.mjs]
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const db = new DatabaseSync(fileURLToPath(new URL('./tasks.db', import.meta.url)));
try {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    ) STRICT;
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
      done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1))
    ) STRICT;
    CREATE INDEX IF NOT EXISTS tasks_owner_id ON tasks(owner_id, id);
    INSERT OR IGNORE INTO users(id, name) VALUES(1, 'learner');
  `);
  const create = db.prepare('INSERT INTO tasks(owner_id, title) VALUES(?, ?)');
  const list = db.prepare('SELECT id, title, done FROM tasks WHERE owner_id=? ORDER BY id');
  const get = db.prepare('SELECT id, title, done FROM tasks WHERE id=? AND owner_id=?');
  const update = db.prepare('UPDATE tasks SET title=?, done=? WHERE id=? AND owner_id=?');
  const remove = db.prepare('DELETE FROM tasks WHERE id=? AND owner_id=?');
  const owner = 1;
  const [command = 'list', ...args] = process.argv.slice(2);
  function idOf(value) {
    if (!/^[1-9]\d*$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) {
      throw new Error('id must be a positive safe integer');
    }
    return Number(value);
  }
  function titleOf(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
      throw new Error('title must contain 1-100 characters');
    }
    return value.trim();
  }
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (command === 'add') {
    const result = create.run(owner, titleOf(args[0]));
    console.log(get.get(Number(result.lastInsertRowid), owner));
  } else if (command === 'list') {
    console.log(list.all(owner));
  } else if (command === 'get') {
    const task = get.get(idOf(args[0]), owner);
    if (!task) throw new Error('not found');
    console.log(task);
  } else if (command === 'update') {
    if (!['0', '1'].includes(args[2])) throw new Error('done must be 0 or 1');
    const id = idOf(args[0]);
    const result = update.run(titleOf(args[1]), Number(args[2]), id, owner);
    if (!result.changes) throw new Error('not found');
    console.log(get.get(id, owner));
  } else if (command === 'delete') {
    if (!remove.run(idOf(args[0]), owner).changes) throw new Error('not found');
    console.log('deleted');
  } else if (command === 'rollback') {
    const before = list.all(owner).length;
    try {
      transaction(() => {
        create.run(owner, 'must roll back');
        create.run(999, 'invalid owner');
      });
    } catch (error) {
      console.log('rollback:', error.message);
    }
    console.log({ before, after: list.all(owner).length });
  } else {
    throw new Error('commands: add, list, get, update, delete, rollback');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
```

## 效果验证

每次 node 命令都是新进程，因此下一次 list 就是重启持久化验证。
全新实验目录下执行，数据库 id 从 1 开始：

```sh
node tasks.mjs add "learn SQLite"
node tasks.mjs get 1
node tasks.mjs update 1 "finished SQLite" 1
node tasks.mjs list
node tasks.mjs rollback
node tasks.mjs add "'); DROP TABLE tasks; --"
node tasks.mjs list
node tasks.mjs delete 1
node tasks.mjs get 1
```

前三步得到 id 为 1 的任务，第四步仍有更新后的 title 和 done: 1。
rollback 打印外键失败，before 与 after 一样，临时插入没有残留。
攻击形状的 title 被当作普通文本保存，表仍存在，说明绑定没有执行其 SQL。
delete 打印 deleted；最后 get 打印 not found，退出状态非零。
再次 `add ""` 应拒绝空标题，不增加条数。
数据库文件与 WAL/SHM 属于运行数据，不提交到源码库，也不放进静态目录。

## 深入：迁移、备份与性能边界

`CREATE TABLE IF NOT EXISTS` 只适合初始化，不能升级已有表结构。
生产需有编号迁移、兼容窗口和备份恢复演练，不能直接覆盖数据库文件。
WAL 运行中可能还有未检查点数据，不能只复制 `.db` 就声称备份完整。
采用 SQLite 备份 API或受支持的一致性备份流程，并验证恢复后的数据。
索引提高读取性能但增加写入成本，用 EXPLAIN QUERY PLAN 验证查询。
本例固定 owner=1 是数据层演示，不是登录或权限实现。
真实 owner 必须来自服务端会话，不能信任浏览器提交的 owner_id。

## 常见错误

| 现象 | 原因与处理 |
| --- | --- |
| 找不到 node:sqlite | Node 太旧或不是官方可用构建，确认实际执行版本 |
| bind 不支持 boolean | 转成 0/1，别用字符串假装布尔值 |
| 外键插入竟然成功 | 在连接初始化、事务外检查 PRAGMA foreign_keys |
| database is locked | 查长事务与多进程写入，别无限重试 |
| 修改 DDL 没生效 | 已有表不会被 IF NOT EXISTS 升级，使用迁移 |
| 进程重启后空库 | 使用了 :memory: 或相对路径指向另一个目录 |

## 标准练习

1. 新增 title 搜索，所有输入继续参数绑定。
   验收：引号作为文本处理，返回结果仍按 id 排序。
2. 增加第二个用户与其任务，保持所有查询的 owner 条件。
   验收：用户 1 的 get、update、delete 均不能作用于用户 2 的数据。
3. 把 rollback 中第二条改为合法 owner。
   验收：两条一起提交；恢复非法 owner 后两条一起消失。
4. 用 EXPLAIN QUERY PLAN 检查 owner 查询。
   验收：记录实际计划，解释复合索引最左列的作用。

## 官方来源与下一步

- [Node 22.13 SQLite](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html)
- [SQLite 外键](https://www.sqlite.org/foreignkeys.html)
- [事务](https://www.sqlite.org/lang_transaction.html)与 [WAL](https://www.sqlite.org/wal.html)
- [SQLite 在线备份](https://www.sqlite.org/backup.html)

下一章：[会话、认证与授权](../auth/sessions)。
