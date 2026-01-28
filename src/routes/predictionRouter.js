// src/routes/predictionRouter.js
const express = require("express");
const router = express.Router();
const predictionController = require("../controllers/predictionController");
const { verifyToken } = require("../middlewares/authMiddleware");

router.use(verifyToken);

router.get("/matches", predictionController.getBettingMatches);
router.post("/", predictionController.createPrediction);
router.get("/my", predictionController.getMyPredictions);
router.get("/match/:matchId", predictionController.getMatchStatistics);

module.exports = router;
