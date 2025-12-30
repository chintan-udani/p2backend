const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User, Channel, Message, Transaction } = require('../models');
const services = require('../services');

// Password helpers without external deps
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
    .toString('hex');
    console.log(salt, hash);
  return { salt, hash };
}

function verifyPassword(inputPassword, storedSalt, storedHash) {
  if (!inputPassword || !storedSalt || !storedHash) return false;

  // We DO NOT compare the salt. 
  // We USE the stored salt to hash the input password.
  const hashAttempt = crypto
    .pbkdf2Sync(inputPassword, storedSalt, 100000, 64, 'sha512')
    .toString('hex');

    
    console.log("hashAttempt:", hashAttempt);
    
  // Compare the calculated hash with the stored hash from DB
  return hashAttempt === storedHash;
}

function createToken(user) {
  const payload = {
    uid: user._id.toString(),
    email: user.email,
    username: user.username,
    role: user.role,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function cookieHeaderForToken(token) {
  const cookieName = process.env.AUTH_COOKIE_NAME || 'lockchat_token';
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  const secure = String(process.env.COOKIE_SECURE || 'true') === 'true';
  const sameSite = process.env.COOKIE_SAMESITE || 'None';
  // Building Set-Cookie manually to avoid extra plugins
  const parts = [
    `${cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite}`,
    'HttpOnly',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

async function auth_register(req, reply) {
  const { email, username, password, role } = req.body || {};
  if (!email || !username || !password) {
    return reply.code(400).send({ error: 'Missing fields' });
  }

  const existing = await services.getSingleDocument(User, { email });
  if (existing) {
    return reply.code(409).send({ error: 'Email already registered' });
  }

  const { salt, hash } = hashPassword(password);
  const user = await services.addData(User, {
    email,
    username,
    passwordHash: hash,
    passwordSalt: salt,
    role: role === 'admin' ? 'admin' : 'user',
  });
  const token = createToken(user);
  reply.header('Set-Cookie', cookieHeaderForToken(token));
  return reply.send({ user: { id: user._id, email: user.email, username: user.username, role: user.role, balance: user.balance } });
}

async function auth_login(req, reply) {
  const { email, username, password } = req.body || {};
  
  if ((!email && !username) || !password) {
    return reply.code(400).send({ error: 'Missing fields' });
  }

  // 1. Find the user
  const query = email ? { email } : { username };
  
  // Note: If your Mongoose schema has { select: false } on password fields, 
  // you might need to explicitly select them here. 
  // Assuming services.getSingleDocument returns the raw doc or lean doc:
  const user = await services.getSingleDocument(User, query);

  // 2. Check if user exists
  if (!user) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }

  // 3. Check status
  if (user.status === 'disabled') {
    return reply.code(403).send({ error: 'Account disabled' });
  }

  // 4. Verify Password
  // We pass the Input Password, the Stored Salt, and the Stored Hash
  console.log(password, user.passwordSalt);
  const isValid = verifyPassword(password, user.passwordSalt, user.passwordHash);

  if (!isValid) {
    console.log(`Login failed for ${user.username}. Hash mismatch.`);
    return reply.code(401).send({ error: 'Invalid credentials' });
  }

  // 5. Success - Set Cookie and Return User
  const token = createToken(user);
  reply.header('Set-Cookie', cookieHeaderForToken(token));
  
  return reply.send({ 
    user: { 
      id: user._id, 
      email: user.email, 
      username: user.username, 
      role: user.role, 
      balance: user.balance, 
      status: user.status 
    } 
  });
}

async function auth_me(req, reply) {
  const user = req.user;
  return reply.send({ user: { id: user._id, email: user.email, username: user.username, role: user.role, balance: user.balance } });
}

async function auth_logout(req, reply) {
  const cookieName = process.env.AUTH_COOKIE_NAME || 'lockchat_token';
  const secure = String(process.env.COOKIE_SECURE || 'true') === 'true';
  const sameSite = process.env.COOKIE_SAMESITE || 'None';
  const parts = [
    `${cookieName}=; Path=/`,
    'Max-Age=0',
    `SameSite=${sameSite}`,
    'HttpOnly',
  ];
  if (secure) parts.push('Secure');
  reply.header('Set-Cookie', parts.join('; '));
  return reply.send({ ok: true });
}

// Channels
async function channels_list(request, reply) {
  const channels = await services.getData(Channel, {}, { sort: { createdAt: -1 }, lean: true });
  return reply.send({ channels });
}

async function channels_create(request, reply) {
  if (!request.isAdmin) return reply.code(403).send({ error: 'Forbidden' });
  const { name, description } = request.body || {};
  if (!name) return reply.code(400).send({ error: 'Missing name' });
  const exists = await services.getSingleDocument(Channel, { name });
  if (exists) return reply.code(409).send({ error: 'Channel exists' });
  const channel = await services.addData(Channel, { name, description, createdBy: req.user._id });
  return reply.send({ channel });
}

// Messages
async function messages_listByChannel(req, reply) {
  const { channelId } = req.params;
  const populate = [{ path: 'sender', select: 'username role' }];
  if (req.isAdmin) populate.push({ path: 'unlockedBy', select: 'username email role' });
  const msgs = await services.getData(
    Message,
    { channel: channelId },
    { sort: { createdAt: -1 }, populate, lean: true }
  );
  let allUsers = [];
  if (req.isAdmin) {
    allUsers = await services.getData(User, { status: 'active' }, { select: 'username email role', lean: true });
  }
  const userId = req.user._id.toString();
  // Hide content for locked messages unless unlocked by the user
  const safe = msgs.map((m) => {
    const unlocked = Array.isArray(m.unlockedBy) && m.unlockedBy.map((x) => x.toString()).includes(userId);
    const senderId = (m.sender && m.sender._id ? m.sender._id.toString() : (m.sender ? m.sender.toString() : '')) || '';
    const isAuthor = senderId === userId;
    const unlockedIds = new Set(Array.isArray(m.unlockedBy) ? m.unlockedBy.map((x) => (x._id ? x._id.toString() : x.toString())) : []);
    const notUnlockedUsers = req.isAdmin
      ? (allUsers || []).filter(u => !unlockedIds.has(u._id ? u._id.toString() : ''))
      : undefined;
    return {
      id: m._id,
      channel: m.channel,
      sender: m.sender,
      imageData: m.imageData || null,
      isLocked: m.isLocked,
      lockPrice: m.lockPrice,
      createdAt: m.createdAt,
      content: m.isLocked && !(unlocked || isAuthor) ? null : m.content,
      unlockedByCount: Array.isArray(m.unlockedBy) ? m.unlockedBy.length : 0,
      unlockedByIds: Array.isArray(m.unlockedBy) ? m.unlockedBy.map((x) => (x._id ? x._id.toString() : x.toString())) : [],
      unlockedByUsers: req.isAdmin ? (Array.isArray(m.unlockedBy) ? m.unlockedBy.map(u => ({ id: u._id || u, username: u.username, email: u.email })) : []) : undefined,
      notUnlockedUsers: req.isAdmin ? (notUnlockedUsers || []).map(u => ({ id: u._id || u, username: u.username, email: u.email })) : undefined,
    };
  });
  return reply.send({ messages: safe });
}

async function messages_send(req, reply, deps) {
  const { channelId } = req.params;
  const { content, isLocked = false, lockPrice = 0, imageData } = req.body || {};
  if (!content) return reply.code(400).send({ error: 'Missing content' });
  const msg = await services.addData(Message, {
    channel: channelId,
    sender: req.user._id,
    content,
    imageData,
    isLocked: !!isLocked,
    lockPrice: Number(lockPrice || 0),
  });
  if (deps?.wsHub) {
    // Use persisted message.channel to avoid mismatch with param casing/format
    deps.wsHub.broadcast(msg.channel.toString(), 'message:new', {
      id: msg._id,
      channel: msg.channel.toString(),
      sender: { id: req.user._id, username: req.user.username, role: req.user.role },
      imageData: msg.imageData || null,
      isLocked: msg.isLocked,
      lockPrice: msg.lockPrice,
      content: msg.isLocked ? null : msg.content,
      createdAt: msg.createdAt,
    });
  }
  return reply.send({ message: msg });
}

async function messages_unlock(req, reply, deps) {
  const { messageId } = req.params;
  const message = await services.getSingleDocument(Message, { _id: messageId });
  if (!message) return reply.code(404).send({ error: 'Message not found' });
  if (!message.isLocked) return reply.send({ ok: true, unlocked: true });

  // Check balance
  const price = Number(message.lockPrice || 0);
  const user = await services.getSingleDocument(User, { _id: req.user._id });
  if ((user.balance || 0) < price) return reply.code(402).send({ error: 'Insufficient balance' });

  // Deduct and record transaction
  user.balance = Number(user.balance) - price;
  await user.save();
  await services.addData(Transaction, {
    user: user._id,
    amount: price,
    type: 'debit',
    description: `Unlock message ${messageId}`,
  });

  // Mark unlocked
  message.unlockedBy = message.unlockedBy || [];
  const uidStr = req.user._id.toString();
  if (!message.unlockedBy.map((x) => x.toString()).includes(uidStr)) {
    message.unlockedBy.push(req.user._id);
    await message.save();
  }

  if (deps?.wsHub) {
    deps.wsHub.broadcast(message.channel.toString(), 'message:unlock', {
      messageId: message._id.toString(),
      userId: uidStr,
    });
  }

  return reply.send({ ok: true });
}

// Wallet
async function wallet_balance(req, reply) {
  const { balance } = await services.getSingleDocument(User, { _id: req.user._id }, { select: 'balance', lean: true });
  const txs = await services.getData(Transaction, { user: req.user._id }, { sort: { createdAt: -1 }, limit: 50, lean: true });
  return reply.send({ balance, transactions: txs });
}

async function wallet_addFunds(req, reply) {
  const { amount } = req.body || {};
  const val = Number(amount);
  if (!val || val <= 0) return reply.code(400).send({ error: 'Invalid amount' });
  const user = await services.getSingleDocument(User, { _id: req.user._id });
  user.balance = Number(user.balance || 0) + val;
  await user.save();
  await services.addData(Transaction, { user: user._id, amount: val, type: 'credit', description: 'Add funds' });
  return reply.send({ balance: user.balance });
}

module.exports = {
  auth_register,
  auth_login,
  auth_me,
  auth_logout,
  channels_list,
  channels_create,
  messages_listByChannel,
  messages_send,
  messages_unlock,
  wallet_balance,
  wallet_addFunds,
};
