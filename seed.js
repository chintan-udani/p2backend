const mongoose = require('mongoose');
const crypto = require('crypto');
const { User, Channel, Message, Transaction } = require('./models');

// Password hashing function matching the backend implementation
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto
    .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
    .toString('hex');
  return { salt, hash };
}

// MongoDB connection
async function connectDB() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/lockchat';
  await mongoose.connect(mongoUri, { autoIndex: true });
  console.log('Connected to MongoDB');
}

// Sample data that matches exactly with your models
async function seedDatabase() {
  try {
    await connectDB();

    // Clear existing data
    await User.deleteMany({});
    await Channel.deleteMany({});
    await Message.deleteMany({});
    await Transaction.deleteMany({});
    
    console.log('Cleared existing data');

    // Create users with properly hashed passwords
    const userData = [
      {
        email: "admin@example.com",
        username: "admin",
        password: "admin123",
        role: "admin",
        balance: 1000,
        status: "active"
      },
      {
        email: "alice@example.com",
        username: "alice",
        password: "user123",
        role: "user",
        balance: 500,
        status: "active"
      },
      {
        email: "bob@example.com",
        username: "bob",
        password: "user123",
        role: "user",
        balance: 300,
        status: "active"
      }
    ];

    const users = [];
    for (const user of userData) {
      const { salt, hash } = hashPassword(user.password);
      const newUser = await User.create({
        email: user.email,
        username: user.username,
        passwordHash: hash,
        passwordSalt: salt,
        role: user.role,
        balance: user.balance,
        status: user.status
      });
      users.push(newUser);
      console.log(`Created user: ${newUser.username} (${newUser.email})`);
    }

    // Create channels
    const channelData = [
      {
        name: "general",
        description: "General discussion channel",
        createdBy: users[0]._id // admin
      },
      {
        name: "premium-content",
        description: "Premium locked content channel",
        createdBy: users[0]._id // admin
      },
      {
        name: "announcements",
        description: "Admin announcements only",
        createdBy: users[0]._id // admin
      }
    ];

    const channels = [];
    for (const channel of channelData) {
      const newChannel = await Channel.create(channel);
      channels.push(newChannel);
      console.log(`Created channel: ${newChannel.name}`);
    }

    // Create messages
    const messageData = [
      {
        channel: channels[0]._id, // general
        sender: users[1]._id, // alice
        content: "Welcome to the general channel everyone!",
        isLocked: false,
        lockPrice: 0
      },
      {
        channel: channels[0]._id, // general
        sender: users[2]._id, // bob
        content: "Thanks for the welcome! Excited to be here.",
        isLocked: false,
        lockPrice: 0
      },
      {
        channel: channels[1]._id, // premium-content
        sender: users[0]._id, // admin
        content: "This is a locked message that costs 50 coins to unlock. It contains exclusive content!",
        isLocked: true,
        lockPrice: 50
      },
      {
        channel: channels[1]._id, // premium-content
        sender: users[0]._id, // admin
        content: "Another locked message with different pricing - this one costs 25 coins.",
        isLocked: true,
        lockPrice: 25
      }
    ];

    const messages = [];
    for (const message of messageData) {
      const newMessage = await Message.create(message);
      messages.push(newMessage);
      console.log(`Created message in channel: ${message.channel}`);
    }

    // Create transactions
    const transactionData = [
      {
        user: users[0]._id, // admin
        amount: 1000,
        type: "credit",
        description: "Initial admin balance"
      },
      {
        user: users[1]._id, // alice
        amount: 500,
        type: "credit",
        description: "Initial user balance"
      },
      {
        user: users[2]._id, // bob
        amount: 300,
        type: "credit",
        description: "Initial user balance"
      }
    ];

    for (const transaction of transactionData) {
      const newTransaction = await Transaction.create(transaction);
      console.log(`Created transaction for user: ${transaction.user} (${transaction.type} ${transaction.amount})`);
    }

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\nUsers created:');
    users.forEach(user => {
      console.log(`- ${user.username} (${user.email}) - Role: ${user.role} - Balance: ${user.balance}`);
    });
    
    console.log('\nChannels created:');
    channels.forEach(channel => {
      console.log(`- ${channel.name} - ${channel.description}`);
    });
    
    console.log('\nMessages created:', messages.length);
    console.log('Transactions created:', transactionData.length);

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the seed function
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };