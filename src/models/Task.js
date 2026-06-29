import mongoose from 'mongoose';
import { PRIORITIES, TASK_STATUS, TASK_STATUS_LIST } from '../config/constants.js';

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, default: 0 },
    type: { type: String, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const checklistItemSchema = new mongoose.Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  required: { type: Boolean, default: true },
});

const acceptanceCriterionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  acknowledged: { type: Boolean, default: false },
});

// Reviewer (manager / admin) verification checklist item
const reviewChecklistItemSchema = new mongoose.Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
});

const reviewSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    comment: { type: String, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { _id: false }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    taskCode: { type: String, trim: true, index: true },
    description: { type: String, default: '' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

    // 'admin_task' = assigned by Admin to a Manager
    // 'subtask'    = assigned by Manager to an Employee
    type: { type: String, enum: ['admin_task', 'subtask'], default: 'subtask' },
    parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // The manager responsible for reviewing this task (defaults to assignedBy)
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    status: { type: String, enum: TASK_STATUS_LIST, default: TASK_STATUS.NOT_STARTED },
    progress: { type: Number, default: 0, min: 0, max: 100 },

    startDate: { type: Date },
    dueDate: { type: Date },
    estimatedHours: { type: Number, default: 0, min: 0 },

    instructions: { type: String, default: '' },
    tags: [{ type: String, trim: true }],
    checklist: [checklistItemSchema],
    acceptanceCriteria: [acceptanceCriterionSchema],
    attachments: [attachmentSchema],
    comments: [commentSchema],

    managerReview: { type: reviewSchema, default: () => ({}) },
    adminReview: { type: reviewSchema, default: () => ({}) },

    // Verification checklists the reviewer must complete before approving
    managerChecklist: [reviewChecklistItemSchema],
    adminChecklist: [reviewChecklistItemSchema],

    accepted: { type: Boolean, default: false },
    declineReason: { type: String, default: '' },
    isDraft: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    completedAt: { type: Date },

    // Time tracking (minutes accumulated + the timestamp the running timer started)
    timeWorked: { type: Number, default: 0 },
    timerStartedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.virtual('isOverdue').get(function () {
  return (
    this.dueDate &&
    this.dueDate < new Date() &&
    this.status !== TASK_STATUS.COMPLETED
  );
});

taskSchema.set('toJSON', { virtuals: true });
taskSchema.set('toObject', { virtuals: true });

const Task = mongoose.model('Task', taskSchema);
export default Task;
