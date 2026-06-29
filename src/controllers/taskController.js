import Task from '../models/Task.js';
import User from '../models/User.js';
import { asyncHandler } from '../middleware/error.js';
import { ROLES, TASK_STATUS, ACTIVITY, NOTIFICATION_TYPES } from '../config/constants.js';
import { logActivity, notify } from '../utils/activity.js';
import { syncProjectProgress, generateTaskCode, seedReviewChecklist, reviewChecklistComplete } from '../utils/workflow.js';

const populateTask = (query) =>
  query
    .populate('assignedTo', 'name avatar email jobTitle')
    .populate('assignedBy', 'name avatar email')
    .populate('reviewer', 'name avatar email')
    .populate('project', 'name color key')
    .populate('department', 'name color')
    .populate('comments.author', 'name avatar')
    .populate('parentTask', 'title')
    .populate('dependencies', 'title status taskCode');

// Derive a working status from a progress value (pre-review)
const statusFromProgress = (progress) => {
  if (progress >= 100) return TASK_STATUS.SUBMITTED;
  if (progress > 0) return TASK_STATUS.IN_PROGRESS;
  return TASK_STATUS.ASSIGNED;
};

const idStr = (v) => (v == null ? '' : v._id ? v._id.toString() : v.toString());

// Employees may only act on tasks assigned to them. Admins can act on anything.
const ensureAssignee = (req, task) => {
  if (req.user.role === ROLES.ADMIN) return true;
  return idStr(task.assignedTo) === idStr(req.user._id);
};

// Accumulate elapsed timer time (minutes) into timeWorked and stop the clock.
const stopTimer = (task) => {
  if (task.timerStartedAt) {
    const mins = Math.round((Date.now() - new Date(task.timerStartedAt).getTime()) / 60000);
    task.timeWorked = (task.timeWorked || 0) + Math.max(0, mins);
    task.timerStartedAt = null;
  }
};

const respond = async (res, id) => res.json(await populateTask(Task.findById(id)));

// GET /api/tasks
export const getTasks = asyncHandler(async (req, res) => {
  const { status, priority, project, assignedTo, type, search, parentTask, overdue, queue } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (project) filter.project = project;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (type) filter.type = type;
  if (parentTask) filter.parentTask = parentTask;
  if (search) filter.$or = [{ title: { $regex: search, $options: 'i' } }, { taskCode: { $regex: search, $options: 'i' } }];
  if (overdue === 'true') {
    filter.dueDate = { $lt: new Date() };
    filter.status = { $nin: [TASK_STATUS.COMPLETED] };
  }

  // Role scoping
  if (req.user.role === ROLES.EMPLOYEE) {
    filter.assignedTo = req.user._id;
  } else if (req.user.role === ROLES.MANAGER) {
    const myEmployees = await User.find({ manager: req.user._id }).distinct('_id');
    filter.$and = [
      ...(filter.$or ? [{ $or: filter.$or }] : []),
      { $or: [{ assignedTo: req.user._id }, { assignedBy: req.user._id }, { assignedTo: { $in: myEmployees } }] },
    ];
    delete filter.$or;
  }

  // Review queues
  if (queue === 'manager') filter.status = TASK_STATUS.SUBMITTED;
  if (queue === 'admin') filter.status = TASK_STATUS.SENT_TO_ADMIN;

  const tasks = await populateTask(Task.find(filter)).sort({ createdAt: -1 });
  res.json(tasks);
});

// GET /api/tasks/:id
export const getTask = asyncHandler(async (req, res) => {
  const task = await populateTask(Task.findById(req.params.id));
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const subtasks = await populateTask(Task.find({ parentTask: task._id })).sort({ createdAt: 1 });
  res.json({ ...task.toObject(), subtasks });
});

