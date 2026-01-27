// src/routes/tacticRouter.js
const express = require('express');
const router = express.Router();
const tacticController = require('../controllers/tacticController');
const { verifyToken } = require('../middlewares/authMiddleware');

// 조회는 로그인 없이 가능하게 할 수도 있지만, 명세서상 인증 권장
router.get('/', tacticController.getTactics);
router.get('/:id', tacticController.getTacticDetail);

// 생성/수정/삭제는 인증 필수
router.post('/', verifyToken, tacticController.createTactic);
router.put('/:id', verifyToken, tacticController.updateTactic);
router.delete('/:id', verifyToken, tacticController.deleteTactic);

module.exports = router;