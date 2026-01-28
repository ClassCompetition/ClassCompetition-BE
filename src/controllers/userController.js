// src/controllers/userController.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ==========================================
// 1. 내 프로필 조회 (GET /api/users/me)
// ==========================================
exports.getMe = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId)
      return res.status(401).json({ success: false, error: "로그인 필요" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profiles: true }, // 종목별 프로필 함께 조회
    });

    if (!user)
      return res.status(404).json({ success: false, error: "유저 없음" });

    // ⭐️ [변경] 종목별 프로필 정리 (명확한 매핑)
    const profilesMap = {};

    console.log(`🔍 [getMe] 사용자(${userId}) raw profiles 개수: ${user.profiles.length}`);

    user.profiles.forEach((p) => {
      // 키 불일치 방지를 위해 소문자로 변환
      const sportKey = p.sportType ? p.sportType.toLowerCase() : '';
      if (!sportKey) return;

      console.log(`  - 처리 중인 프로필: ${p.sportType} (ID: ${p.id})`);

      // 1. JSON 데이터 파싱 (weight, mainHand 등)
      let extraData = {};
      try {
        if (p.introduction && p.introduction.startsWith("{")) {
          const parsed = JSON.parse(p.introduction);
          // originalIntro가 있다면 introduction으로 복원
          if (parsed.originalIntro !== undefined) {
            p.introduction = parsed.originalIntro;
            delete parsed.originalIntro;
          }
          extraData = parsed;
        }
      } catch (e) {
        // console.warn(`Profile parsing error:`, e);
      }

      // 2. 기본 데이터 + 추가 데이터 병합하여 객체 생성
      const profileData = {
        position: p.position,
        tier: p.tier,
        champions: p.champions,
        introduction: p.introduction,

        // ⭐️ DB 컬럼 값을 명시적으로 포함 (누락 방지)
        height: p.height, // General 키
        preferredFoot: p.preferredFoot, // General 주발

        ...extraData, // weight, mainHand, lolNickname 등
      };

      // 3. 프론트엔드 호환성을 위한 필드 매핑 (별칭 설정)
      if (p.sportType === "lol" || sportKey === 'lol') {
        profileData.mainLane = p.position;
        profileData.mainChampions = p.champions;
      }

      if (p.sportType === "general" || sportKey === 'general') {
        profileData.mainPosition = p.position;
        // height, preferredFoot은 이미 위에서 profileData에 들어감
        profileData.mainFoot = p.preferredFoot;
      }

      // 맵에 저장 (소문자 키 사용)
      profilesMap[sportKey] = profileData;
    });

    console.log(`✅ [getMe] 최종 반환할 profilesMap 키 목록:`, Object.keys(profilesMap));

    // 민감 정보 제외
    const { passwordHash, refreshToken, ...userData } = user;

    // 응답 데이터에 profiles 추가
    userData.profiles = profilesMap;

    res.json({ success: true, data: userData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "서버 에러" });
  }
};

// ==========================================
// 2. 기본 정보 수정 (닉네임 등)
// PATCH /api/users/me
// ==========================================
exports.updateProfile = async (req, res) => {
  const userId = req.userId;
  const { nickname, department, characterImageUrl } = req.body;

  try {
    if (nickname) {
      const check = await prisma.user.findUnique({ where: { nickname } });
      if (check && check.id !== userId) {
        return res
          .status(400)
          .json({ success: false, error: "이미 사용 중인 닉네임입니다." });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        nickname,
        // department, // ⭐️ DB 스키마에 department 컬럼 추가 후 주석 해제 필요 (npx prisma db push)
        characterImage: characterImageUrl, // DB 필드명 매핑
      },
    });

    res.json({ success: true, message: "수정 완료", data: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "수정 실패" });
  }
};

