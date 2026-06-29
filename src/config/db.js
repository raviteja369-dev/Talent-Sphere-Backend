import mongoose from 'mongoose';

export const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  const directUri = process.env.MONGO_URI_DIRECT;
  if (!uri && !directUri) {
    throw new Error('MONGO_URI is not defined in environment variables');
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
