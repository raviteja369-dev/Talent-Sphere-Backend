import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Department from './models/Department.js';
import Team from './models/Team.js';
import Project from './models/Project.js';
import Task from './models/Task.js';
import Notification from './models/Notification.js';
import ActivityLog from './models/ActivityLog.js';
import { ROLES } from './config/constants.js';

/**
 * Wipes all demo/sample people, projects, tasks, teams, notifications and
 * activity — but KEEPS departments — and leaves a single admin account so you
 * can build real data from scratch. Run with: npm run clean
 *
 * Override the bootstrap admin via env: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD.
 */
const clean = async () => {
  await connectDB();

  console.log('Removing all people, projects, tasks, teams, notifications and activity (departments kept)...');
  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({}),
    Notification.deleteMany({}),
    ActivityLog.deleteMany({}),
  ]);

  // Departments are preserved, but their "head" pointed at now-deleted managers.
  await Department.updateMany({}, { $unset: { head: '' } });

  const name = process.env.ADMIN_NAME || 'Administrator';
  const email = (process.env.ADMIN_EMAIL || 'admin@talentsphere.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';

  await User.create({ name, email, password, role: ROLES.ADMIN, jobTitle: 'Administrator' });

  console.log('\n========================================');
  console.log('  Workspace reset. Only admin remains:');
  console.log('========================================');
  console.log(`  ADMIN → ${email} / ${password}`);
  console.log('========================================\n');

  await mongoose.connection.close();
  process.exit(0);
};

clean().catch((err) => {
  console.error('Clean failed:', err);
  process.exit(1);
});
