import express from 'express';
import {
  getUsers, getUser, createUser, updateUser, deleteUser, getTeamPerformance,
} from '../controllers/userController.js';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = express.Router();
router.use(protect);

router.get('/team/performance', getTeamPerformance);
router.get('/', getUsers);
router.get('/:id', getUser);
router.post('/', authorize(ROLES.ADMIN, ROLES.MANAGER), createUser);
router.put('/:id', authorize(ROLES.ADMIN, ROLES.MANAGER), updateUser);
router.delete('/:id', authorize(ROLES.ADMIN, ROLES.MANAGER), deleteUser);

export default router;
