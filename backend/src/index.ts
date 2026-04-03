// SpanVault - REST API Server
// Express server exposing all SpanVault data endpoints

process.env.SPANVAULT_SERVICE = 'api';

import express from 'express';
import cors    from 'cors';
import { loadConfig }    from './config/loader';
import { testConnection } from './db';
import { logger }        from './utils/logger';

import devicesRouter    from './api/routes/devices';
import interfacesRouter from './api/routes/interfaces';
import metricsRouter    from './api/routes/metrics';
import topologyRouter   from './api/routes/topology';
import flowsRouter      from './api/routes/flows';
import alertsRouter     from './api/routes/alerts';
import sitesRouter      from './api/routes/sites';

const config = loadConfig();
const app    = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'SpanVault API', time: new Date().toISOString() });
});

// Route mounting
app.use('/api/devices',    devicesRouter);
app.use('/api/interfaces', interfacesRouter);
app.use('/api/metrics',    metricsRouter);
app.use('/api/topology',   topologyRouter);
app.use('/api/flows',      flowsRouter);
app.use('/api/alerts',     alertsRouter);
app.use('/api/sites',      sitesRouter);

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled API error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

async function start(): Promise<void> {
  await testConnection();

  app.listen(config.api.port, () => {
    logger.info(`SpanVault API listening on port ${config.api.port}`);
  });
}

start().catch((err) => {
  logger.error('API server failed to start', { error: err.message });
  process.exit(1);
});
