// src/routes/teamRouter.js
const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.use(verifyToken);

router.get('/', teamController.getMyTeams);
router.post('/', teamController.createTeam);
router.get('/seek', teamController.seekTeam); 
router.get('/:id', teamController.getTeamDetail);
router.post('/join', teamController.joinTeam);

// 가입 승인/거절
router.post('/:id/approve/:requestId', teamController.approveRequest);
router.post('/:id/reject/:requestId', teamController.rejectRequest);

// ⭐️ [추가] 대표 전술 설정 라우트
router.put('/:id/representative-tactic', teamController.updateRepresentativeTactic);

module.exports = router;