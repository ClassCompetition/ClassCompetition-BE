// force_reset_je_bal.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🔄 '제발' 대회 강제 초기화를 시작합니다...");

  // 1. 이름으로 대회 찾기
  const tournament = await prisma.tournament.findFirst({
    where: { name: "제발" },
  });

  if (!tournament) {
    console.error("❌ '제발'이라는 이름의 대회를 찾을 수 없습니다.");
    return;
  }

  console.log(
    `✅ 대회를 찾았습니다: [ID: ${tournament.id}] ${tournament.name} (현재 상태: ${tournament.status})`,
  );

  // 2. 관련 매치(경기) 데이터 모두 삭제
  const deletedMatches = await prisma.match.deleteMany({
    where: { tournamentId: tournament.id },
  });
  console.log(
    `🗑️ 연관된 경기 데이터 ${deletedMatches.count}개를 삭제했습니다.`,
  );

  // 3. 대회 상태를 '모집 중(RECRUITING)'으로 변경
  // (만약 예정 상태를 원하시면 status: 'UPCOMING'으로 변경하세요)
  const updatedTournament = await prisma.tournament.update({
    where: { id: tournament.id },
    data: {
      status: "RECRUITING", // 모집 중으로 변경 (참가 신청 가능 상태)
      bracketGeneration: null, // 대진표 생성 방식 초기화
      startDate: new Date(), // 시작일 오늘로 갱신 (선택사항)
    },
  });

  console.log(
    `✨ 초기화 완료! 대회 상태가 '${updatedTournament.status}'으로 변경되었습니다.`,
  );
  console.log(
    "👉 웹사이트에서 새로고침(F5) 후 '참가 신청' 버튼이 뜨는지 확인해보세요.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
