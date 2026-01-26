// src/controllers/predictionController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. 승부 예측하기 (포인트 걸기)
// POST /api/predictions
exports.createPrediction = async (req, res) => {
  const userId = req.userId; // 미들웨어에서 가져온 내 ID
  const { matchId, predictedTeamId, betAmount } = req.body;

  try {
    // 트랜잭션: 포인트 차감 + 예측 기록 생성이 동시에 되어야 함
    const result = await prisma.$transaction(async (tx) => {
      // 1. 유저 지갑 확인
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user.points < betAmount) {
        throw new Error(`포인트가 부족합니다! (보유: ${user.points}P)`);
      }

      // 2. 포인트 차감
      await tx.user.update({
        where: { id: userId },
        data: { points: user.points - betAmount }
      });

      // 3. 예측 기록 생성
      const newPrediction = await tx.prediction.create({
        data: {
          userId,
          matchId: parseInt(matchId),
          predictedTeamId: parseInt(predictedTeamId),
          betAmount: parseInt(betAmount),
          result: 'pending' // 대기중
        }
      });

      return newPrediction;
    });

    res.status(201).json({ success: true, message: "예측 성공!", data: result });

  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, error: error.message || "예측 실패" });
  }
};

// 2. 내 예측 내역 조회
// GET /api/predictions/me
exports.getMyPredictions = async (req, res) => {
  const userId = req.userId;
  try {
    const predictions = await prisma.prediction.findMany({
      where: { userId },
      include: { match: { include: { team1: true, team2: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: predictions });
  } catch (error) {
    res.status(500).json({ success: false, error: "조회 실패" });
  }
};