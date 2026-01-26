// src/routes/matchRouter.js
const express = require('express');
const router = express.Router();
const matchController = require('../controllers/matchController');

// POST /api/matches/:id/result -> 결과 입력 및 승자 진출
router.post('/:id/result', matchController.updateMatchResult);

module.exports = router;