import { io } from 'socket.io-client';

/**
 * URL del servidor Socket.IO:
 * - Dev (Vite): mismo origen → proxy en vite.config.js hacia :3000
 * - Prod / preview: backend en :3000 (o VITE_SOCKET_URL si lo defines en .env)
 */
function getSocketUrl() {
  const explicit = import.meta.env.VITE_SOCKET_URL;
  if (explicit) return explicit;

  if (import.meta.env.DEV) {
    const h = window.location.hostname;
    return `http://${h}:3000`;
  }

  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') {
    return 'http://127.0.0.1:3000';
  }
  return `http://${h}:3000`;
}

export const socket = io(getSocketUrl(), {
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
});

export default socket;
