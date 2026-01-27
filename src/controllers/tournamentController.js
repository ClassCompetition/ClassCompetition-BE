// src/controllers/tournamentController.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ==========================================
// 1. 대회 생성 (규칙 설정)
// ==========================================
exports.createTournament = async (req, res) => {
  const {
    name,
    sport,
    description,
    isPrivate,
    startDate,
    endDate,
    format,
    playoffTeams,
    groupCount,
    teamCount, // frontend sends 'teamCount'
  } = req.body;
  const managerId = req.userId;

  try {
    // ⭐ sport → sportType 변환 ('LoL' → 'lol', 'Soccer' → 'soccer')
    const sportType = sport.toLowerCase();

    const newTournament = await prisma.tournament.create({
      data: {
        name,
        sport:
          sportType === "lol"
            ? "LoL"
            : sportType === "soccer"
              ? "Soccer"
              : sportType === "basketball"
                ? "Basketball"
                : "Futsal",
        sportType, // 'lol', 'soccer' (로직용)
        description,
        isPrivate: isPrivate || false,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: "RECRUITING",
        managerId,
        inviteCode: isPrivate
          ? Math.random().toString(36).substring(2, 8).toUpperCase()
          : null,

        // ⭐️ 대회 포맷 및 설정
        format: format || "TOURNAMENT",
        playoffTeams: format === "HYBRID" ? parseInt(playoffTeams) : null,
        groupCount:
          (format === "LEAGUE" || format === "HYBRID") && groupCount
            ? parseInt(groupCount)
            : null,
        targetTeamCount: teamCount ? parseInt(teamCount) : null, // Store expected team count
      },
    });

    res.status(201).json({ success: true, data: newTournament });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "대회 생성 실패" } });
  }
};

// ==========================================
// 2. 대회 목록 조회 (기존 유지)
// ==========================================
exports.getAllTournaments = async (req, res) => {
  const { status, sport, page = 1 } = req.query;

  try {
    const where = {};
    if (status) where.status = status;
    if (sport) where.sportType = sport.toLowerCase(); // ⭐ sportType으로 필터링

    const tournaments = await prisma.tournament.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10,
      skip: (parseInt(page) - 1) * 10,
      include: {
        _count: { select: { participatingTeams: true } },
      },
    });

    const data = tournaments.map((t) => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      status: t.status,
      format: t.format, // 포맷 정보 추가
      isPrivate: t.isPrivate,
      description: t.description,
      startDate: t.startDate,
      endDate: t.endDate,
      teamCount: t._count.participatingTeams,
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "목록 조회 실패" } });
  }
};

// ==========================================
// 3. 대회 상세 조회 (기존 유지)
// ==========================================
exports.getTournamentDetail = async (req, res) => {
  const { id } = req.params;

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
      include: {
        participatingTeams: {
          include: { team: true },
        },
      },
    });

    if (!tournament)
      return res
        .status(404)
        .json({ success: false, error: { message: "대회 없음" } });

    res.json({
      success: true,
      data: {
        ...tournament,
        teams: tournament.participatingTeams.map((pt) => ({
          id: pt.team.id,
          name: pt.team.name,
          logo: pt.team.logo,
        })),
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: { message: "상세 조회 실패" } });
  }
};

// ==========================================
// 4. 대회 참가 신청 (기존 유지)
// ==========================================
exports.joinTournament = async (req, res) => {
  const { id } = req.params;
  const { teamId } = req.body;

  try {
    // ⭐ 대회와 팀 정보 가져오기
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
      select: { sportType: true, status: true },
    });

    const team = await prisma.team.findUnique({
      where: { id: parseInt(teamId) },
      select: { sportType: true },
    });

    if (!tournament || !team) {
      return res.status(404).json({
        success: false,
        error: { message: "대회 또는 팀을 찾을 수 없습니다." },
      });
    }

    // ⭐ 종목 일치 확인 (sportType끼리 비교)
    if (tournament.sportType !== team.sportType) {
      return res.status(400).json({
        success: false,
        error: {
          message: `팀 종목(${team.sportType})과 대회 종목(${tournament.sportType})이 일치하지 않습니다.`,
        },
      });
    }

    // 기존 참가 확인
    const existing = await prisma.tournamentTeam.findUnique({
      where: {
        tournamentId_teamId: {
          tournamentId: parseInt(id),
          teamId: parseInt(teamId),
        },
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { message: "이미 참가 중인 팀입니다." },
      });
    }

    await prisma.tournamentTeam.create({
      data: {
        tournamentId: parseInt(id),
        teamId: parseInt(teamId),
        status: "PENDING", // ⭐️ 기본 상태: 승인 대기
      },
    });

    res.json({
      success: true,
      message: "참가 신청이 완료되었습니다. 관리자 승인 후 참가가 확정됩니다.",
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "참가 신청 실패" } });
  }
};

