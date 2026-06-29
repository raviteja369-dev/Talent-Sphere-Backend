import User from '../models/User.js';
import Task from '../models/Task.js';
import { asyncHandler } from '../middleware/error.js';
import { ROLES, TASK_STATUS } from '../config/constants.js';

// GET /api/users  (admin: all, manager: own employees)
export const getUsers = asyncHandler(async (req, res) => {
  const { role, department, manager, search } = req.query;
  const filter = {};

  if (role) filter.role = role;
  if (department) filter.department = department;
  if (manager) filter.manager = manager;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  // Managers can only see their own employees (plus themselves)
  if (req.user.role === ROLES.MANAGER) {
    filter.$and = [
      { $or: [{ manager: req.user._id }, { _id: req.user._id }] },
    ];
  }

  const users = await User.find(filter)
    .populate('department', 'name color')
    .populate('manager', 'name email avatar')
    .sort({ createdAt: -1 });

  res.json(users);
});

// GET /api/users/:id
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate('department', 'name color')
    .populate('manager', 'name email avatar');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

// POST /api/users  (admin creates managers; manager creates employees)
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, department, manager, jobTitle, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required' });
  }

  // RBAC: admins create managers/employees, managers create only employees under them
  let resolvedRole = role || ROLES.EMPLOYEE;
  let resolvedManager = manager;

  if (req.user.role === ROLES.MANAGER) {
    resolvedRole = ROLES.EMPLOYEE;
    resolvedManager = req.user._id;
  }

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ message: 'Email already in use' });

  const user = await User.create({
    name,
    email,
    password,
    role: resolvedRole,
    department,
    manager: resolvedRole === ROLES.EMPLOYEE ? resolvedManager : undefined,
    jobTitle,
    phone,
  });

  res.status(201).json(user);
});

// PUT /api/users/:id
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const { name, email, role, department, manager, jobTitle, phone, isActive } = req.body;
  if (name) user.name = name;
  if (email) user.email = email;
  if (role && req.user.role === ROLES.ADMIN) user.role = role;
  if (department !== undefined) user.department = department || undefined;
  if (manager !== undefined) user.manager = manager || undefined;
  if (jobTitle !== undefined) user.jobTitle = jobTitle;
  if (phone !== undefined) user.phone = phone;
  if (isActive !== undefined) user.isActive = isActive;

  await user.save();
  res.json(user);
});

// DELETE /api/users/:id
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.role === ROLES.ADMIN) {
    return res.status(400).json({ message: 'Admin accounts cannot be deleted' });
  }
  await user.deleteOne();
  res.json({ message: 'User removed' });
});

// GET /api/users/team/performance  (manager: performance of own employees)
export const getTeamPerformance = asyncHandler(async (req, res) => {
  const managerId = req.user.role === ROLES.MANAGER ? req.user._id : req.query.manager;
  const filter = managerId ? { manager: managerId, role: ROLES.EMPLOYEE } : { role: ROLES.EMPLOYEE };
  const employees = await User.find(filter).select('name email avatar jobTitle');

  const performance = await Promise.all(
    employees.map(async (emp) => {
      const [total, completed, inProgress, overdue] = await Promise.all([
        Task.countDocuments({ assignedTo: emp._id, type: 'subtask' }),
        Task.countDocuments({ assignedTo: emp._id, type: 'subtask', status: TASK_STATUS.COMPLETED }),
        Task.countDocuments({ assignedTo: emp._id, type: 'subtask', status: TASK_STATUS.IN_PROGRESS }),
        Task.countDocuments({
          assignedTo: emp._id,
          type: 'subtask',
          dueDate: { $lt: new Date() },
          status: { $nin: [TASK_STATUS.COMPLETED] },
        }),
      ]);
      const completionRate = total ? Math.round((completed / total) * 100) : 0;
      return { employee: emp, total, completed, inProgress, overdue, completionRate };
    })
  );

  res.json(performance);
});
