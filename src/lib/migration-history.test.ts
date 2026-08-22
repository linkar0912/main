import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIRECTORY = "prisma/migrations";

type Statement = { migration: string; sql: string };

// `prisma migrate deploy` runs each migration in a transaction and records a
// failed one in `_prisma_migrations`, after which every later deploy aborts
// with P3009 before applying anything. A single re-declared object therefore
// wedges the whole release until an operator resolves it by hand, so the
// migration history is linted here rather than discovered in production.
function readStatements(): Statement[] {
  return readdirSync(MIGRATIONS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((migration) => {
      const sql = readFileSync(
        `${MIGRATIONS_DIRECTORY}/${migration}/migration.sql`,
        "utf8",
      ).replace(/--[^\n]*/g, "");

      return sql
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0)
        .map((statement) => ({ migration, sql: statement }));
    });
}

const statements = readStatements();

describe("migration history", () => {
  it("never adds the same column twice", () => {
    const owners = new Map<string, string>();
    const duplicates: string[] = [];

    for (const { migration, sql } of statements) {
      const target = /^ALTER\s+TABLE\s+"([^"]+)"/i.exec(sql);
      if (!target) continue;

      for (const [, column] of sql.matchAll(
        /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi,
      )) {
        const key = `${target[1]}.${column}`;
        const owner = owners.get(key);

        if (owner) {
          duplicates.push(`"${key}" added by ${owner} and again by ${migration}`);
          continue;
        }

        owners.set(key, migration);
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("never creates the same table twice", () => {
    const owners = new Map<string, string>();
    const duplicates: string[] = [];

    for (const { migration, sql } of statements) {
      const created = /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i.exec(
        sql,
      );
      if (!created) continue;

      const owner = owners.get(created[1]);
      if (owner) {
        duplicates.push(
          `"${created[1]}" created by ${owner} and again by ${migration}`,
        );
        continue;
      }

      owners.set(created[1], migration);
    }

    expect(duplicates).toEqual([]);
  });
});
