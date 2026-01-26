// src/controllers/matchController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.updateMatchResult = async (req, res) => {
  const { id } = req.params; // matchId
  const { winnerId, scoreA, scoreB } = req.body;

  try {
    // 1. 경기 정보 + 대회 정보 + 양 팀 멤버 정보까지 싹 긁어오기
    const match = await prisma.match.findUnique({
      where: { id: parseInt(id) },
      include: {
        tournament: true, // 대회 관리자 찾기 위해
        teamA: { include: { members: true } }, // A팀 멤버(팀장, 선수)
        teamB: { include: { members: true } }  // B팀 멤버(팀장, 선수)
      }
    });

    if (!match) return res.status(404).json({ error: "경기 없음" });

    // [트랜잭션 시작] 경기 결과 업데이트 + 다음 라운드 진출 + 포인트 지급
    await prisma.$transaction(async (tx) => {
      
      // (1) 경기 결과 업데이트
      await tx.match.update({
        where: { id: match.id },
        data: { winnerId, scoreA, scoreB, status: 'FINISHED' }
      });

      // (2) 다음 라운드 진출 로직 (기존과 동일)
      if (match.nextMatchId) {
        const nextMatch = await tx.match.findUnique({ where: { id: match.nextMatchId } });
        if (!nextMatch.teamAId) {
          await tx.match.update({ where: { id: nextMatch.id }, data: { teamAId: winnerId } });
        } else {
          await tx.match.update({ where: { id: nextMatch.id }, data: { teamBId: winnerId } });
        }
      }

      // (3) ⭐️ 활동 포인트 지급 (핵심 로직) ⭐️
      // 대상자들을 모두 모읍니다.
      const tournamentManagerId = match.tournament.managerId;
      
      // 양 팀의 모든 멤버들 (팀장 포함)
      const allMembers = [...match.teamA.members, ...match.teamB.members];
      
      // 중복 지급 방지를 위해 Set 사용 (처리된 유저 ID 기록)
      const processedUserIds = new Set();

      // A. 대회 관리자 처리 (최우선 순위)
      // 대회 관리자에게 100P 지급
      if (tournamentManagerId) {
        await tx.user.update({
          where: { id: tournamentManagerId },
          data: { point: { increment: 100 } }
        });
        processedUserIds.add(tournamentManagerId); // 처리 완료 명단에 등록
      }

      // B. 나머지 인원 처리 (팀 관리자 vs 선수)
      for (const member of allMembers) {
        const userId = member.userId;

        // 이미 대회 관리자로서 포인트를 받았다면? -> 패스! (중복 지급 X)
        if (processedUserIds.has(userId)) continue;

        let rewardPoint = 0;

        if (member.role === 'LEADER') {
          // 팀 관리자: 200P
          rewardPoint = 200;
        } else {
          // 일반 선수: 100P
          rewardPoint = 100;
        }

        // 포인트 지급
        await tx.user.update({
          where: { id: userId },
          data: { point: { increment: rewardPoint } }
        });
        
        processedUserIds.add(userId); // 처리 완료
      }
    });

    res.json({ message: '경기 종료! 결과 입력 및 활동 포인트 지급 완료.' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '결과 처리 실패' });
  }
};