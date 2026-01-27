// src/routes/tournamentRouter.js
const express = require("express");
const router = express.Router();
const tournamentController = require("../controllers/tournamentController");
const { verifyToken } = require("../middlewares/authMiddleware");

// Public: 목록 조회, 상세 조회
router.get("/", tournamentController.getAllTournaments);
router.get("/:id", tournamentController.getTournamentDetail);
router.get("/:id/bracket", tournamentController.getBracket);
router.get("/:id/participants", tournamentController.getParticipants); // ⭐ 추가

// Protected: 생성, 참가, 설정(시작)
router.post("/", verifyToken, tournamentController.createTournament);
router.post("/:id/join", verifyToken, tournamentController.joinTournament);
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

module.exports = router;
