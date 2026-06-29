import ActivityLog from '../models/ActivityLog.js';
import Notification from '../models/Notification.js';

export const logActivity = async ({ actor, action, message, task, project, meta }) => {
  try {
    await ActivityLog.create({ actor, action, message, task, project, meta });
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
};

export const notify = async ({ user, type, title, message, task, project }) => {
  try {
    if (!user) return;
    await Notification.create({ user, type, title, message, task, project });
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
};

export const notifyMany = async (users = [], payload) => {
  await Promise.all(users.filter(Boolean).map((user) => notify({ ...payload, user })));
};
