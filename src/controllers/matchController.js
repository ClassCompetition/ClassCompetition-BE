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

// ------------------------------------------------------------------
// 🔒 Internal Helper: 다음 라운드 대진표 생성
// ------------------------------------------------------------------
async function _createNextRound(tx, tournamentId, winnerIds, stage) {
  // 1. 다음 라운드 진출 팀 수
  const teamCount = winnerIds.length;
  
  // 2. 더 이상 진행할 매치가 없으면 종료 (예: 결승 종료 후)
  if (teamCount < 2) {
    // 결승이 끝났으므로 대회 상태를 ENDED로 변경할 수도 있음
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: 'ENDED' }
    });
    return;
  }

  // 3. 라운드 이름 결정 (4명 -> 4강 -> 준결승, 2명 -> 결승)
  let roundName = `${teamCount}강`;
  if (teamCount === 2) roundName = "결승";
  else if (teamCount === 4) roundName = "준결승";

  // 4. 매치 생성
  const matchCount = teamCount / 2;
  
  // 날짜 계산을 위한 기준 시간 (현재 시간 + 1일 혹은 마지막 경기 다음 날 등)
  // 여기서는 편의상 "내일 저녁 6시" 부터 시작으로 설정
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 1);
  baseDate.setHours(18, 0, 0, 0);

  const matchesToCreate = [];

  for (let i = 0; i < matchCount; i++) {
    const teamAId = winnerIds[i * 2];
    const teamBId = winnerIds[i * 2 + 1];

    const matchDate = new Date(baseDate.getTime() + i * 60 * 60 * 1000); // 1시간 간격

    matchesToCreate.push({
      tournamentId,
      stage,
      roundName,
      teamAId,
      teamBId,
      status: "UPCOMING",
      matchDate
    });
  }

  await tx.match.createMany({ data: matchesToCreate });
}

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

    let nextRoundCreated = false;

    // 트랜잭션으로 결과 저장 + 포인트 정산 처리 + 다음 라운드 생성
    await prisma.$transaction(async (tx) => {
        // 1. 경기 결과 업데이트
        const updatedMatch = await tx.match.update({
          where: { id: parseInt(id) },
          data: {
            teamAScore, teamBScore, winnerTeamId, status: status || 'DONE'
          }
        });

        // 2. 경기가 끝났다면('DONE'), 베팅 정산
        if (status === 'DONE' && winnerTeamId) {
            // ... (베팅 정산 로직 유지) ...
            const predictions = await tx.prediction.findMany({
                where: { matchId: parseInt(id), status: 'pending' }
            });

            const totalPot = predictions.reduce((sum, p) => sum + p.betAmount, 0);
            const winningPot = predictions
                .filter(p => p.predictedTeamId === winnerTeamId)
                .reduce((sum, p) => sum + p.betAmount, 0);

            let multiplier = winningPot > 0 ? totalPot / winningPot : 1;
            
            for (const p of predictions) {
                if (p.predictedTeamId === winnerTeamId) {
                    const payout = Math.floor(p.betAmount * multiplier);
                    await tx.prediction.update({
                        where: { id: p.id },
                        data: { status: 'won', payout }
                    });
                    await tx.user.update({
                        where: { id: p.userId },
                        data: { points: { increment: payout } }
                    });
                } else {
                    await tx.prediction.update({
                        where: { id: p.id },
                        data: { status: 'lost', payout: 0 }
                    });
                }
            }

            // ⭐️ [추가] 다음 라운드 진출 로직
            // 현재 라운드의 모든 경기가 끝났는지 확인
            const currentRoundMatches = await tx.match.findMany({
              where: {
                tournamentId: match.tournamentId,
                roundName: match.roundName, // 예: "4강"
                stage: match.stage // 예: "TOURNAMENT"
              },
              orderBy: { id: 'asc' } // 대진표 순서대로 정렬 가정
            });

            const allFinished = currentRoundMatches.every(m => m.status === 'DONE');

            if (allFinished) {
              // 승자들 수집 (대진표 순서대로)
              const winners = currentRoundMatches.map(m => m.winnerTeamId);
              
              // 다음 라운드 생성
              if (winners.length >= 2) {
                 await _createNextRound(tx, match.tournamentId, winners, match.stage);
                 nextRoundCreated = true;
              } else if (winners.length === 1) {
                 // 결승 종료 -> 대회 종료 처리
                 await tx.tournament.update({
                   where: { id: match.tournamentId },
                   data: { status: 'ENDED' }
                 });
              }
            }
        }
    });

    res.json({ 
      success: true, 
      message: nextRoundCreated 
        ? "경기 결과 저장 완료. 다음 라운드 대진표가 생성되었습니다!" 
        : "경기 결과 저장 및 포인트 정산 완료." 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "결과 처리 실패" } });
  }
};