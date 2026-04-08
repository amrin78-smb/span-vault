-- SpanVault Database Schema
-- Plain PostgreSQL (no TimescaleDB required)

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
  device_type  VARCHAR(50) DEFAULT 'router',
  snmp_enabled BOOLEAN DEFAULT TRUE,
  icmp_enabled BOOLEAN DEFAULT TRUE,
  priority     VARCHAR(10) DEFAULT 'normal',
  community    VARCHAR(100) DEFAULT 'public',
  snmp_version VARCHAR(5) DEFAULT '2c',
  status       VARCHAR(10) DEFAULT 'unknown',
  last_seen    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INTERFACES
-- ============================================================
CREATE TABLE IF NOT EXISTS interfaces (
  id           SERIAL PRIMARY KEY,
  device_id    INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  if_index     INTEGER NOT NULL,
  name         VARCHAR(100),
  description  VARCHAR(255),
  speed_bps    BIGINT DEFAULT 0,
  if_type      VARCHAR(50),
  admin_status VARCHAR(10) DEFAULT 'unknown',
  oper_status  VARCHAR(10) DEFAULT 'unknown',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id, if_index)
);

-- ============================================================
-- INTERFACE METRICS
-- ============================================================
CREATE TABLE IF NOT EXISTS interface_metrics (
  time         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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

CREATE INDEX IF NOT EXISTS idx_interface_metrics_interface_time
  ON interface_metrics (interface_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_interface_metrics_time
  ON interface_metrics (time DESC);

-- ============================================================
-- ICMP TARGETS
-- ============================================================
CREATE TABLE IF NOT EXISTS icmp_targets (
  id         SERIAL PRIMARY KEY,
  device_id  INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  ip_address INET NOT NULL UNIQUE,
  label      VARCHAR(150),
  priority   VARCHAR(10) DEFAULT 'normal',
  enabled    BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ICMP METRICS
-- ============================================================
CREATE TABLE IF NOT EXISTS icmp_metrics (
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  target_id   INTEGER NOT NULL REFERENCES icmp_targets(id) ON DELETE CASCADE,
  latency_ms  NUMERIC(8,3),
  packet_loss NUMERIC(5,2) DEFAULT 0,
  status      VARCHAR(10) DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS idx_icmp_metrics_target_time
  ON icmp_metrics (target_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_icmp_metrics_time
  ON icmp_metrics (time DESC);

-- ============================================================
-- FLOW SUMMARY
-- ============================================================
CREATE TABLE IF NOT EXISTS flow_summary (
  time_bucket TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  src_ip      INET NOT NULL,
  dst_ip      INET NOT NULL,
  src_port    INTEGER,
  dst_port    INTEGER,
  protocol    INTEGER,
  bytes       BIGINT DEFAULT 0,
  packets     BIGINT DEFAULT 0,
  device_id   INTEGER REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_flow_summary_time
  ON flow_summary (time_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_flow_summary_src_ip
  ON flow_summary (src_ip, time_bucket DESC);
CREATE INDEX IF NOT EXISTS idx_flow_summary_dst_ip
  ON flow_summary (dst_ip, time_bucket DESC);

-- ============================================================
-- TOPOLOGY NODES
-- ============================================================
CREATE TABLE IF NOT EXISTS topology_nodes (
  id         SERIAL PRIMARY KEY,
  device_id  INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  label      VARCHAR(150) NOT NULL,
  node_type  VARCHAR(50) DEFAULT 'router',
  x          NUMERIC(8,2) DEFAULT 0,
  y          NUMERIC(8,2) DEFAULT 0,
  site_id    INTEGER REFERENCES sites(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  id           SERIAL PRIMARY KEY,
  device_id    INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  target_id    INTEGER REFERENCES icmp_targets(id) ON DELETE CASCADE,
  alert_type   VARCHAR(50) NOT NULL,
  severity     VARCHAR(10) DEFAULT 'warning',
  message      TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  resolved     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_resolved
  ON alerts (resolved, created_at DESC);

-- ============================================================
-- HOURLY ROLLUP VIEWS (replaces TimescaleDB continuous aggregates)
-- ============================================================
CREATE OR REPLACE VIEW interface_metrics_hourly AS
SELECT
  date_trunc('hour', time)  AS bucket,
  interface_id,
  AVG(in_bps)               AS avg_in_bps,
  AVG(out_bps)              AS avg_out_bps,
  MAX(in_bps)               AS max_in_bps,
  MAX(out_bps)              AS max_out_bps,
  AVG(util_in_pct)          AS avg_util_in,
  AVG(util_out_pct)         AS avg_util_out
FROM interface_metrics
WHERE time > NOW() - INTERVAL '90 days'
GROUP BY bucket, interface_id;

CREATE OR REPLACE VIEW icmp_metrics_hourly AS
SELECT
  date_trunc('hour', time)  AS bucket,
  target_id,
  AVG(latency_ms)           AS avg_latency_ms,
  MAX(latency_ms)           AS max_latency_ms,
  AVG(packet_loss)          AS avg_packet_loss,
  COUNT(*) FILTER (WHERE status = 'down') AS down_count,
  COUNT(*)                  AS total_count
FROM icmp_metrics
WHERE time > NOW() - INTERVAL '90 days'
GROUP BY bucket, target_id;

-- ============================================================
-- AUTO CLEANUP (runs on insert via pg scheduled job alternative)
-- We'll handle retention in the aggregator service instead
-- ============================================================

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value) VALUES
  ('snmp_poll_interval',    '60'),
  ('icmp_critical_interval','15'),
  ('icmp_normal_interval',  '60'),
  ('utilization_warning',   '70'),
  ('utilization_critical',  '80'),
  ('latency_warning_ms',    '100'),
  ('latency_critical_ms',   '200')
ON CONFLICT (key) DO NOTHING;