// ==========================================
// 4. 대회 참가 이력 조회 (GET /api/users/profile/tournaments)
// ==========================================
exports.getTournamentHistory = async (req, res) => {
  const userId = req.userId;

  try {
    // 1. 유저가 속한 팀 ID들 찾기
    const userTeams = await prisma.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    const teamIds = userTeams.map((ut) => ut.teamId);

    if (teamIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 2. 해당 팀들이 참가한 대회 찾기
    const participations = await prisma.tournamentTeam.findMany({
      where: {
        teamId: { in: teamIds },
        status: "APPROVED", // 승인된 참가만
      },
      include: {
        tournament: true,
        team: true,
      },
      orderBy: { tournament: { startDate: "desc" } },
    });

    // 3. 데이터 가공
    // (우승 여부를 알기 위해선 tournament.winnerId 또는 결승 매치 확인 필요)
    // 여기선 tournament 모델에 winnerId 필드가 있다고 가정하거나(컨트롤러 133라인 로직 참고),
    // 간단히 상태만 표시

    // ⭐️ tournamentController.getTournamentDetail 처럼 winnerId가 계산되어 있지 않을 수 있으므로
    // 필요하다면 추가 로직이 필요하지만, 일단 DB 필드나 상태로 처리
    const history = [];

    for (const p of participations) {
      let result = "참가";
      const t = p.tournament;

      if (t.status === "ENDED") {
        // DB에 저장된 winnerId가 있다면 확인
        // 만약 winnerId가 별도로 관리되지 않는다면 로직 추가 필요
        // 여기선 tournament 테이블에 winnerId가 있다고 가정하지 않고 match 테이블 조회할 수도 있지만
        // 성능상 비효율적일 수 있음.
        // tournamentController 로직을 참고하여 마지막 경기 승자를 조회해보겠습니다.

        let isWinner = false;

        // 마지막 결승 경기 확인
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
          // 결승전 참가했지만 우승 못했으면 준우승
          // (결승전 라운드 이름 체크하면 더 정확함)
          if (
            finalMatch.roundName === "결승" ||
            finalMatch.roundName === "2강"
          ) {
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

exports.updateSportProfile = async (req, res) => {
  const userId = req.userId;
  const { sportType } = req.params;
  
  // 소문자로 변환하여 키 불일치 방지
  const sportTypeLower = sportType ? sportType.toLowerCase() : 'general';

  console.log(`📝 [updateSportProfile] 요청 수신 - User: ${userId}, Type: ${sportTypeLower}`);
  console.log(`📦 [updateSportProfile] Body 데이터:`, req.body);

  // characterImageUrl이 들어오면 -> User 테이블(통합 이미지) 업데이트
  const {
    position,
    tier,
    champions,
    introduction,
    characterImageUrl,
    lolNickname,
    mainLane,
    mainChampions, // LoL
    height,
    weight,
    mainHand,
    mainFoot,
    mainPosition, // General
  } = req.body;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. 이미지가 있으면 '통합 캐릭터 이미지' 업데이트
      if (characterImageUrl) {
        await tx.user.update({
          where: { id: userId },
          data: { characterImage: characterImageUrl },
        });
      }

      // 2. DB 컬럼에 매핑할 데이터 준비
      let dbPosition = position;
      let dbTier = tier;
      let dbChampions = champions;
      let dbPreferredFoot = null;
      let dbHeight = null;
      let dbIntroduction = introduction;

      const extraData = {};

      if (sportTypeLower === "lol") {
        dbPosition = mainLane || position; // 주 라인 -> position
        dbChampions = mainChampions;       // 주 챔피언 -> champions
        dbTier = tier;                     // 티어 -> tier
        if (lolNickname) extraData.lolNickname = lolNickname; // 닉네임 -> JSON
      } else if (sportTypeLower === "general") {
        dbPosition = mainPosition || position;

        // ⭐️ [수정] 스키마가 String이므로 문자열로 변환해서 저장
        // 빈 문자열이 오더라도 값이 있으면 저장, 없으면 null
        dbHeight = height ? String(height) : null;

        dbPreferredFoot = mainFoot;

        // ⭐️ [수정] 몸무게도 혹시 모르니 JSON에는 숫자로 넣되 안전하게 처리
        if (weight) extraData.weight = parseInt(weight); // JSON 내부는 숫자가 더 다루기 편함
        if (mainHand) extraData.mainHand = mainHand;
      }

      // extraData 병합
      if (Object.keys(extraData).length > 0) {
        dbIntroduction = JSON.stringify({
          ...extraData,
          originalIntro: introduction,
        });
      }

      // 3. 종목별 정보 업데이트 (upsert)
      await tx.userProfile.upsert({
        where: {
          userId_sportType: { userId, sportType: sportTypeLower },
        },
        update: {
          position: dbPosition,
          tier: dbTier,
          champions: dbChampions,
          preferredFoot: dbPreferredFoot,
          height: dbHeight, // 이제 String이 들어갑니다 ("168")
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

    res.json({
      success: true,
      message: "프로필 및 캐릭터 이미지가 업데이트되었습니다.",
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "프로필 수정 실패" } });
  }
};