// POST /api/tasks
export const createTask = asyncHandler(async (req, res) => {
  const {
    title, description, project, department, assignedTo, priority,
    startDate, dueDate, instructions, checklist, parentTask, type,
    estimatedHours, tags, acceptanceCriteria, dependencies,
  } = req.body;

  if (!title) return res.status(400).json({ message: 'Task title is required' });
  if (!assignedTo) return res.status(400).json({ message: 'A task must be assigned to a user' });

  const assignee = await User.findById(assignedTo);
  if (!assignee) return res.status(404).json({ message: 'Assignee not found' });

  // Determine task type by who is assigning
  let resolvedType = type;
  if (req.user.role === ROLES.ADMIN) {
    resolvedType = 'admin_task';
    if (assignee.role !== ROLES.MANAGER) {
      return res.status(400).json({ message: 'Admins can only assign tasks to managers' });
    }
  } else if (req.user.role === ROLES.MANAGER) {
    resolvedType = 'subtask';
    if (assignee.role !== ROLES.EMPLOYEE) {
      return res.status(400).json({ message: 'Managers can only assign tasks to employees' });
    }
  }

  const taskCode = await generateTaskCode(project);

  const task = await Task.create({
    title,
    taskCode,
    description,
    project,
    department,
    assignedTo,
    assignedBy: req.user._id,
    reviewer: req.user.role === ROLES.MANAGER ? req.user._id : undefined,
    type: resolvedType,
    parentTask,
    dependencies: Array.isArray(dependencies) ? dependencies : [],
    priority,
    startDate,
    dueDate,
    estimatedHours: Number(estimatedHours) || 0,
    instructions,
    tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [],
    checklist: Array.isArray(checklist)
      ? checklist.map((c) => ({ text: c.text || c, done: false, required: c.required !== false }))
      : [],
    acceptanceCriteria: Array.isArray(acceptanceCriteria)
      ? acceptanceCriteria.map((c) => ({ text: c.text || c, acknowledged: false }))
      : [],
    status: TASK_STATUS.ASSIGNED,
  });

  await logActivity({
    actor: req.user._id,
    action: ACTIVITY.TASK_CREATED,
    message: `${req.user.name} created task ${taskCode} "${title}"`,
    task: task._id,
    project,
  });
  await logActivity({
    actor: req.user._id,
    action: ACTIVITY.TASK_ASSIGNED,
    message: `${req.user.name} assigned "${title}" to ${assignee.name}`,
    task: task._id,
    project,
  });

  await notify({
    user: assignedTo,
    type: NOTIFICATION_TYPES.TASK_ASSIGNED,
    title: 'New Task Assigned',
    message: `You have been assigned ${taskCode}: "${title}"`,
    task: task._id,
    project,
  });

  await syncProjectProgress(project, req.user._id);
  await respond(res.status(201), task._id);
});

// PUT /api/tasks/:id
export const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (task.locked) return res.status(403).json({ message: 'This task is completed and locked from editing' });

  const dueChanged = req.body.dueDate !== undefined && idStr(req.body.dueDate) !== idStr(task.dueDate);
  const editable = ['title', 'description', 'priority', 'startDate', 'dueDate', 'instructions', 'project', 'department', 'estimatedHours'];
  editable.forEach((field) => {
    if (req.body[field] !== undefined) task[field] = req.body[field];
  });
  if (Array.isArray(req.body.checklist)) task.checklist = req.body.checklist;
  if (Array.isArray(req.body.acceptanceCriteria)) task.acceptanceCriteria = req.body.acceptanceCriteria;
  if (Array.isArray(req.body.tags)) task.tags = req.body.tags.map((t) => String(t).trim()).filter(Boolean);
  if (Array.isArray(req.body.dependencies)) task.dependencies = req.body.dependencies;

  await task.save();

  if (dueChanged) {
    await logActivity({
      actor: req.user._id,
      action: ACTIVITY.DEADLINE_CHANGED,
      message: `${req.user.name} changed the due date of "${task.title}"`,
      task: task._id,
      project: task.project,
    });
  }

  await syncProjectProgress(task.project, req.user._id);
  await respond(res, task._id);
});

// DELETE /api/tasks/:id
export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  const projectId = task.project;
  await Task.deleteMany({ parentTask: task._id });
  await task.deleteOne();
  await syncProjectProgress(projectId, req.user._id);
  res.json({ message: 'Task removed' });
});

// PATCH /api/tasks/:id/accept (employee)
export const acceptTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!ensureAssignee(req, task)) return res.status(403).json({ message: 'You can only accept tasks assigned to you' });

  task.accepted = true;
  task.declineReason = '';
  if ([TASK_STATUS.ASSIGNED, TASK_STATUS.NOT_STARTED, TASK_STATUS.DECLINED].includes(task.status)) {
    task.status = TASK_STATUS.ACCEPTED;
  }
  await task.save();

  await logActivity({ actor: req.user._id, action: ACTIVITY.TASK_ACCEPTED, message: `${req.user.name} accepted "${task.title}"`, task: task._id, project: task.project });
  if (task.assignedBy) {
    await notify({ user: task.assignedBy, type: NOTIFICATION_TYPES.TASK_ACCEPTED, title: 'Task Accepted', message: `${req.user.name} accepted "${task.title}"`, task: task._id, project: task.project });
  }
  await respond(res, task._id);
});

