// src/controllers/predictionController.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ==========================================
// 1. 경기 목록 및 베팅 상태 조회 (GET /api/predictions/matches)
// ==========================================
exports.getBettingMatches = async (req, res) => {
  const userId = req.userId;

  try {
    const matches = await prisma.match.findMany({
      where: { teamAId: { not: null }, teamBId: { not: null } },
      include: {
        teamA: true,
        teamB: true,
        tournament: true,
        predictions: true,
      },
      orderBy: { matchDate: "asc" },
    });

    // ⭐️ [수정] 오늘 날짜의 '자정(00:00:00)'을 구합니다.
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 시,분,초,밀리초 제거

    const data = matches.map((m) => {
      // (1) 배당률 계산
      const totalPoints = m.predictions.reduce(
        (sum, p) => sum + p.betAmount,
        0,
      );
      const teamAPoints = m.predictions
        .filter((p) => p.predictedTeamId === m.teamAId)
        .reduce((sum, p) => sum + p.betAmount, 0);
      const teamBPoints = totalPoints - teamAPoints;

      const teamAPercent = totalPoints === 0 ? 50 : Math.round((teamAPoints / totalPoints) * 100);
      const teamBPercent = totalPoints === 0 ? 50 : Math.round((teamBPoints / totalPoints) * 100);

      const ratioA =
        totalPoints === 0
          ? 2.0
          : teamAPoints === 0
          ? 1.0
          : parseFloat((totalPoints / teamAPoints).toFixed(2));
      const ratioB =
        totalPoints === 0
          ? 2.0
          : teamBPoints === 0
          ? 1.0
          : parseFloat((totalPoints / teamBPoints).toFixed(2));

      // (2) 내 베팅 확인
      const myPrediction = m.predictions.find((p) => p.userId === userId);
      const userBet = myPrediction
        ? {
            selectedTeamId: myPrediction.predictedTeamId,
            amount: myPrediction.betAmount,
          }
        : null;
      const earnedPoints = myPrediction?.payout;

      // (3) 상태 결정
      let status = "PENDING";
      if (["DONE", "COMPLETED", "FINISHED"].includes(m.status))
        status = "COMPLETED";

      // ⭐️ [수정] 마감 로직: 날짜 객체끼리 비교 (시간 무시)
      let isBettingOpen = false;
      if (m.matchDate) {
        const matchDate = new Date(m.matchDate);
        matchDate.setHours(0, 0, 0, 0); // 경기 날짜도 자정으로 초기화

        // "오늘 자정"이 "경기일 자정"보다 작아야 함 (즉, 어제까지만 가능)
        // 28일 < 28일 (False) -> 마감
        // 28일 < 29일 (True) -> 오픈
        isBettingOpen =
          status === "PENDING" && today.getTime() < matchDate.getTime();
      }

      return {
        id: m.id,
        tournament: m.tournament.name,
        sport: m.tournament.sport,
        teamA: m.teamA.name,
        teamAId: m.teamA.id,
        teamB: m.teamB.name,
        teamBId: m.teamB.id,
        date: m.matchDate,
        status,
        winnerId: m.winnerTeamId,
        teamAPercent,
        teamBPercent,
        ratioA,
        ratioB,
        userBet,
        earnedPoints,
        isBettingOpen,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "조회 실패" } });
  }
};

// ==========================================
// 2. 베팅 제출 (POST /api/predictions)
// ==========================================
exports.createPrediction = async (req, res) => {
  const userId = req.userId;
  const { matchId, selectedTeamId, betAmount } = req.body;

  if (!matchId || !selectedTeamId || !betAmount || isNaN(selectedTeamId)) {
    return res
      .status(400)
      .json({ success: false, error: { message: "잘못된 요청" } });
  }

  try {
    const match = await prisma.match.findUnique({
      where: { id: parseInt(matchId) },
    });
    if (!match)
      return res
        .status(404)
        .json({ success: false, error: { message: "경기 없음" } });

    // ⭐️ [수정] 날짜 검증: 시간 초기화 후 비교
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const matchDate = new Date(match.matchDate);
    matchDate.setHours(0, 0, 0, 0);

    if (match.status !== "UPCOMING" && match.status !== "PENDING") {
      return res
        .status(400)
        .json({ success: false, error: { message: "이미 종료된 경기" } });
    }

    // 오늘 날짜가 경기 날짜보다 크거나 같으면 마감 (당일 베팅 불가)
    if (today.getTime() >= matchDate.getTime()) {
      return res
        .status(400)
        .json({
          success: false,
          error: { message: "베팅 마감 (경기 당일 불가)" },
        });
    }

    // ... (포인트 차감 및 베팅 생성 로직 유지) ...
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user.points < betAmount)
      return res
        .status(400)
        .json({ success: false, error: { message: "포인트 부족" } });

    const existing = await prisma.prediction.findUnique({
      where: { userId_matchId: { userId, matchId: parseInt(matchId) } },
    });
    if (existing)
      return res
        .status(400)
        .json({ success: false, error: { message: "이미 베팅함" } });

    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { points: { decrement: parseInt(betAmount) } },
      });
      return await tx.prediction.create({
        data: {
          userId,
          matchId: parseInt(matchId),
          predictedTeamId: parseInt(selectedTeamId),
          betAmount: parseInt(betAmount),
          status: "pending",
        },
      });
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "베팅 실패" } });
  }
};

// ... (나머지 getMyPredictions 등은 그대로 유지)
exports.getMyPredictions = async (req, res) => {
  const userId = req.userId;
  try {
    const predictions = await prisma.prediction.findMany({
      where: { userId },
      include: {
        match: { include: { teamA: true, teamB: true } },
        predictedTeam: true,
      },
      orderBy: { createdAt: "desc" },
    });
    const data = predictions.map((p) => ({
      id: p.id,
      match: `${p.match.teamA?.name} vs ${p.match.teamB?.name}`,
      predictedTeam: p.predictedTeam.name,
      betAmount: p.betAmount,
      status: p.status,
      result: p.payout ? `+${p.payout}P` : "-",
      date: p.createdAt,
    }));
    res.json({ success: true, data });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: { message: "내역 조회 실패" } });
  }
};

exports.getMatchStatistics = async (req, res) => {
  const { matchId } = req.params;
  try {
    const match = await prisma.match.findUnique({
      where: { id: parseInt(matchId) },
      include: { predictions: true },
    });
    if (!match)
      return res
        .status(404)
        .json({ success: false, error: { message: "경기 없음" } });
    const totalBets = match.predictions.reduce(
      (sum, p) => sum + p.betAmount,
      0,
    );
    const teamABets = match.predictions
      .filter((p) => p.predictedTeamId === match.teamAId)
      .reduce((sum, p) => sum + p.betAmount, 0);
    const teamBBets = totalBets - teamABets;
    const teamAPercent =
      totalBets === 0 ? 50 : Math.round((teamABets / totalBets) * 100);
    const teamBPercent =
      totalBets === 0 ? 50 : Math.round((teamBBets / totalBets) * 100);
    res.json({
      success: true,
      data: {
        matchId: match.id,
        totalBets,
        teamAPercent,
        teamBPercent,
        teamATotal: teamABets,
        teamBTotal: teamBBets,
      },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "통계 조회 실패" } });
  }
};
