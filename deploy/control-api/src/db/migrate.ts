import * as fs from 'fs';
import * as path from 'path';
import { pool, query } from './client';

interface Migration {
  id: number;
  name: string;
  applied_at: Date;
}

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(): Promise<string[]> {
  const rows = await query<Migration>('SELECT name FROM migrations ORDER BY id');
  return rows.map((row) => row.name);
}

async function applyMigration(name: string, sql: string): Promise<void> {
  console.log(`Applying migration: ${name}`);
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    console.log(`✓ Applied migration: ${name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`✗ Failed to apply migration: ${name}`, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  console.log('Starting database migrations...');
  
  try {
    await ensureMigrationsTable();
    const appliedMigrations = await getAppliedMigrations();
    console.log(`Already applied: ${appliedMigrations.length} migrations`);
    
    const migrationsDir = path.join(__dirname, '../migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      if (appliedMigrations.includes(file)) {
        console.log(`⊘ Skipping already applied migration: ${file}`);
        continue;
      }
      
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      await applyMigration(file, sql);
    }
    
    console.log('✓ All migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations complete. Exiting.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}