// ==========================================
// 5. ⭐️ [복구] 대회 시작 (일정 생성)
// ==========================================
exports.startTournament = async (req, res) => {
  const { id } = req.params;
  const managerId = req.userId;

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
      include: {
        participatingTeams: {
          where: { status: "APPROVED" }, // ⭐️ 승인된 팀만 포함
        },
      },
    });

    // 권한 및 상태 체크
    if (tournament.managerId !== managerId)
      return res.status(403).json({ message: "권한 없음" });
    if (tournament.status === "ONGOING")
      return res.status(400).json({ message: "이미 진행 중입니다." });

    const teamIds = tournament.participatingTeams.map((pt) => pt.teamId);
    if (teamIds.length < 2)
      return res.status(400).json({ message: "최소 2팀이 필요합니다." });

    // 팀 섞기 (랜덤)
    teamIds.sort(() => Math.random() - 0.5);

    // 포맷에 따른 경기 생성
    if (tournament.format === "LEAGUE" || tournament.format === "HYBRID") {
      // 리그전 스케줄 생성 (HYBRID는 예선전으로 리그 진행)
      if (tournament.groupCount && tournament.groupCount > 1) {
        await _createLeagueScheduleGroups(
          tournament.id,
          teamIds,
          tournament.groupCount,
        );
      } else {
        await _createLeagueSchedule(tournament.id, teamIds);
      }
    } else {
      // 토너먼트 대진표 생성
      await _createTournamentBracket(tournament.id, teamIds, "TOURNAMENT");
    }

    // 상태 변경
    await prisma.tournament.update({
      where: { id: parseInt(id) },
      data: { status: "ONGOING" },
    });

    res.json({
      success: true,
      message: `대회가 시작되었습니다! (${tournament.format})`,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "대회 시작 실패" } });
  }
};

// ==========================================
// 6. ⭐️ [복구] 플레이오프 시작 (하이브리드 전용)
// ==========================================
exports.startPlayoff = async (req, res) => {
  const { id } = req.params;
  const managerId = req.userId;

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
    });

    // 검증
    if (tournament.managerId !== managerId)
      return res.status(403).json({ message: "권한 없음" });
    if (tournament.format !== "HYBRID")
      return res.status(400).json({ message: "하이브리드 대회가 아닙니다." });
    if (!tournament.playoffTeams)
      return res
        .status(400)
        .json({ message: "본선 진출 팀 수가 설정되지 않았습니다." });

    // 1. 리그 경기(예선) 결과 집계
    const leagueMatches = await prisma.match.findMany({
      where: {
        tournamentId: parseInt(id),
        stage: "LEAGUE",
        status: { in: ["DONE", "COMPLETED"] }, // 완료된 경기만
      },
    });

    // 2. 승점 계산
    const scores = {};
    leagueMatches.forEach((m) => {
      if (m.winnerTeamId) {
        scores[m.winnerTeamId] = (scores[m.winnerTeamId] || 0) + 1; // 승리 +1점
      }
    });

    // 3. 순위 산정 (승수 내림차순)
    const ranking = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]) // [[teamId, wins], ...]
      .map((entry) => parseInt(entry[0]));

    // 4. 상위 N팀 선발
    const advancedTeams = ranking.slice(0, tournament.playoffTeams);
    if (advancedTeams.length < tournament.playoffTeams) {
      return res
        .status(400)
        .json({ error: "경기 데이터 부족으로 순위를 매길 수 없습니다." });
    }

    // 5. 플레이오프(토너먼트) 대진표 생성
    // stage를 'TOURNAMENT'로 명시하여 생성
    await _createTournamentBracket(tournament.id, advancedTeams, "TOURNAMENT");

    res.json({
      success: true,
      message: `예선 종료! 상위 ${advancedTeams.length}팀이 본선에 진출했습니다.`,
      data: { advancedTeams },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "플레이오프 전환 실패" } });
  }
};

