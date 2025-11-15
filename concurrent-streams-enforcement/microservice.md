# Session Enforcement Service

## Core Design Decisions

### 1. Stateless Architecture + Redis as Single Source of Truth

**Decision**: All session state lives in Redis; service containers are completely stateless.

**Rationale**:
- Horizontal scalability: Any instance handles any request
- Fast deployments: No state migration needed
- High availability: Container failures don't lose data

### 2. Data Model: Redis Sorted Set (ZSET)

```typescript
// Redis structure
Key: `session:{userId}:active`
Type: Sorted Set (ZSET)
Members: sessionId (string)
Scores: timestamp (unix epoch)
TTL: 24 hours

// Example
Key: session:user_123:active
  "sess_abc" → score: 1700000000 (older)
  "sess_xyz" → score: 1700003600 (newer)

// Session metadata (separate hash)
Key: session:metadata:{sessionId}
Fields: { deviceId, deviceType, startTime, ipAddress }
```

**Why ZSET over List?**
- O(log N) removal by sessionId vs O(N) scan in List
- Built-in sorting by timestamp for FIFO eviction
- `ZPOPMIN` atomically removes oldest session

### 3. FIFO Eviction Strategy

When user exceeds 2 streams → evict oldest session (not newest, not priority-based).

**Rationale**: Simple, predictable, matches user expectation ("my latest device stays active").

### 4. Fargate Deployment

**Why not Lambda?**
- No cold starts: Maintains persistent Redis connection pool
- Consistent latency: Lambda cold starts add 200-1000ms
- Better for high-frequency operations

---

## Concurrency Control

### Challenge: Race Conditions

**Problem**: Two devices start sessions simultaneously → both see count=1 → both add → total=3 ❌

### Solution: Atomic Lua Scripts

All validation logic runs as single atomic operation in Redis (single-threaded execution).

```lua
-- start_session.lua (runs atomically in Redis)
local activeKey = KEYS[1]
local sessionId = ARGV[1]
local timestamp = tonumber(ARGV[2])
local maxConcurrent = 2

-- Check if session already exists (handles device reconnections)
local existingScore = redis.call('ZSCORE', activeKey, sessionId)
if existingScore then
  redis.call('ZADD', activeKey, timestamp, sessionId)
  return {status = "updated", evicted = nil}
end

-- Get current count
local currentCount = redis.call('ZCARD', activeKey)

-- Evict oldest if limit exceeded
local evictedSession = nil
if currentCount >= maxConcurrent then
  local oldest = redis.call('ZPOPMIN', activeKey, 1)
  if oldest[1] then
    evictedSession = oldest[1]
    redis.call('DEL', 'session:metadata:' .. evictedSession)
  end
end

-- Add new session
redis.call('ZADD', activeKey, timestamp, sessionId)
redis.call('EXPIRE', activeKey, 86400)

return {status = "created", evicted = evictedSession, count = redis.call('ZCARD', activeKey)}
```

```typescript
// Service code (TypeScript)
interface SessionResult {
  status: 'created' | 'updated';
  evicted?: string;
  count: number;
}

async function startSession(userId: string, sessionId: string): Promise<SessionResult> {
  const result = await redis.eval(
    startSessionScript,
    1, // number of keys
    `session:${userId}:active`,
    sessionId,
    Math.floor(Date.now() / 1000)
  ) as SessionResult;

  // If session evicted, send async notification
  if (result.evicted) {
    await publishEvictionEvent(userId, result.evicted);
  }

  return result;
}
```

**Benefits**:
- ✅ Atomic: No race conditions
- ✅ Single network call: ~5ms latency

**Note on Idempotency**:
- **Network retries**: Handled at HTTP layer via `Idempotency-Key` header (cached response)

---

## Session Expiration & Cleanup

### 3-Layer Strategy

**Layer 1: Redis TTL (Primary)**
- Every session key has 24-hour TTL
- Auto-cleanup when not renewed

**Layer 2: Heartbeat Mechanism**

**Important**: Heartbeat is sent while the **app is open** (foreground), not tied to playback state. This ensures users can pause content without losing their session.

```typescript
// Client sends heartbeat every 5 minutes while app is open
async function heartbeat(userId: string, sessionId: string): Promise<void> {
  // Updates the timestamp (score) 
  const updated = await redis.zadd(
    `session:${userId}:active`,
    'XX', // Only update if exists
    Math.floor(Date.now() / 1000),
    sessionId
  );

  if (updated === 0) {
    throw new SessionNotFoundError('Session was evicted or expired');
  }
  // Updates TTL
  await redis.expire(`session:${userId}:active`, 86400);
}
```

**Layer 3: Background Cleanup Job**
- Runs every 1 minute
- Removes sessions with no heartbeat for 60+ minutes
- Safety net for missed heartbeats or TTL delays
- Allows users to pause content without losing session
- Proactively cleans up zombie sessions to avoid unnecessary eviction notifications

