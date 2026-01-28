const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("🔄 토너먼트 진행 시뮬레이션 시작...");

  // 1. 가장 최근의 ONGOING 토너먼트 찾기
  const tournament = await prisma.tournament.findFirst({
    where: { status: 'ONGOING' },
    orderBy: { createdAt: 'desc' }
  });

  if (!tournament) {
    console.log("⚠️ 진행 중인(ONGOING) 토너먼트가 없습니다.");
    return;
  }
  console.log(`✅ 토너먼트 발견: [${tournament.name}] (ID: ${tournament.id})`);

  // 2. 진행 중인(UPCOMING) 토너먼트 경기 찾기
  let matches = await prisma.match.findMany({
    where: {
      tournamentId: tournament.id,
      stage: 'TOURNAMENT',
      status: 'UPCOMING'
    },
    orderBy: { id: 'asc' }
  });

  // [수정] UPCOMING 경기가 없으면, 가장 최근에 완료된 라운드를 찾아서 복구 시도
  if (matches.length === 0) {
    console.log("ℹ️ 진행 중인(UPCOMING) 경기가 없습니다. 복구 모드로 전환합니다...");
    
    // 가장 최근에 완료된 경기들을 찾음 (ID 역순)
    const lastDoneMatches = await prisma.match.findMany({
      where: {
        tournamentId: tournament.id,
        stage: 'TOURNAMENT',
        status: 'DONE'
      },
      orderBy: { id: 'desc' }
    });

    if (lastDoneMatches.length === 0) {
      console.log("⚠️ 완료된 경기도 없습니다. 대진표가 아예 생성되지 않았을 수 있습니다.");
      return;
    }

    // 가장 최근 경기들의 라운드 이름 파악
    const lastRoundName = lastDoneMatches[0].roundName;
    console.log(`🔍 가장 최근 완료된 라운드: ${lastRoundName}`);

    // 해당 라운드의 모든 경기가 끝났는지 확인
    const currentRoundMatches = await prisma.match.findMany({
      where: {
        tournamentId: tournament.id,
        stage: 'TOURNAMENT',
        roundName: lastRoundName
      },
      orderBy: { id: 'asc' }
    });

    // 이미 다음 라운드가 생성되었는지 확인 (다음 라운드 경기가 있는지)
    // 간단히: 현재 라운드 매치 수의 절반인 다음 라운드가 있는지 체크?
    // 아니면 그냥 강제로 다음 라운드 생성 시도 (중복 생성 방지 필요하지만 일단 진행)
    
    // 승자 수집
    const winners = currentRoundMatches.map(m => m.winnerTeamId).filter(id => id !== null);
    
    if (winners.length < 2) {
       console.log("⚠️ 승자가 2명 미만입니다. (우승자 결정됨?)");
       return;
    }

    // 다음 라운드 매치 생성 로직으로 바로 이동
    await createNextRound(tournament.id, winners);
    return;
  }

  console.log(`🏁 진행 중인 경기 ${matches.length}개를 발견했습니다. 랜덤 승자로 종료 처리합니다...`);

  // 3. 경기 결과 업데이트 (랜덤 승자)
  const roundName = matches[0].roundName;
  
  for (const match of matches) {
    if (!match.teamAId || !match.teamBId) {
        console.log(`⚠️ 경기 #${match.id}는 팀이 배정되지 않아 건너뜁니다.`);
        continue;
    }

    const isTeamAWins = Math.random() > 0.5;
    const winnerId = isTeamAWins ? match.teamAId : match.teamBId;
    const scoreA = isTeamAWins ? 2 : 1;
    const scoreB = isTeamAWins ? 1 : 2;

    await prisma.match.update({
      where: { id: match.id },
      data: {
        teamAScore: scoreA,
        teamBScore: scoreB,
        winnerTeamId: winnerId,
        status: 'DONE'
      }
    });

    console.log(`   👉 경기 #${match.id} (${match.roundName}) 종료: 승자 Team ${winnerId}`);
  }

  // 4. 다음 라운드 생성 체크
  const currentRoundMatches = await prisma.match.findMany({
    where: {
      tournamentId: tournament.id,
      roundName: roundName,
      stage: 'TOURNAMENT'
    },
    orderBy: { id: 'asc' }
  });
  
  const winners = currentRoundMatches.map(m => m.winnerTeamId).filter(id => id !== null);
  await createNextRound(tournament.id, winners);
}

// 헬퍼 함수: 다음 라운드 생성
async function createNextRound(tournamentId, winners) {
  if (winners.length < 2) {
      if (winners.length === 1) {
          console.log(`🎉 우승자가 결정되었습니다! Team ID: ${winners[0]}`);
          await prisma.tournament.update({
              where: { id: tournamentId },
              data: { status: 'ENDED' }
          });
      }
      return;
  }

  const nextRoundName = winners.length === 2 ? "결승" : `${winners.length}강`;
  
  // 중복 생성 방지: 이미 해당 라운드 경기가 있는지 확인
  const existing = await prisma.match.findFirst({
      where: {
          tournamentId: tournamentId,
          stage: 'TOURNAMENT',
          roundName: nextRoundName
      }
  });

  if (existing) {
      console.log(`⚠️ [${nextRoundName}] 대진표가 이미 존재합니다. 생성하지 않습니다.`);
      return;
  }

  console.log(`🚀 다음 라운드 [${nextRoundName}] 대진표를 생성합니다. (진출 팀: ${winners.length}팀)`);
  
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 1);
  baseDate.setHours(18, 0, 0, 0);

  const matchesToCreate = [];
  const matchCount = winners.length / 2;

  for (let i = 0; i < matchCount; i++) {
    const teamAId = winners[i * 2];
    const teamBId = winners[i * 2 + 1];

    matchesToCreate.push({
      tournamentId: tournamentId,
      stage: 'TOURNAMENT',
      roundName: nextRoundName,
      teamAId,
      teamBId,
      status: 'UPCOMING',
      matchDate: new Date(baseDate.getTime() + i * 3600000)
    });
  }

  await prisma.match.createMany({ data: matchesToCreate });
  console.log(`✨ [${nextRoundName}] ${matchesToCreate.length}경기 생성 완료! 대진표를 확인해보세요.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
