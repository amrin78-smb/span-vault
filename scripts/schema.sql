-- SpanVault Database Schema
-- PostgreSQL + TimescaleDB
-- Run this after creating the spanvault database and enabling TimescaleDB

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================
-- SITES
-- ============================================================
CREATE TABLE IF NOT EXISTS sites (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(100) NOT NULL UNIQUE,
  location  VARCHAR(200),
  timezone  VARCHAR(50) DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DEVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
  id           SERIAL PRIMARY KEY,
  hostname     VARCHAR(150) NOT NULL,
  ip_address   INET NOT NULL UNIQUE,
  site_id      INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  vendor       VARCHAR(100),
  model        VARCHAR(100),
  device_type  VARCHAR(50) DEFAULT 'router', -- router, switch, firewall
  snmp_enabled BOOLEAN DEFAULT TRUE,
  icmp_enabled BOOLEAN DEFAULT TRUE,
  priority     VARCHAR(10) DEFAULT 'normal', -- critical, normal
  community    VARCHAR(100) DEFAULT 'public',
  snmp_version VARCHAR(5) DEFAULT '2c',
  status       VARCHAR(10) DEFAULT 'unknown', -- up, down, unknown
  last_seen    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INTERFACES
-- ============================================================
CREATE TABLE IF NOT EXISTS interfaces (
  id          SERIAL PRIMARY KEY,
  device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  if_index    INTEGER NOT NULL,
  name        VARCHAR(100),
  description VARCHAR(255),
  speed_bps   BIGINT DEFAULT 0,
  if_type     VARCHAR(50),
  admin_status VARCHAR(10) DEFAULT 'unknown',
  oper_status  VARCHAR(10) DEFAULT 'unknown',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id, if_index)
);

-- ============================================================
-- INTERFACE METRICS (TimescaleDB hypertable)
-- ============================================================
CREATE TABLE IF NOT EXISTS interface_metrics (
  time         TIMESTAMPTZ NOT NULL,
  interface_id INTEGER NOT NULL REFERENCES interfaces(id) ON DELETE CASCADE,
  in_bps       BIGINT DEFAULT 0,
  out_bps      BIGINT DEFAULT 0,
  in_errors    BIGINT DEFAULT 0,
  out_errors   BIGINT DEFAULT 0,
  in_discards  BIGINT DEFAULT 0,
  out_discards BIGINT DEFAULT 0,
  util_in_pct  NUMERIC(5,2) DEFAULT 0,
  util_out_pct NUMERIC(5,2) DEFAULT 0
);

SELECT create_hypertable('interface_metrics', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_interface_metrics_interface_id
  ON interface_metrics (interface_id, time DESC);

-- ============================================================
-- ICMP TARGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS icmp_targets (
  id          SERIAL PRIMARY KEY,
  device_id   INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  ip_address  INET NOT NULL UNIQUE,
  label       VARCHAR(150),
  priority    VARCHAR(10) DEFAULT 'normal',
  enabled     BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ICMP METRICS (TimescaleDB hypertable)
-- ============================================================
CREATE TABLE IF NOT EXISTS icmp_metrics (
  time         TIMESTAMPTZ NOT NULL,
  target_id    INTEGER NOT NULL REFERENCES icmp_targets(id) ON DELETE CASCADE,
  latency_ms   NUMERIC(8,3),
  packet_loss  NUMERIC(5,2) DEFAULT 0,
  status       VARCHAR(10) DEFAULT 'unknown' -- up, down, unknown
);

SELECT create_hypertable('icmp_metrics', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_icmp_metrics_target_id
  ON icmp_metrics (target_id, time DESC);

-- ============================================================
-- FLOW SUMMARY (TimescaleDB hypertable)
-- ============================================================
CREATE TABLE IF NOT EXISTS flow_summary (
  time_bucket  TIMESTAMPTZ NOT NULL,
  src_ip       INET NOT NULL,
  dst_ip       INET NOT NULL,
  src_port     INTEGER,
  dst_port     INTEGER,
  protocol     INTEGER,
  bytes        BIGINT DEFAULT 0,
  packets      BIGINT DEFAULT 0,
  device_id    INTEGER REFERENCES devices(id) ON DELETE SET NULL
);

SELECT create_hypertable('flow_summary', 'time_bucket', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_flow_summary_src_ip
  ON flow_summary (src_ip, time_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_flow_summary_dst_ip
  ON flow_summary (dst_ip, time_bucket DESC);

-- ============================================================
-- TOPOLOGY NODES
-- ============================================================
CREATE TABLE IF NOT EXISTS topology_nodes (
  id          SERIAL PRIMARY KEY,
  device_id   INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  label       VARCHAR(150) NOT NULL,
  node_type   VARCHAR(50) DEFAULT 'router', -- router, switch, firewall, cloud, site
  x           NUMERIC(8,2) DEFAULT 0,
  y           NUMERIC(8,2) DEFAULT 0,
  site_id     INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TOPOLOGY LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS topology_links (
  id             SERIAL PRIMARY KEY,
  source_node_id INTEGER NOT NULL REFERENCES topology_nodes(id) ON DELETE CASCADE,
  target_node_id INTEGER NOT NULL REFERENCES topology_nodes(id) ON DELETE CASCADE,
  interface_id   INTEGER REFERENCES interfaces(id) ON DELETE SET NULL,
  link_speed_bps BIGINT DEFAULT 0,
  label          VARCHAR(100),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  device_id   INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  target_id   INTEGER REFERENCES icmp_targets(id) ON DELETE CASCADE,
  alert_type  VARCHAR(50) NOT NULL, -- down, high_utilization, high_latency, packet_loss, congestion
  severity    VARCHAR(10) DEFAULT 'warning', -- warning, critical
  message     TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  resolved    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('snmp_poll_interval', '60'),
  ('icmp_critical_interval', '15'),
  ('icmp_normal_interval', '60'),
  ('utilization_warning', '70'),
  ('utilization_critical', '80'),
  ('latency_warning_ms', '100'),
  ('latency_critical_ms', '200')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- RETENTION POLICIES (TimescaleDB)
-- ============================================================
-- Keep raw interface metrics for 90 days
SELECT add_retention_policy('interface_metrics', INTERVAL '90 days', if_not_exists => TRUE);
-- Keep raw ICMP metrics for 90 days
SELECT add_retention_policy('icmp_metrics', INTERVAL '90 days', if_not_exists => TRUE);
-- Keep flow summary for 30 days
SELECT add_retention_policy('flow_summary', INTERVAL '30 days', if_not_exists => TRUE);

-- ============================================================
-- CONTINUOUS AGGREGATES (hourly rollups)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS interface_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  interface_id,
  AVG(in_bps)       AS avg_in_bps,
  AVG(out_bps)      AS avg_out_bps,
  MAX(in_bps)       AS max_in_bps,
  MAX(out_bps)      AS max_out_bps,
  AVG(util_in_pct)  AS avg_util_in,
  AVG(util_out_pct) AS avg_util_out
FROM interface_metrics
GROUP BY bucket, interface_id
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS icmp_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  target_id,
  AVG(latency_ms)   AS avg_latency_ms,
  MAX(latency_ms)   AS max_latency_ms,
  AVG(packet_loss)  AS avg_packet_loss,
  COUNT(*) FILTER (WHERE status = 'down') AS down_count,
  COUNT(*)          AS total_count
FROM icmp_metrics
GROUP BY bucket, target_id
WITH NO DATA;
