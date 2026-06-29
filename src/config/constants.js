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
  IN_PROGRESS: 'in_progress',
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

export const NOTIFICATION_TYPES = {
  TASK_ASSIGNED: 'task_assigned',
  DEADLINE_REMINDER: 'deadline_reminder',
  PROGRESS_UPDATED: 'progress_updated',
  MANAGER_APPROVED: 'manager_approved',
  MANAGER_REJECTED: 'manager_rejected',
  ADMIN_APPROVED: 'admin_approved',
  ADMIN_REJECTED: 'admin_rejected',
  COMMENT_ADDED: 'comment_added',
  FILE_UPLOADED: 'file_uploaded',
};
