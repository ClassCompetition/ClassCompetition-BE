// src/routes/tacticRouter.js
const express = require('express');
const router = express.Router();
const tacticController = require('../controllers/tacticController');

// 전술 생성
router.post('/', tacticController.createTactic);

// 특정 팀의 전술 목록 조회
router.get('/team/:teamId', tacticController.getTeamTactics);

// 특정 전술 상세 조회
router.get('/:id', tacticController.getTacticDetail);

// 전술 수정
router.put('/:id', tacticController.updateTactic);

// 전술 삭제
router.delete('/:id', tacticController.deleteTactic);

module.exports = router;