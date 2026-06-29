import express from 'express';
import {
  getTasks, getTask, createTask, updateTask, deleteTask,
  acceptTask, declineTask, startTask, pauseTask, resumeTask,
  updateProgress, submitTask, managerReview, adminReview,
  addComment, toggleChecklistItem, acknowledgeCriterion, addAttachment,
  toggleReviewItem,
} from '../controllers/taskController.js';
import { protect, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { ROLES } from '../config/constants.js';

const router = express.Router();
router.use(protect);

router.get('/', getTasks);
router.get('/:id', getTask);
router.post('/', authorize(ROLES.ADMIN, ROLES.MANAGER), createTask);
router.put('/:id', updateTask);
router.delete('/:id', authorize(ROLES.ADMIN, ROLES.MANAGER), deleteTask);

// Employee lifecycle actions
router.patch('/:id/accept', authorize(ROLES.EMPLOYEE, ROLES.ADMIN), acceptTask);
router.patch('/:id/decline', authorize(ROLES.EMPLOYEE, ROLES.ADMIN), declineTask);
router.patch('/:id/start', authorize(ROLES.EMPLOYEE, ROLES.ADMIN), startTask);
router.patch('/:id/pause', authorize(ROLES.EMPLOYEE, ROLES.ADMIN), pauseTask);
router.patch('/:id/resume', authorize(ROLES.EMPLOYEE, ROLES.ADMIN), resumeTask);
router.patch('/:id/progress', authorize(ROLES.EMPLOYEE, ROLES.ADMIN), updateProgress);
router.patch('/:id/submit', authorize(ROLES.EMPLOYEE, ROLES.ADMIN), submitTask);
router.patch('/:id/criteria/:critId', authorize(ROLES.EMPLOYEE, ROLES.ADMIN), acknowledgeCriterion);

// Review actions
router.patch('/:id/manager-review', authorize(ROLES.MANAGER), managerReview);
router.patch('/:id/admin-review', authorize(ROLES.ADMIN), adminReview);
router.patch('/:id/review-checklist/:scope/:itemId', authorize(ROLES.MANAGER, ROLES.ADMIN), toggleReviewItem);

// Collaboration
router.post('/:id/comments', addComment);
router.patch('/:id/checklist/:itemId', toggleChecklistItem);
router.post('/:id/attachments', upload.single('file'), addAttachment);

export default router;