```typescript
async function cleanupStaleSessions(): Promise<void> {
  const cutoffTime = Math.floor(Date.now() / 1000) - 3600; // 60 min ago
  const keys = await redis.keys('session:*:active');

  for (const key of keys) {
    await redis.zremrangebyscore(key, '-inf', cutoffTime);
  }
}
```

---

## Race Condition Scenarios

### 1. Concurrent Session Starts
**Problem**: User already has 1 active session, then 2 devices start at same time  
**Solution**: Lua script processes sequentially (Redis single-threaded)  
**Result**: One accepted, one triggers FIFO eviction of oldest session ✅

### 2. Double-Submit (Network Retry)
**Problem**: Client retries same request due to network timeout  
**Solution**: Client sends same `Idempotency-Key` header → Server returns cached response  
**Result**: No duplicate session, same sessionId returned ✅

**Flow**:
```typescript
// Client-side (generates idempotency key once per operation)
const idempotencyKey = crypto.randomUUID();

try {
  await fetch('/sessions/start', {
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ deviceId, deviceType })
  });
} catch (networkError) {
  // Retry with SAME idempotency key
  await fetch('/sessions/start', {
    headers: { 'Idempotency-Key': idempotencyKey }, // ← Same key
    body: JSON.stringify({ deviceId, deviceType })
  });
}

// Server checks cache first:
// - First request: Process normally, cache result for 5 min
// - Retry request: Return cached result (same sessionId)
```

### 3. Heartbeat During Eviction
**Problem**: Device A sends heartbeat while being evicted by Device B  
**Solution**: Heartbeat uses `ZADD XX` flag (only update if exists) → returns 0 if evicted  
**Result**: Device A gets 404 → Shows "Session terminated" notification ✅

### 4. Thundering Herd
**Problem**: User opens 10 tabs simultaneously  
**Solution**: Redis queues requests, processes sequentially  
**Result**: Only last 2 tabs stay active, others evicted ✅

---

## Complete Validation Flow

```
Client → Gateway → Service → Redis → SNS (async)
  ↓         ↓          ↓        ↓
  JWT     Validate   Atomic   Evict    Notify
          Extract    Lua      Oldest   Evicted
          userId     Script            Device
```

### Detailed Steps (with timing)

**1. Gateway validates JWT** (~5-10ms)
- Generate or extract `X-Request-ID` (UUID v4) for request tracing
- Verify JWT signature using cached public key
- Extract userId → Add `X-User-Id` header
- Forward `Idempotency-Key` header from client (if present)
- Add `X-Request-ID` to all downstream requests

**2. Service receives request** (~1-2ms)
```typescript
async function startSession(req: Request): Promise<Response> {
  const userId = req.headers['x-user-id']; // From Gateway
  const requestId = req.headers['x-request-id']; // From Gateway
  const idempotencyKey = req.headers['idempotency-key']; // From client
  const { deviceId, deviceType } = req.body;
  
  // Log incoming request
  logger.info('session_start_request', {
    requestId,
    userId,
    deviceId,
    deviceType,
    idempotencyKey
  });
  
  // Check idempotency cache (handles network retries)
  const cacheKey = `idempotency:${userId}:${idempotencyKey}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    logger.info('idempotency_cache_hit', { requestId, userId, idempotencyKey });
    return {
      ...JSON.parse(cached),
      headers: { 'X-Request-ID': requestId }
    };
  }
  
  // Generate new sessionId (server controls ID)
  const sessionId = `sess_${crypto.randomUUID()}`;
  
  logger.info('processing_session_start', { requestId, userId, sessionId });
  
  const result = await startSession(userId, sessionId);
  
  const response = {
    sessionId,
    expiresAt: Date.now() + 86400000,
    currentCount: result.count
  };
  
  // Cache result for 5 minutes (idempotency window)
  await redis.setex(cacheKey, 300, JSON.stringify(response));
  
  logger.info('session_start_success', {
    requestId,
    userId,
    sessionId,
    currentCount: result.count,
    evicted: result.evicted
  });
  
  return {
    ...response,
    headers: { 'X-Request-ID': requestId }
  };
}
```

**3. Atomic Redis operation** (~3-5ms)
- Execute Lua script (check + add/evict)
- Return result with evicted session if any

**4. Async notification** (~20ms, non-blocking)
```typescript
async function publishEvictionEvent(userId: string, evictedSessionId: string): Promise<void> {
  await sns.publish({
    TopicArn: SNS_TOPIC_ARN,
    Message: JSON.stringify({
      eventType: 'SESSION_EVICTED',
      userId,
      evictedSessionId,
      timestamp: Date.now()
    })
  });
  // Fire-and-forget, don't wait for delivery
}
```

**Total latency: ~10-20ms** (P99 target: <100ms)

**Response Headers**:
```http
HTTP/1.1 200 OK
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "sessionId": "sess_abc123xyz",
  "expiresAt": 1700086400,
  "currentCount": 2
}
```

**Client Usage**:
```typescript
const response = await fetch('/api/sessions/start', {
  headers: {
    'Authorization': `Bearer ${jwt}`,
    'Idempotency-Key': crypto.randomUUID()
  }
});