// PATCH /api/tasks/:id/decline (employee)
export const declineTask = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ message: 'A reason is required to decline a task' });

  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!ensureAssignee(req, task)) return res.status(403).json({ message: 'You can only decline tasks assigned to you' });

  task.status = TASK_STATUS.DECLINED;
  task.accepted = false;
  task.declineReason = reason.trim();
  stopTimer(task);
  await task.save();

  await logActivity({ actor: req.user._id, action: ACTIVITY.TASK_DECLINED, message: `${req.user.name} declined "${task.title}": ${reason.trim()}`, task: task._id, project: task.project });
  if (task.assignedBy) {
    await notify({ user: task.assignedBy, type: NOTIFICATION_TYPES.TASK_DECLINED, title: 'Task Declined', message: `${req.user.name} declined "${task.title}": ${reason.trim()}`, task: task._id, project: task.project });
  }
  await respond(res, task._id);
});

// PATCH /api/tasks/:id/start (employee)
export const startTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!ensureAssignee(req, task)) return res.status(403).json({ message: 'You can only start tasks assigned to you' });

  task.accepted = true;
  task.status = TASK_STATUS.IN_PROGRESS;
  if (task.progress === 0) task.progress = 0;
  task.timerStartedAt = new Date();
  await task.save();

  await logActivity({ actor: req.user._id, action: ACTIVITY.TASK_STARTED, message: `${req.user.name} started working on "${task.title}"`, task: task._id, project: task.project });
  if (task.assignedBy) {
    await notify({ user: task.assignedBy, type: NOTIFICATION_TYPES.TASK_STARTED, title: 'Task Started', message: `${req.user.name} started "${task.title}"`, task: task._id, project: task.project });
  }
  await respond(res, task._id);
});

// PATCH /api/tasks/:id/pause (employee)
export const pauseTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!ensureAssignee(req, task)) return res.status(403).json({ message: 'You can only pause your own tasks' });

  stopTimer(task);
  task.status = TASK_STATUS.PAUSED;
  await task.save();

  await logActivity({ actor: req.user._id, action: ACTIVITY.TASK_PAUSED, message: `${req.user.name} paused "${task.title}"`, task: task._id, project: task.project });
  await respond(res, task._id);
});

// PATCH /api/tasks/:id/resume (employee)
export const resumeTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!ensureAssignee(req, task)) return res.status(403).json({ message: 'You can only resume your own tasks' });

  task.status = TASK_STATUS.IN_PROGRESS;
  task.timerStartedAt = new Date();
  await task.save();

  await logActivity({ actor: req.user._id, action: ACTIVITY.TASK_RESUMED, message: `${req.user.name} resumed "${task.title}"`, task: task._id, project: task.project });
  await respond(res, task._id);
});

// PATCH /api/tasks/:id/progress (employee)
export const updateProgress = asyncHandler(async (req, res) => {
  const { progress, isDraft } = req.body;
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!ensureAssignee(req, task)) return res.status(403).json({ message: 'You can only update your own tasks' });
  if (task.locked) return res.status(403).json({ message: 'This task is completed and locked' });

  const value = Math.max(0, Math.min(100, Number(progress)));
  task.progress = value;
  task.isDraft = Boolean(isDraft);

  // Reset rejection status on rework; otherwise track working status.
  if ([TASK_STATUS.MANAGER_REJECTED, TASK_STATUS.ADMIN_REJECTED].includes(task.status)) {
    task.status = value >= 100 ? TASK_STATUS.IN_PROGRESS : TASK_STATUS.IN_PROGRESS;
  } else if (![TASK_STATUS.SUBMITTED, TASK_STATUS.COMPLETED, TASK_STATUS.PAUSED].includes(task.status)) {
    // Keep ACCEPTED until explicitly started; once progressing, mark in-progress.
    task.status = value > 0 ? TASK_STATUS.IN_PROGRESS : (task.accepted ? TASK_STATUS.ACCEPTED : statusFromProgress(value));
  }

  await task.save();

  if (isDraft) {
    await logActivity({ actor: req.user._id, action: ACTIVITY.PROGRESS_UPDATED, message: `${req.user.name} saved changes on "${task.title}" (${value}%)`, task: task._id, project: task.project });
  } else {
    await logActivity({ actor: req.user._id, action: ACTIVITY.PROGRESS_UPDATED, message: `${req.user.name} updated progress on "${task.title}" to ${value}%`, task: task._id, project: task.project });
    if (task.assignedBy) {
      await notify({ user: task.assignedBy, type: NOTIFICATION_TYPES.PROGRESS_UPDATED, title: 'Progress Updated', message: `"${task.title}" is now ${value}% complete`, task: task._id, project: task.project });
    }
  }

  await syncProjectProgress(task.project, req.user._id);
  await respond(res, task._id);
});

