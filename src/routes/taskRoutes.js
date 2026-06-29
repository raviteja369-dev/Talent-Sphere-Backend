import express from 'express';
import {
  getTasks, getTask, createTask, updateTask, deleteTask,
  acceptTask, updateProgress, submitTask,
  managerReview, adminReview, addComment, toggleChecklistItem, addAttachment,
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

router.patch('/:id/accept', authorize(ROLES.EMPLOYEE), acceptTask);
router.patch('/:id/progress', authorize(ROLES.EMPLOYEE), updateProgress);
router.patch('/:id/submit', authorize(ROLES.EMPLOYEE), submitTask);

router.patch('/:id/manager-review', authorize(ROLES.MANAGER), managerReview);
router.patch('/:id/admin-review', authorize(ROLES.ADMIN), adminReview);

router.post('/:id/comments', addComment);
router.patch('/:id/checklist/:itemId', toggleChecklistItem);
router.post('/:id/attachments', upload.single('file'), addAttachment);

export default router;
