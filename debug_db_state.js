const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const tournamentId = 3;
  console.log(`🔍 Checking Tournament ${tournamentId} state...`);

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
  });
  console.log("Tournament:", tournament);

  const matches = await prisma.match.findMany({
    where: { tournamentId: tournamentId },
  });

  if (matches.length === 0) {
    console.log("❌ No matches found.");
  } else {
    console.log(`✅ Found ${matches.length} matches.`);
    console.log("Sample match:", matches[0]);

    // Check stages
    const stages = matches.map((m) => m.stage);
    console.log("Stages present:", [...new Set(stages)]);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
