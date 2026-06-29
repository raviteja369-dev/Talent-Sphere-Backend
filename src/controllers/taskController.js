import Task from '../models/Task.js';
import User from '../models/User.js';
import Project from '../models/Project.js';
import { asyncHandler } from '../middleware/error.js';
import { ROLES, TASK_STATUS } from '../config/constants.js';
import { logActivity, notify } from '../utils/activity.js';

const populateTask = (query) =>
  query
    .populate('assignedTo', 'name avatar email jobTitle')
    .populate('assignedBy', 'name avatar email')
    .populate('project', 'name color key')
    .populate('department', 'name color')
    .populate('comments.author', 'name avatar')
    .populate('parentTask', 'title');

// Derive a working status from a progress value (pre-review)
const statusFromProgress = (progress) => {
  if (progress >= 100) return TASK_STATUS.SUBMITTED;
  if (progress > 0) return TASK_STATUS.IN_PROGRESS;
  return TASK_STATUS.ASSIGNED;
};

// GET /api/tasks
export const getTasks = asyncHandler(async (req, res) => {
  const { status, priority, project, assignedTo, type, search, parentTask, overdue } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (project) filter.project = project;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (type) filter.type = type;
  if (parentTask) filter.parentTask = parentTask;
  if (search) filter.title = { $regex: search, $options: 'i' };
  if (overdue === 'true') {
    filter.dueDate = { $lt: new Date() };
    filter.status = { $nin: [TASK_STATUS.COMPLETED] };
  }

  // Role scoping
  if (req.user.role === ROLES.EMPLOYEE) {
    filter.assignedTo = req.user._id;
  } else if (req.user.role === ROLES.MANAGER) {
    const myEmployees = await User.find({ manager: req.user._id }).distinct('_id');
    filter.$or = [
      { assignedTo: req.user._id },
      { assignedBy: req.user._id },
      { assignedTo: { $in: myEmployees } },
    ];
  }

  const tasks = await populateTask(Task.find(filter)).sort({ createdAt: -1 });
  res.json(tasks);
});

// GET /api/tasks/:id
export const getTask = asyncHandler(async (req, res) => {
  const task = await populateTask(Task.findById(req.params.id));
  if (!task) return res.status(404).json({ message: 'Task not found' });

  // Include subtasks if this is a parent
  const subtasks = await populateTask(Task.find({ parentTask: task._id })).sort({ createdAt: 1 });
  res.json({ ...task.toObject(), subtasks });
});

// POST /api/tasks
export const createTask = asyncHandler(async (req, res) => {
  const {
    title, description, project, department, assignedTo, priority,
    startDate, dueDate, instructions, checklist, parentTask, type,
  } = req.body;

  if (!title) return res.status(400).json({ message: 'Task title is required' });
  if (!assignedTo) return res.status(400).json({ message: 'A task must be assigned to a user' });

  const assignee = await User.findById(assignedTo);
  if (!assignee) return res.status(404).json({ message: 'Assignee not found' });

  // Determine task type by who is assigning
  let resolvedType = type;
  if (req.user.role === ROLES.ADMIN) {
    resolvedType = 'admin_task'; // admin assigns to managers
    if (assignee.role !== ROLES.MANAGER) {
      return res.status(400).json({ message: 'Admins can only assign tasks to managers' });
    }
  } else if (req.user.role === ROLES.MANAGER) {
    resolvedType = 'subtask'; // manager assigns to employees
    if (assignee.role !== ROLES.EMPLOYEE) {
      return res.status(400).json({ message: 'Managers can only assign tasks to employees' });
    }
  }

  const task = await Task.create({
    title,
    description,
    project,
    department,
    assignedTo,
    assignedBy: req.user._id,
    type: resolvedType,
    parentTask,
    priority,
    startDate,
    dueDate,
    instructions,
    checklist: Array.isArray(checklist) ? checklist.map((t) => ({ text: t.text || t, done: false })) : [],
    status: TASK_STATUS.ASSIGNED,
  });

  await logActivity({
    actor: req.user._id,
    action: 'task_assigned',
    message: `${req.user.name} assigned "${title}" to ${assignee.name}`,
    task: task._id,
    project,
  });

  await notify({
    user: assignedTo,
    type: 'task_assigned',
    title: 'New Task Assigned',
    message: `You have been assigned: "${title}"`,
    task: task._id,
    project,
  });

  const populated = await populateTask(Task.findById(task._id));
  res.status(201).json(populated);
});