const requestId = response.headers.get('X-Request-ID');
// Client can log or report requestId for support: "My request ID: 550e8400-..."
```

---

## Trade-offs & Design Choices

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| **Consistency** | Strong (Lua) | Eventual | Business requirement: Never exceed 2 streams (legal) |
| **Latency** | ~5ms | ~1ms (no lock) | Acceptable for <100ms SLA, ensures correctness |
| **Notifications** | Push (SNS) | Polling | Better UX (1-3s vs 5-60s), lower cost, battery-friendly |
| **Heartbeat Interval** | 5 minutes | 30 seconds | Balances staleness detection vs Redis write load |
| **Failure Mode** | Fail closed | Fail open | License violation risk > availability (99.99% uptime) |
| **Deployment** | Fargate | Lambda | No cold starts, persistent Redis connections |
| **Idempotency** | Idempotency-Key header | Client-generated sessionId | Server controls IDs, industry standard, better security |

---

## Monitoring & Observability

### Key Metrics

**Business Metrics** (Critical)
```typescript
metrics.histogram('session.concurrent_count', currentCount);
metrics.increment('session.eviction', { reason: 'LIMIT_EXCEEDED' });
metrics.gauge('session.avg_per_user', avgSessions);
```

**Performance Metrics** (SLA)
```typescript
metrics.histogram('session.latency', latencyMs, { 
  endpoint: '/sessions/start',
  percentile: 'p99' 
});
// Alert if P99 > 100ms for 5 minutes
```

**Infrastructure Metrics**
- Redis CPU: Alert if >80%
- Redis memory: Alert if >85%
- Connection pool: Alert if >90% utilization

### Alerts

**Critical** (Page on-call)
- `concurrent_streams > 2` for 1 minute → License violation
- `error_rate > 5%` for 2 minutes → Service degradation
- `p99_latency > 200ms` for 5 minutes → SLA breach

**Warning** (Slack)
- `eviction_rate > 20%` for 10 minutes → Possible abuse
- `redis_memory > 80%` → Capacity planning needed

### Structured Logging

**All logs include `requestId` for request correlation**:

```typescript
logger.info('session_started', {
  requestId,        // ← For request tracing
  userId,
  sessionId,
  deviceType,
  currentCount,
  evicted: evictedSessionId,
  latencyMs,
  ip: clientIp
});

logger.error('redis_connection_failed', {
  requestId,        // ← For request tracing
  userId,
  sessionId,
  error: err.message,
  retries: retryCount
});

logger.warn('idempotency_cache_hit', {
  requestId,        // ← For request tracing
  userId,
  idempotencyKey,
  message: 'Network retry detected, returning cached response'
});
```

**Benefits of Request ID in Logs**:
- Trace complete request flow across services
- Correlate Gateway → Service → Redis operations
- Debug production issues by searching for specific requestId
- Client can report requestId for support tickets

### Distributed Tracing

**Correlation between Request ID and Trace ID**:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('session-enforcer');

async function startSession(userId: string, sessionId: string, requestId: string) {
  return tracer.startActiveSpan('session.start', async (span) => {
    // Add requestId to span for correlation
    span.setAttribute('request.id', requestId);
    span.setAttribute('user.id', userId);
    span.setAttribute('session.id', sessionId);
    
    const result = await tracer.startActiveSpan('redis.lua_script', async (childSpan) => {
      childSpan.setAttribute('request.id', requestId);
      return redis.eval(...);
    });
    
    if (result.evicted) {
      await tracer.startActiveSpan('sns.publish', async (childSpan) => {
        childSpan.setAttribute('request.id', requestId);
        childSpan.setAttribute('evicted.session.id', result.evicted);
        await publishEvictionEvent(...);
      });
    }
    
    span.end();
    return result;
  });
}
```

**Request ID vs Trace ID**:
- **Request ID**: Business-level identifier, returned to client, used in logs
- **Trace ID**: OpenTelemetry span ID, used for distributed tracing UI
- **Relationship**: Request ID is added as span attribute for correlation

---

## Summary

**Core Principles**:
- **Correctness First**: Lua scripts ensure atomic operations, never exceed 2 streams
- **Performance**: <100ms P99 via Redis + persistent connections
- **Reliability**: Fail closed prevents license violations, Multi-AZ Redis for 99.99% uptime
- **Scalability**: Stateless service scales horizontally, Redis handles millions of ops/sec
- **Observability**: Rich metrics/logs/traces for debugging and capacity planning

**Key Implementation Details**:
- ZSET for O(log N) operations with automatic FIFO ordering
- Single Lua script eliminates all race conditions
- 3-layer expiration catches all edge cases
- Async notifications decouple enforcement from delivery
