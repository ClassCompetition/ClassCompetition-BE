// src/routes/teamRouter.js
const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');

// POST /api/teams -> 팀 생성
router.post('/', teamController.createTeam);

// GET /api/teams -> 팀 목록 조회
router.get('/', teamController.getAllTeams);

// [추가] POST /api/teams/join -> 초대 코드로 가입
router.post('/join', teamController.joinTeam);

module.exports = router;