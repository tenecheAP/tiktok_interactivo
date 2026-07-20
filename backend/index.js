const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Módulos locales
require('./logger'); // Esto sobreescribe console.log y console.error e inicializa logs
const { loadConfig } = require('./configManager');
const { AccountPool } = require('./accountPool');
const ConnectionOrchestrator = require('./connectionOrchestrator');
const { setupRoutes } = require('./routes');
const { setupSockets } = require('./socketManager');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Exponer io globalmente (ya que muchos archivos dependen de global.io)
global.io = io;

// Inicializar configuración y gestores
loadConfig();
const giftCatalogManager = require('./giftCatalogManager');
giftCatalogManager.load();

const accountPool = new AccountPool();
const orchestrator = new ConnectionOrchestrator(accountPool);

// Inicializar Rutas y Sockets
setupRoutes(app, accountPool, orchestrator);
setupSockets(io, orchestrator);

// Cargar cuentas del pool y arrancar
accountPool.load().then(() => {
    console.log('[ACCOUNT_POOL] Cuentas cargadas:', accountPool.size());
    orchestrator.startHealthLoop();
}).catch(err => {
    console.error('[ACCOUNT_POOL] Error cargando cuentas:', err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[ERR] El puerto ${PORT} ya está en uso.`);
    } else {
        console.error('[ERR] Error del servidor HTTP:', err);
    }
    process.exit(1);
});