// ==========================================
// 7. 대진표 조회 (GET .../bracket)
// ==========================================
exports.getBracket = async (req, res) => {
  const { id } = req.params;
  try {
    const matches = await prisma.match.findMany({
      where: { tournamentId: parseInt(id) },
      include: { teamA: true, teamB: true },
      orderBy: { id: "asc" },
    });

    // 라운드별 그룹화
    const bracketData = matches.reduce((acc, match) => {
      // stage가 있으면 stage별로도 묶을 수 있음 (예: 예선/본선)
      const groupKey =
        match.stage === "LEAGUE"
          ? match.roundName || "예선 리그" // ⭐ "A조", "B조" 등으로 표시됨
          : match.roundName || "Unassigned";

      if (!acc[groupKey]) acc[groupKey] = [];

      acc[groupKey].push({
        id: match.id,
        stage: match.stage,
        teamA: match.teamA
          ? {
              id: match.teamA.id,
              name: match.teamA.name,
              score: match.teamAScore,
            }
          : null,
        teamB: match.teamB
          ? {
              id: match.teamB.id,
              name: match.teamB.name,
              score: match.teamBScore,
            }
          : null,
        winnerId: match.winnerTeamId,
        status: match.status,
      });
      return acc;
    }, {});

    const result = Object.keys(bracketData).map((key) => ({
      roundName: key,
      matches: bracketData[key],
    }));

    res.json({ success: true, data: result });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: { message: "대진표 조회 실패" } });
  }
};

// ==========================================
// 참가 팀 목록 조회 (NEW)
// ==========================================
exports.getParticipants = async (req, res) => {
  const { id } = req.params;
  const { status } = req.query; // 'APPROVED', 'PENDING', 'ALL'

  try {
    const whereCondition = { tournamentId: parseInt(id) };
    if (status && status !== "ALL") {
      whereCondition.status = status;
    } else if (!status) {
      whereCondition.status = "APPROVED"; // 기본값: 승인된 팀만
    }

    const participants = await prisma.tournamentTeam.findMany({
      where: whereCondition,
      include: {
        team: {
          select: {
            id: true,
            name: true,
            sport: true,
            sportType: true,
            wins: true,
            losses: true,
            description: true,
            representativeTacticId: true,
            members: {
              select: {
                id: true,
                userId: true,
                role: true,
                position: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // 프론트엔드에서 상태를 알 수 있도록 status 포함
    const teams = participants.map((p) => ({
      ...p.team,
      joinStatus: p.status, // PENDING, APPROVED, REJECTED
      requestId: p.id, // 승인/거절 처리를 위해 필요할 수 있음 (사실 composite key라 tournamentId, teamId로 가능하지만 id가 있다면 편함)
    }));

    res.json({ success: true, data: teams });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "참가 팀 조회 실패" } });
  }
};

// ==========================================
// 참가 승인/거절 처리 (NEW)
// ==========================================
exports.processTournamentRequest = async (req, res) => {
  const { id } = req.params; // tournamentId
  const { teamId, action } = req.body; // action: 'APPROVE' | 'REJECT'
  const managerId = req.userId;

  try {
    // 1. 권한 확인
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
    });

    if (!tournament) return res.status(404).json({ message: "대회 없음" });
    if (tournament.managerId !== managerId)
      return res.status(403).json({ message: "관리자 권한 필요" });

    // 2. 상태 업데이트
    const status = action === "APPROVE" ? "APPROVED" : "REJECTED";

    await prisma.tournamentTeam.update({
      where: {
        tournamentId_teamId: {
          tournamentId: parseInt(id),
          teamId: parseInt(teamId),
        },
      },
      data: { status },
    });

    res.json({
      success: true,
      message: `참가 신청이 ${status === "APPROVED" ? "승인" : "거절"}되었습니다.`,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "요청 처리 실패" } });
  }
};

// ------------------------------------------------------------------
// 🔒 내부 헬퍼 함수 (Internal Helper Functions)
// ------------------------------------------------------------------

// [A] 리그전 스케줄 생성 (Round Robin)
async function _createLeagueSchedule(tournamentId, teamIds) {
  const matches = [];
  const n = teamIds.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({
        tournamentId,
        stage: "LEAGUE", // ⭐️ 리그 경기
        roundName: "League Round",
        teamAId: teamIds[i],
        teamBId: teamIds[j],
        status: "RECRUITING",
      });
    }
  }
  await prisma.match.createMany({ data: matches });
}

