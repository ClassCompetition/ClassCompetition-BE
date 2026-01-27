const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middlewares/authMiddleware');

// 모든 요청에 토큰 필요
router.use(verifyToken);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/profile/sports/:sportType', userController.updateSportProfile);

module.exports = router;