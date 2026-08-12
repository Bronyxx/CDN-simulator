# 🚀 Distributed CDN & Edge Caching Simulator

A production-inspired distributed content delivery and edge caching simulator built with **Node.js**, **Express**, **Redis**, **Axios**, and **Docker Compose**.

The project simulates a real-world scenario — such as a college results portal — where thousands of users request the same data simultaneously. Instead of sending every request to a centralized origin server, requests are distributed across multiple edge servers, with Redis providing fast local caching at each edge.

The system also provides health-aware load balancing, automatic failover, cache-stampede protection, cache invalidation, metrics, and load testing.

---

## 📌 Problem Statement

Consider an online college results portal. When semester results are published, thousands of students may access the same result page at nearly the same time.

**Without caching**, every request reaches the origin server — even though most users are requesting identical data. This causes:

- High origin-server load
- Increased response latency
- Unnecessary repeated data retrieval
- Poor scalability during traffic spikes
- A single point of failure
- Service disruption if a server becomes unavailable

### The Goal

Build a system that can:

- Serve frequently requested data from cache
- Distribute traffic across multiple edge servers
- Prevent simultaneous cache misses from overwhelming the origin
- Detect unhealthy edge servers automatically
- Remove failed edges from the routing pool
- Continue serving requests when an edge server fails
- Automatically add recovered servers back into the pool
- Provide observability through metrics
- Support cache invalidation when origin data changes
- Run the entire distributed architecture through Docker Compose

---

## 🏗️ System Architecture

```
                         ┌─────────────────┐
                         │     Clients     │
                         │   / Browsers    │
                         └────────┬────────┘
                                  │ HTTP
                                  ▼
                         ┌─────────────────┐
                         │     Router      │
                         │     :5000       │
                         │ Health-Aware    │
                         │ Load Balancer   │
                         └────────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
             ┌────────────┐ ┌────────────┐ ┌────────────┐
             │   Edge 1   │ │   Edge 2   │ │   Edge 3   │
             │   :4000    │ │   :4000    │ │   :4000    │
             └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
                   ▼              ▼              ▼
             ┌──────────┐   ┌──────────┐   ┌──────────┐
             │ Redis DB0│   │ Redis DB1│   │ Redis DB2│
             └────┬─────┘   └────┬─────┘   └────┬─────┘
                  └──────────────┼──────────────┘
                             Cache Miss
                                 ▼
                         ┌─────────────────┐
                         │     Origin      │
                         │     :3000       │
                         └─────────────────┘
```

---

## 🧩 Components

### 1. Client
Represents users requesting resources (e.g. `GET /results/ece-6`). In this project, PowerShell requests and the load-testing script act as clients.

### 2. Router
The entry point into the CDN. **Port: 5000**

Responsibilities:
- Receive incoming requests
- Maintain a list of healthy edges
- Perform health checks
- Select an edge using round-robin routing
- Remove unhealthy edges / re-add recovered edges
- Forward requests to the selected edge and return the response to the client

### 3. Edge Servers
Each edge server checks its local Redis cache before forwarding a request to the origin, and caches the origin's response for subsequent requests.

### 4. Origin
The source of truth for data, and the endpoint used to trigger cache invalidation.

---

## 🔄 Request Flow

### Scenario 1 — First Request / Cache Miss

```
Client → Router → Edge (round-robin) → Redis (key missing)
       → Edge acquires distributed lock → Origin → Edge caches response (TTL 30s)
       → Router → Client
```

### Scenario 2 — Cache Hit

```
Client → Router → Edge → Redis (CACHE HIT) → Router → Client
```

The origin server is completely bypassed, dramatically reducing origin traffic.

### Scenario 3 — Cache Stampede Protection

If the cache expires and 100 users request the same resource simultaneously **without locking**, all 100 requests miss the cache and hit the origin — defeating the purpose of caching.

**With a distributed lock:**

1. The first request acquires a Redis lock and fetches from origin.
2. Remaining requests see the lock exists and wait.
3. Once the first request populates Redis, waiting requests get a cache hit.

Result: **100 incoming requests → 1 origin request → 99 cache responses.**