// PATCH /api/tasks/:id/submit (employee submits for review with validation)
export const submitTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!ensureAssignee(req, task)) return res.status(403).json({ message: 'You can only submit your own tasks' });

  // ── Submission gate (spec §5) ───────────────────────────────────────
  const errors = [];
  if ((task.progress || 0) < 100) errors.push('Progress must be at 100%.');

  const pendingChecklist = (task.checklist || []).filter((c) => c.required !== false && !c.done);
  if (pendingChecklist.length) errors.push(`Complete all mandatory checklist items (${pendingChecklist.length} remaining).`);

  if ((task.attachments || []).length === 0) errors.push('Upload at least one deliverable / attachment.');

  const unacked = (task.acceptanceCriteria || []).filter((c) => !c.acknowledged);
  if (unacked.length) errors.push(`Acknowledge all acceptance criteria (${unacked.length} remaining).`);

  if (errors.length) return res.status(422).json({ message: 'Task cannot be submitted yet.', errors });

  stopTimer(task);
  task.progress = 100;
  task.isDraft = false;
  task.status = TASK_STATUS.SUBMITTED;
  task.managerReview = { status: 'pending' };
  seedReviewChecklist(task, 'manager');
  await task.save();

  await logActivity({ actor: req.user._id, action: ACTIVITY.SUBMITTED_FOR_REVIEW, message: `${req.user.name} submitted "${task.title}" for review`, task: task._id, project: task.project });

  const reviewer = task.reviewer || task.assignedBy;
  if (reviewer) {
    await notify({ user: reviewer, type: NOTIFICATION_TYPES.TASK_SUBMITTED, title: 'Task Submitted for Review', message: `"${task.title}" was submitted and awaits your review`, task: task._id, project: task.project });
  }

  await syncProjectProgress(task.project, req.user._id);
  await respond(res, task._id);
});

// PATCH /api/tasks/:id/manager-review (manager approve / request changes / reject)
export const managerReview = asyncHandler(async (req, res) => {
  const { decision, comment } = req.body; // 'approve' | 'changes' | 'reject'
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  // Only the assigning/reviewing manager (or the assignee's manager) may review.
  if (req.user.role === ROLES.MANAGER) {
    const owns = idStr(task.reviewer) === idStr(req.user._id) || idStr(task.assignedBy) === idStr(req.user._id);
    let managesAssignee = false;
    if (!owns && task.assignedTo) {
      const assignee = await User.findById(task.assignedTo).select('manager');
      managesAssignee = idStr(assignee?.manager) === idStr(req.user._id);
    }
    if (!owns && !managesAssignee) return res.status(403).json({ message: 'You can only review tasks for your own team' });
  }

  if (task.status !== TASK_STATUS.SUBMITTED) {
    return res.status(409).json({ message: 'This task is not awaiting manager review' });
  }

  const sendBack = decision === 'reject' || decision === 'changes';
  if (sendBack && !(comment && comment.trim())) {
    return res.status(400).json({ message: 'A comment is required when requesting changes or rejecting' });
  }
  if (decision === 'approve' && !reviewChecklistComplete(task, 'manager')) {
    return res.status(422).json({ message: 'Complete the review checklist before approving.', errors: ['Complete all review checklist items before approving.'] });
  }

  task.managerReview = { status: decision === 'approve' ? 'approved' : 'rejected', comment: comment || '', reviewedBy: req.user._id, reviewedAt: new Date() };

  if (decision === 'approve') {
    task.status = TASK_STATUS.SENT_TO_ADMIN;
    task.adminReview = { status: 'pending' };
    seedReviewChecklist(task, 'admin');
    await notify({ user: task.assignedTo, type: NOTIFICATION_TYPES.MANAGER_APPROVED, title: 'Work Approved by Manager', message: `Your work on "${task.title}" was approved and sent to Admin`, task: task._id, project: task.project });
    const admins = await User.find({ role: ROLES.ADMIN }).distinct('_id');
    await Promise.all(admins.map((a) => notify({ user: a, type: NOTIFICATION_TYPES.TASK_SUBMITTED, title: 'Task Awaiting Final Approval', message: `"${task.title}" was approved by a manager and needs your final review`, task: task._id, project: task.project })));
    await logActivity({ actor: req.user._id, action: ACTIVITY.MANAGER_APPROVED, message: `${req.user.name} approved "${task.title}" and escalated to Admin`, task: task._id, project: task.project });
  } else {
    // Request changes / reject — return to the employee and unlock for rework.
    task.status = TASK_STATUS.MANAGER_REJECTED;
    task.locked = false;
    const verb = decision === 'reject' ? 'rejected' : 'requested changes on';
    await notify({ user: task.assignedTo, type: NOTIFICATION_TYPES.MANAGER_CHANGES, title: decision === 'reject' ? 'Submission Rejected' : 'Changes Requested', message: `Your manager ${verb} "${task.title}": ${comment}`, task: task._id, project: task.project });
    await logActivity({ actor: req.user._id, action: ACTIVITY.MANAGER_REJECTED, message: `${req.user.name} ${verb} "${task.title}"`, task: task._id, project: task.project });
  }

  await task.save();
  await syncProjectProgress(task.project, req.user._id);
  await respond(res, task._id);
});

