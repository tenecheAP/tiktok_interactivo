# TikTok Live Interactive System

Este proyecto permite conectar eventos de TikTok Live con el mundo físico mediante un ESP32 y una interfaz web moderna.

## Características principales
- **Latencia ultra-baja (<1s)**: Comunicación directa vía WebSockets.
- **Clasificación de usuarios**: Diferenciación entre seguidores, fans y súper fans.
- **Mapeo flexible**: Configuración de qué evento dispara qué actuador o sonido.
- **Dashboard en tiempo real**: Visualización de eventos y estado de conexión.

## Estructura del Proyecto
- `/backend`: Servidor Node.js (Motor de eventos y conector TikTok).
- `/frontend`: Interfaz de usuario en React.
- `/esp32`: Firmware para el microcontrolador.

## Instrucciones de Instalación

### 1. Backend
```bash
cd backend
npm install
node index.js
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

### 3. ESP32
1. Abre `esp32/esp32_websocket.ino` en el IDE de Arduino.
2. Configura tu SSID y Password de WiFi.
3. Configura la IP de tu ordenador donde corre el backend.
4. Instala las librerías `WebSockets` y `ArduinoJson`.
5. Sube el código a tu ESP32.

## Mapeo de Eventos (Configuración)
Por defecto, el sistema viene con los siguientes mapeos:
- **Regalo (Gift)**: Activa el relé 1 y reproduce `gift.mp3`.
- **Like (100+)**: Pulsa el LED interno y reproduce `like.mp3`.
- **Seguir (Follow)**: Mueve un servo y reproduce `welcome.mp3`.

## Gamificación
El sistema detecta automáticamente el nivel del usuario basándose en sus insignias y valor de los regalos, permitiendo efectos visuales (colores de LED) diferenciados.
