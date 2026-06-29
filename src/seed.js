import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Department from './models/Department.js';
import Team from './models/Team.js';
import Project from './models/Project.js';
import Task from './models/Task.js';
import Notification from './models/Notification.js';
import ActivityLog from './models/ActivityLog.js';
import { ROLES, TASK_STATUS, PRIORITIES } from './config/constants.js';

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

const DEPARTMENTS = [
  { name: 'Engineering', color: '#6366f1', description: 'Core platform & product engineering' },
  { name: 'Design', color: '#ec4899', description: 'Product design & user experience' },
  { name: 'Quality Assurance', color: '#10b981', description: 'Testing & quality engineering' },
  { name: 'DevOps & Infrastructure', color: '#f59e0b', description: 'Cloud, CI/CD & reliability' },
  { name: 'Data & Analytics', color: '#06b6d4', description: 'Data engineering & BI' },
];

const FIRST = ['Aarav','Vivaan','Aditya','Ravi','Karthik','Priya','Sneha','Ananya','Rohan','Ishaan','Meera','Diya','Arjun','Kabir','Neha','Rahul','Pooja','Vikram','Sanjay','Divya','Nikhil','Tara','Manish','Kiran'];
const LAST = ['Sharma','Verma','Reddy','Nair','Iyer','Patel','Gupta','Singh','Rao','Kapoor','Menon','Joshi','Bose','Das','Mehta'];

const JOB_TITLES = {
  manager: ['Engineering Manager', 'Design Lead', 'QA Manager', 'DevOps Lead', 'Analytics Manager'],
  employee: ['Software Engineer', 'Senior Engineer', 'UI Designer', 'UX Researcher', 'QA Engineer', 'SDET', 'DevOps Engineer', 'Data Analyst', 'Frontend Developer', 'Backend Developer'],
};

const PROJECT_NAMES = [
  ['Atlas Cloud Migration', 'ATL'],
  ['Phoenix Mobile App', 'PHX'],
  ['Quantum Analytics Platform', 'QAP'],
  ['Helios Design System', 'HDS'],
  ['Orion Payments Gateway', 'ORN'],
  ['Nova Customer Portal', 'NOV'],
];

const TASK_TITLES = [
  'Implement authentication module', 'Design dashboard wireframes', 'Set up CI/CD pipeline',
  'Write API integration tests', 'Optimize database queries', 'Build notification service',
  'Create responsive landing page', 'Refactor payment flow', 'Configure monitoring & alerts',
  'Develop reporting engine', 'Migrate legacy data', 'Implement role-based access',
];

