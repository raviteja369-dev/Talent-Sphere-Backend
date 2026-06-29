import express from 'express';
import {
  getNotifications, markRead, markAllRead, deleteNotification,
} from '../controllers/notificationController.js';
import { getActivity } from '../controllers/activityController.js';
import { getAnalytics } from '../controllers/analyticsController.js';
import { getDashboard } from '../controllers/dashboardController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();
router.use(protect);

// Notifications
router.get('/notifications', getNotifications);
router.patch('/notifications/read-all', markAllRead);
router.patch('/notifications/:id/read', markRead);
router.delete('/notifications/:id', deleteNotification);

// Activity
router.get('/activity', getActivity);

// Analytics + dashboard
router.get('/analytics', getAnalytics);
router.get('/dashboard', getDashboard);

export default router;