---

## 🔐 Redis Distributed Lock

Implemented using Redis `SET NX EX` semantics:

```
SET lock:/results/ece-6 locked NX EX 5
```

- `NX` → only create the lock if it doesn't already exist
- `EX 5` → auto-expire the lock after 5 seconds, preventing a permanently stuck lock if a process crashes

## ⏳ Cache Expiration

Cached responses use a **TTL of 30 seconds**, balancing performance, origin protection, and data freshness.

---

## ⚖️ Load Balancing

The router maintains a list of healthy edges and distributes requests using **round-robin** selection:

```json
["http://edge-1:4000", "http://edge-2:4000", "http://edge-3:4000"]
```

Observed distribution over 1,000 requests:

| Edge | Requests |
|------|----------|
| Edge 1 | 334 |
| Edge 2 | 333 |
| Edge 3 | 333 |

---

## ❤️ Health Checking

The router checks each edge every **5 seconds** via `GET /health`. Each edge verifies its Redis connection with `PING`:

```json
{ "status": "healthy", "redis": "connected" }
```

## 🚨 Automatic Failover & 🔄 Automatic Recovery

When an edge fails, the router removes it from `healthyEdges` and continues routing traffic to the remaining edges — no manual restart required. When the edge recovers, the router automatically adds it back into the pool on the next health check.

**Tested by stopping an edge directly:**

```bash
docker stop cdn-edge-2
```

The router detected the failure, removed Edge 2 from rotation, and continued serving 100% of requests through Edge 1 and Edge 3.

---

## 📊 Metrics

Each edge exposes `GET /metrics`:

```json
{
  "totalRequests": 334,
  "cacheHits": 333,
  "cacheMisses": 1,
  "originRequests": 1,
  "hitRatio": "99.70%"
}
```

| Metric | Description |
|--------|-------------|
| `totalRequests` | Total requests handled by the edge |
| `cacheHits` | Requests served from Redis |
| `cacheMisses` | Requests requiring further processing |
| `originRequests` | Requests forwarded to origin |
| `hitRatio` | Percentage served from cache |

---

## 🗑️ Cache Invalidation

The origin exposes `POST /invalidate` to clear stale cached data across all edges when the underlying data changes:

```json
{ "key": "/results/ece-6" }
```

The origin contacts every edge, which each delete the corresponding key from Redis.

---

## 🧱 Docker Architecture

The complete system is containerized via Docker Compose: **Redis**, **Origin**, **Router**, and three **Edge** services, each running independently.

| Service | Internal Port | Host Port |
|---------|---------------|-----------|
| Origin | 3000 | 3000 |
| Edge 1 | 4000 | 4000 |
| Edge 2 | 4000 | 4001 |
| Edge 3 | 4000 | 4002 |
| Router | 5000 | 5000 |
| Redis | 6379 | 6379 |

Inside the Docker network, services communicate using container names (e.g. `http://edge-1:4000`, `http://origin:3000`, `http://redis:6379`).

---

## 🗂️ Project Structure

```
CDN-simulator/
│
├── docker-compose.yml
│
├── origin/
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── edgeServers/
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
├── router/
│   ├── Dockerfile
│   ├── package.json
│   └── index.js
│
└── scripts/
    └── loadTest.js
```

---

## 🔌 API Endpoints

**Router**
- `GET /results/:id` — forwards the request to a healthy edge

**Edge**
- `GET /health` — returns `{ "status": "healthy", "redis": "connected" }`
- `GET /metrics` — returns cache/request metrics
- `GET /redis-test` — Redis connectivity check
- `POST /invalidate` — invalidate a cache key

---

## 🧪 Load Testing & Benchmark Results

A custom Node.js load-testing script (`scripts/loadTest.js`) drives the full request path (Client → Router → Edge → Redis/Origin → Response) and was tested with **1,000 requests**.

### Normal Operation (all 3 edges healthy)

```
Total requests:    1000
Successful:        1000
Failed:               0
Time:              3239 ms
Requests/sec:      308.74
```