// PATCH /api/tasks/:id/admin-review (admin final approve / request changes / reject)
export const adminReview = asyncHandler(async (req, res) => {
  const { decision, comment } = req.body; // 'approve' | 'changes' | 'reject'
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  if (task.status !== TASK_STATUS.SENT_TO_ADMIN) {
    return res.status(409).json({ message: 'This task is not awaiting admin review' });
  }
  const sendBack = decision === 'reject' || decision === 'changes';
  if (sendBack && !(comment && comment.trim())) {
    return res.status(400).json({ message: 'A comment is required when requesting changes or rejecting' });
  }
  if (decision === 'approve' && !reviewChecklistComplete(task, 'admin')) {
    return res.status(422).json({ message: 'Complete the final approval checklist before approving.', errors: ['Complete all final approval checklist items before approving.'] });
  }

  task.adminReview = { status: decision === 'approve' ? 'approved' : 'rejected', comment: comment || '', reviewedBy: req.user._id, reviewedAt: new Date() };

  if (decision === 'approve') {
    task.status = TASK_STATUS.COMPLETED;
    task.progress = 100;
    task.locked = true;
    task.completedAt = new Date();
    await notify({ user: task.assignedTo, type: NOTIFICATION_TYPES.ADMIN_APPROVED, title: 'Final Approval Granted', message: `"${task.title}" received final approval and is now complete`, task: task._id, project: task.project });
    if (task.managerReview?.reviewedBy) {
      await notify({ user: task.managerReview.reviewedBy, type: NOTIFICATION_TYPES.ADMIN_APPROVED, title: 'Task Completed', message: `"${task.title}" received final approval from Admin`, task: task._id, project: task.project });
    }
    await logActivity({ actor: req.user._id, action: ACTIVITY.ADMIN_APPROVED, message: `${req.user.name} gave final approval for "${task.title}" — task completed`, task: task._id, project: task.project });
  } else {
    task.status = TASK_STATUS.ADMIN_REJECTED;
    const reworkUser = task.managerReview?.reviewedBy || task.assignedBy;
    await notify({ user: reworkUser, type: NOTIFICATION_TYPES.ADMIN_CHANGES, title: 'Admin Requested Rework', message: `Admin requested changes on "${task.title}": ${comment}`, task: task._id, project: task.project });
    if (task.assignedTo) {
      await notify({ user: task.assignedTo, type: NOTIFICATION_TYPES.ADMIN_CHANGES, title: 'Rework Required', message: `Admin requested changes on "${task.title}"`, task: task._id, project: task.project });
    }
    await logActivity({ actor: req.user._id, action: ACTIVITY.ADMIN_REJECTED, message: `${req.user.name} requested rework on "${task.title}"`, task: task._id, project: task.project });
  }

  await task.save();
  await syncProjectProgress(task.project, req.user._id);
  await respond(res, task._id);
});