// PUT /api/tasks/:id
export const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const editable = ['title', 'description', 'priority', 'startDate', 'dueDate', 'instructions', 'project', 'department'];
  editable.forEach((field) => {
    if (req.body[field] !== undefined) task[field] = req.body[field];
  });
  if (Array.isArray(req.body.checklist)) task.checklist = req.body.checklist;

  await task.save();
  const populated = await populateTask(Task.findById(task._id));
  res.json(populated);
});

// DELETE /api/tasks/:id
export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  await Task.deleteMany({ parentTask: task._id });
  await task.deleteOne();
  res.json({ message: 'Task removed' });
});

// PATCH /api/tasks/:id/accept (employee)
export const acceptTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  task.accepted = true;
  if (task.status === TASK_STATUS.ASSIGNED || task.status === TASK_STATUS.NOT_STARTED) {
    task.status = TASK_STATUS.IN_PROGRESS;
  }
  await task.save();

  await logActivity({
    actor: req.user._id,
    action: 'task_accepted',
    message: `${req.user.name} accepted "${task.title}"`,
    task: task._id,
  });

  const populated = await populateTask(Task.findById(task._id));
  res.json(populated);
});

// PATCH /api/tasks/:id/progress (employee)
export const updateProgress = asyncHandler(async (req, res) => {
  const { progress, isDraft } = req.body;
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const value = Math.max(0, Math.min(100, Number(progress)));
  task.progress = value;
  task.isDraft = Boolean(isDraft);

  // Reset rejection status on rework
  if (task.status === TASK_STATUS.MANAGER_REJECTED || task.status === TASK_STATUS.ADMIN_REJECTED) {
    task.status = value >= 100 ? TASK_STATUS.SUBMITTED : TASK_STATUS.IN_PROGRESS;
  } else if (![TASK_STATUS.SUBMITTED, TASK_STATUS.COMPLETED].includes(task.status)) {
    task.status = statusFromProgress(value);
  }
  if (value < 100 && task.status === TASK_STATUS.SUBMITTED) {
    task.status = TASK_STATUS.IN_PROGRESS;
  }

  await task.save();

  await logActivity({
    actor: req.user._id,
    action: 'progress_updated',
    message: `${req.user.name} updated progress on "${task.title}" to ${value}%`,
    task: task._id,
  });

  if (task.assignedBy) {
    await notify({
      user: task.assignedBy,
      type: 'progress_updated',
      title: 'Progress Updated',
      message: `"${task.title}" is now ${value}% complete`,
      task: task._id,
    });
  }

  const populated = await populateTask(Task.findById(task._id));
  res.json(populated);
});

// PATCH /api/tasks/:id/submit (employee marks 100% / submits)
export const submitTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  task.progress = 100;
  task.isDraft = false;
  task.status = TASK_STATUS.SUBMITTED;
  task.managerReview = { status: 'pending' };
  await task.save();

  await logActivity({
    actor: req.user._id,
    action: 'task_submitted',
    message: `${req.user.name} submitted "${task.title}" for review`,
    task: task._id,
  });

  if (task.assignedBy) {
    await notify({
      user: task.assignedBy,
      type: 'progress_updated',
      title: 'Task Submitted for Review',
      message: `"${task.title}" was marked complete and awaits your review`,
      task: task._id,
    });
  }

  const populated = await populateTask(Task.findById(task._id));
  res.json(populated);
});

// PATCH /api/tasks/:id/manager-review (manager approve/reject)
export const managerReview = asyncHandler(async (req, res) => {
  const { decision, comment } = req.body; // 'approve' | 'reject'
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  task.managerReview = {
    status: decision === 'approve' ? 'approved' : 'rejected',
    comment: comment || '',
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
  };

  if (decision === 'approve') {
    task.status = TASK_STATUS.SENT_TO_ADMIN;
    task.adminReview = { status: 'pending' };
    await notify({
      user: task.assignedTo,
      type: 'manager_approved',
      title: 'Work Approved by Manager',
      message: `Your work on "${task.title}" was approved and sent to Admin`,
      task: task._id,
    });
    await logActivity({
      actor: req.user._id,
      action: 'manager_approved',
      message: `${req.user.name} approved "${task.title}" and escalated to Admin`,
      task: task._id,
    });
  } else {
    task.status = TASK_STATUS.MANAGER_REJECTED;
    await notify({
      user: task.assignedTo,
      type: 'manager_rejected',
      title: 'Changes Requested',
      message: `Your manager requested changes on "${task.title}": ${comment || 'See comments'}`,
      task: task._id,
    });
    await logActivity({
      actor: req.user._id,
      action: 'manager_rejected',
      message: `${req.user.name} requested changes on "${task.title}"`,
      task: task._id,
    });
  }

  await task.save();
  const populated = await populateTask(Task.findById(task._id));
  res.json(populated);
});

