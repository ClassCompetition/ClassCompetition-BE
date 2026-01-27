const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Fixing sport casing...");

  // 1. Update Tournaments
  const tournaments = await prisma.tournament.updateMany({
    where: { sport: "lol" },
    data: { sport: "LoL" },
  });
  console.log(
    `✅ Updated ${tournaments.count} tournaments from 'lol' to 'LoL'`,
  );

  // 2. Update Teams
  const teams = await prisma.team.updateMany({
    where: { sport: "lol" },
    data: { sport: "LoL" },
  });
  console.log(`✅ Updated ${teams.count} teams from 'lol' to 'LoL'`);

  // 3. Update any other 'lol' variations if necessary in other tables?
  // Currently checking Tournament and Team implies these are the main display points.

  console.log("🎉 Done!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
