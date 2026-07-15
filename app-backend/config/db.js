const mongoose = require('mongoose');

/**
 * Connect to MongoDB. Called once at startup from index.js.
 * Throws if no URI is provided so index.js can fail fast.
 */
async function connectDB(uri) {
  if (!uri) throw new Error('MONGO_URI is not set');

  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('error', (err) => console.error('MongoDB error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

  await mongoose.connect(uri);
  return mongoose.connection;
}

module.exports = connectDB;