// POST /api/tasks/:id/comments
export const addComment = asyncHandler(async (req, res) => {
  const { text, mentions } = req.body;
  if (!text) return res.status(400).json({ message: 'Comment text is required' });

  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  task.comments.push({ author: req.user._id, text, mentions: mentions || [] });
  await task.save();

  await logActivity({ actor: req.user._id, action: ACTIVITY.COMMENT_ADDED, message: `${req.user.name} commented on "${task.title}"`, task: task._id, project: task.project });

  const recipients = new Set();
  if (idStr(task.assignedTo) !== idStr(req.user._id)) recipients.add(idStr(task.assignedTo));
  if (idStr(task.assignedBy) !== idStr(req.user._id)) recipients.add(idStr(task.assignedBy));
  (mentions || []).forEach((m) => recipients.add(m));

  await Promise.all(
    [...recipients].filter(Boolean).map((user) =>
      notify({ user, type: NOTIFICATION_TYPES.COMMENT_ADDED, title: 'New Comment', message: `${req.user.name} commented on "${task.title}"`, task: task._id, project: task.project })
    )
  );

  await respond(res, task._id);
});

// PATCH /api/tasks/:id/checklist/:itemId
export const toggleChecklistItem = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (task.locked) return res.status(403).json({ message: 'This task is completed and locked' });
  if (!ensureAssignee(req, task)) return res.status(403).json({ message: 'Only the assignee can update this checklist' });
  const item = task.checklist.id(req.params.itemId);
  if (!item) return res.status(404).json({ message: 'Checklist item not found' });
  item.done = !item.done;
  await task.save();

  const done = task.checklist.filter((c) => c.done).length;
  await logActivity({
    actor: req.user._id,
    action: ACTIVITY.CHECKLIST_UPDATED,
    message: `${req.user.name} ${item.done ? 'completed' : 'reopened'} "${item.text}" (${done}/${task.checklist.length}) on "${task.title}"`,
    task: task._id,
    project: task.project,
  });

  await respond(res, task._id);
});

// PATCH /api/tasks/:id/criteria/:critId  (acknowledge acceptance criterion)
export const acknowledgeCriterion = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!ensureAssignee(req, task)) return res.status(403).json({ message: 'You can only update your own tasks' });
  const item = task.acceptanceCriteria.id(req.params.critId);
  if (!item) return res.status(404).json({ message: 'Criterion not found' });
  item.acknowledged = !item.acknowledged;
  await task.save();
  await respond(res, task._id);
});

// PATCH /api/tasks/:id/review-checklist/:scope/:itemId  (manager/admin verify items)
export const toggleReviewItem = asyncHandler(async (req, res) => {
  const { scope, itemId } = req.params;
  if (!['manager', 'admin'].includes(scope)) return res.status(400).json({ message: 'Invalid checklist scope' });

  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  // Permission: managers verify the manager checklist while it awaits their review; admins verify the admin checklist.
  if (scope === 'manager') {
    if (req.user.role === ROLES.EMPLOYEE) return res.status(403).json({ message: 'Only reviewers can update this checklist' });
    if (task.status !== TASK_STATUS.SUBMITTED) return res.status(409).json({ message: 'This task is not awaiting manager review' });
  } else {
    if (req.user.role !== ROLES.ADMIN) return res.status(403).json({ message: 'Only an admin can update the final approval checklist' });
    if (task.status !== TASK_STATUS.SENT_TO_ADMIN) return res.status(409).json({ message: 'This task is not awaiting admin review' });
  }

  const field = scope === 'admin' ? 'adminChecklist' : 'managerChecklist';
  const item = task[field].id(itemId);
  if (!item) return res.status(404).json({ message: 'Checklist item not found' });
  item.done = !item.done;
  await task.save();
  await respond(res, task._id);
});

// POST /api/tasks/:id/attachments  (after multer upload)
export const addAttachment = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (!req.file && !req.body.url) return res.status(400).json({ message: 'No file provided' });

  const attachment = req.file
    ? { name: req.file.originalname, url: `/uploads/${req.file.filename}`, size: req.file.size, type: req.file.mimetype, uploadedBy: req.user._id }
    : { name: req.body.name || 'Link', url: req.body.url, uploadedBy: req.user._id };

  task.attachments.push(attachment);
  await task.save();

  await logActivity({ actor: req.user._id, action: ACTIVITY.ATTACHMENT_UPLOADED, message: `${req.user.name} uploaded "${attachment.name}" to "${task.title}"`, task: task._id, project: task.project });

  if (task.assignedBy && idStr(task.assignedBy) !== idStr(req.user._id)) {
    await notify({ user: task.assignedBy, type: NOTIFICATION_TYPES.FILE_UPLOADED, title: 'File Uploaded', message: `${req.user.name} uploaded a file to "${task.title}"`, task: task._id, project: task.project });
  }

  await respond(res, task._id);
});
