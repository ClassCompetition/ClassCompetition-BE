// src/routes/matchRouter.js
const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Public: 경기 상세
router.get('/:id', matchController.getMatchDetail);

// Protected: 점수 입력 (관리자만)
router.put('/:id/score', verifyToken, matchController.updateScore);

module.exports = router;