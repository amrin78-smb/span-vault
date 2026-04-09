// SpanVault - NetVault Database Connection
// Read-only connection to NetVault database for shared data (sites, countries)
import { Pool } from 'pg';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';

const config = loadConfig();

// Connect to NetVault database on the same PostgreSQL instance
export const netvaultPool = new Pool({
  host:     config.database.host,
  port:     config.database.port,
  database: 'netvault',
  user:     config.database.user,
  password: config.database.password,
  max:      5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

netvaultPool.on('error', (err) => {
  logger.warn('NetVault database pool error (non-fatal)', { error: err.message });
});

export async function nvQuery<T = any>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = await netvaultPool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } catch (err) {
    logger.warn('NetVault query failed', { sql: sql.slice(0, 100), error: (err as Error).message });
    throw err;
  } finally {
    client.release();
  }
}
