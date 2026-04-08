-- SpanVault Sample Seed Data
-- Thai Union Group WAN topology placeholder data

-- Sites
INSERT INTO sites (name, location, timezone) VALUES
  ('HQ Bangkok',    'Bangkok, Thailand',      'Asia/Bangkok'),
  ('Samut Sakhon',  'Samut Sakhon, Thailand', 'Asia/Bangkok'),
  ('Songkhla',      'Songkhla, Thailand',     'Asia/Bangkok'),
  ('Singapore Hub', 'Singapore',              'Asia/Singapore')
ON CONFLICT DO NOTHING;

-- Devices
INSERT INTO devices (hostname, ip_address, site_id, vendor, model, device_type, priority) VALUES
  ('hq-fw-01',   '10.1.1.1', 1, 'Fortinet',  'FortiGate 600E', 'firewall', 'critical'),
  ('hq-rt-01',   '10.1.1.2', 1, 'Cisco',     'ASR 1001',       'router',   'critical'),
  ('hq-sw-core', '10.1.1.3', 1, 'HPE Aruba', 'CX 8325',        'switch',   'critical'),
  ('ss-fw-01',   '10.2.1.1', 2, 'Fortinet',  'FortiGate 200E', 'firewall', 'normal'),
  ('ss-rt-01',   '10.2.1.2', 2, 'Cisco',     'ISR 4331',       'router',   'normal'),
  ('sk-fw-01',   '10.3.1.1', 3, 'Fortinet',  'FortiGate 200E', 'firewall', 'normal'),
  ('sg-rt-01',   '10.4.1.1', 4, 'Cisco',     'ASR 1002',       'router',   'critical')
ON CONFLICT DO NOTHING;

-- ICMP Targets (include Google/Cloudflare for baseline connectivity check)
INSERT INTO icmp_targets (device_id, ip_address, label, priority) VALUES
  (1,    '10.1.1.1', 'HQ Firewall',      'critical'),
  (2,    '10.1.1.2', 'HQ Router',        'critical'),
  (3,    '10.1.1.3', 'HQ Core Switch',   'critical'),
  (4,    '10.2.1.1', 'SS Firewall',      'normal'),
  (5,    '10.2.1.2', 'SS Router',        'normal'),
  (6,    '10.3.1.1', 'SK Firewall',      'normal'),
  (7,    '10.4.1.1', 'SG Router',        'critical'),
  (NULL, '8.8.8.8',  'Google DNS',       'normal'),
  (NULL, '1.1.1.1',  'Cloudflare DNS',   'normal')
ON CONFLICT DO NOTHING;

-- Topology Nodes (integer x/y positions)
INSERT INTO topology_nodes (device_id, label, node_type, x, y, site_id) VALUES
  (1, 'HQ Firewall',    'firewall', 400, 100, 1),
  (2, 'HQ Router',      'router',   400, 250, 1),
  (3, 'HQ Core Switch', 'switch',   400, 400, 1),
  (4, 'SS Firewall',    'firewall', 150, 550, 2),
  (5, 'SS Router',      'router',   150, 700, 2),
  (6, 'SK Firewall',    'firewall', 650, 550, 3),
  (7, 'SG Router',      'router',   650, 700, 4)
ON CONFLICT DO NOTHING;

-- Topology Links
INSERT INTO topology_links (source_node_id, target_node_id, label, link_speed_bps) VALUES
  (1, 2, 'HQ FW-RT',    1000000000),
  (2, 3, 'HQ RT-SW',    10000000000),
  (2, 5, 'HQ-SS MPLS',  100000000),
  (2, 6, 'HQ-SK MPLS',  100000000),
  (2, 7, 'HQ-SG MPLS',  1000000000)
ON CONFLICT DO NOTHING;

SELECT 'Seed data loaded successfully' AS result;
