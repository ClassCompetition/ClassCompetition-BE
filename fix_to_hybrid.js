// fix_to_hybrid.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🛠️ '제발' 대회를 하이브리드(HYBRID)로 수정합니다...");

  // 1. 대회 찾기
  const tournament = await prisma.tournament.findFirst({
    where: { name: "제발" },
  });

  if (!tournament) {
    console.error("❌ '제발' 대회를 찾을 수 없습니다.");
    return;
  }

  console.log(
    `ℹ️ 변경 전 상태: Format=[${tournament.format}], Status=[${tournament.status}]`,
  );

  // 2. 잘못 생성된 경기(Match) 데이터 싹 지우기
  const deletedMatches = await prisma.match.deleteMany({
    where: { tournamentId: tournament.id },
  });
  console.log(`🗑️ 기존 매치 ${deletedMatches.count}개를 삭제했습니다.`);

  // 3. 대회 설정을 HYBRID로 강제 변경
  const updated = await prisma.tournament.update({
    where: { id: tournament.id },
    data: {
      format: "HYBRID", // ⭐️ 핵심: 포맷 변경
      groupCount: 2, // 2개 조로 설정 (원하는 대로 수정 가능)
      playoffTeams: 4, // 본선 진출 4팀 (원하는 대로 수정 가능)
      status: "RECRUITING", // 다시 '모집 중' 상태로 (버튼 활성화 위해)
      bracketGeneration: null, // 생성 방식 초기화
    },
  });

  console.log(
    `✅ 변경 완료: Format=[${updated.format}], Status=[${updated.status}]`,
  );
  console.log(
    `👉 이제 웹사이트에서 새로고침 후 '대진표 생성'을 누르면 '조별 리그'가 생성될 것입니다.`,
  );
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
