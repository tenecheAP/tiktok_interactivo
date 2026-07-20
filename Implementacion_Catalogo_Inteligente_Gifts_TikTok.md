# Implementación del Catálogo Inteligente de Regalos TikTok Live

## Objetivo

Implementar un catálogo inteligente de regalos que mantenga sincronizada
automáticamente la información de todos los regalos detectados durante
los Lives de TikTok, respetando la arquitectura existente del proyecto.

## Contexto del proyecto

-   Backend: Node.js + Express
-   Comunicación: Socket.io
-   Integración: `tiktok-live-connector`
-   Frontend: React + Vite
-   Persistencia: archivos JSON
-   Hardware: ESP32 mediante WebSockets
-   Arquitectura modular con QueueManager y configuración persistente.

**No romper ninguna funcionalidad existente.**

## Arquitectura

Crear:

``` text
backend/giftCatalogManager.js
```

Será el único responsable del catálogo de regalos.

## Persistencia

Crear automáticamente:

``` text
backend/gifts.json
```

Ejemplo:

``` json
[
  {
    "id":5655,
    "name":"Rose",
    "diamonds":1,
    "icon":"https://...",
    "description":"",
    "type":1,
    "repeatable":true,
    "firstSeen":"...",
    "lastSeen":"...",
    "timesReceived":250,
    "lastModified":"..."
  }
]
```

## Integración

Interceptar únicamente los eventos `gift` provenientes de
`tiktok-live-connector`.

Extraer todos los datos disponibles:

-   giftId
-   name
-   diamondCount
-   describe
-   icon
-   iconLarge
-   giftType
-   repeatCount
-   repeatEnd
-   combo
-   isFree
-   region
-   demás campos disponibles

Enviar la información al `GiftCatalogManager`.

## Lógica

-   Si el regalo no existe: insertarlo.
-   Si existe: comparar todos los campos y actualizar solo los
    modificados.
-   Actualizar `lastSeen` y `lastModified`.
-   Incrementar `timesReceived`.

## Escritura inteligente

No guardar el JSON por cada evento.

Implementar un buffer:

1.  Marcar cambios (`dirty=true`).
2.  Esperar 5 segundos.
3.  Guardar una sola vez.
4.  Limpiar estado (`dirty=false`).

## API pública

-   load()
-   save()
-   updateGift()
-   getGift()
-   getAll()
-   exists()
-   search()
-   exportCSV()
-   exportJSON()
-   stats()

## Estadísticas

Calcular automáticamente:

-   Total de regalos.
-   Regalo más enviado.
-   Regalo con más diamantes.
-   Diamantes acumulados.
-   Promedio de diamantes.
-   Primer regalo detectado.
-   Último regalo detectado.

## Frontend

Agregar una vista **Gift Catalog** con:

-   Imagen
-   Nombre
-   Gift ID
-   Diamantes
-   Veces recibido
-   Primera aparición
-   Última aparición
-   Última modificación

Agregar:

-   búsqueda por nombre y Gift ID.
-   ordenamiento.
-   filtros.

## Socket.io

Emitir:

``` text
gift_catalog_updated
```

Actualizar el frontend en tiempo real sin polling.

## Exportación

Permitir exportar:

-   gifts.json
-   gifts.csv

## Compatibilidad futura

Preparar el módulo para:

-   múltiples cuentas TikTok
-   múltiples Lives
-   SQLite
-   PostgreSQL
-   MySQL
-   Redis
-   Dashboard Web
-   API REST
-   IA y estadísticas históricas

## Restricciones

No modificar el comportamiento de:

-   QueueManager
-   AccountPool
-   ConnectionOrchestrator
-   SocketManager
-   ESP32
-   Web Audio API
-   Dashboard existente

## Calidad

-   Código modular.
-   async/await.
-   Manejo de errores.
-   Sin duplicación.
-   Logs claros.
-   Reutilizar utilidades existentes.
-   Mantener latencia \< 1 segundo.

## Entregable

Al finalizar, mostrar:

-   Archivos creados.
-   Archivos modificados.
-   Justificación técnica.
-   Mejoras futuras.
