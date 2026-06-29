import User from '../models/User.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Department from '../models/Department.js';
import { asyncHandler } from '../middleware/error.js';
import { ROLES, TASK_STATUS } from '../config/constants.js';

const ACTIVE_STATUSES = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.SUBMITTED,
  TASK_STATUS.MANAGER_APPROVED,
  TASK_STATUS.SENT_TO_ADMIN,
  TASK_STATUS.MANAGER_REJECTED,
  TASK_STATUS.ADMIN_REJECTED,
];

// GET /api/dashboard
export const getDashboard = asyncHandler(async (req, res) => {
  if (req.user.role === ROLES.ADMIN) return adminDashboard(req, res);
  if (req.user.role === ROLES.MANAGER) return managerDashboard(req, res);
  return employeeDashboard(req, res);
});

const adminDashboard = async (req, res) => {
  const now = new Date();
  const [
    totalManagers, totalEmployees, totalProjects,
    activeTasks, completedTasks, pendingApprovals,
    overdueTasks, allTasks,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.MANAGER }),
    User.countDocuments({ role: ROLES.EMPLOYEE }),
    Project.countDocuments(),
    Task.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
    Task.countDocuments({ status: TASK_STATUS.COMPLETED }),
    Task.countDocuments({ status: TASK_STATUS.SENT_TO_ADMIN }),
    Task.countDocuments({ dueDate: { $lt: now }, status: { $nin: [TASK_STATUS.COMPLETED] } }),
    Task.find().select('progress status dueDate'),
  ]);

  const totalTasks = allTasks.length;
  const overallProgress = totalTasks
    ? Math.round(allTasks.reduce((s, t) => s + (t.progress || 0), 0) / totalTasks)
    : 0;
  const delayedTasks = allTasks.filter(
    (t) => t.dueDate && t.dueDate < now && t.status !== TASK_STATUS.COMPLETED
  ).length;

  // Department-wise progress
  const departments = await Department.find().select('name color');
  const departmentProgress = await Promise.all(
    departments.map(async (d) => {
      const tasks = await Task.find({ department: d._id }).select('progress status');
      const total = tasks.length;
      const progress = total ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / total) : 0;
      const completed = tasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length;
      return { name: d.name, color: d.color, progress, total, completed };
    })
  );

  res.json({
    role: ROLES.ADMIN,
    stats: {
      totalManagers, totalEmployees, totalProjects,
      activeTasks, completedTasks, pendingApprovals,
      delayedTasks, overdueTasks, overallProgress,
    },
    departmentProgress,
  });
};

const managerDashboard = async (req, res) => {
  const now = new Date();
  const employees = await User.find({ manager: req.user._id }).distinct('_id');

  const [
    assignedProjects, assignedTasks, teamMembers,
    pendingReviews, completedReviews, myAdminTasks,
    overdueTasks, employeeTasks,
  ] = await Promise.all([
    Project.countDocuments({ manager: req.user._id }),
    Task.countDocuments({ assignedBy: req.user._id }),
    employees.length,
    Task.countDocuments({ assignedTo: { $in: employees }, status: TASK_STATUS.SUBMITTED }),
    Task.countDocuments({ assignedBy: req.user._id, 'managerReview.status': { $in: ['approved', 'rejected'] } }),
    Task.countDocuments({ assignedTo: req.user._id, type: 'admin_task' }),
    Task.countDocuments({ assignedTo: { $in: employees }, dueDate: { $lt: now }, status: { $nin: [TASK_STATUS.COMPLETED] } }),
    Task.find({ assignedTo: { $in: employees } }).select('progress status'),
  ]);

  const totalEmpTasks = employeeTasks.length;
  const teamProgress = totalEmpTasks
    ? Math.round(employeeTasks.reduce((s, t) => s + (t.progress || 0), 0) / totalEmpTasks)
    : 0;

  res.json({
    role: ROLES.MANAGER,
    stats: {
      assignedProjects, assignedTasks, teamMembers,
      pendingReviews, completedReviews, pendingApprovals: pendingReviews,
      myAdminTasks, overdueTasks, teamProgress,
    },
  });
};

const employeeDashboard = async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [myTasks, todayTasks, upcoming, completed, pending] = await Promise.all([
    Task.countDocuments({ assignedTo: req.user._id }),
    Task.countDocuments({ assignedTo: req.user._id, dueDate: { $gte: startOfDay, $lte: endOfDay } }),
    Task.countDocuments({ assignedTo: req.user._id, dueDate: { $gt: now, $lte: weekAhead }, status: { $nin: [TASK_STATUS.COMPLETED] } }),
    Task.countDocuments({ assignedTo: req.user._id, status: TASK_STATUS.COMPLETED }),
    Task.countDocuments({ assignedTo: req.user._id, status: { $in: ACTIVE_STATUSES } }),
  ]);

  const allMine = await Task.find({ assignedTo: req.user._id }).select('progress');
  const avgProgress = allMine.length
    ? Math.round(allMine.reduce((s, t) => s + (t.progress || 0), 0) / allMine.length)
    : 0;

  res.json({
    role: ROLES.EMPLOYEE,
    stats: { myTasks, todayTasks, upcoming, completed, pending, avgProgress },
  });
};
