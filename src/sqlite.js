import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openSqlite(file) {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS _solstice_migrations (name TEXT PRIMARY KEY)');
  const directory = new URL('../migrations/', import.meta.url);
  const applied = sqlite.prepare('SELECT 1 FROM _solstice_migrations WHERE name = ?');
  const record = sqlite.prepare('INSERT INTO _solstice_migrations (name) VALUES (?)');
  function transaction(run) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const value = run();
      sqlite.exec('COMMIT');
      return value;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  for (const name of readdirSync(directory).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    transaction(() => {
      if (applied.get(name)) return;
      sqlite.exec(readFileSync(new URL(name, directory), 'utf8'));
      record.run(name);
    });
  }
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...values) {
        return {
          first: () => statement.get(...values),
          all: () => ({ results: statement.all(...values) }),
          run: () => ({ meta: statement.run(...values) }),
        };
      } };
    },
    batch: statements => transaction(() => statements.map(statement => statement.run())),
    close: () => sqlite.close(),
  };
}
