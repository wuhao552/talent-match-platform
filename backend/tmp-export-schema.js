const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const c = new Client({
  host: 'localhost',
  port: 54321,
  user: 'kingbase',
  password: '123456',
  database: 'talent_match',
});

const EXCLUDED_PREFIXES = [
  'sys_',
  'pl_profiler_',
  'pg_',
  'sql_',
];

async function main() {
  await c.connect();

  const tablesResult = await c.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );

  const tableNames = tablesResult.rows
    .map((r) => r.table_name)
    .filter((name) => !EXCLUDED_PREFIXES.some((p) => name.startsWith(p)));

  let output = `-- Talent Match Platform Database Schema\n`;
  output += `-- Exported at: ${new Date().toISOString()}\n`;
  output += `-- Database: talent_match (KingbaseES / PostgreSQL-compatible)\n\n`;

  for (const tableName of tableNames) {
    output += `DROP TABLE IF EXISTS ${tableName} CASCADE;\n\n`;
  }

  output += `\n`;

  for (const tableName of tableNames) {
    const columnsResult = await c.query(
      `SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [tableName],
    );

    const pkResult = await c.query(
      `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'PRIMARY KEY'
         AND tc.table_schema = 'public'
         AND tc.table_name = $1
       ORDER BY kcu.ordinal_position`,
      [tableName],
    );

    const fkResult = await c.query(
      `SELECT
         kcu.column_name,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name,
         tc.constraint_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY'
         AND tc.table_schema = 'public'
         AND tc.table_name = $1`,
      [tableName],
    );

    const uniqueResult = await c.query(
      `SELECT tc.constraint_name, array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       WHERE tc.constraint_type = 'UNIQUE'
         AND tc.table_schema = 'public'
         AND tc.table_name = $1
       GROUP BY tc.constraint_name`,
      [tableName],
    );

    output += `CREATE TABLE ${tableName} (\n`;

    const colLines = [];
    for (const col of columnsResult.rows) {
      let type = col.data_type;
      if (col.character_maximum_length) {
        type = `${type}(${col.character_maximum_length})`;
      } else if (col.numeric_precision && col.data_type === 'numeric') {
        type = `numeric(${col.numeric_precision},${col.numeric_scale || 0})`;
      }

      let line = `  ${col.column_name} ${type}`;
      if (col.is_nullable === 'NO') {
        line += ' NOT NULL';
      }
      if (col.column_default) {
        const def = col.column_default.replace(/::\w+$/, '');
        line += ` DEFAULT ${def}`;
      }
      colLines.push(line);
    }

    if (pkResult.rows.length) {
      const pkCols = pkResult.rows.map((