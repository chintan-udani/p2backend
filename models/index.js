const mongoose = require('mongoose');
const { Schema } = mongoose;

// User model: stores auth info, role, and wallet balance
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true },
    passwordHash: { type: String, required: true },
    passwordSalt: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user', index: true },
    balance: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  },
  { timestamps: true }
);

// Channel model: chat channels
const ChannelSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Message model: supports locked messages and per-user unlocks
const MessageSchema = new Schema(
  {
    channel: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    imageData: { type: String },
    isLocked: { type: Boolean, default: false },
    lockPrice: { type: Number, default: 0 },
    unlockedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// Transaction model: wallet credits/debits
const TransactionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true }, // positive numbers; type differentiates
    type: { type: String, enum: ['credit', 'debit'], required: true },
    description: { type: String },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Channel = mongoose.models.Channel || mongoose.model('Channel', ChannelSchema);
const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

module.exports = { User, Channel, Message, Transaction };
