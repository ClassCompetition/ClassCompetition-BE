// src/routes/tacticRouter.js
const express = require('express');
const router = express.Router();
const tacticController = require('../controllers/tacticController');
const { verifyToken } = require('../middlewares/authMiddleware');

// ⭐️ 모든 전술 관련 기능(조회 포함)은 로그인이 필요합니다.
// 컨트롤러에서 req.userId를 사용하기 때문입니다.
router.use(verifyToken); 

// 전술 목록 조회 & 상세 조회
router.get('/', tacticController.getTactics);
router.get('/:id', tacticController.getTacticDetail);

// 전술 생성, 수정, 삭제
router.post('/', tacticController.createTactic);
router.put('/:id', tacticController.updateTactic);
router.delete('/:id', tacticController.deleteTactic);

module.exports = router;