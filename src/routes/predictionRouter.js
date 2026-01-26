// src/routes/predictionRouter.js
const express = require('express');
const router = express.Router();
const predictionController = require('../controllers/predictionController');
const { verifyToken } = require('../middlewares/authMiddleware'); // 로그인 확인용

// 1. 승부 예측하기 (토큰 필요)
// POST /api/predictions
router.post('/', verifyToken, predictionController.createPrediction);

// 2. 내 예측 내역 조회 (토큰 필요)
// GET /api/predictions/me
router.get('/me', verifyToken, predictionController.getMyPredictions);

module.exports = router;