// PATCH /api/tasks/:id/admin-review (admin final approve/reject)
export const adminReview = asyncHandler(async (req, res) => {
  const { decision, comment } = req.body;
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  task.adminReview = {
    status: decision === 'approve' ? 'approved' : 'rejected',
    comment: comment || '',
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
  };

  if (decision === 'approve') {
    task.status = TASK_STATUS.COMPLETED;
    task.progress = 100;
    await notify({
      user: task.assignedTo,
      type: 'admin_approved',
      title: 'Final Approval Granted',
      message: `"${task.title}" received final approval and is now complete`,
      task: task._id,
    });
    if (task.managerReview?.reviewedBy) {
      await notify({
        user: task.managerReview.reviewedBy,
        type: 'admin_approved',
        title: 'Final Approval Granted',
        message: `"${task.title}" received final approval from Admin`,
        task: task._id,
      });
    }
    await logActivity({
      actor: req.user._id,
      action: 'admin_approved',
      message: `${req.user.name} gave final approval for "${task.title}"`,
      task: task._id,
    });
  } else {
    task.status = TASK_STATUS.ADMIN_REJECTED;
    const reworkUser = task.managerReview?.reviewedBy || task.assignedBy;
    await notify({
      user: reworkUser,
      type: 'admin_rejected',
      title: 'Admin Requested Rework',
      message: `Admin requested changes on "${task.title}": ${comment || 'See comments'}`,
      task: task._id,
    });
    await logActivity({
      actor: req.user._id,
      action: 'admin_rejected',
      message: `${req.user.name} requested rework on "${task.title}"`,
      task: task._id,
    });
  }

  await task.save();
  const populated = await populateTask(Task.findById(task._id));
  res.json(populated);
});

// POST /api/tasks/:id/comments
export const addComment = asyncHandler(async (req, res) => {
  const { text, mentions } = req.body;
  if (!text) return res.status(400).json({ message: 'Comment text is required' });

  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  task.comments.push({ author: req.user._id, text, mentions: mentions || [] });
  await task.save();

  await logActivity({
    actor: req.user._id,
    action: 'comment_added',
    message: `${req.user.name} commented on "${task.title}"`,
    task: task._id,
  });

  // Notify the other party + mentions
  const recipients = new Set();
  if (task.assignedTo?.toString() !== req.user._id.toString()) recipients.add(task.assignedTo?.toString());
  if (task.assignedBy?.toString() !== req.user._id.toString()) recipients.add(task.assignedBy?.toString());
  (mentions || []).forEach((m) => recipients.add(m));

  await Promise.all(
    [...recipients].filter(Boolean).map((user) =>
      notify({
        user,
        type: 'comment_added',
        title: 'New Comment',
        message: `${req.user.name} commented on "${task.title}"`,
        task: task._id,
      })
    )
  );

  const populated = await populateTask(Task.findById(task._id));
  res.json(populated);
});

// PATCH /api/tasks/:id/checklist/:itemId
export const toggleChecklistItem = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  const item = task.checklist.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: 'Checklist item not found' });
  item.done = !item.done;
  await task.save();
  const populated = await populateTask(Task.findById(task._id));
  res.json(populated);
});

// POST /api/tasks/:id/attachments  (after multer upload)
export const addAttachment = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!req.file && !req.body.url) {
    return res.status(400).json({ message: 'No file provided' });
  }

  const attachment = req.file
    ? {
        name: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        size: req.file.size,
        type: req.file.mimetype,
        uploadedBy: req.user._id,
      }
    : {
        name: req.body.name || 'Link',
        url: req.body.url,
        uploadedBy: req.user._id,
      };

  task.attachments.push(attachment);
  await task.save();

  await logActivity({
    actor: req.user._id,
    action: 'file_uploaded',
    message: `${req.user.name} uploaded "${attachment.name}" to "${task.title}"`,
    task: task._id,
  });

  if (task.assignedBy && task.assignedBy.toString() !== req.user._id.toString()) {
    await notify({
      user: task.assignedBy,
      type: 'file_uploaded',
      title: 'File Uploaded',
      message: `${req.user.name} uploaded a file to "${task.title}"`,
      task: task._id,
    });
  }

  const populated = await populateTask(Task.findById(task._id));
  res.json(populated);
});
