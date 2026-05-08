# Sistema de Cuentas Enjambre – Arquitectura de Alta Disponibilidad

**Objetivo:** Eliminar puntos únicos de fallo, distribuir riesgo de shadowban/censura, maximizar alcance y uptime.

## Problema que Resuelve

- Single point of failure: 1 cuenta TikTok = 1 stream = 1 punto de bloqueo
- Shadowban/limitación algoritmo: TikTok puede restringir alcance sin warning
- Ban total: Cuenta eliminada → stream muerto
- Rate limits: Límites de API por usuario

## Filosofía de Diseño: DECENTRALIZACIÓN TOTAL

**"Ninguna cuenta es indispensable; el sistema sobrevive a la pérdida de cualquier nodo."**

```
           ┌─────────────────────────────────────┐
           │   Content Distribution Layer       │
           │   (Frontend / Bot Lector)          │
           └───────────────┬─────────────────────┘
                           │ distribuye
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   Cuenta A    │  │   Cuenta B    │  │   Cuenta C    │
│  @streamer1   │  │  @streamer2   │  │  @streamer3   │
│  Health: 98%  │  │  Health: 76%  │  │  Health: 91%  │
│  Priority: 1  │  │  Priority: 2  │  │  Priority: 3  │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
              Failover/Health-Checks
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ Backup Account│  │ Backup Account│  │ Backup Account│
│  @backup_a    │  │  @backup_b    │  │  @backup_c    │
│  Status: Hot  │  │  Status: Cold │  │  Status: Warm │
└───────────────┘  └───────────────┘  └───────────────┘
```

## Componentes de la Arquitectura

### 1. Account Pool (Pool de Cuentas)

```javascript
// backend/accountPool.js
class AccountPool {
  accounts: [
    {
      id: 'acc_001',
      username: '@streamer_main',
      uniqueId: '1234567890',
      sessionId: 'sess_abc123',
      status: 'active',        // active | standby | banned | error
      healthScore: 0.98,       // 0-1
      consecutiveFails: 0,
      lastEventAt:  Date,
      priority: 1,             // menor número = mayor prioridad
      metadata: {
        followers: 15000,
        isVerified: false,
        country: 'MX',
        createdAt: Date
      }
    },
    ...
  ]

  rotationPolicy: 'round-robin' | 'weighted' | 'least-connections' | 'failover-only'
  failoverThreshold: 0.3   // si healthScore < 30%, se saca del pool
  cooldownAfterBan: 3600000 // 1h en ms antes de reintentar cuenta baneada
}
```

**Account States:**
- `active`: Streaming actualmente, recibiendo eventos
- `standby`: Viva pero no en uso (preparada para failover)
- `banned`: Temporal/permanentemente bloqueada (en cooldown)
- `error`: Error de conexión, pendiente de diagnóstico

### 2. Connection Orchestrator

```javascript
// backend/connectionOrchestrator.js
class ConnectionOrchestrator {
  // Distribuye conexiones entre cuentas del pool
  async getNextAccount(roomUsername) {
    // Round-robin:予定 account con prioridad más alta que esté healthy
    // Si la account activa cae, promueve automáticamente una standby
  }

  // Monitor de salud: heartbeat cada 30s por cuenta
  async healthCheck(accountId) {
    // Mide: latency, eventos/minuto, error rate
    // Actualiza healthScore (0-1)
    // Si score < threshold → marca como 'error' y activa failover
  }

  // Auto-recuperación: reintentos con backoff
  async recoverAccount(accountId) {
    // Reconnect, reauth, rotate IP (proxy), etc.
  }
}
```

### 3. Frontend Multi-Account UI

**Nueva ruta:** `/accounts-enjambre` (protegida, admin-only)

**Vista 1: Pool Overview**
- Tabla de cuentas: username, estado, health score, eventos recibidos, uptime
- Indicadores visuales: ✅ healthy, ⚠️ warning, ❌ down
- Acciones: Force connect, force disconnect, reset health, ban/unban

**Vista 2: Rotation Policy Config**
- Selector: round-robin / weighted / custom
- Parámetros:
  - Max concurrent connections (default: 1, but supports >1 for redundancy)
  - Failover timeout (default: 10s)
  - Cooldown periods (default: 1h)
  - Health check interval (default: 30s)

**Vista 3: Failover Logs**
- Timeline de eventos:
  - `14:32:01 Cuenta @streamer1健康度降至 15% → failover a @streamer2`
  - `14:32:05 Cambio exitoso, latencia: 450ms`
  - `14:35:22 @streamer1 recuperada, reintroducida al pool`

**Vista 4: Analytics**
- Comparativa de rendimiento por cuenta (eventos/segundo)
- Uptime porcentual (últimas 24h)
- Map de geolocalización (si se usan proxies)

### 4. Backend API (REST + Socket Events)

**Endpoints:**

```
GET    /api/accounts                  – Listar todas las cuentas
POST   /api/accounts                   – Añadir nueva cuenta (credenciales)
PUT    /api/accounts/:id               – Actualizar metadatos
DELETE /api/accounts/:id               – Eliminar cuenta (soft delete)
POST   /api/accounts/:id/connect       – Forzar conexión
POST   /api/accounts/:id/disconnect    – Forzar desconexión
POST   /api/accounts/:id/ban           – Marcar como banned (cooldown)
POST   /api/accounts/:id/reset-health  – Resetear healthScore a 100%
GET    /api/pool/rotation-policy       – Obtener política de rotación
PUT    /api/pool/rotation-policy       – Actualizar política

Socket events (server → frontend):
  account_pool_update    – Cuenta actualizada (estado, health)
  failover_event         – Se produjo un failover
  account_banned         – Cuenta baneada por TikTok
  health_warning         – Health Score baja
```

