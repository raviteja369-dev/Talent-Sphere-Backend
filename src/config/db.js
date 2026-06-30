import mongoose from 'mongoose';
import dns from 'node:dns';

export const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  const directUri = process.env.MONGO_URI_DIRECT;
  if (!uri && !directUri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  // Some local/corporate DNS resolvers refuse SRV (mongodb+srv) lookups, which
  // breaks Atlas connections. Prefer reliable public DNS for resolution.
  try {
    const current = dns.getServers();
    dns.setServers(['8.8.8.8', '1.1.1.1', ...current]);
  } catch {
    /* ignore — fall back to system DNS */
  }

  mongoose.set('strictQuery', true);
  const options = { serverSelectionTimeoutMS: 15000 };

  // Some networks (corporate DNS) refuse SRV (mongodb+srv) lookups from Node's
  // resolver. We try the SRV URI first, then transparently fall back to the
  // direct (non-SRV) connection string which lists the replica-set hosts.
  try {
    const conn = await mongoose.connect(uri || directUri, options);
    console.log(`✓ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    const isSrvDnsError =
      err.message?.includes('querySrv') || err.code === 'ECONNREFUSED' || err.syscall === 'querySrv';
    if (uri && directUri && isSrvDnsError) {
      console.warn('⚠ SRV lookup failed, retrying with direct connection string...');
      const conn = await mongoose.connect(directUri, options);
      console.log(`✓ MongoDB connected (direct): ${conn.connection.host}/${conn.connection.name}`);
      return conn;
    }
    console.error('✗ MongoDB connection error:', err.message);
    throw err;
  }
};
