// src/controllers/predictionController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. 경기 목록 및 베팅 상태 조회 (GET /api/predictions/matches)
// ==========================================
exports.getBettingMatches = async (req, res) => {
  const userId = req.userId;

  try {
    // 1. 경기 목록 조회
    const matches = await prisma.match.findMany({
      where: {
        teamAId: { not: null },
        teamBId: { not: null }
      },
      include: {
        teamA: true,
        teamB: true,
        tournament: true,
        predictions: true 
      },
      orderBy: { matchDate: 'asc' }
    });

    // 2. 데이터 가공
    const data = matches.map(m => {
      // (1) 배당률 계산
      const totalBets = m.predictions.reduce((sum, p) => sum + p.betAmount, 0);
      const teamABets = m.predictions.filter(p => p.predictedTeamId === m.teamAId).reduce((sum, p) => sum + p.betAmount, 0);
      const teamBBets = totalBets - teamABets;

      const ratioA = teamABets === 0 ? 1.0 : parseFloat((totalBets / teamABets).toFixed(2));
      const ratioB = teamBBets === 0 ? 1.0 : parseFloat((totalBets / teamBBets).toFixed(2));

      // (2) 현재 유저의 베팅 정보 찾기
      const myPrediction = m.predictions.find(p => p.userId === userId);
      
      let userBet = null;
      let earnedPoints = null;

      if (myPrediction) {
        userBet = {
          selectedTeamId: myPrediction.predictedTeamId,
          amount: myPrediction.betAmount
        };
        earnedPoints = myPrediction.payout; 
      }

      // (3) 상태 결정 (PENDING | COMPLETED)
      let status = 'PENDING';
      if (m.status === 'DONE' || m.status === 'COMPLETED' || m.status === 'FINISHED') {
        status = 'COMPLETED';
      }

      // ⭐️ [변경] 베팅 가능 여부: 경기 시작 전이면 항상 열림 (30분 제한 삭제)
      const matchTime = new Date(m.matchDate).getTime();
      const now = new Date().getTime();
      
      // 상태가 PENDING이고, 현재 시간이 경기 시간보다 작을 때(이전일 때)만 Open
      const isBettingOpen = status === 'PENDING' && now < matchTime;

      return {
        id: m.id,
        tournament: m.tournament.name,
        sport: m.tournament.sport,
        
        teamA: m.teamA.name,
        teamAId: m.teamA.id,
        
        teamB: m.teamB.name,
        teamBId: m.teamB.id,
        
        date: m.matchDate,
        status: status,
        winnerId: m.winnerTeamId,
        
        ratioA,
        ratioB,
        
        userBet,
        earnedPoints,
        isBettingOpen
      };
    });

    res.json({ success: true, data });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "경기 목록 조회 실패" } });
  }
};

// ==========================================
// 2. 베팅 제출 (POST /api/predictions)
// ==========================================
exports.createPrediction = async (req, res) => {
  const userId = req.userId;
  const { matchId, selectedTeamId, betAmount } = req.body;

  try {
    // 1. 경기 정보 확인
    const match = await prisma.match.findUnique({ where: { id: parseInt(matchId) } });
    if (!match) return res.status(404).json({ success: false, error: { message: "경기 없음" } });

    // ⭐️ [변경] 마감 시간 검증: 경기 시작 시간과 같거나 지났으면 마감
    const matchTime = new Date(match.matchDate).getTime();
    const now = new Date().getTime();

    if (now >= matchTime) {
      return res.status(400).json({ success: false, error: { message: "경기가 시작되어 베팅이 마감되었습니다." } });
    }

    // 2. 유저 포인트 & 중복 베팅 확인
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user.points < betAmount) {
      return res.status(400).json({ success: false, error: { message: "포인트가 부족합니다." } });
    }

    const existing = await prisma.prediction.findUnique({
      where: { userId_matchId: { userId, matchId: parseInt(matchId) } }
    });
    if (existing) {
      return res.status(400).json({ success: false, error: { message: "이미 베팅한 경기입니다." } });
    }

    // 3. 트랜잭션 처리
    const result = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { points: { decrement: parseInt(betAmount) } }
      });

      const prediction = await tx.prediction.create({
        data: {
          userId,
          matchId: parseInt(matchId),
          predictedTeamId: parseInt(selectedTeamId),
          betAmount: parseInt(betAmount),
          status: 'pending'
        }
      });
      return prediction;
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        matchId: result.matchId,
        selectedTeamId: result.predictedTeamId,
        betAmount: result.betAmount
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "베팅 실패" } });
  }
};

// ==========================================
// 3. 내 베팅 내역 (GET /api/predictions/my)
// ==========================================
exports.getMyPredictions = async (req, res) => {
  const userId = req.userId;

  try {
    const predictions = await prisma.prediction.findMany({
      where: { userId },
      include: {
        match: {
          include: { teamA: true, teamB: true }
        },
        predictedTeam: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const data = predictions.map(p => ({
      id: p.id,
      match: `${p.match.teamA?.name} vs ${p.match.teamB?.name}`,
      predictedTeam: p.predictedTeam.name,
      betAmount: p.betAmount,
      status: p.status, 
      result: p.payout ? `+${p.payout}P` : '-',
      date: p.createdAt
    }));

    res.json({ success: true, data });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "내역 조회 실패" } });
  }
};