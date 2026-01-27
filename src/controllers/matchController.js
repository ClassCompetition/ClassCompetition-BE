// src/controllers/matchController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. 경기 상세 조회 (GET /api/matches/:id)
// ==========================================
exports.getMatchDetail = async (req, res) => {
  const { id } = req.params;

  try {
    const match = await prisma.match.findUnique({
      where: { id: parseInt(id) },
      include: {
        tournament: true,
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
        predictions: true
      }
    });

    if (!match) return res.status(404).json({ success: false, error: { message: "경기 없음" } });

    // 예측 통계 계산
    const totalVotes = match.predictions.length;
    const teamAVotes = match.predictions.filter(p => p.predictedTeamId === match.teamAId).length;
    const teamBVotes = totalVotes - teamAVotes;

    res.json({
      success: true,
      data: {
        id: match.id,
        tournamentName: match.tournament.name,
        roundName: match.roundName,
        status: match.status,
        matchDate: match.matchDate,
        teamA: match.teamA ? { id: match.teamA.id, name: match.teamA.name, score: match.teamAScore } : null,
        teamB: match.teamB ? { id: match.teamB.id, name: match.teamB.name, score: match.teamBScore } : null,
        predictions: {
          totalVotes,
          teamA: teamAVotes,
          teamB: teamBVotes
        }
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "경기 조회 실패" } });
  }
};

// ==========================================
// 2. 경기 결과 입력 (PUT /api/matches/:id/score)
// ==========================================
exports.updateScore = async (req, res) => {
  const { id } = req.params;
  const { teamAScore, teamBScore, winnerTeamId, status } = req.body;
  const userId = req.userId; 

  try {
    const match = await prisma.match.findUnique({ 
        where: { id: parseInt(id) },
        include: { tournament: true } 
    });

    if (!match) return res.status(404).json({ success: false, error: { message: "경기 없음" } });
    if (match.tournament.managerId !== userId) {
        return res.status(403).json({ success: false, error: { message: "권한이 없습니다." } });
    }

    // 트랜잭션으로 결과 저장 + 포인트 정산 처리
    await prisma.$transaction(async (tx) => {
        // 1. 경기 결과 업데이트
        await tx.match.update({
          where: { id: parseInt(id) },
          data: {
            teamAScore, teamBScore, winnerTeamId, status: status || 'DONE'
          }
        });

        // 2. 경기가 끝났다면('DONE'), 베팅 정산 시작
        if (status === 'DONE' && winnerTeamId) {
            // 해당 경기의 모든 예측 가져오기
            const predictions = await tx.prediction.findMany({
                where: { matchId: parseInt(id), status: 'pending' }
            });

            // 전체 베팅 금액 (배당률 계산용)
            const totalPot = predictions.reduce((sum, p) => sum + p.betAmount, 0);
            // 승리 팀에 건 총 금액
            const winningPot = predictions
                .filter(p => p.predictedTeamId === winnerTeamId)
                .reduce((sum, p) => sum + p.betAmount, 0);

            // 배당률 (승리한 사람이 없으면 1배 - 즉 원금만? 혹은 시스템 룰에 따름. 여기선 단순화)
            // (간단 로직: 전체 판돈 / 승리 팀 판돈)
            let multiplier = winningPot > 0 ? totalPot / winningPot : 1;
            
            // 수수료 떼기? (예: 90%만 지급) -> 여기선 생략하고 100% 지급

            for (const p of predictions) {
                if (p.predictedTeamId === winnerTeamId) {
                    // 승리: 배당금 지급
                    const payout = Math.floor(p.betAmount * multiplier);
                    
                    // 1) 예측 상태 업데이트
                    await tx.prediction.update({
                        where: { id: p.id },
                        data: { status: 'won', payout }
                    });
                    
                    // 2) 유저 포인트 지급
                    await tx.user.update({
                        where: { id: p.userId },
                        data: { points: { increment: payout } }
                    });

                } else {
                    // 패배: 상태만 업데이트
                    await tx.prediction.update({
                        where: { id: p.id },
                        data: { status: 'lost', payout: 0 }
                    });
                }
            }
        }
    });

    res.json({ success: true, message: "경기 결과 저장 및 포인트 정산 완료." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "결과 처리 실패" } });
  }
};