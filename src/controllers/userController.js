// src/controllers/userController.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// 기존 이미지 삭제 함수 (에러 로그만 남김)
const deleteOldImage = (imageUrl) => {
  if (!imageUrl) return;
  try {
    const filename = imageUrl.split('/').pop();
    const filePath = path.join(process.cwd(), 'uploads', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("Image deletion error:", error.message);
  }
};

// 1. 내 프로필 조회
exports.getMe = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ success: false, error: "로그인 필요" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profiles: true },
    });

    if (!user) return res.status(404).json({ success: false, error: "유저 없음" });

    const profilesMap = {};

    user.profiles.forEach((p) => {
      const sportKey = p.sportType ? p.sportType.toLowerCase() : '';
      if (!sportKey) return;

      let extraData = {};
      try {
        if (p.introduction && p.introduction.startsWith("{")) {
          const parsed = JSON.parse(p.introduction);
          if (parsed.originalIntro !== undefined) {
            p.introduction = parsed.originalIntro;
            delete parsed.originalIntro;
          }
          extraData = parsed;
        }
      } catch (e) {}

      const profileData = {
        position: p.position,
        tier: p.tier,
        champions: p.champions,
        introduction: p.introduction,
        height: p.height,
        preferredFoot: p.preferredFoot,
        ...extraData,
      };

      if (p.sportType === "lol" || sportKey === 'lol') {
        profileData.mainLane = p.position;
        profileData.mainChampions = p.champions;
      }

      if (p.sportType === "general" || sportKey === 'general') {
        profileData.mainPosition = p.position;
        profileData.mainFoot = p.preferredFoot;
      }

      profilesMap[sportKey] = profileData;
    });

    const { passwordHash, refreshToken, ...userData } = user;
    userData.profiles = profilesMap;

    res.json({ success: true, data: userData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "서버 에러" });
  }
};

// 2. 기본 정보 수정
exports.updateProfile = async (req, res) => {
  const userId = req.userId;
  const { nickname, department, characterImageUrl } = req.body;

  try {
    if (nickname) {
      const check = await prisma.user.findUnique({ where: { nickname } });
      if (check && check.id !== userId) {
        return res.status(400).json({ success: false, error: "이미 사용 중인 닉네임입니다." });
      }
    }

    if (characterImageUrl) {
      const currentUser = await prisma.user.findUnique({ where: { id: userId } });
      if (currentUser?.characterImage && currentUser.characterImage !== characterImageUrl) {
          deleteOldImage(currentUser.characterImage);
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        nickname,
        // department, 
        characterImage: characterImageUrl,
      },
    });

    res.json({ success: true, message: "수정 완료", data: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "수정 실패" });
  }
};

// 4. 대회 참가 이력 조회
exports.getTournamentHistory = async (req, res) => {
  const userId = req.userId;

  try {
    const userTeams = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = userTeams.map((ut) => ut.teamId);

    if (teamIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const participations = await prisma.tournamentTeam.findMany({
      where: {
        teamId: { in: teamIds },
        status: "APPROVED",
      },
      include: {
        tournament: true,
        team: true,
      },
      orderBy: { tournament: { startDate: "desc" } },
    });

    const history = [];

    for (const p of participations) {
      let result = "참가";
      const t = p.tournament;

      if (t.status === "ENDED") {
        const finalMatch = await prisma.match.findFirst({
          where: {
            tournamentId: t.id,
            stage: "TOURNAMENT",
            status: "DONE",
            winnerTeamId: { not: null },
          },
          orderBy: { id: "desc" },
        });

        if (finalMatch && finalMatch.winnerTeamId === p.teamId) {
          result = "우승";
        } else if (
          finalMatch &&
          (finalMatch.teamAId === p.teamId || finalMatch.teamBId === p.teamId)
        ) {
          if (finalMatch.roundName === "결승" || finalMatch.roundName === "2강") {
            result = "준우승";
          } else {
            result = "탈락";
          }
        } else {
          result = "탈락";
        }
      } else if (t.status === "ONGOING") {
        result = "진행 중";
      } else {
        result = "예정";
      }

      history.push({
        id: t.id,
        name: t.name,
        team: p.team.name,
        result: result,
        date: t.endDate
          ? new Date(t.endDate).toISOString().split("T")[0]
          : t.startDate
            ? new Date(t.startDate).toISOString().split("T")[0]
            : "미정",
      });
    }

    res.json({ success: true, data: history });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "대회 기록 조회 실패" });
  }
};

// 3. 종목별 프로필 수정
exports.updateSportProfile = async (req, res) => {
  const userId = req.userId;
  const { sportType } = req.params;
  const sportTypeLower = sportType ? sportType.toLowerCase() : 'general';

  const {
    position, tier, champions, introduction, characterImageUrl,
    lolNickname, mainLane, mainChampions, height, weight, mainHand, mainFoot, mainPosition,
  } = req.body;

  try {
    await prisma.$transaction(async (tx) => {
      if (characterImageUrl) {
        const currentUser = await tx.user.findUnique({ where: { id: userId } });
        if (currentUser?.characterImage && currentUser.characterImage !== characterImageUrl) {
            deleteOldImage(currentUser.characterImage);
        }
        await tx.user.update({
          where: { id: userId },
          data: { characterImage: characterImageUrl },
        });
      }

      let dbPosition = position;
      let dbTier = tier;
      let dbChampions = champions;
      let dbPreferredFoot = null;
      let dbHeight = null;
      let dbIntroduction = introduction;

      const extraData = {};

      if (sportTypeLower === "lol") {
        dbPosition = mainLane || position;
        dbChampions = mainChampions;
        dbTier = tier;
        if (lolNickname) extraData.lolNickname = lolNickname;
      } else if (sportTypeLower === "general") {
        dbPosition = mainPosition || position;
        dbHeight = height ? String(height) : null;
        dbPreferredFoot = mainFoot;
        if (weight) extraData.weight = parseInt(weight); 
        if (mainHand) extraData.mainHand = mainHand;
      }

      if (Object.keys(extraData).length > 0) {
        dbIntroduction = JSON.stringify({
          ...extraData,
          originalIntro: introduction,
        });
      }

      await tx.userProfile.upsert({
        where: {
          userId_sportType: { userId, sportType: sportTypeLower },
        },
        update: {
          position: dbPosition,
          tier: dbTier,
          champions: dbChampions,
          preferredFoot: dbPreferredFoot,
          height: dbHeight,
          introduction: dbIntroduction,
        },
        create: {
          userId,
          sportType: sportTypeLower,
          position: dbPosition,
          tier: dbTier,
          champions: dbChampions,
          preferredFoot: dbPreferredFoot,
          height: dbHeight,
          introduction: dbIntroduction,
        },
      });
    });

    res.json({ success: true, message: "프로필 업데이트 완료" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "프로필 수정 실패" } });
  }
};