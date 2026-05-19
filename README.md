# 🌐 CDN Simulator

A distributed Content Delivery Network (CDN) simulator built with **Node.js**, **Redis**, and **Docker Compose**. It replicates real-world CDN architecture with a dedicated origin server and edge servers that cache responses close to the client — complete with cache invalidation propagation.

---

## 🏗️ Architecture

```
Client Request
      │
      ▼
 ┌─────────────┐
 │  Edge Server │  ◄── Redis Cache (TTL: 30s)
 │  (Port 4001) │
 └──────┬──────┘
        │ cache miss
        ▼
 ┌─────────────┐
 │Origin Server│  ◄── Source of truth
 │  (Port 3000) │
 └─────────────┘
```

- **Origin Server** — serves the source data and orchestrates cache invalidation across all edge nodes
- **Edge Server(s)** — sit between the client and origin, caching responses in Redis with a 30-second TTL
- **Redis** — per-edge in-memory cache store

---

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) & Docker Compose installed

### Run with Docker Compose

```bash
git clone https://github.com/bronyxx/cdn-simulator.git
cd cdn-simulator
docker compose up --build
```

This spins up:
| Service | Port | Description |
|---|---|---|
| `origin` | 3000 | Origin server |
| `edge` | 4001 | Edge server with Redis cache |
| `redis` | 6379 | Redis instance for the edge |

---

## 📡 API Reference

### Edge Server — `http://localhost:4001`

#### `GET /data/:id`
Fetch data by ID. Returns from Redis cache if available, otherwise fetches from origin and caches it for 30 seconds.

```bash
curl http://localhost:4001/data/42
```

**Cache hit response:**
```json
{
  "source": "cache",
  "data": { "id": "42", "data": "Hello from origin", "ts": 1718000000000 }
}
```

**Cache miss response:**
```json
{
  "source": "origin",
  "data": { "id": "42", "data": "Hello from origin", "ts": 1718000000000 }
}
```

#### `POST /invalidate/:key`
Deletes a specific key from the edge's Redis cache.

```bash
curl -X POST http://localhost:4001/invalidate/42
```

```json
{ "message": "Key 42 deleted from cache" }
```

---

### Origin Server — `http://localhost:3000`

#### `GET /data/:id`
Returns source data with `Cache-Control: public, max-age=30` header.

```bash
curl http://localhost:3000/data/42
```

```json
{ "id": "42", "data": "Hello from origin", "ts": 1718000000000 }
```

#### `POST /invalidate/:key`
Propagates cache invalidation to **all registered edge nodes**.

```bash
curl -X POST http://localhost:3000/invalidate/42
```

```json
{ "message": "Key 42 invalidated across all edges" }
```

Origin logs each edge's invalidation result:
```
Invalidating key: 42 across all edges
Edge 1 invalidated successfully
```

---

## 🐳 Docker Compose Structure

Each service runs in its own container with its own image:

```yaml
services:
  origin:       # Node.js origin server
  edge:         # Node.js edge server
  redis:        # Redis cache for edge
```

To scale edge nodes, uncomment additional entries in `EDGE_NODES` inside `origin/index.js` and add corresponding services in `docker-compose.yml`.

---

## ⚙️ Environment Variables

**Edge Server (`.env`)**
```env
REDIS_URL=redis://redis:6379
```

**Origin Server (`.env`)**
```env
PORT=3000
```

---

## 🔄 How Cache Invalidation Works

1. Client sends `POST /invalidate/:key` to the **origin**
2. Origin fans out the request to all registered edge nodes via `Promise.allSettled`
3. Each edge deletes the key from its Redis store
4. Next request to that key on any edge results in a fresh fetch from origin

This mirrors real-world CDN cache purge behavior.

---

## 🗂️ Project Structure

```
cdn-simulator/
├── origin/
│   ├── index.js
│   ├── Dockerfile
│   └── .env
├── edge/
│   ├── index.js
│   ├── Dockerfile
│   └── .env
└── docker-compose.yml
```

---

## 🛠️ Tech Stack

- **Node.js** + **Express** — server runtime
- **Redis** (`node-redis`) — edge caching
- **Axios** — inter-service HTTP communication
- **Docker Compose** — multi-container orchestration

---

## 📌 Future Improvements

- [ ] Add multiple edge nodes (edge2, edge3) with independent Redis instances
- [ ] Implement consistent hashing for request routing
- [ ] Add cache hit/miss metrics dashboard
- [ ] Simulate geographic latency between origin and edges
- [ ] Add health check endpoints per service

---

## 👤 Author

**Sreehari S** — [github.com/bronyxx](https://github.com/bronyxx) | [leetcode.com/rrrambo](https://leetcode.com/u/rrrambo)
