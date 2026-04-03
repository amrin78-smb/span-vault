# SpanVault - WAN Monitoring System

SpanVault is a lightweight, production-ready WAN monitoring platform for on-premises Windows Server deployment.
It collects SNMP, ICMP, and NetFlow data, stores it in PostgreSQL with TimescaleDB, and provides a web dashboard with topology mapping.

---

## Architecture

```
[ Routers / Firewalls / Sites ]
        |         |         |
      SNMP      ICMP     NetFlow UDP
        |         |         |
        v         v         v
          [ Node.js Collector Layer ]
    SNMP Poller | ICMP Monitor | Flow Collector | Aggregator
                        |
                        v
        [ PostgreSQL + TimescaleDB ]
                        |
                        v
              [ REST API (Express) ]
                        |
                        v
          [ Next.js Frontend Dashboard ]
```

---

## Prerequisites

Before running the installer, ensure the following are installed on your Windows Server:

1. PostgreSQL 15 or later (https://www.postgresql.org/download/windows/)
2. TimescaleDB for your PostgreSQL version (https://docs.timescale.com/self-hosted/latest/install/installation-windows/)
3. Node.js 20 LTS (installer will download if missing)
4. NSSM (installer will download if missing)

If SpanVault is being installed on the same server as NetVault, PostgreSQL and Node.js are already present. Only TimescaleDB needs to be added.

---

## Installation

1. Clone or copy the SpanVault folder to your server.

2. Open PowerShell as Administrator.

3. Navigate to the SpanVault directory:
```
cd C:\path\to\spanvault
```

4. Run the installer:
```
.\installer\Install-SpanVault.ps1 -DbPassword "yourpassword"
```

Optional parameters:
```
-InstallDir   "C:\SpanVault"      (default: C:\SpanVault)
-DbUser       "postgres"           (default: postgres)
-DbName       "spanvault"          (default: spanvault)
-ApiPort      3001                 (default: 3001)
-FlowPort     2055                 (default: 2055, standard NetFlow port)
-SkipSeed                          (skip loading sample data)
```

---

## Services

SpanVault runs as five Windows services managed by NSSM:

| Service | Description |
|---|---|
| SpanVault-SNMP | Polls network devices via SNMP v2c every 60 seconds |
| SpanVault-ICMP | Pings targets every 15s (critical) or 60s (normal) |
| SpanVault-Flow | Listens on UDP 2055 for NetFlow v9 datagrams |
| SpanVault-Aggregator | Detects congestion and scores site health every minute |
| SpanVault-API | REST API + serves the web dashboard |

Manage services via services.msc or NSSM:
```
nssm start SpanVault-SNMP
nssm stop  SpanVault-SNMP
nssm restart SpanVault-API
```

---

## Adding Devices

POST to the API to add a device for monitoring:
```
POST http://localhost:3001/api/devices
Content-Type: application/json

{
  "hostname":    "hq-fw-01",
  "ip_address":  "10.1.1.1",
  "site_id":     1,
  "vendor":      "Fortinet",
  "model":       "FortiGate 600E",
  "device_type": "firewall",
  "priority":    "critical",
  "community":   "public"
}
```

Adding a device automatically creates an ICMP target for it.

---

## NetFlow Configuration

Point your routers and firewalls to export NetFlow v9 to your SpanVault server IP on UDP port 2055.

Example for Cisco IOS:
```
ip flow-export destination <spanvault-ip> 2055
ip flow-export version 9
ip flow-export source GigabitEthernet0/0
ip flow-cache timeout active 1
ip flow-cache timeout inactive 15
```

---

## Logs

All service logs are written to C:\SpanVault\logs\ (or your custom InstallDir\logs):
```
SpanVault-SNMP.log
SpanVault-ICMP.log
SpanVault-Flow.log
SpanVault-Aggregator.log
SpanVault-API.log
```

---

## Accessing the Dashboard

Open a browser and navigate to:
```
http://localhost:3001
```

Or from another machine on the network:
```
http://<server-ip>:3001
```

---

## Coexistence with NetVault

SpanVault and NetVault run on the same Windows Server without conflict:

- NetVault runs on port 3000, SpanVault on port 3001
- Each has its own PostgreSQL database (netvault and spanvault)
- TimescaleDB is added as an extension to the shared PostgreSQL instance
- Node.js is shared
- NSSM services are completely independent

---

## Data Retention

TimescaleDB automatically manages data retention:

- Interface metrics: 90 days raw, hourly aggregates retained indefinitely
- ICMP metrics: 90 days raw, hourly aggregates retained indefinitely
- Flow summary: 30 days

Adjust retention in the schema.sql file before running the installer.

---

## GitHub Repository

```
https://github.com/amrin78-smb/span-vault
```
