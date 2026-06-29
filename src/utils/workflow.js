import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { ROLES, TASK_STATUS, PROJECT_STATUS, ACTIVITY, NOTIFICATION_TYPES } from '../config/constants.js';
import { logActivity, notify } from './activity.js';

/**
 * Recalculate a project's progress from its tasks and auto-transition its
 * status. A project is Completed only when it has at least one task and every
 * task has reached COMPLETED (i.e. Employee done → Manager approved → Admin
 * approved). Fires a one-time project_completed notification + activity on the
 * transition into Completed.
 *
 * Safe to call after any task mutation. Never throws — workflow side effects
 * must not break the primary request.
 */
export async function syncProjectProgress(projectId, actorId) {
  try {
    if (!projectId) return;
    const project = await Project.findById(projectId);
    if (!project) return;

    const tasks = await Task.find({ project: project._id }).select('progress status');
    const total = tasks.length;

    const progress = total
      ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / total)
      : 0;

    const allCompleted = total > 0 && tasks.every((t) => t.status === TASK_STATUS.COMPLETED);

    const wasCompleted = project.status === PROJECT_STATUS.COMPLETED;
    project.progress = progress;

    if (allCompleted && !wasCompleted) {
      project.status = PROJECT_STATUS.COMPLETED;
      project.completedAt = new Date();
      await project.save();
      await onProjectCompleted(project, actorId);
      return project;
    }

    if (!allCompleted && wasCompleted) {
      // A task was reopened — revert the project to active.
      project.status = PROJECT_STATUS.ACTIVE;
      project.completedAt = undefined;
    }

    await project.save();
    return project;
  } catch (err) {
    console.error('syncProjectProgress failed:', err.message);
  }
}

async function onProjectCompleted(project, actorId) {
  await logActivity({
    actor: actorId,
    action: ACTIVITY.PROJECT_COMPLETED,
    message: `Project "${project.name}" was completed — all tasks approved`,
    project: project._id,
  });

  const recipients = new Set();
  if (project.manager) recipients.add(project.manager.toString());
  if (project.createdBy) recipients.add(project.createdBy.toString());
  const admins = await User.find({ role: ROLES.ADMIN }).distinct('_id');
  admins.forEach((a) => recipients.add(a.toString()));

  await Promise.all(
    [...recipients].map((user) =>
      notify({
        user,
        type: NOTIFICATION_TYPES.PROJECT_COMPLETED,
        title: 'Project Completed',
        message: `All tasks in "${project.name}" have been approved. The project is now complete.`,
        project: project._id,
      })
    )
  );
}

// Default reviewer verification checklists (spec §3)
export const MANAGER_REVIEW_CHECKLIST = [
  'Requirements Verified',
  'Files Reviewed',
  'Code Reviewed',
  'Testing Verified',
  'Documentation Verified',
];

export const ADMIN_REVIEW_CHECKLIST = [
  'Manager Approved',
  'Documentation Complete',
  'Client Requirements Met',
  'Quality Verified',
  'Compliance Verified',
];

/**
 * (Re)seed a task's reviewer checklist at the start of a review cycle. Always
 * resets completion to false so each review (including after a resubmit) starts
 * fresh, and recreates the default items when none exist.
 */
export function seedReviewChecklist(task, scope) {
  const field = scope === 'admin' ? 'adminChecklist' : 'managerChecklist';
  if (!task[field] || task[field].length === 0) {
    const items = scope === 'admin' ? ADMIN_REVIEW_CHECKLIST : MANAGER_REVIEW_CHECKLIST;
    task[field] = items.map((text) => ({ text, done: false }));
  } else {
    task[field].forEach((i) => { i.done = false; });
  }
}

/** True when every item in the reviewer checklist has been checked. */
export function reviewChecklistComplete(task, scope) {
  const field = scope === 'admin' ? 'adminChecklist' : 'managerChecklist';
  const items = task[field] || [];
  return items.length > 0 && items.every((i) => i.done);
}

/**
 * Generate the next sequential task code for a project, e.g. "MKT-0007".
 * Falls back to a "TSK" prefix when the project has no key.
 */
export async function generateTaskCode(projectId) {
  let prefix = 'TSK';
  if (projectId) {
    const project = await Project.findById(projectId).select('key name');
    if (project?.key) prefix = project.key.toUpperCase();
    else if (project?.name) prefix = project.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'TSK';
  }
  const count = await Task.countDocuments(projectId ? { project: projectId } : {});
  const seq = String(count + 1).padStart(4, '0');
  return `${prefix}-${seq}`;
}
