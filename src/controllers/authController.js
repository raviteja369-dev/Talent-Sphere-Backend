import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken } from '../utils/token.js';
import { asyncHandler } from '../middleware/error.js';

const sanitize = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  jobTitle: user.jobTitle,
  phone: user.phone,
  department: user.department,
  manager: user.manager,
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (!user.isActive) {
    return res.status(403).json({ message: 'Your account has been deactivated' });
  }

  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user._id);
  res.json({ token, user: sanitize(user) });
});

// GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('department', 'name color');
  res.json(user);
});

// PUT /api/auth/profile
export const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  const { name, jobTitle, phone, avatar, currentPassword, newPassword } = req.body;

  if (name) user.name = name;
  if (jobTitle !== undefined) user.jobTitle = jobTitle;
  if (phone !== undefined) user.phone = phone;
  if (avatar !== undefined) user.avatar = avatar;

  if (newPassword) {
    if (!currentPassword || !(await user.matchPassword(currentPassword))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    user.password = newPassword;
  }

  await user.save();
  res.json(sanitize(user));
});

// POST /api/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() });

  // Always respond success to avoid user enumeration
  if (!user) {
    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  }

  const resetToken = user.getResetToken();
  await user.save({ validateBeforeSave: false });

  // In production this would be emailed. For the demo we return it.
  res.json({
    message: 'Password reset token generated.',
    resetToken,
    resetUrl: `${process.env.CLIENT_URL}/reset-password/${resetToken}`,
  });
});

// POST /api/auth/reset-password/:token
export const resetPassword = asyncHandler(async (req, res) => {
  const hashed = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpire: { $gt: Date.now() },
  }).select('+resetPasswordToken +resetPasswordExpire');

  if (!user) {
    return res.status(400).json({ message: 'Invalid or expired reset token' });
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  const token = generateToken(user._id);
  res.json({ token, user: sanitize(user) });
});