const seed = async () => {
  await connectDB();
  console.log('Clearing existing data...');
  await Promise.all([
    User.deleteMany({}), Department.deleteMany({}), Team.deleteMany({}),
    Project.deleteMany({}), Task.deleteMany({}), Notification.deleteMany({}), ActivityLog.deleteMany({}),
  ]);

  // Departments
  const departments = await Department.insertMany(DEPARTMENTS);
  console.log(`✓ ${departments.length} departments`);

  // Admin
  const admin = await User.create({
    name: 'Alexandra Chen',
    email: 'admin@talentsphere.com',
    password: 'Admin@123',
    role: ROLES.ADMIN,
    jobTitle: 'Chief Operations Officer',
  });

  // Managers (one per department)
  const managers = [];
  for (let i = 0; i < departments.length; i++) {
    const fname = FIRST[i];
    const lname = rand(LAST);
    const mgr = await User.create({
      name: `${fname} ${lname}`,
      email: `manager${i + 1}@talentsphere.com`,
      password: 'Manager@123',
      role: ROLES.MANAGER,
      department: departments[i]._id,
      jobTitle: JOB_TITLES.manager[i],
    });
    managers.push(mgr);
    departments[i].head = mgr._id;
    await departments[i].save();
  }
  console.log(`✓ ${managers.length} managers`);

  // 20 Employees distributed across managers
  const employees = [];
  for (let i = 0; i < 20; i++) {
    const fname = FIRST[(i + 4) % FIRST.length];
    const lname = rand(LAST);
    const mgr = managers[i % managers.length];
    const emp = await User.create({
      name: `${fname} ${lname}`,
      email: `employee${i + 1}@talentsphere.com`,
      password: 'Employee@123',
      role: ROLES.EMPLOYEE,
      department: mgr.department,
      manager: mgr._id,
      jobTitle: rand(JOB_TITLES.employee),
    });
    employees.push(emp);
  }
  console.log(`✓ ${employees.length} employees`);

  // Teams
  for (let i = 0; i < managers.length; i++) {
    const teamMembers = employees.filter((e) => e.manager.toString() === managers[i]._id.toString());
    await Team.create({
      name: `${departments[i].name} Team`,
      department: departments[i]._id,
      manager: managers[i]._id,
      members: teamMembers.map((m) => m._id),
    });
  }

  // Projects (assigned to managers)
  const projects = [];
  for (let i = 0; i < PROJECT_NAMES.length; i++) {
    const mgr = managers[i % managers.length];
    const [name, key] = PROJECT_NAMES[i];
    const proj = await Project.create({
      name,
      key,
      description: `${name} — strategic initiative owned by ${mgr.name}.`,
      department: mgr.department,
      manager: mgr._id,
      createdBy: admin._id,
      priority: rand(PRIORITIES),
      startDate: daysFromNow(-30 + i * 3),
      dueDate: daysFromNow(30 + i * 10),
      color: departments[i % departments.length].color,
      progress: Math.floor(Math.random() * 80) + 10,
    });
    projects.push(proj);
  }
  console.log(`✓ ${projects.length} projects`);

  // Tasks: admin_task (admin -> manager) + subtasks (manager -> employee)
  const statuses = [
    TASK_STATUS.ASSIGNED, TASK_STATUS.IN_PROGRESS, TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.SUBMITTED, TASK_STATUS.SENT_TO_ADMIN, TASK_STATUS.COMPLETED,
    TASK_STATUS.MANAGER_REJECTED, TASK_STATUS.COMPLETED,
  ];
  const progressByStatus = {
    [TASK_STATUS.ASSIGNED]: 0,
    [TASK_STATUS.IN_PROGRESS]: rand([30, 60, 90]),
    [TASK_STATUS.SUBMITTED]: 100,
    [TASK_STATUS.SENT_TO_ADMIN]: 100,
    [TASK_STATUS.COMPLETED]: 100,
    [TASK_STATUS.MANAGER_REJECTED]: 90,
  };

  let taskCount = 0;
  for (const project of projects) {
    const mgr = managers.find((m) => m._id.toString() === project.manager.toString());
    const teamEmployees = employees.filter((e) => e.manager.toString() === mgr._id.toString());

    // 2 admin tasks per project assigned to the manager
    for (let t = 0; t < 2; t++) {
      const adminTask = await Task.create({
        title: `${rand(TASK_TITLES)} (${project.key})`,
        description: 'High-level deliverable assigned by leadership.',
        project: project._id,
        department: project.department,
        type: 'admin_task',
        assignedTo: mgr._id,
        assignedBy: admin._id,
        priority: rand(PRIORITIES),
        status: rand([TASK_STATUS.IN_PROGRESS, TASK_STATUS.ASSIGNED]),
        progress: rand([20, 40, 60]),
        startDate: daysFromNow(-10),
        dueDate: daysFromNow(rand([-3, 5, 14, 21])),
        instructions: 'Coordinate with your team and break this down into actionable subtasks.',
        checklist: [
          { text: 'Define scope', done: true },
          { text: 'Assign subtasks', done: true },
          { text: 'Review deliverables', done: false },
        ],
      });
      taskCount++;

      // 3 subtasks per admin task assigned to employees
      for (let s = 0; s < 3; s++) {
        const emp = rand(teamEmployees);
        if (!emp) continue;
        const status = rand(statuses);
        const sub = await Task.create({
          title: rand(TASK_TITLES),
          description: 'Implementation subtask broken down from the parent deliverable.',
          project: project._id,
          department: project.department,
          type: 'subtask',
          parentTask: adminTask._id,
          assignedTo: emp._id,
          assignedBy: mgr._id,
          priority: rand(PRIORITIES),
          status,
          progress: progressByStatus[status] ?? 50,
          accepted: status !== TASK_STATUS.ASSIGNED,
          startDate: daysFromNow(-7),
          dueDate: daysFromNow(rand([-2, 3, 7, 12])),
          instructions: 'Follow the design spec and update progress regularly.',
          checklist: [
            { text: 'Review requirements', done: true },
            { text: 'Implement feature', done: status === TASK_STATUS.COMPLETED },
            { text: 'Add tests', done: status === TASK_STATUS.COMPLETED },
          ],
          managerReview:
            [TASK_STATUS.SENT_TO_ADMIN, TASK_STATUS.COMPLETED].includes(status)
              ? { status: 'approved', reviewedBy: mgr._id, reviewedAt: new Date() }
              : status === TASK_STATUS.MANAGER_REJECTED
              ? { status: 'rejected', comment: 'Please address edge cases and resubmit.', reviewedBy: mgr._id, reviewedAt: new Date() }
              : { status: 'pending' },
          adminReview:
            status === TASK_STATUS.COMPLETED
              ? { status: 'approved', reviewedBy: admin._id, reviewedAt: new Date() }
              : { status: 'pending' },
        });
        taskCount++;

        await ActivityLog.create({
          actor: mgr._id,
          action: 'task_assigned',
          message: `${mgr.name} assigned "${sub.title}" to ${emp.name}`,
          task: sub._id,
          project: project._id,
        });
      }
    }
  }
  console.log(`✓ ${taskCount} tasks`);

  // Sample notifications for admin and a manager
  await Notification.create([
    { user: admin._id, type: 'progress_updated', title: 'Tasks awaiting final approval', message: 'Several tasks have been escalated for your review.' },
    { user: managers[0]._id, type: 'task_assigned', title: 'New project assigned', message: 'You have been assigned to a new strategic project.' },
  ]);

  await ActivityLog.create({
    actor: admin._id,
    action: 'project_created',
    message: `${admin.name} initialized the workspace with ${projects.length} projects`,
  });

  console.log('\n========================================');
  console.log('  Seed complete! Login credentials:');
  console.log('========================================');
  console.log('  ADMIN     → admin@talentsphere.com / Admin@123');
  console.log('  MANAGER   → manager1@talentsphere.com / Manager@123');
  console.log('  EMPLOYEE  → employee1@talentsphere.com / Employee@123');
  console.log('========================================\n');

  await mongoose.connection.close();
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
