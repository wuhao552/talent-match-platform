/**
 * Migration: Drop redundant columns from match_results and skills tables
 * Run: npx tsx scripts/drop-redundant-columns.ts
 */
import 'dotenv/config';
import { DataSource } from 'typeorm';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_DATABASE || 'talent_match',
  });

  await ds.initialize();
  console.log('[Migration] Connected to database');

  try {
    // Drop 6 redundant bonus columns from match_results
    const matchResultCols = [
      'cooccurrence_bonus',
      'hotness_bonus',
      'experience_bonus',
      'industry_match_bonus',
      'trend_bonus',
      'community_context',
    ];

    for (const col of matchResultCols) {
      console.log(`[Migration] Dropping match_results.${col}...`);
      await ds.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'match_results' AND column_name = '${col}'
          ) THEN
            ALTER TABLE match_results DROP COLUMN ${col};
          END IF;
        END $$;
      `);
    }

    // Drop 6 redundant benchmark columns from skills
    const skillCols = [
      'hotness',
      'demand_trend',
      'avg_demand_6m',
      'has_structural_break',
      'is_low_frequency',
      'break_direction',
    ];

    for (const col of skillCols) {
      console.log(`[Migration] Dropping skills.${col}...`);
      await ds.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'skills' AND column_name = '${col}'
          ) THEN
            ALTER TABLE skills DROP COLUMN ${col};
          END IF;
        END $$;
      `);
    }

    console.log('[Migration] All done! Dropped 12 redundant columns.');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('[Migration] Failed:', err);
  process.exit(1);
});