// [A-2] 그룹별 리그 스케줄 생성
async function _createLeagueScheduleGroups(tournamentId, teamIds, groupCount) {
  // 팀을 그룹으로 나누기
  const groups = Array.from({ length: groupCount }, () => []);
  teamIds.forEach((teamId, index) => {
    groups[index % groupCount].push(teamId);
  });

  const matches = [];

  // 각 그룹별로 리그전 생성
  for (let g = 0; g < groupCount; g++) {
    const groupTeams = groups[g];
    const n = groupTeams.length;
    const groupName = `${String.fromCharCode(65 + g)}조`; // Group A, B, C...

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        matches.push({
          tournamentId,
          stage: "LEAGUE",
          roundName: groupName,
          teamAId: groupTeams[i],
          teamBId: groupTeams[j],
          status: "RECRUITING",
        });
      }
    }
  }

  await prisma.match.createMany({ data: matches });
}

// [B] 토너먼트 대진표 생성
async function _createTournamentBracket(tournamentId, teamIds, stage) {
  const teamCount = teamIds.length;

  // 1. 라운드 크기 계산 (4강, 8강, 16강...)
  let roundSize = 2;
  while (roundSize < teamCount) roundSize *= 2;

  // 2. 첫 라운드 매치 생성
  const matchCount = roundSize / 2;
  const matchesToCreate = [];

  for (let i = 0; i < matchCount; i++) {
    const teamAId = teamIds[i * 2] || null;
    const teamBId = teamIds[i * 2 + 1] || null;

    matchesToCreate.push({
      tournamentId,
      stage: stage, // 'TOURNAMENT' (본선)
      roundName: `${roundSize}강`,
      teamAId,
      teamBId,
      // 둘 다 있으면 예정, 하나만 있으면(부전승) 완료 처리
      status: teamAId && teamBId ? "UPCOMING" : "DONE",
      winnerTeamId:
        !teamBId && teamAId ? teamAId : !teamAId && teamBId ? teamBId : null,
    });
  }

  await prisma.match.createMany({ data: matchesToCreate });
}

// ==========================================
// 8. 대회 설정 변경 (기존 유지)
// ==========================================
exports.updateSettings = async (req, res) => {
  const { id } = req.params;
  const { name, description, groupCount, startDate, endDate, targetTeamCount } =
    req.body;

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
    });

    if (!tournament) return res.status(404).json({ message: "대회 없음" });

    // 이미 시작된 경우 조 개수 변경 불가
    if (tournament.status === "ONGOING" && groupCount) {
      return res
        .status(400)
        .json({ message: "이미 시작된 대회는 조 설정을 변경할 수 없습니다." });
    }

    // Date parsing helper
    const parseDate = (dateStr) => {
      if (!dateStr) return undefined; // No change
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? undefined : d;
    };

    const updated = await prisma.tournament.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        groupCount: groupCount ? parseInt(groupCount) : undefined,
        targetTeamCount: targetTeamCount
          ? parseInt(targetTeamCount)
          : undefined,
        startDate: parseDate(startDate),
        endDate: parseDate(endDate),
      },
    });
    res.json({ success: true, message: "수정 완료", data: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "수정 실패" } });
  }
};

