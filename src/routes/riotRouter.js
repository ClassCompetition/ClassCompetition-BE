const express = require('express');
const router = express.Router();
const riotController = require('../controllers/riotController');
const { verifyToken } = require('../middlewares/authMiddleware'); // 로그인한 사람만 쓰게 하려면

// POST /api/riot/summoner
router.post('/summoner', verifyToken, riotController.getSummonerData);

module.exports = router;