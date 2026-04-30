// ─── Auth Routes ──────────────────────────────────────────────────────────────
// File: src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { validate, schemas } = require('../middleware/validateMiddleware');

router.post('/register', validate(schemas.registerSchema), authCtrl.register);
router.post('/login', validate(schemas.loginSchema), authCtrl.login);
router.post('/refresh-token', authCtrl.refreshToken);
router.post('/forgot-password', authCtrl.forgotPassword);
router.put('/reset-password/:token', authCtrl.resetPassword);
router.get('/me', protect, authCtrl.getMe);
router.put('/update-profile', protect, authCtrl.updateProfile);
router.put('/change-password', protect, authCtrl.changePassword);

module.exports = router;
