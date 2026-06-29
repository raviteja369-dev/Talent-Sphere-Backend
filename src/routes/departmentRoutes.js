import express from 'express';
import {
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getTeams, createTeam, updateTeam, deleteTeam,
} from '../controllers/departmentController.js';
import { protect, authorize } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

const router = express.Router();
router.use(protect);

router.get('/', getDepartments);
router.post('/', authorize(ROLES.ADMIN), createDepartment);
router.put('/:id', authorize(ROLES.ADMIN), updateDepartment);
router.delete('/:id', authorize(ROLES.ADMIN), deleteDepartment);

// Teams nested under the same router file
router.get('/teams/all', getTeams);
router.post('/teams', authorize(ROLES.ADMIN, ROLES.MANAGER), createTeam);
router.put('/teams/:id', authorize(ROLES.ADMIN, ROLES.MANAGER), updateTeam);
router.delete('/teams/:id', authorize(ROLES.ADMIN, ROLES.MANAGER), deleteTeam);

export default router;
