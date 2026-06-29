export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
};

export const PRIORITIES = ['low', 'medium', 'high', 'critical'];

// Canonical task statuses driving the approval workflow
export const TASK_STATUS = {
  NOT_STARTED: 'not_started',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  SUBMITTED: 'submitted_for_review',
  MANAGER_APPROVED: 'manager_approved',
  MANAGER_REJECTED: 'manager_rejected',
  SENT_TO_ADMIN: 'sent_to_admin',
  ADMIN_APPROVED: 'admin_approved',
  ADMIN_REJECTED: 'admin_rejected',
  COMPLETED: 'completed',
  OVERDUE: 'overdue',
};

export const TASK_STATUS_LIST = Object.values(TASK_STATUS);

// Statuses considered "open / in-flight" (not completed, not declined)
export const ACTIVE_TASK_STATUSES = [
  TASK_STATUS.ASSIGNED,
  TASK_STATUS.ACCEPTED,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.PAUSED,
  TASK_STATUS.SUBMITTED,
  TASK_STATUS.MANAGER_APPROVED,
  TASK_STATUS.SENT_TO_ADMIN,
  TASK_STATUS.MANAGER_REJECTED,
  TASK_STATUS.ADMIN_REJECTED,
];

export const PROJECT_STATUS = {
  PLANNING: 'planning',
  ACTIVE: 'active',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const NOTIFICATION_TYPES = {
  PROJECT_ASSIGNED: 'project_assigned',
  PROJECT_COMPLETED: 'project_completed',
  TASK_ASSIGNED: 'task_assigned',
  TASK_ACCEPTED: 'task_accepted',
  TASK_DECLINED: 'task_declined',
  TASK_STARTED: 'task_started',
  TASK_SUBMITTED: 'task_submitted',
  DEADLINE_REMINDER: 'deadline_reminder',
  PROGRESS_UPDATED: 'progress_updated',
  COMMENT_ADDED: 'comment_added',
  FILE_UPLOADED: 'file_uploaded',
  MANAGER_APPROVED: 'manager_approved',
  MANAGER_CHANGES: 'manager_changes',
  MANAGER_REJECTED: 'manager_rejected',
  ADMIN_APPROVED: 'admin_approved',
  ADMIN_CHANGES: 'admin_changes',
  ADMIN_REJECTED: 'admin_rejected',
};

// Activity log action keys (free-form but centralised for consistency)
export const ACTIVITY = {
  PROJECT_CREATED: 'project_created',
  PROJECT_UPDATED: 'project_updated',
  PROJECT_ASSIGNED: 'project_assigned',
  PROJECT_COMPLETED: 'project_completed',
  TASK_CREATED: 'task_created',
  TASK_ASSIGNED: 'task_assigned',
  TASK_ACCEPTED: 'task_accepted',
  TASK_DECLINED: 'task_declined',
  TASK_STARTED: 'task_started',
  TASK_PAUSED: 'task_paused',
  TASK_RESUMED: 'task_resumed',
  PROGRESS_UPDATED: 'progress_updated',
  CHECKLIST_UPDATED: 'checklist_updated',
  COMMENT_ADDED: 'comment_added',
  ATTACHMENT_UPLOADED: 'file_uploaded',
  SUBMITTED_FOR_REVIEW: 'task_submitted',
  MANAGER_APPROVED: 'manager_approved',
  MANAGER_REJECTED: 'manager_rejected',
  ADMIN_APPROVED: 'admin_approved',
  ADMIN_REJECTED: 'admin_rejected',
  DEADLINE_CHANGED: 'deadline_changed',
};
