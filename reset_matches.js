// reset_matches.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const TOURNAMENT_ID = 1; // ⭐️ 문제가 생긴 대회 ID를 여기에 적으세요! (DB 확인 필요)

  console.log(`🧹 대회 ID ${TOURNAMENT_ID}의 매치 데이터를 초기화합니다...`);

  // 1. 해당 대회의 모든 매치 삭제
  const deletedMatches = await prisma.match.deleteMany({
    where: { tournamentId: TOURNAMENT_ID },
  });
  console.log(`❌ 잘못된 매치 ${deletedMatches.count}개 삭제 완료.`);

  // 2. 대회 상태를 다시 'RECRUITING' 또는 'UPCOMING'으로 변경
  await prisma.tournament.update({
    where: { id: TOURNAMENT_ID },
    data: {
      status: "UPCOMING", // 다시 시작 전 상태로
      bracketGeneration: null,
    },
  });
  console.log(`🔄 대회 상태를 'UPCOMING'으로 되돌렸습니다.`);

  console.log("✅ 복구 완료! 이제 웹에서 다시 '대진표 생성'을 눌러보세요.");
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
