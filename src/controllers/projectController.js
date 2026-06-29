import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { asyncHandler } from '../middleware/error.js';
import { ROLES, TASK_STATUS, ACTIVITY, NOTIFICATION_TYPES } from '../config/constants.js';
import { logActivity, notify } from '../utils/activity.js';
import { syncProjectProgress } from '../utils/workflow.js';

const PERSISTABLE = [
  'name', 'key', 'clientName', 'description', 'goals', 'milestones',
  'department', 'manager', 'priority', 'status', 'budget',
  'startDate', 'dueDate', 'timeline', 'color',
];

const applyFields = (project, body) => {
  PERSISTABLE.forEach((f) => {
    if (body[f] !== undefined) project[f] = body[f];
  });
};

// GET /api/projects
export const getProjects = asyncHandler(async (req, res) => {
  const { status, priority, department, search } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (department) filter.department = department;
  if (search) filter.name = { $regex: search, $options: 'i' };

  // Managers only see projects assigned to them
  if (req.user.role === ROLES.MANAGER) filter.manager = req.user._id;

  const projects = await Project.find(filter)
    .populate('manager', 'name avatar email')
    .populate('department', 'name color')
    .sort({ createdAt: -1 });

  const withStats = await Promise.all(
    projects.map(async (p) => {
      const [total, completed] = await Promise.all([
        Task.countDocuments({ project: p._id }),
        Task.countDocuments({ project: p._id, status: TASK_STATUS.COMPLETED }),
      ]);
      const progress = total ? Math.round((completed / total) * 100) : p.progress;
      return { ...p.toObject(), taskCount: total, completedCount: completed, progress };
    })
  );

  res.json(withStats);
});

// GET /api/projects/:id  (rich detail: stats, tasks, team)
export const getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id)
    .populate('manager', 'name avatar email')
    .populate('department', 'name color')
    .populate('createdBy', 'name');
  if (!project) return res.status(404).json({ message: 'Project not found' });

  if (req.user.role === ROLES.MANAGER && project.manager && project.manager._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: 'You do not have access to this project' });
  }

  const tasks = await Task.find({ project: project._id })
    .populate('assignedTo', 'name avatar email jobTitle')
    .populate('assignedBy', 'name avatar')
    .sort({ createdAt: -1 });

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length;
  const inReview = tasks.filter((t) => [TASK_STATUS.SUBMITTED, TASK_STATUS.SENT_TO_ADMIN].includes(t.status)).length;
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < new Date() && t.status !== TASK_STATUS.COMPLETED).length;
  const progress = total ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / total) : project.progress;

  // Team = distinct assignees on the project's tasks
  const teamMap = new Map();
  tasks.forEach((t) => {
    if (t.assignedTo) teamMap.set(t.assignedTo._id.toString(), t.assignedTo);
  });

  res.json({
    ...project.toObject(),
    tasks,
    team: [...teamMap.values()],
    stats: { total, completed, inReview, overdue, progress },
  });
});

// POST /api/projects (admin)
export const createProject = asyncHandler(async (req, res) => {
  if (!req.body.name) return res.status(400).json({ message: 'Project name is required' });

  const project = new Project({ createdBy: req.user._id });
  applyFields(project, req.body);
  await project.save();

  await logActivity({
    actor: req.user._id,
    action: ACTIVITY.PROJECT_CREATED,
    message: `${req.user.name} created project "${project.name}"${project.clientName ? ` for ${project.clientName}` : ''}`,
    project: project._id,
  });

  if (project.manager) {
    const mgr = await User.findById(project.manager).select('name');
    await notify({
      user: project.manager,
      type: NOTIFICATION_TYPES.PROJECT_ASSIGNED,
      title: 'New Project Assigned',
      message: `You have been assigned to manage "${project.name}"`,
      project: project._id,
    });
    await logActivity({
      actor: req.user._id,
      action: ACTIVITY.PROJECT_ASSIGNED,
      message: `${req.user.name} assigned project "${project.name}" to ${mgr?.name || 'a manager'}`,
      project: project._id,
    });
  }

  const populated = await Project.findById(project._id).populate('manager', 'name avatar email').populate('department', 'name color');
  res.status(201).json(populated);
});

// PUT /api/projects/:id (admin)
export const updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });

  const prevManager = project.manager?.toString();
  applyFields(project, req.body);
  await project.save();

  await logActivity({
    actor: req.user._id,
    action: ACTIVITY.PROJECT_UPDATED,
    message: `${req.user.name} updated project "${project.name}"`,
    project: project._id,
  });

  if (req.body.manager && req.body.manager !== prevManager) {
    await notify({
      user: req.body.manager,
      type: NOTIFICATION_TYPES.PROJECT_ASSIGNED,
      title: 'Project Assigned',
      message: `You have been assigned to manage "${project.name}"`,
      project: project._id,
    });
    await logActivity({
      actor: req.user._id,
      action: ACTIVITY.PROJECT_ASSIGNED,
      message: `${req.user.name} reassigned project "${project.name}"`,
      project: project._id,
    });
  }

  const populated = await Project.findById(project._id).populate('manager', 'name avatar email').populate('department', 'name color');
  res.json(populated);
});

// DELETE /api/projects/:id (admin)
export const deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  await Task.deleteMany({ project: project._id });
  res.json({ message: 'Project and related tasks removed' });
});

// POST /api/projects/:id/recalculate (admin/manager) — force a progress resync
export const recalcProject = asyncHandler(async (req, res) => {
  const project = await syncProjectProgress(req.params.id, req.user._id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json(project);
});