// ==========================================
// 대진표 생성 (랜덤)
// ==========================================
exports.generateBracket = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    // 1. Verify manager
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
      include: {
        participatingTeams: {
          include: { team: true },
        },
      },
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: { message: "대회를 찾을 수 없습니다" },
      });
    }

    if (tournament.managerId !== userId) {
      return res
        .status(403)
        .json({ success: false, error: { message: "권한이 없습니다" } });
    }

    // 2. Check status (must be UPCOMING or RECRUITING)
    if (
      tournament.status !== "UPCOMING" &&
      tournament.status !== "RECRUITING"
    ) {
      return res.status(400).json({
        success: false,
        error: { message: "대진표는 UPCOMING 상태에서만 생성할 수 있습니다" },
      });
    }

    // 3. Get participating teams
    const teams = tournament.participatingTeams;

    if (teams.length < 2) {
      return res.status(400).json({
        success: false,
        error: { message: "최소 2개 팀이 필요합니다" },
      });
    }

    // 4. Generate random bracket
    const matches = generateRandomBracket(teams);

    // 5. Create Match records
    await prisma.match.createMany({
      data: matches.map((m) => ({
        tournamentId: tournament.id,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        roundName: m.roundName,
        status: "UPCOMING",
        stage: "TOURNAMENT",
      })),
    });

    // 6. Update tournament status to ONGOING
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        status: "ONGOING",
        bracketGeneration: "random",
      },
    });

    res.json({
      success: true,
      data: {
        matchCount: matches.length,
        message: "대진표가 생성되었습니다",
      },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "대진표 생성 실패" } });
  }
};

// ==========================================
// 수동 대진표 생성
// ==========================================
exports.createManualBracket = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  const { matches } = req.body; // Array of { teamAId, teamBId, roundName }

  try {
    // 1. Verify manager
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: { message: "대회를 찾을 수 없습니다" },
      });
    }

    if (tournament.managerId !== userId) {
      return res
        .status(403)
        .json({ success: false, error: { message: "권한이 없습니다" } });
    }

    // 2. Validate matches
    if (!matches || matches.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: { message: "경기 정보가 필요합니다" } });
    }

    // 3. Create Match records
    await prisma.match.createMany({
      data: matches.map((m) => ({
        tournamentId: tournament.id,
        teamAId: m.teamAId,
        teamBId: m.teamBId || null, // Bye 허용
        roundName: m.roundName || "1라운드",
        status: "UPCOMING",
        stage: "TOURNAMENT",
      })),
    });

    // 4. Update tournament
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: {
        status: "ONGOING",
        bracketGeneration: "manual",
      },
    });

    res.json({
      success: true,
      data: { message: "수동 대진표가 생성되었습니다" },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "대진표 생성 실패" } });
  }
};

// ------------------------------------------------------------------
// 🔒 Internal Helper Functions
// ------------------------------------------------------------------

/**
 * Generate random tournament bracket
 * @param {Array} participatingTeams - Array of { teamId, team: {...} }
 * @returns {Array} Array of matches
 */
function generateRandomBracket(participatingTeams) {
  // Extract teams and shuffle
  const teams = participatingTeams.map((pt) => pt.team);
  const shuffled = [...teams].sort(() => Math.random() - 0.5);

  const matches = [];

  // Round 1 - pair up teams
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      // Normal match
      matches.push({
        teamAId: shuffled[i].id,
        teamBId: shuffled[i + 1].id,
        roundName: "1라운드",
      });
    } else {
      // Bye (odd number of teams)
      matches.push({
        teamAId: shuffled[i].id,
        teamBId: null,
        roundName: "1라운드 (부전승)",
      });
    }
  }

  return matches;
}

