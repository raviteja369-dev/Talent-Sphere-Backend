import Project from '../models/Project.js';
import Task from '../models/Task.js';
import { asyncHandler } from '../middleware/error.js';
import { ROLES, TASK_STATUS } from '../config/constants.js';
import { logActivity, notify } from '../utils/activity.js';

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

  // Attach live task counts + progress
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

// GET /api/projects/:id
export const getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id)
    .populate('manager', 'name avatar email')
    .populate('department', 'name color')
    .populate('createdBy', 'name');
  if (!project) return res.status(404).json({ message: 'Project not found' });
  res.json(project);
});

// POST /api/projects (admin)
export const createProject = asyncHandler(async (req, res) => {
  const { name, key, description, department, manager, priority, startDate, dueDate, color } = req.body;
  if (!name) return res.status(400).json({ message: 'Project name is required' });

  const project = await Project.create({
    name,
    key,
    description,
    department,
    manager,
    priority,
    startDate,
    dueDate,
    color,
    createdBy: req.user._id,
  });

  await logActivity({
    actor: req.user._id,
    action: 'project_created',
    message: `Created project "${name}"`,
    project: project._id,
  });

  if (manager) {
    await notify({
      user: manager,
      type: 'task_assigned',
      title: 'New Project Assigned',
      message: `You have been assigned to project "${name}"`,
      project: project._id,
    });
    await logActivity({
      actor: req.user._id,
      action: 'project_assigned',
      message: `Assigned project "${name}" to a manager`,
      project: project._id,
    });
  }

  res.status(201).json(project);
});

// PUT /api/projects/:id (admin)
export const updateProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });

  const prevManager = project.manager?.toString();
  Object.assign(project, req.body);
  await project.save();

  if (req.body.manager && req.body.manager !== prevManager) {
    await notify({
      user: req.body.manager,
      type: 'task_assigned',
      title: 'Project Assigned',
      message: `You have been assigned to project "${project.name}"`,
      project: project._id,
    });
  }

  res.json(project);
});

// DELETE /api/projects/:id (admin)
export const deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  await Task.deleteMany({ project: project._id });
  res.json({ message: 'Project and related tasks removed' });
});
