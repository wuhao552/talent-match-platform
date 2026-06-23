/**
 * Migration script: Add core_name column to skills table
 * Run: npx tsx scripts/migrate-skill-matcher.ts
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
  console.log('[Migration] Connected to database');

  try {
    // 1. Add core_name column if not exists
    console.log('[Migration] Adding core_name column...');
    await ds.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'skills' AND column_name = 'core_name'
        ) THEN
          ALTER TABLE skills ADD COLUMN core_name VARCHAR(128);
        END IF;
      END $$;
    `);
    console.log('[Migration] core_name column ready');

    // 2. Populate core_name from existing name data (best-effort SQL approximation)
    // The full seed will overwrite with exact values computed by stripSuffixes()
    console.log('[Migration] Populating core_name values...');
    const result = await ds.query(`
      UPDATE skills SET core_name = LOWER(REGEXP_REPLACE(name, '[-\\s./]', '', 'g'))
      WHERE core_name IS NULL AND name IS NOT NULL
    `);
    console.log(`[Migration] Updated ${result.length} rows with core_name`);

    console.log('[Migration] All done!');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('[Migration] Failed:', err);
  process.exit(1);
});
