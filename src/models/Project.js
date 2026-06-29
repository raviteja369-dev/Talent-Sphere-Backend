import mongoose from 'mongoose';
import { PRIORITIES } from '../config/constants.js';

const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date },
  done: { type: Boolean, default: false },
});

const projectAttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, default: 0 },
    type: { type: String, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, uppercase: true, trim: true },
    clientName: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    goals: [{ type: String, trim: true }],
    milestones: [milestoneSchema],
    documents: [projectAttachmentSchema],
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    // Manager(s) the project is assigned to by the admin
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    status: {
      type: String,
      enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'],
      default: 'active',
    },
    budget: { type: Number, default: 0, min: 0 },
    startDate: { type: Date },
    dueDate: { type: Date },
    timeline: { type: String, default: '' },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    completedAt: { type: Date },
    color: { type: String, default: '#2563EB' },
  },
  { timestamps: true }
);

const Project = mongoose.model('Project', projectSchema);
export default Project;
