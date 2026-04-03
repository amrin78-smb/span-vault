// SpanVault - Database Layer
// PostgreSQL connection pool with helper utilities

import { Pool, PoolClient } from 'pg';
import { loadConfig } from '../config/loader';
import { logger } from '../utils/logger';

const config = loadConfig();

// Shared connection pool - reused across all services
export const pool = new Pool({
  host:     config.database.host,
  port:     config.database.port,
  database: config.database.name,
  user:     config.database.user,
  password: config.database.password,
  max:      20,           // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

// Generic query helper - returns rows directly
export async function query<T = any>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } catch (err) {
    logger.error('Database query error', { sql: sql.slice(0, 100), error: (err as Error).message });
    throw err;
  } finally {
    client.release();
  }
}

// Single row helper - returns first row or null
export async function queryOne<T = any>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// Transaction helper - runs multiple queries atomically
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Test database connectivity at startup
export async function testConnection(): Promise<void> {
  try {
    await query('SELECT NOW() AS time');
    logger.info('Database connection established');
  } catch (err) {
    logger.error('Failed to connect to database', { error: (err as Error).message });
    throw err;
  }
}
