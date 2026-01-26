// src/routes/tournamentRouter.js
const express = require('express');
const router = express.Router();
const tournamentController = require('../controllers/tournamentController');

// POST /api/tournaments -> 대회 및 대진표 생성
router.post('/', tournamentController.createTournament);

// GET /api/tournaments/:id/bracket -> 대진표 조회
router.get('/:id/bracket', tournamentController.getBracket);

module.exports = router;
