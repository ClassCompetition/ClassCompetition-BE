const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const tournamentId = 3;
  console.log(`🛠️ Tournament ${tournamentId} 데이터 복구를 시작합니다...`);

  // 1. 잘못된 매치 삭제
  const deletedMatches = await prisma.match.deleteMany({
    where: { tournamentId: tournamentId },
  });
  console.log(`🗑️ 기존 매치 ${deletedMatches.count}개 삭제 완료`);

  // 2. 대회 상태 초기화 (UPCOMING)
  const updatedTournament = await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "UPCOMING" },
  });
  console.log(
    `🔄 대회 상태를 '${updatedTournament.status}'으로 초기화했습니다.`,
  );

  // 3. (옵션) 참가 팀 확인
  const participants = await prisma.tournamentTeam.findMany({
    where: { tournamentId: tournamentId, status: "APPROVED" },
  });
  console.log(`ℹ️ 현재 승인된 참가 팀 수: ${participants.length}팀`);

  console.log('✅ 복구 완료. 이제 웹에서 "대회 시작"을 다시 눌러주세요.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
