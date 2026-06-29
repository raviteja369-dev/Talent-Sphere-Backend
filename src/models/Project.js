import mongoose from 'mongoose';
import { PRIORITIES } from '../config/constants.js';

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, uppercase: true, trim: true },
    description: { type: String, default: '' },
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
    startDate: { type: Date },
    dueDate: { type: Date },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    color: { type: String, default: '#6366f1' },
  },
  { timestamps: true }
);

const Project = mongoose.model('Project', projectSchema);
export default Project;
