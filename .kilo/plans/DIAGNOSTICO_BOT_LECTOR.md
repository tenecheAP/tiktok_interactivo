# Diagnóstico y Mejora del Bot Lector - Producción

## Estado Actual (2026-05-06)

### Análisis de Código

**BotLectorView.jsx** – Funcionalidad intacta:
- ✅ Conexión via Socket.IO al backend
- ✅ TTS con Web Speech API + queue (TtsQueue)
- ✅ Procesamiento de reglas (botRulesEngine)
- ✅ Configuración persistente en localStorage
- ✅ Simulación de eventos

**botRulesEngine.js** – Lógica FSM correcta:
- ✅ Estado de espectadores (inactive → active_reading → blocked_need_gift → exhausted)
- ✅ Activación por regalos específicos (activationGiftNames)
- ✅ Continuación por regalos de continuación (continuationGiftNames)
- ✅ Límites por sesión (maxCommentsPerViewerSession) y por bloque (commentsPerBlock)
- ✅ VIP boost por valor de regalo o nombre

**Socket client** – Conexión estable:
- ✅ Reintentos automáticos (10 intentos, 1s delay)
- ✅ Fallback transports: ['websocket', 'polling']

## Problemas Identificados (Potenciales)

1. **Missing error boundary** – Si TtsQueue falla, no hay recuperación
2. **No heartbeat monitoring** – Si el backend se cae, el bot no detecta inmediatamente
3. **viewerMapRef no sincroniza bien con estado** – Posible race condition en actualizaciones
4. **TtsQueue.flush() solo en unmount** – Deberíaalso en errores de conexión
5. **No hay fallback TTS alternativo** – Si Web Speech API falla (común en Chrome), no hay audio
6. **Configuración no validada** – Si el usuario configura valores inválidos, el bot se rompe silenciosamente
7. **Latencia TTS no medida** – No hay métricas de tiempo entre evento y reproducción

## Mejoras Críticas a Implementar

### 1. Robustez de Conexión (P1)
- [ ] Agregar `socket.on('disconnect')` y `socket.on('reconnect')` handlers
- [ ] Mostrar estado de reconnect en UI (contador de intentos)
- [ ] Auto-reintento de conexión con backoff exponencial

### 2. TTS Failover (P1)
- [ ] Implementar `AudioContext` synth como fallback si `speechSynthesis` falla
- [ ] Cola de emergencia que preserve utterances pendientes
- [ ] Logging de errores TTS (speechSynthesis.onerror)

### 3. Validación de Config (P2)
- [ ] Rango validation: commentsPerBlock ≥ 1, maxCommentsPerViewerSession ≥ commentsPerBlock
- [ ] Sanitización: gift names lowercase y trimmed
- [ ] Mostrar advertencia si valores son inconsistentes

### 4. ViewerMap Consistency (P2)
- [ ] Usar `useState` + `useRef` sincronizados correctamente
- [ ] Persistir viewerMap en `sessionStorage` para recuperación tras refresco
- [ ] Límite de entradas (ej: máximo 500 espectadores) para evitar memory leak

### 5. Logging & Observability (P2)
- [ ] Enviar logs al backend (evento `bot_log`) para centralización
- [ ] Contador de eventos procesados (gifts/chats) y TTS utterances
- [ ] Métricas de latencia: t_event_arrival → t_tts_start

### 6. UI/UX (P3)
- [ ] Indicador visual de "Bot Activo" parpadeante cuando lee
- [ ] Estadísticas en tiempo real: total leídos, pendientes en cola
- [ ] Botón "Pausar todo" (incluye TTS y logs)
- [ ] Export de configuración/estado a JSON

### 7. Seguridad (P3)
- [ ] Sanitizar nicknames antes de TTS (evitar XSS en utterances)
- [ ] Limitar longitud máxima de comentario leído (ej: 200 chars)
- [ ] Bloquear palabras ofensivas (list negra configurable)

---

## Plan de Ejecución

1. **Día 1**: Robustez de Conexión + TTS Failover (P1)
2. **Día 2**: Validación + ViewerMap Consistency (P2)
3. **Día 3**: Logging & Observability (P2)
4. **Día 4**: UI/UX improvements (P3) + pruebas integrales

---

## Criterios de Éxito

- Bot lector no falla tras 1 hora de streaming con 100+ espectadores
- TTS turnaround < 2s desde evento hasta audio
- Conexión se recupera automáticamente tras caída de red (3G → WiFi)
- No memory leaks (heap estable en Chrome DevTools)

---

**Estado:** En espera de aprobación para ejecución
