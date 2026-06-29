import Department from '../models/Department.js';
import Team from '../models/Team.js';
import { asyncHandler } from '../middleware/error.js';

// ---- Departments ----
export const getDepartments = asyncHandler(async (req, res) => {
  const departments = await Department.find().populate('head', 'name avatar').sort({ name: 1 });
  res.json(departments);
});

export const createDepartment = asyncHandler(async (req, res) => {
  const { name, description, color, head } = req.body;
  if (!name) return res.status(400).json({ message: 'Department name is required' });
  const department = await Department.create({ name, description, color, head });
  res.status(201).json(department);
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!department) return res.status(404).json({ message: 'Department not found' });
  res.json(department);
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findByIdAndDelete(req.params.id);
  if (!department) return res.status(404).json({ message: 'Department not found' });
  res.json({ message: 'Department removed' });
});

// ---- Teams ----
export const getTeams = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.manager) filter.manager = req.query.manager;
  const teams = await Team.find(filter)
    .populate('manager', 'name avatar')
    .populate('members', 'name avatar jobTitle')
    .populate('department', 'name color');
  res.json(teams);
});

export const createTeam = asyncHandler(async (req, res) => {
  const { name, description, department, manager, members } = req.body;
  if (!name) return res.status(400).json({ message: 'Team name is required' });
  const team = await Team.create({ name, description, department, manager, members });
  res.status(201).json(team);
});

export const updateTeam = asyncHandler(async (req, res) => {
  const team = await Team.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!team) return res.status(404).json({ message: 'Team not found' });
  res.json(team);
});

export const deleteTeam = asyncHandler(async (req, res) => {
  const team = await Team.findByIdAndDelete(req.params.id);
  if (!team) return res.status(404).json({ message: 'Team not found' });
  res.json({ message: 'Team removed' });
});
