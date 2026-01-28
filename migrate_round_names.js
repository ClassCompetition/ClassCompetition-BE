const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("🔄 라운드 이름 마이그레이션 시작...");

  // 1. "4강" -> "준결승" 업데이트
  const result4 = await prisma.match.updateMany({
    where: { roundName: "4강" },
    data: { roundName: "준결승" }
  });
  console.log(`✅ "4강" -> "준결승" 업데이트 완료 (${result4.count}건)`);

  // 2. "2강" -> "결승" 업데이트
  const result2 = await prisma.match.updateMany({
    where: { roundName: "2강" },
    data: { roundName: "결승" }
  });
  console.log(`✅ "2강" -> "결승" 업데이트 완료 (${result2.count}건)`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
