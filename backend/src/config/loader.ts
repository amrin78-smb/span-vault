// SpanVault - Config Loader
// Reads config.json from the SpanVault root directory

import * as fs from 'fs';
import * as path from 'path';

export interface SpanVaultConfig {
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  api: {
    port: number;
    secret: string;
  };
  snmp: {
    pollIntervalSeconds: number;
    community: string;
    version: string;
    timeout: number;
    retries: number;
    maxConcurrent: number;
  };
  icmp: {
    criticalIntervalSeconds: number;
    normalIntervalSeconds: number;
    probesPerCycle: number;
    timeoutMs: number;
  };
  flow: {
    udpPort: number;
    aggregationIntervalSeconds: number;
  };
  thresholds: {
    utilizationWarningPercent: number;
    utilizationCriticalPercent: number;
    latencyWarningMs: number;
    latencyCriticalMs: number;
    packetLossWarningPercent: number;
    packetLossCriticalPercent: number;
  };
  logging: {
    level: string;
    dir: string;
  };
}

let cached: SpanVaultConfig | null = null;

export function loadConfig(): SpanVaultConfig {
  if (cached) return cached;

  // Look for config.json in the SpanVault root (two levels up from backend/src/config)
  const configPaths = [
    path.join(process.cwd(), 'config.json'),
    path.join(process.cwd(), '..', 'config.json'),
    'C:\\SpanVault\\config.json',
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      cached = JSON.parse(raw) as SpanVaultConfig;
      return cached;
    }
  }

  throw new Error(
    'config.json not found. Place it in the SpanVault root directory or C:\\SpanVault\\config.json'
  );
}
