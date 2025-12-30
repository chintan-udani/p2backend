const { authGuard } = require('../middleware');
const controllers = require('../controllers/controllers');

module.exports = async function (fastify, opts) {
  'use strict';
  const { wsHub } = opts || {};

  // --- Health & Auth ---
  fastify.get('/health', async () => ({ ok: true }));
  fastify.post('/auth/register', controllers.auth_register);
  fastify.post('/auth/login', controllers.auth_login);
  fastify.get('/auth/me', { preHandler: authGuard }, controllers.auth_me);
  fastify.post('/auth/logout', { preHandler: authGuard }, controllers.auth_logout);

  // --- Channels ---
  fastify.get('/channels', { preHandler: authGuard }, controllers.channels_list);
  fastify.post('/channels', { preHandler: authGuard }, controllers.channels_create);

  // --- Messages ---
  fastify.get('/messages/:channelId', { preHandler: authGuard }, controllers.messages_listByChannel);
  fastify.post('/messages/:channelId', { preHandler: authGuard }, (req, reply) => 
    controllers.messages_send(req, reply, { wsHub })
  );
  fastify.post('/messages/:messageId/unlock', { preHandler: authGuard }, (req, reply) => 
    controllers.messages_unlock(req, reply, { wsHub })
  );

  // --- Wallet ---
  fastify.get('/wallet/balance', { preHandler: authGuard }, controllers.wallet_balance);
  fastify.post('/wallet/add', { preHandler: authGuard }, controllers.wallet_addFunds);

  
 
};
