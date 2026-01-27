// src/routes/teamRouter.js
const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.use(verifyToken); // 모든 팀 기능은 로그인 필요

// 1. 팀 목록 및 생성
router.get('/', teamController.getMyTeams); // 명세서: GET /api/teams (내 팀 목록)
router.post('/', teamController.createTeam);

// 2. 가입 신청 (초대 코드 이용)
router.post('/join', teamController.joinTeam);

// 3. 팀 상세 및 관리
router.get('/:id', teamController.getTeamDetail);
router.get('/seek', teamController.seekTeam);

// 4. 가입 신청 승인/거절 (팀장 전용)
router.post('/:id/requests/:requestId/approve', teamController.approveRequest);
router.post('/:id/requests/:requestId/reject', teamController.rejectRequest);

// 5. 경기 기록 (추후 구현 예정 - 빈 컨트롤러 연결 또는 생략 가능)
// router.get('/:id/matches', teamController.getTeamMatches);

module.exports = router;