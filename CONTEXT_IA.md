# 🧠 Contexto para IA: TikTok Live Interactive Ecosystem

Este documento sirve como guía maestra para cualquier IA que trabaje en este proyecto. Describe la arquitectura, lógica de negocio y reglas técnicas fundamentales.

## 🚀 Visión General
El proyecto es un ecosistema interactivo en tiempo real que conecta eventos de **TikTok Live** con actuadores físicos (vía **ESP32**) y una interfaz web profesional.

### Stack Tecnológico
- **Backend**: Node.js + Express + Socket.io + `tiktok-live-connector`.
- **Frontend**: React + Vite + Tailwind CSS + Lucide Icons.
- **Hardware**: ESP32 (firmware en C++/Arduino) comunicado vía WebSockets.

---

## 🏗️ Arquitectura de Comunicación
El flujo de datos sigue este orden estrictamente para garantizar latencia <1s:
1. **TikTok**: Emite eventos públicos (regalos, likes, follows).
2. **Backend**: Captura eventos, filtra según la configuración y gestiona **Colas de Actuadores**.
3. **Frontend / ESP32**: Reciben comandos vía Socket.io simultáneamente.

---

## 🛠️ Módulos Críticos

### 1. Sistema de Colas y Persistencia (Backend)
Para evitar que el hardware se bloquee con múltiples regalos simultáneos, el backend implementa una cola asíncrona por cada actuador (`relay_1`, `relay_2`, etc.).
- **Archivo**: `backend/index.js`
- **Persistencia**: La configuración se guarda automáticamente en `backend/config.json`. Si el servidor se reinicia, los mapeos se restauran.
- **Lógica**: `addToQueue()` añade el evento y `processQueue()` lo ejecuta respetando el `duration` configurado.

### 2. Panel de Configuración Pro (Frontend)
Permite mapear eventos a acciones físicas con feedback visual de estado.
- **Modo Live**: Al conectar, el sidebar izquierdo cambia automáticamente para mostrar el flujo de regalos en tiempo real.
- **Optimistic UI**: Cualquier cambio en el panel de configuración se refleja instantáneamente.
- **Sincronización**: Usa **Debounce (800ms)** y cuenta con un botón de **Restablecer** para volver a la configuración inicial.
- **ESP32 Status**: El dashboard incluye un indicador visual del estado de conexión del hardware.

### 3. Motor de Audio Sintético
Debido a restricciones de CORS/ORB, no se usan archivos `.mp3` externos. El audio se genera en tiempo real usando la **Web Audio API**.
- **Función**: `playEventSound()` en `App.jsx`.

---

## 📜 Reglas para la IA (Instrucciones de Desarrollo)

1. **Persistencia de Configuración**: Actualmente la configuración reside en memoria en el backend. Al agregar persistencia, usar archivos `.json` locales.
2. **Optimistic UI**: Cualquier cambio en el panel de configuración debe reflejarse instantáneamente en el estado local del React antes de enviarse al backend.
3. **Eventos de TikTok**: Siempre verificar si el regalo tiene un mapeo por **Nombre** o por **Rango de Valor (Monedas)** antes de descartarlo.
4. **Seguridad**: No requerir claves de TikTok; la API es pública basada en el `username`.
5. **Hardware**: Los comandos enviados al ESP32 deben ser JSON simples con `action` y `duration`.

---

## 📂 Estructura de Archivos
- `/backend/index.js`: Motor central, colas y conexión TikTok.
- `/frontend/src/App.jsx`: Dashboard Pro, configuración y audio.
- `/esp32/esp32_websocket.ino`: Firmware para control de GPIOs.

---

*Nota: Mantener este archivo actualizado tras cambios estructurales importantes.*
