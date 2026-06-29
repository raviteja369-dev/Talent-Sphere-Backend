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
    description: { type: String, default: '' },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },

    // 'admin_task' = assigned by Admin to a Manager
    // 'subtask'    = assigned by Manager to an Employee
    type: { type: String, enum: ['admin_task', 'subtask'], default: 'subtask' },
    parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    status: { type: String, enum: TASK_STATUS_LIST, default: TASK_STATUS.NOT_STARTED },
    progress: { type: Number, default: 0, min: 0, max: 100 },

    startDate: { type: Date },
    dueDate: { type: Date },

    instructions: { type: String, default: '' },
    checklist: [checklistItemSchema],
    attachments: [attachmentSchema],
    comments: [commentSchema],

    managerReview: { type: reviewSchema, default: () => ({}) },
    adminReview: { type: reviewSchema, default: () => ({}) },

    accepted: { type: Boolean, default: false },
    isDraft: { type: Boolean, default: false },
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
