const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🚀 테스트 데이터 생성을 시작합니다...");

  // 1. 대회 찾기
  let tournament = await prisma.tournament.findFirst({
    where: { name: { contains: "ㅎㅇㅎㅇㄴ" } },
  });

  if (!tournament) {
    console.log('ℹ️ "ㅎㅇㅎㅇㄴ" 대회를 찾을 수 없어 새로 생성합니다.');
    // 관리자(매점빵) 찾기 - 없으면 첫 번째 유저로
    const manager = await prisma.user.findFirst();
    if (!manager) {
      console.error("❌ 유저가 하나도 없습니다. 먼저 회원가입을 진행해주세요.");
      return;
    }

    tournament = await prisma.tournament.create({
      data: {
        name: "ㅎㅇㅎㅇㄴ",
        status: "UPCOMING",
        managerId: manager.id,
        sport: "LoL",
        sportType: "lol",
        description: "테스트용 대회입니다.",
        targetTeamCount: 8,
        groupCount: 0,
      },
    });
  }

  console.log(`✅ 대회 ID: ${tournament.id}, 이름: ${tournament.name}`);

  // 2. 테스트 팀 생성 데이터
  const testTeams = [
    { name: "T1 Academy", description: "T1 아카데미 팀입니다." },
    { name: "Gen.G Academy", description: "Gen.G 아카데미 팀입니다." },
    { name: "DK Challengers", description: "DK 챌린저스입니당" },
    { name: "KT Rolster B", description: "KT 2군" },
    { name: "HLE B", description: "한화생명 2군" },
  ];

  for (const teamData of testTeams) {
    // 팀 존재 확인
    let team = await prisma.team.findFirst({
      where: { name: teamData.name },
    });

    if (!team) {
      // 리더 유저 생성
      const timestamp = Date.now();
      const user = await prisma.user.create({
        data: {
          email: `test_${timestamp}_${Math.random()}@example.com`,
          name: `User_${teamData.name.replace(/\s/g, "")}`,
          passwordHash: "dummy",
          nickname: `N_${teamData.name.replace(/\s/g, "")}`,
        },
      });

      // 팀 생성
      team = await prisma.team.create({
        data: {
          name: teamData.name,
          sport: "LoL",
          sportType: "lol",
          description: teamData.description,
          inviteCode: `CODE_${timestamp}_${Math.random().toString(36).substring(7)}`,
          members: {
            create: {
              userId: user.id,
              role: "leader",
              position: "MID",
            },
          },
        },
      });
      console.log(`✅ 팀 생성 완료: ${team.name} (ID: ${team.id})`);
    } else {
      console.log(`ℹ️ 팀 이미 존재: ${team.name} (ID: ${team.id})`);
    }

    // 3. 참가 신청 (PENDING)
    const existingParticipation = await prisma.tournamentTeam.findUnique({
      where: {
        tournamentId_teamId: {
          tournamentId: tournament.id,
          teamId: team.id,
        },
      },
    });

    if (!existingParticipation) {
      await prisma.tournamentTeam.create({
        data: {
          tournamentId: tournament.id,
          teamId: team.id,
          status: "PENDING", // 대기 상태
        },
      });
      console.log(`   👉 참가 신청 완료 (PENDING): ${team.name}`);
    } else {
      console.log(
        `   ℹ️ 이미 참가 신청됨: ${team.name} (상태: ${existingParticipation.status})`,
      );
    }
  }

  console.log("\n🎉 모든 작업이 완료되었습니다!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