// ==========================================
// 리그 순위표 조회 (NEW)
// ==========================================
exports.getLeagueStandings = async (req, res) => {
  const { id } = req.params;

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: { message: "대회를 찾을 수 없습니다" },
      });
    }

    // 리그 경기 결과 조회
    const matches = await prisma.match.findMany({
      where: {
        tournamentId: parseInt(id),
        stage: "LEAGUE",
      },
      include: {
        teamA: true,
        teamB: true,
      },
    });

    // 그룹별로 나누기 (매치 roundName 기준)
    const groups = {};
    const ungrouped = [];

    // 경기 결과를 기반으로 팀이 어느 그룹에 속하는지 확인
    // (A팀 vs B팀 경기에서 roundName이 'A조'라면, A팀과 B팀은 A조)
    matches.forEach((match) => {
      const groupName = match.roundName || "리그";
      if (!groups[groupName]) groups[groupName] = new Set();
      if (match.teamAId) groups[groupName].add(match.teamAId);
      if (match.teamBId) groups[groupName].add(match.teamBId);
    });

    // 만약 그룹 정보가 없다면 전체를 하나로 취급
    const hasGroups = Object.keys(groups).length > 0;

    // 팀별 통계 계산 (기존 로직 활용)
    const calculateStats = (targetTeamIds) => {
      const stats = {};
      targetTeamIds.forEach((teamId) => {
        const pt = participatingTeams.find((p) => p.teamId === teamId);
        if (pt) {
          stats[teamId] = {
            teamId: pt.teamId,
            teamName: pt.team.name,
            logo: pt.team.logo,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            points: 0,
            recentForm: [],
          };
        }
      });

      matches.forEach((match) => {
        if (
          !targetTeamIds.has(match.teamAId) ||
          !targetTeamIds.has(match.teamBId)
        )
          return;

        if (
          match.status === "DONE" &&
          match.teamAScore !== null &&
          match.teamBScore !== null
        ) {
          const teamAId = match.teamAId;
          const teamBId = match.teamBId;

          if (stats[teamAId] && stats[teamBId]) {
            stats[teamAId].played++;
            stats[teamBId].played++;

            stats[teamAId].goalsFor += match.teamAScore;
            stats[teamAId].goalsAgainst += match.teamBScore;
            stats[teamBId].goalsFor += match.teamBScore;
            stats[teamBId].goalsAgainst += match.teamAScore;

            if (match.teamAScore > match.teamBScore) {
              stats[teamAId].won++;
              stats[teamAId].points += 3;
              stats[teamAId].recentForm.push("W");
              stats[teamBId].lost++;
              stats[teamBId].recentForm.push("L");
            } else if (match.teamAScore < match.teamBScore) {
              stats[teamBId].won++;
              stats[teamBId].points += 3;
              stats[teamBId].recentForm.push("W");
              stats[teamAId].lost++;
              stats[teamAId].recentForm.push("L");
            } else {
              stats[teamAId].drawn++;
              stats[teamAId].points += 1;
              stats[teamAId].recentForm.push("D");
              stats[teamBId].drawn++;
              stats[teamBId].points += 1;
              stats[teamBId].recentForm.push("D");
            }
          }
        }
      });

      return Object.values(stats).sort((a, b) => {
        const aGD = a.goalsFor - a.goalsAgainst;
        const bGD = b.goalsFor - b.goalsAgainst;
        if (b.points !== a.points) return b.points - a.points;
        if (bGD !== aGD) return bGD - aGD;
        return b.goalsFor - a.goalsFor;
      });
    };

    let resultData;
    if (Object.keys(groups).length > 1) {
      // 다중 그룹 (ex: A조, B조)
      resultData = Object.keys(groups)
        .sort()
        .map((groupName) => ({
          groupName,
          standings: calculateStats(groups[groupName]),
        }));
    } else {
      // 단일 그룹
      const allTeamIds = new Set(participatingTeams.map((pt) => pt.teamId));
      resultData = calculateStats(allTeamIds);
    }

    res.json({ success: true, data: resultData });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "순위표 조회 실패" } });
  }
};

// ==========================================
// 리그 경기 일정 조회 (NEW)
// ==========================================
exports.getLeagueMatches = async (req, res) => {
  const { id } = req.params;

  try {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId: parseInt(id),
        stage: "LEAGUE",
      },
      include: {
        teamA: true,
        teamB: true,
      },
      orderBy: [{ roundName: "asc" }, { id: "asc" }],
    });

    const formattedMatches = matches.map((match) => ({
      id: match.id,
      round: match.roundName || "리그",
      date:
        match.matchDate && !isNaN(new Date(match.matchDate).getTime())
          ? new Date(match.matchDate).toISOString().split("T")[0]
          : "미정",
      time:
        match.matchDate && !isNaN(new Date(match.matchDate).getTime())
          ? new Date(match.matchDate).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : null,
      venue: match.venue || null,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      teamAName: match.teamA?.name || "TBD",
      teamBName: match.teamB?.name || "TBD",
      teamAScore: match.teamAScore,
      teamBScore: match.teamBScore,
      status: match.status,
      winnerTeamId: match.winnerTeamId,
    }));

    res.json({ success: true, data: formattedMatches });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "경기 일정 조회 실패" } });
  }
};
