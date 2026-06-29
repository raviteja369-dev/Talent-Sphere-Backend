import express from 'express';
import {
  getProjects, getProject, createProject, updateProject, deleteProject, recalcProject,
} from '../controllers/projectController.js';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = express.Router();
router.use(protect);

router.get('/', getProjects);
router.get('/:id', getProject);
router.post('/', authorize(ROLES.ADMIN), createProject);
router.put('/:id', authorize(ROLES.ADMIN), updateProject);
router.delete('/:id', authorize(ROLES.ADMIN), deleteProject);
router.post('/:id/recalculate', authorize(ROLES.ADMIN, ROLES.MANAGER), recalcProject);

export default router;
