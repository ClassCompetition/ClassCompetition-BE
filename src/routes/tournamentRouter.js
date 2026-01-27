// src/routes/tournamentRouter.js
const express = require("express");
const router = express.Router();
const tournamentController = require("../controllers/tournamentController");
const { verifyToken } = require("../middlewares/authMiddleware");

// Public: 목록 조회, 상세 조회
router.get("/", tournamentController.getAllTournaments);
router.get("/:id", tournamentController.getTournamentDetail);
router.get("/:id/bracket", tournamentController.getBracket);
router.get("/:id/standings", tournamentController.getLeagueStandings); // ⭐ 리그 순위표
router.get("/:id/matches", tournamentController.getLeagueMatches); // ⭐ 리그 경기 일정
router.get("/:id/participants", tournamentController.getParticipants); // ⭐ 추가

// Protected: 생성, 참가, 설정(시작)
router.post("/", verifyToken, tournamentController.createTournament);
router.post("/:id/join", verifyToken, tournamentController.joinTournament);
router.post(
  "/:id/participants/process",
  verifyToken,
  tournamentController.processTournamentRequest,
); // ⭐️ 승인/거절
router.put("/:id/settings", verifyToken, tournamentController.updateSettings); // 시작 트리거

// ⭐ Bracket Generation
router.post(
  "/:id/generate-bracket",
  verifyToken,
  tournamentController.generateBracket,
);
router.post(
  "/:id/bracket/manual",
  verifyToken,
  tournamentController.createManualBracket,
);

// ⭐ Hybrid Playoff
router.post("/:id/playoff", verifyToken, tournamentController.startPlayoff);

module.exports = router;
