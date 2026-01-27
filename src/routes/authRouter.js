const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.post('/register', authController.register); // 신규 추가
router.post('/login', authController.login);
router.get('/me', verifyToken, authController.getMe); // 토큰 검증 필요

module.exports = router;