| Edge | Requests | Cache Hits | Cache Misses | Hit Ratio |
|------|----------|------------|---------------|-----------|
| Edge 1 | 334 | 333 | 1 | 99.70% |
| Edge 2 | 333 | 332 | 1 | 99.70% |
| Edge 3 | 333 | 332 | 1 | 99.70% |

**Overall:** 997 cache hits, 3 cache misses, 3 origin requests → **99.70% cache hit ratio**, meaning only **0.3%** of requests reached the origin.

### Failure Benchmark (Edge 2 stopped mid-test)

```
Total requests:    1000
Successful:        1000
Failed:               0
Time:              2373 ms
Requests/sec:      421.41
```

**Result:** 1000/1000 requests succeeded even with one of three edge servers intentionally taken offline — demonstrating automatic failover and service continuity.

---

## 🧠 Core Distributed-Systems Concepts Demonstrated

- **Caching** — reduce repeated origin requests using Redis
- **Cache TTL** — automatically expire cached data
- **Cache Stampede Prevention** — Redis distributed locks ensure only one request repopulates an expired cache entry
- **Load Balancing** — round-robin request distribution
- **Health Checking** — continuous edge-server monitoring
- **Automatic Failover** — unhealthy servers removed from the routing pool
- **Automatic Recovery** — recovered servers reintroduced automatically
- **Cache Invalidation** — explicit removal of stale cached data
- **Horizontal Scaling** — add edge-server instances without changing the origin
- **Containerization** — full architecture run via Docker Compose
- **Observability** — cache and request metrics exposed per edge

---

## 🚀 Running the Project

### Prerequisites

- Node.js
- Docker
- Docker Compose

### Start the System

From the project root:

```bash
docker compose up --build -d
```

Check containers:

```bash
docker compose ps
```

Expected services: `cdn-redis`, `cdn-origin`, `cdn-edge-1`, `cdn-edge-2`, `cdn-edge-3`, `cdn-router`

### Test the System

**Through the router:**

```powershell
Invoke-RestMethod http://localhost:5000/results/ece-6
```

First request → `{ "source": "origin", "data": {} }`
Subsequent requests → `{ "source": "cache", "data": {} }`

**Check edge health:**

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-RestMethod http://localhost:4001/health
Invoke-RestMethod http://localhost:4002/health
```

**Check metrics:**

```powershell
Invoke-RestMethod http://localhost:4000/metrics
```

**Test failover:**

```bash
docker stop cdn-edge-2
docker compose logs router --tail 20   # router should report only edge-1 and edge-3
docker start cdn-edge-2                # router should auto-detect and restore it
```

---

## 🔮 Future Improvements

The current implementation establishes the core CDN architecture. The next stage could introduce **event-driven cache management using Apache Kafka** for distributed cache invalidation, origin data-update events, and asynchronous change propagation.

Other possible improvements:

- Prometheus metrics & Grafana dashboards
- Consistent hashing
- LRU/LFU cache eviction policies
- Request rate limiting
- Circuit breakers & retry policies
- HTTPS & authentication
- Kubernetes deployment
- Distributed tracing
- More sophisticated load-balancing algorithms

---

## 📊 Final Results

| Capability | Result |
|------------|--------|
| Edge servers | 3 |
| Load balancing | Round-robin |
| Cache | Redis |
| Cache TTL | 30 seconds |
| Cache hit ratio | 99.70% |
| Requests tested | 1,000 |
| Origin requests | 3 |
| Normal success rate | 100% |
| Failure-test success rate | 100% |
| Health-check interval | 5 seconds |
| Containerization | Docker Compose |
| Cache-stampede protection | Redis distributed lock |
| Automatic failover | Implemented |
| Automatic recovery | Implemented |
| Cache invalidation | Implemented |

---

## ⭐ Project Highlights

- ✅ Distributed edge architecture
- ✅ Redis caching with TTL
- ✅ Cache stampede protection via distributed locking
- ✅ Round-robin, health-aware load balancing
- ✅ Automatic failover & recovery
- ✅ Cache invalidation
- ✅ Request metrics & observability
- ✅ Dockerized microservices
- ✅ Load testing & fault-tolerance testing