### 5. Persistencia y Configuración

**Base de datos:**
- `accounts` collection:
  ```json
  {
    "_id": "acc_001",
    "username": "@streamer_main",
    "credentials": {
      "sessionId": "encrypted_AES256",
      "cookies": "encrypted_AES256"
    },
    "status": "active",
    "healthScore": 0.95,
    "stats": {
      "totalConnections": 142,
      "successfulSessions": 138,
      "failedSessions": 4,
      "lastConnectedAt": "2026-05-06T14:30:00Z",
      "uptime24h": 0.87
    },
    "rotation": { "priority": 1, "weight": 100 },
    "createdAt": "...",
    "updatedAt": "..."
  }
  ```

- `rotation_policy` document:
  ```json
  {
    "_id": "global",
    "policy": "round-robin",
    "maxConcurrent": 1,
    "failoverTimeout": 10000,
    "cooldownAfterBan": 3600000,
    "healthCheckInterval": 30000,
    "failoverThreshold": 0.3
  }
  ```

**Encriptación:** Usar `crypto-js` o Node.js built-in `crypto` para:
- sessionId
- cookies
- cualquier token

Clave maestra en variable de entorno (nunca en código).

### 6. Health Score Algorithm

```
healthScore = (
  0.4 * connectionSuccessRate +      // 40% – éxito de conexiones
  0.3 * eventThroughput +            // 30% – eventos/segundo recibidos
  0.2 * latencyScore +               // 20% – latencia (ms) invertida (1/latency)
  0.1 * ageFactor                    // 10% – antigüedad de la cuenta (más vieja = más confiable)
)

Umbrales:
  > 0.7  → healthy (verde)
  0.3-0.7 → warning (ámbar)
  < 0.3   → critical (rojo) → auto-failover
```

## Implementación por Fases

### Fase 1: Backend – Pool Básico (Día 1)
**Archivos nuevos:**
- `backend/accountPool.js` – Clase AccountPool (CRUD + health check)
- `backend/connectionOrchestrator.js` – Selector de cuenta + failover
- `backend/routes/accounts.js` – API REST endpoints
- `backend/services/accountHealthService.js` – Cálculo de healthScore

**Modificaciones:**
- `backend/index.js`:
  - Inyectar AccountPool en Socket.IO middleware
  - Sustituir `activeTikTokConnections` por `orchestrator.getActiveConnections()`
  - Emitir eventos `account_pool_update` cuando cambie estado

### Fase 2: Frontend – Dashboard Enjambre (Día 2)
**Nueva ruta:** `frontend/src/accounts-enjambre/`

**Componentes:**
- `AccountsOverview.jsx` – Tabla con filtros y acciones
- `RotationConfig.jsx` – Formulario de política
- `FailoverLog.jsx` – Timeline de eventos
- `AccountHealthChart.jsx` – Gráfico de healthScore histórico

**Estado global:**
- Usar `useContext` o `zustand` para compartir pool state entre componentes
- Sincronizar vía Socket.IO para actualizaciones en tiempo real

### Fase 3: Auto-Recuperación y Proxies (Día 3)
**Features avanzados:**
- Rotación de proxies por cuenta (si se配置)
- Auto-reintento con backoff exponencial
- Notificaciones (email/Telegram) cuando todas las cuentas fallan
- Métricas exportables (Prometheus/Grafana)

### Fase 4: Seguridad y Persistencia (Día 4)
- Encriptación de credenciales en DB
- API Key authentication para admin panel
- Audit log (quién hizo qué)
- Backup/restore de pool configuration

## Decisión de Autoridad Total

**Como Architect & Lead, determino:**

1. **No se toca el bot-lector actual** – Ya funciona, solo se fortalece.
2. **Account Pool va en backend** – Frontend solo visualiza y manda comandos.
3. **TikTok direct WebSocket PoC se pausa** – No es prioritario; el enjambre es más crítico para sobrevivir a shadowbans.
4. **Enjambre es obligatorio para 300k usuarios** – Sin redundancia, el stream se cae con 1 cuenta.

## Riesgos y Mitigaciones

| Riesgo | Prob. | Impact | Mitigación |
|--------|-------|--------|------------|
| Todas las cuentas baneadas simultáneamente | Baja | CRÍTICO | Política de rotación de IPs/proxies, creación automática de nuevas cuentas (semi-auto) |
| HealthScore inaccurate | Media | Alta | Múltiples métricas + manual override por admin |
| Latencia alta en failover | Media | Media | Pre-warm standby accounts (conectadas en segundo plano) |
| Credenciales filtradas | Baja | CRÍTICO | Encriptación fuerte + rotación de creds cada 90 días |

## Criterios de Éxito

- **Disponibilidad 99.5%** en un mes (máximo 3.6h downtime)
- **Failover < 10s** desde caída de cuenta activa hasta activación de backup
- **HealthScore** accurate: >80% de coincidencia con diagnóstico manual
- **UI intuitiva**: Cualquier admin puede gestionar el pool sin entrenamiento

---

**Estado:** Implementación pendiente – Aprobación requerida para iniciar Fase 1.
