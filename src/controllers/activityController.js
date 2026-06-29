import ActivityLog from '../models/ActivityLog.js';
import { asyncHandler } from '../middleware/error.js';

// GET /api/activity
export const getActivity = asyncHandler(async (req, res) => {
  const { task, project, limit = 50 } = req.query;
  const filter = {};
  if (task) filter.task = task;
  if (project) filter.project = project;

  const logs = await ActivityLog.find(filter)
    .populate('actor', 'name avatar role')
    .populate('task', 'title')
    .populate('project', 'name')
    .sort({ createdAt: -1 })
    .limit(Number(limit));

  res.json(logs);
});
