import User from '../models/User.js';
import Task from '../models/Task.js';
import Department from '../models/Department.js';
import { asyncHandler } from '../middleware/error.js';
import { ROLES, TASK_STATUS } from '../config/constants.js';

// GET /api/analytics
export const getAnalytics = asyncHandler(async (req, res) => {
  const now = new Date();

  // ---- Employee productivity (top employees by completed tasks) ----
  const employees = await User.find({ role: ROLES.EMPLOYEE }).select('name avatar');
  const employeeProductivity = await Promise.all(
    employees.map(async (emp) => {
      const [total, completed] = await Promise.all([
        Task.countDocuments({ assignedTo: emp._id }),
        Task.countDocuments({ assignedTo: emp._id, status: TASK_STATUS.COMPLETED }),
      ]);
      return { name: emp.name, completed, total, rate: total ? Math.round((completed / total) * 100) : 0 };
    })
  );
  employeeProductivity.sort((a, b) => b.completed - a.completed);

  // ---- Manager performance ----
  const managers = await User.find({ role: ROLES.MANAGER }).select('name');
  const managerPerformance = await Promise.all(
    managers.map(async (mgr) => {
      const teamIds = await User.find({ manager: mgr._id }).distinct('_id');
      const [total, completed] = await Promise.all([
        Task.countDocuments({ assignedTo: { $in: teamIds } }),
        Task.countDocuments({ assignedTo: { $in: teamIds }, status: TASK_STATUS.COMPLETED }),
      ]);
      return { name: mgr.name, total, completed, rate: total ? Math.round((completed / total) * 100) : 0 };
    })
  );

  // ---- Task completion rate (status distribution) ----
  const statusAgg = await Task.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const statusDistribution = statusAgg.map((s) => ({ status: s._id, count: s.count }));

  // ---- Delayed tasks count ----
  const delayedTasks = await Task.countDocuments({
    dueDate: { $lt: now },
    status: { $nin: [TASK_STATUS.COMPLETED] },
  });

  // ---- Weekly progress (tasks completed per day, last 7 days) ----
  const weekly = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(now.getDate() - i);
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const end = new Date(day); end.setHours(23, 59, 59, 999);
    const [completed, created] = await Promise.all([
      Task.countDocuments({ status: TASK_STATUS.COMPLETED, updatedAt: { $gte: start, $lte: end } }),
      Task.countDocuments({ createdAt: { $gte: start, $lte: end } }),
    ]);
    weekly.push({
      day: start.toLocaleDateString('en-US', { weekday: 'short' }),
      completed,
      created,
    });
  }

  // ---- Monthly progress (last 6 months) ----
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const [completed, created] = await Promise.all([
      Task.countDocuments({ status: TASK_STATUS.COMPLETED, updatedAt: { $gte: start, $lte: end } }),
      Task.countDocuments({ createdAt: { $gte: start, $lte: end } }),
    ]);
    monthly.push({ month: start.toLocaleDateString('en-US', { month: 'short' }), completed, created });
  }

  // ---- Department performance ----
  const departments = await Department.find().select('name color');
  const departmentPerformance = await Promise.all(
    departments.map(async (d) => {
      const tasks = await Task.find({ department: d._id }).select('progress status');
      const total = tasks.length;
      const progress = total ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / total) : 0;
      return { name: d.name, color: d.color, progress, total };
    })
  );

  // ---- Workload distribution (active tasks per employee) ----
  const workload = await Promise.all(
    employees.map(async (emp) => {
      const active = await Task.countDocuments({
        assignedTo: emp._id,
        status: { $nin: [TASK_STATUS.COMPLETED] },
      });
      return { name: emp.name, active };
    })
  );
  workload.sort((a, b) => b.active - a.active);

  res.json({
    employeeProductivity: employeeProductivity.slice(0, 8),
    managerPerformance,
    statusDistribution,
    delayedTasks,
    weekly,
    monthly,
    departmentPerformance,
    workload: workload.slice(0, 10),
  });
});
