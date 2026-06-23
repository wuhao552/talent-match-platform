/**
 * Database backup script - exports all table data to SQL file
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
  console.log('[Backup] Connected to database');

  try {
    const outputFile = 'c:\\Users\\18967\\Desktop\\claude\\B2\\talent-match-platform\\backup\\talent_match_backup.sql';
    
    let sql = '-- Talent Match Platform Database Backup\n';
    sql += `-- Generated: ${new Date().toISOString()}\n\n`;

    // Get all tables
    const tables = await ds.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    for (const { table_name } of tables) {
      // Skip system tables
      if (table_name.startsWith('pg_') || table_name.startsWith('sys_')) continue;
      
      console.log(`[Backup] Exporting ${table_name}...`);
      
      // Get columns
      const columns = await ds.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table_name]);
      
      const colNames = columns.map((c: any) => `"${c.column_name}"`).join(', ');
      
      // Get data
      const rows = await ds.query(`SELECT * FROM "${table_name}"`);
      
      if (rows.length === 0) {
        sql += `-- Table ${table_name} is empty\n\n`;
        continue;
      }
      
      // Generate INSERT statements
      sql += `-- Table: ${table_name}\n`;
      sql += `TRUNCATE TABLE "${table_name}" CASCADE;\n`;
      sql += `INSERT INTO "${table_name}" (${colNames}) VALUES\n`;
      
      for (let i = 0; i < rows.length; i++) {
        const values = columns.map((c: any) => {
          const val = rows[i][c.column_name];
          if (val === null) return 'NULL';
          if (c.data_type.includes('text') || c.data_type.includes('varchar')) {
            return `'${String(val).replace(/'/g, "''")}'`;
          }
          if (c.data_type.includes('timestamp')) {
            return `'${val}'`;
          }
          return String(val);
        }).join(', ');
        
        sql += `  (${values})${i < rows.length - 1 ? ',' : ';'}\n`;
      }
      sql += '\n';
    }

    // Write to file
    const fs = await import('fs');
    fs.writeFileSync(outputFile, sql);
    console.log(`[Backup] Completed! Backup saved to:\n${outputFile}`);
    console.log(`[Backup] Size: ${sql.length.toLocaleString()} bytes`);

  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('[Backup] Failed:', err);
  process.exit(1);
});
