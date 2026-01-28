// seed_members_v3.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 팀원 데이터 보충(채우기) 시작...");

  // 1. 팀 조회
  const teams = await prisma.team.findMany({
    include: { members: true }, // 현재 멤버 정보도 같이 가져옴
  });
  console.log(`📋 현재 생성된 팀: ${teams.length}개`);

  if (teams.length === 0) return;

  // 2. 유저 확보
  const requiredUsers = teams.length * 5;
  const existingUsers = await prisma.user.findMany({
    take: requiredUsers + 50,
  }); // 여유있게 가져옴
  let users = [...existingUsers];

  // 유저 부족하면 추가 생성
  if (users.length < requiredUsers) {
    const needed = requiredUsers - users.length;
    console.log(`➕ 유저 ${needed}명을 추가 생성합니다...`);
    for (let i = 0; i < needed; i++) {
      try {
        const newUser = await prisma.user.create({
          data: {
            kakaoId: `dummy_v3_${Date.now()}_${i}`,
            name: `선수_${Math.floor(Math.random() * 90000) + 10000}`,
            email: `player_v3_${Date.now()}_${i}@test.com`,
            characterImage: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
            points: 1000,
          },
        });
        users.push(newUser);
      } catch (e) {}
    }
  }

  // 3. 빈 자리 채우기
  const positions = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
  let globalUserIndex = 0;
  let totalAdded = 0;

  for (const team of teams) {
    const currentMemberCount = team.members.length;

    // 5명이 꽉 찼으면 스킵
    if (currentMemberCount >= 5) {
      console.log(`✅ [FULL] ${team.name}: 이미 5명이 꽉 찼습니다.`);
      continue;
    }

    const needed = 5 - currentMemberCount;
    console.log(
      `📥 [FILLING] ${team.name}: 현재 ${currentMemberCount}명 -> ${needed}명 추가 배정...`,
    );

    // 현재 팀에 있는 유저 ID 목록 (중복 추가 방지)
    const currentMemberUserIds = new Set(team.members.map((m) => m.userId));

    let addedForThisTeam = 0;

    while (addedForThisTeam < needed) {
      // 유저 풀에서 하나 뽑기
      const user = users[globalUserIndex % users.length];
      globalUserIndex++;

      // 이미 팀에 있는 유저면 패스
      if (currentMemberUserIds.has(user.id)) continue;

      // 포지션 결정 (비어있는 포지션 순서대로)
      // 현재 멤버 수 + 추가된 수 = 1명 있으면 index 1(JUNGLE)부터 시작
      const positionIndex = (currentMemberCount + addedForThisTeam) % 5;

      try {
        await prisma.teamMember.create({
          data: {
            teamId: team.id,
            userId: user.id,
            role: "MEMBER", // 추가되는 인원은 일반 멤버
            position: positions[positionIndex] || "PLAYER",
          },
        });
        addedForThisTeam++;
        totalAdded++;
      } catch (e) {
        console.error(`   🚨 추가 실패: ${e.message}`);
      }
    }
  }

  console.log(
    `\n🎉 최종 결과: 총 ${totalAdded}명의 팀원이 추가로 배정되었습니다.`,
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
