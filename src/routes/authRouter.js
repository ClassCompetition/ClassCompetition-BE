// src/routes/authRouter.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// 명세서 1.1 ~ 1.3
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);

module.exports = router;