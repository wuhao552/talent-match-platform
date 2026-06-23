/**
 * Inspect database schema: list all tables, columns, and their usage
 */
import { DataSource } from 'typeorm';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || '123.207.218.243',
    port: parseInt(process.env.DB_PORT || '54321', 10),
    username: process.env.DB_USERNAME || 'kingbase',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_DATABASE || 'talent_match',
  });

  await ds.initialize();
  console.log('Connected\n');

  try {
    // 1. All tables with row counts
    const tables = await ds.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('=== TABLES ===');
    for (const t of tables) {
      const count = await ds.query(`SELECT COUNT(*) AS cnt FROM "${t.table_name}"`);
      console.log(`  ${t.table_name}: ${count[0].cnt} rows`);
    }

    // 2. All columns per table
    console.log('\n=== COLUMNS ===');
    for (const t of tables) {
      const cols = await ds.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [t.table_name]);
      console.log(`\n  ${t.table_name}:`);
      for (const c of cols) {
        console.log(`    ${c.column_name.padEnd(25)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable}${c.column_default ? ` default=${c.column_default}` : ''}`);
      }
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
