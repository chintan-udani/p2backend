require('dotenv').config();

const fastify = require('fastify')({ logger: true });
const mongoose = require('mongoose');

// Plugins
const fastifyCookie = require('@fastify/cookie');
const fastifyCors = require('@fastify/cors');
fastify.register(require('@fastify/websocket'))

const wsHub = (() => {
  const channels = new Map();
  const ensure = (id) => {
    const key = String(id || '').trim();
    if (!key) return null;
    if (!channels.has(key)) channels.set(key, new Set());
    return key;
  };
  const subscribe = (id, socket) => {
    const key = ensure(id);
    if (!key) return;
    const set = channels.get(key);
    set.add(socket);
    socket.on('close', () => {
      set.delete(socket);
      if (set.size === 0) channels.delete(key);
    });
    socket.on('error', () => {
      try { socket.close(); } catch {}
    });
  };
  const broadcast = (id, event, payload) => {
    const key = String(id || '').trim();
    const set = channels.get(key);
    if (!set || set.size === 0) return;
    const msg = JSON.stringify({ event, payload });
    for (const s of set) {
      if (s.readyState === 1) {
        try { s.send(msg); } catch {}
      }
    }
  };
  return { subscribe, broadcast };
})();

/* -----------------------------------------
   CORS + Cookies
----------------------------------------- */
const FRONTEND_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:9002";

fastify.register(fastifyCookie, {
  secret: process.env.COOKIE_SECRET || "super-secret-key",
  hook: "onRequest",
});

fastify.register(fastifyCors, {
  origin: FRONTEND_ORIGIN,
  credentials: true, // required for cookies
});

fastify.register(async function (fastify) {
  fastify.get('/hellooo', { websocket: true }, (socket /* WebSocket */, req /* FastifyRequest */) => {
    socket.on('message', message => {
      // message.toString() === 'hi from client'
      socket.send('hi from server')
    })
  })
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    const { channelId } = req.query || {};
    const ch = String(channelId || '').trim();
    if (!ch) {
      try { socket.send(JSON.stringify({ event: 'error', payload: { message: 'Missing channelId' } })); } catch {}
      try { socket.close(); } catch {}
      return;
    }
    wsHub.subscribe(ch, socket);
    try { socket.send(JSON.stringify({ event: 'connected', payload: { channelId: ch } })); } catch {}
  })
})
/* -----------------------------------------
   Register Application Routes
----------------------------------------- */
const registerRoutes = require('./routes/routes');
registerRoutes(fastify, { wsHub });

/* -----------------------------------------
   Start server + DB
----------------------------------------- */
async function start() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    fastify.log.error("❌ Missing MONGO_URI in environment variables");
    process.exit(1);
  }

  // Connect MongoDB
  try {
    await mongoose.connect(mongoUri, { autoIndex: true });
    fastify.log.info("✅ Connected to MongoDB");
  } catch (err) {
    fastify.log.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }

  const PORT = Number(process.env.PORT || 4000);
  const HOST = process.env.HOST || "0.0.0.0";

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`🚀 API Server running at http://${HOST}:${PORT}`);
    fastify.log.info(`🔗 CORS Allowed Origin: ${FRONTEND_ORIGIN}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Only run when executed directly
if (require.main === module) {
  start();
}

module.exports = fastify;
