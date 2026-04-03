// SpanVault Frontend - API Client

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Devices
  getDevices:   ()                       => apiFetch<Device[]>('/devices'),
  getDevice:    (id: number)             => apiFetch<Device>(`/devices/${id}`),
  createDevice: (data: Partial<Device>)  => apiFetch('/devices', { method: 'POST', body: JSON.stringify(data) }),
  updateDevice: (id: number, data: Partial<Device>) => apiFetch(`/devices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDevice: (id: number)             => apiFetch(`/devices/${id}`, { method: 'DELETE' }),

  // Sites
  getSites: () => apiFetch<Site[]>('/sites'),

  // Interfaces
  getInterfaces: (deviceId: number) => apiFetch<Interface[]>(`/interfaces?device_id=${deviceId}`),

  // Metrics
  getSummary: () => apiFetch<Summary>('/metrics/summary'),
  getInterfaceMetrics: (id: number, from: string, to: string, res = 'raw') =>
    apiFetch<InterfaceMetric[]>(`/metrics/interface?interface_id=${id}&from=${from}&to=${to}&resolution=${res}`),
  getIcmpMetrics: (id: number, from: string, to: string) =>
    apiFetch<IcmpMetric[]>(`/metrics/icmp?target_id=${id}&from=${from}&to=${to}`),

  // Topology
  getTopology: () => apiFetch<Topology>('/topology'),
  saveNodePos: (id: number, x: number, y: number) =>
    apiFetch(`/topology/nodes/${id}/position`, { method: 'PUT', body: JSON.stringify({ x, y }) }),

  // Flows
  getTopTalkers:   (from: string, to: string, limit = 10) =>
    apiFetch<TopTalker[]>(`/flows/top-talkers?from=${from}&to=${to}&limit=${limit}`),
  getFlowTimeline: (from: string, to: string) =>
    apiFetch<FlowBucket[]>(`/flows/timeline?from=${from}&to=${to}`),

  // Alerts
  getAlerts:        (resolved = false) => apiFetch<Alert[]>(`/alerts?resolved=${resolved}`),
  acknowledgeAlert: (id: number)       => apiFetch(`/alerts/${id}/acknowledge`, { method: 'PUT' }),
  resolveAlert:     (id: number)       => apiFetch(`/alerts/${id}/resolve`,     { method: 'PUT' }),
};

// ── Type definitions ──────────────────────────────────────────────────────────
export interface Device {
  id: number;
  hostname: string;
  ip_address: string;
  site_id: number;
  site_name: string;
  vendor: string;
  model: string;
  device_type: string;
  status: string;
  priority: string;
  last_seen: string;
}

export interface Site {
  id: number;
  name: string;
  location: string;
  device_count: number;
  devices_up: number;
  devices_down: number;
}

export interface Interface {
  id: number;
  device_id: number;
  if_index: number;
  name: string;
  speed_bps: number;
  oper_status: string;
}

export interface InterfaceMetric {
  time: string;
  in_bps: number;
  out_bps: number;
  util_in_pct: number;
  util_out_pct: number;
}

export interface IcmpMetric {
  time: string;
  latency_ms: number;
  packet_loss: number;
  status: string;
}

export interface Summary {
  devices: { up: number; down: number; total: number };
  alerts:  { critical: number; warning: number };
  icmp:    { avg_latency: number; avg_loss: number };
}

export interface Topology {
  nodes: TopologyNode[];
  links: TopologyLink[];
}

export interface TopologyNode {
  id: number;
  label: string;
  node_type: string;
  x: number;
  y: number;
  device_id: number;
  hostname: string;
  ip_address: string;
  status: string;
  site_name: string;
}

export interface TopologyLink {
  id: number;
  source_node_id: number;
  target_node_id: number;
  label: string;
  util_pct: number;
  link_speed_bps: number;
}

export interface TopTalker {
  src_ip: string;
  dst_ip: string;
  total_bytes: number;
  total_packets: number;
}

export interface FlowBucket {
  bucket: string;
  total_bytes: number;
  total_packets: number;
}

export interface Alert {
  id: number;
  device_id: number;
  hostname: string;
  alert_type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  resolved: boolean;
  created_at: string;
}
