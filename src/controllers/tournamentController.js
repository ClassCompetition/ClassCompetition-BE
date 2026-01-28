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
        _count: {
          select: {
            participatingTeams: {
              where: { status: "APPROVED" },
            },
          },
        },
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
          where: { status: "APPROVED" },
          include: { team: true },
        },
      },
    });

    if (!tournament)
      return res
        .status(404)
        .json({ success: false, error: { message: "대회 없음" } });

    // ⭐️ 우승자 정보 조회 (결승전이 끝났다면 상태와 무관하게 우승자 표시)
    let winnerId = null;

    // 1. '결승' 라운드 매치 찾기
    const finalMatch = await prisma.match.findFirst({
      where: {
        tournamentId: parseInt(id),
        stage: "TOURNAMENT", // 토너먼트 스테이지여야 함
        roundName: "결승", // 명시적으로 결승전 찾기
        status: "DONE",
      },
    });

    if (finalMatch && finalMatch.winnerTeamId) {
      winnerId = finalMatch.winnerTeamId;
    } else {
      // 2. 결승전 이름이 다르거나 못 찾았을 경우, 가장 마지막에 완료된 토너먼트 매치 확인
      // (단, 2강(결승)이 아닐 수도 있으니 주의 필요하지만, 기존 로직 보완 차원)
      const lastMatch = await prisma.match.findFirst({
        where: {
          tournamentId: parseInt(id),
          stage: "TOURNAMENT",
          status: "DONE",
        },
        orderBy: { id: "desc" },
      });

      // 마지막 매치가 있고, 그것이 결승전일 가능성이 높음 (가장 나중에 생성/완료됨)
      if (lastMatch && lastMatch.winnerTeamId) {
        // 추가 검증: 이 매치가 정말 마지막 라운드인지 확인하려면 전체 라운드 구조를 봐야 하지만,
        // 보통 결승전이 가장 마지막 id를 가짐.
        winnerId = lastMatch.winnerTeamId;
      }
    }

    res.json({
      success: true,
      data: {
        ...tournament,
        winnerId: winnerId || null, // 계산된 winnerId 추가
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

    // 1. 유효성 검증
    if (tournament.managerId !== managerId)
      return res.status(403).json({ message: "권한 없음" });
    if (tournament.format !== "HYBRID")
      return res.status(400).json({ message: "하이브리드 대회가 아닙니다." });
    if (!tournament.playoffTeams)
      return res
        .status(400)
        .json({ message: "본선 진출 팀 수가 설정되지 않았습니다." });

    // 2. 리그 경기(예선) 결과 조회
    const leagueMatches = await prisma.match.findMany({
      where: {
        tournamentId: parseInt(id),
        stage: "LEAGUE",
      },
    });

    // 경기가 하나도 없거나, 진행 중인 경기가 있으면 시작 불가
    if (leagueMatches.length === 0) {
      return res
        .status(400)
        .json({ message: "리그 경기가 생성되지 않았습니다." });
    }
    const pendingMatches = leagueMatches.filter((m) => m.status !== "DONE");
    if (pendingMatches.length > 0) {
      return res.status(400).json({
        message: `아직 종료되지 않은 리그 경기가 ${pendingMatches.length}개 있습니다.`,
      });
    }

    // 3. 조별 순위 산정 로직 (getLeagueStandings와 동일한 로직 사용)
    const groups = {}; // { 'A조': [teamId, ...], 'B조': ... }
    const teamStats = {}; // { teamId: { points, goalDiff, goalsFor ... } }

    leagueMatches.forEach((match) => {
      const groupName = match.roundName || "리그";
      if (!groups[groupName]) groups[groupName] = new Set();
      if (match.teamAId) groups[groupName].add(match.teamAId);
      if (match.teamBId) groups[groupName].add(match.teamBId);

      // 통계 초기화
      [match.teamAId, match.teamBId].forEach((tid) => {
        if (tid && !teamStats[tid]) {
          teamStats[tid] = { id: tid, points: 0, goalDiff: 0, goalsFor: 0 };
        }
      });

      // 점수 계산 (DONE 상태인 경우만)
      if (
        match.status === "DONE" &&
        match.teamAScore !== null &&
        match.teamBScore !== null
      ) {
        const teamA = teamStats[match.teamAId];
        const teamB = teamStats[match.teamBId];

        teamA.goalsFor += match.teamAScore;
        teamA.goalDiff += match.teamAScore - match.teamBScore;
        teamB.goalsFor += match.teamBScore;
        teamB.goalDiff += match.teamBScore - match.teamAScore;

        if (match.teamAScore > match.teamBScore) {
          teamA.points += 3;
        } else if (match.teamAScore < match.teamBScore) {
          teamB.points += 3;
        } else {
          teamA.points += 1;
          teamB.points += 1;
        }
      }
    });

    // 4. 각 조별 상위 팀 선발
    const groupNames = Object.keys(groups).sort();
    const groupCount = groupNames.length;

    // 조가 여러 개일 경우: (본선 티켓 수 / 조 개수) 만큼 각 조에서 선발
    // 예: 4강 본선, 2개 조 -> 각 조 2팀씩
    if (tournament.playoffTeams % groupCount !== 0) {
      return res.status(400).json({
        message: `본선 팀 수(${tournament.playoffTeams})가 조 개수(${groupCount})로 나누어떨어지지 않습니다.`,
      });
    }
    const advancePerGroup = tournament.playoffTeams / groupCount;
    let advancedTeams = [];

    groupNames.forEach((gName) => {
      const groupTeamIds = Array.from(groups[gName]);

      // 해당 조 팀들을 순위대로 정렬
      const sortedTeams = groupTeamIds
        .map((tid) => teamStats[tid])
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points; // 승점
          if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff; // 득실차
          return b.goalsFor - a.goalsFor; // 다득점
        });

      // 상위 n팀 선택
      const qualifiers = sortedTeams.slice(0, advancePerGroup).map((t) => t.id);
      advancedTeams = [...advancedTeams, ...qualifiers];
    });

    // 5. 플레이오프(토너먼트) 대진표 생성
    // 순위 기반 시드 배정을 위해 advancedTeams 순서를 섞거나 조정할 수 있음
    // (여기서는 간단히 추출된 순서대로 토너먼트 생성에 넘김)
    await _createTournamentBracket(tournament.id, advancedTeams, "TOURNAMENT");

    res.json({
      success: true,
      message: `예선 종료! 총 ${advancedTeams.length}팀이 본선에 진출했습니다.`,
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
        tournamentId: match.tournamentId, // ⭐️ tournamentId 추가
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
        matchDate: match.matchDate,
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
// 9. [NEW] 경기 상세 정보 조회 (GET /api/tournaments/:id/matches/:matchId)
// ==========================================
exports.getMatchDetail = async (req, res) => {
  const { id, matchId } = req.params; // tournamentId, matchId

  try {
    // 경기 정보 조회 (팀 정보, 대회 정보 포함)
    const match = await prisma.match.findUnique({
      where: { id: parseInt(matchId) },
      include: {
        teamA: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    profiles: true,
                  },
                },
              },
            },
          },
        },
        teamB: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    profiles: true,
                  },
                },
              },
            },
          },
        },
        tournament: true, // 헤더 표시용
        predictions: true, // 승부예측 통계용
      },
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: { message: "경기를 찾을 수 없습니다." },
      });
    }

    // URL의 토너먼트 ID와 실제 경기의 토너먼트 ID가 일치하는지 검증
    if (match.tournamentId !== parseInt(id)) {
      return res.status(400).json({
        success: false,
        error: { message: "해당 대회의 경기가 아닙니다." },
      });
    }

    // 프론트엔드 사용하기 편하게 데이터 가공
    const totalBets = match.predictions.reduce(
      (sum, p) => sum + p.betAmount,
      0,
    );
    const teamABets = match.predictions
      .filter((p) => p.predictedTeamId === match.teamAId)
      .reduce((sum, p) => sum + p.betAmount, 0);
    const teamBBets = totalBets - teamABets;

    // 팀 멤버 데이터를 프론트엔드 포맷(players)으로 변환하는 헬퍼 함수
    const formatTeamPlayers = (team) => {
      if (!team || !team.members) {
        console.log(`[getMatchDetail] Team ${team?.id} has no members`);
        return [];
      }
      return team.members.map((member) => {
        // 해당 대회의 종목에 맞는 프로필 찾기 (없으면 첫 번째 프로필 사용)
        const profile =
          member.user.profiles.find(
            (p) =>
              p.sportType?.toLowerCase() ===
              match.tournament.sportType?.toLowerCase(),
          ) || member.user.profiles[0];

        return {
          id: member.user.id,
          name: member.user.nickname || member.user.name,
          position: member.position || profile?.position || "TBD",
          champion: profile?.champions || "-",
          tier: profile?.tier,
        };
      });
    };

    const teamAPlayers = match.teamA ? formatTeamPlayers(match.teamA) : [];
    const teamBPlayers = match.teamB ? formatTeamPlayers(match.teamB) : [];

    console.log(`[getMatchDetail] TeamA Players Count: ${teamAPlayers.length}`);
    console.log(`[getMatchDetail] TeamB Players Count: ${teamBPlayers.length}`);

    const data = {
      id: match.id,
      tournamentId: match.tournamentId,
      tournamentName: match.tournament.name,
      sport: match.tournament.sport,
      round: match.roundName,
      date: match.matchDate
        ? new Date(match.matchDate).toISOString().split("T")[0]
        : null,
      time: match.matchDate
        ? new Date(match.matchDate).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
      status: match.status,
      venue: match.venue,

      // 팀 정보
      teamA: match.teamA ? { ...match.teamA, players: teamAPlayers } : null,
      teamB: match.teamB ? { ...match.teamB, players: teamBPlayers } : null,
      teamAScore: match.teamAScore,
      teamBScore: match.teamBScore,
      winnerId: match.winnerTeamId,

      // 승부예측 통계
      predictions: {
        totalBets,
        teamA: teamABets,
        teamB: teamBBets,
        teamAPercent:
          totalBets === 0 ? 50 : Math.round((teamABets / totalBets) * 100),
        teamBPercent:
          totalBets === 0 ? 50 : Math.round((teamBBets / totalBets) * 100),
      },

      userPoints: 0,

      // 베팅 가능 여부 (경기 시작 전이고 상태가 UPCOMING일 때만)
      // 날짜 비교 로직 개선: 경기 당일 포함 마감 처리 (predictionController와 로직 통일)
      isBettingOpen: (() => {
        if (match.status !== "UPCOMING") return false;
        if (!match.matchDate) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const matchDate = new Date(match.matchDate);
        matchDate.setHours(0, 0, 0, 0);

        // 오늘 날짜가 경기 날짜보다 작아야 함 (즉, 어제까지만 가능)
        return today.getTime() < matchDate.getTime();
      })(),
    };

    // 로그인한 유저라면 포인트 정보 추가
    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { points: true },
      });
      if (user) data.userPoints = user.points;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "경기 상세 조회 실패" } });
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

function getValidDateRange(startDateStr, endDateStr) {
  const now = new Date();
  const originalStart = startDateStr ? new Date(startDateStr) : null;

  // 1. 시작일 결정: (설정된 시작일이 없거나, 이미 지났으면) -> 오늘부터 시작
  let effectiveStart;
  if (!originalStart || originalStart < now) {
    effectiveStart = new Date(); // 오늘
  } else {
    effectiveStart = originalStart; // 미래의 시작일 유지
  }

  // 2. 종료일 결정
  let effectiveEnd = endDateStr ? new Date(endDateStr) : null;

  // 종료일이 없거나, 시작일보다 이전이라면 -> 시작일 + 7일로 강제 설정
  if (!effectiveEnd || effectiveEnd <= effectiveStart) {
    effectiveEnd = new Date(effectiveStart);
    effectiveEnd.setDate(effectiveEnd.getDate() + 7);
  }

  return { start: effectiveStart, end: effectiveEnd };
}

function calculateMatchDate(startDate, endDate, matchIndex, totalMatches) {
  const start = startDate.getTime();
  const end = endDate.getTime();
  const duration = end - start;

  // 전체 기간을 경기 수로 나누어 간격을 구함
  const interval = totalMatches > 1 ? duration / totalMatches : 0;

  // 해당 순번의 날짜 계산
  const targetTime = start + interval * matchIndex;
  const targetDate = new Date(targetTime);

  // 시간은 "저녁 6시"로 고정 (랜덤성 배제)
  targetDate.setHours(18, 0, 0, 0);

  return targetDate;
}

// [A] 리그전 스케줄 생성 (단일 조)
async function _createLeagueSchedule(tournamentId, teamIds) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { startDate: true, endDate: true, format: true },
  });

  // ⭐️ 날짜 보정 로직 적용
  let { start, end } = getValidDateRange(
    tournament.startDate,
    tournament.endDate,
  );

  // 하이브리드라면 리그 기간은 전체의 80%만 사용
  if (tournament.format === "HYBRID") {
    const totalDuration = end.getTime() - start.getTime();
    end = new Date(start.getTime() + totalDuration * 0.8);
  }

  const matches = [];
  const n = teamIds.length;
  const totalMatches = (n * (n - 1)) / 2;
  let matchCounter = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const matchDate = calculateMatchDate(
        start,
        end,
        matchCounter,
        totalMatches,
      );

      matches.push({
        tournamentId,
        stage: "LEAGUE",
        roundName: "League Round",
        teamAId: teamIds[i],
        teamBId: teamIds[j],
        status: "UPCOMING",
        matchDate: matchDate, // ⭐️ 보정된 날짜 입력
      });
      matchCounter++;
    }
  }
  await prisma.match.createMany({ data: matches });
}

// [A-2] 그룹별 리그 스케줄 생성
async function _createLeagueScheduleGroups(tournamentId, teamIds, groupCount) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { startDate: true, endDate: true, format: true },
  });

  // ⭐️ 날짜 보정 로직 적용
  let { start, end } = getValidDateRange(
    tournament.startDate,
    tournament.endDate,
  );

  if (tournament.format === "HYBRID") {
    const totalDuration = end.getTime() - start.getTime();
    end = new Date(start.getTime() + totalDuration * 0.8);
  }

  const groups = Array.from({ length: groupCount }, () => []);
  teamIds.forEach((teamId, index) => {
    groups[index % groupCount].push(teamId);
  });

  const matches = [];
  let estimatedTotalMatches = 0;
  groups.forEach((g) => {
    estimatedTotalMatches += (g.length * (g.length - 1)) / 2;
  });

  let globalMatchCounter = 0;

  for (let g = 0; g < groupCount; g++) {
    const groupTeams = groups[g];
    const n = groupTeams.length;
    const groupName = `${String.fromCharCode(65 + g)}조`;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const matchDate = calculateMatchDate(
          start,
          end,
          globalMatchCounter,
          estimatedTotalMatches,
        );

        matches.push({
          tournamentId,
          stage: "LEAGUE",
          roundName: groupName,
          teamAId: groupTeams[i],
          teamBId: groupTeams[j],
          status: "UPCOMING",
          matchDate: matchDate, // ⭐️ 보정된 날짜 입력
        });
        globalMatchCounter++;
      }
    }
  }

  await prisma.match.createMany({ data: matches });
}

async function _createTournamentBracket(tournamentId, teamIds, stage) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { startDate: true, endDate: true, format: true },
  });

  // ⭐️ 날짜 보정 로직
  let baseDate;

  // 1. 하이브리드 본선인 경우: 리그 마지막 경기 다음날부터 시작
  if (tournament.format === "HYBRID" && stage === "TOURNAMENT") {
    const lastLeagueMatch = await prisma.match.findFirst({
      where: {
        tournamentId: tournamentId,
        stage: "LEAGUE",
      },
      orderBy: { matchDate: "desc" },
    });

    if (lastLeagueMatch && lastLeagueMatch.matchDate) {
      baseDate = new Date(lastLeagueMatch.matchDate);
      baseDate.setDate(baseDate.getDate() + 1); // 다음날
    } else {
      // 리그 일정이 없으면 오늘부터
      baseDate = new Date();
    }
  }
  // 2. 일반 토너먼트이거나 시작일이 없거나 이미 지난 경우: 오늘부터
  else if (
    !tournament.startDate ||
    new Date(tournament.startDate) < new Date()
  ) {
    baseDate = new Date();
  }
  // 3. 미래 시작일이 있는 경우
  else {
    baseDate = new Date(tournament.startDate);
  }

  baseDate.setHours(18, 0, 0, 0); // 18시 시작

  const teamCount = teamIds.length;
  let roundSize = 2;
  while (roundSize < teamCount) roundSize *= 2;

  const matchCount = roundSize / 2;
  const matchesToCreate = [];

  for (let i = 0; i < matchCount; i++) {
    const teamAId = teamIds[i * 2] || null;
    const teamBId = teamIds[i * 2 + 1] || null;

    // 1시간 간격 분산
    const matchDate = new Date(baseDate.getTime() + i * 60 * 60 * 1000);

    let roundName = `${roundSize}강`;
    if (roundSize === 2) roundName = "결승";
    else if (roundSize === 4) roundName = "준결승";

    matchesToCreate.push({
      tournamentId,
      stage: stage,
      roundName: roundName,
      teamAId,
      teamBId,
      status: teamAId && teamBId ? "UPCOMING" : "DONE",
      winnerTeamId:
        !teamBId && teamAId ? teamAId : !teamAId && teamBId ? teamBId : null,
      matchDate: matchDate, // ⭐️ 보정된 날짜 입력
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
    // 1. 대회 및 참가 팀 조회
    const tournament = await prisma.tournament.findUnique({
      where: { id: parseInt(id) },
      include: {
        participatingTeams: {
          include: { team: true },
        },
      },
    });

    if (!tournament)
      return res.status(404).json({
        success: false,
        error: { message: "대회를 찾을 수 없습니다" },
      });
    if (tournament.managerId !== userId)
      return res
        .status(403)
        .json({ success: false, error: { message: "권한이 없습니다" } });

    // 2. 상태 체크
    if (
      tournament.status !== "UPCOMING" &&
      tournament.status !== "RECRUITING"
    ) {
      return res.status(400).json({
        success: false,
        error: { message: "이미 진행 중인 대회입니다" },
      });
    }

    // 3. 참가 팀 확인
    const teams = tournament.participatingTeams.filter(
      (pt) => pt.status === "APPROVED",
    );
    const teamIds = teams.map((pt) => pt.teamId);

    if (teamIds.length < 2) {
      return res.status(400).json({
        success: false,
        error: { message: "최소 2개 팀이 승인되어야 합니다" },
      });
    }

    // 4. 포맷에 따라 분기 처리
    if (tournament.format === "LEAGUE" || tournament.format === "HYBRID") {
      // 4-A. 리그/하이브리드 -> 조별 리그 일정 생성
      teamIds.sort(() => Math.random() - 0.5); // 팀 섞기

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
      // 4-B. 토너먼트 -> ⭐ [수정] 날짜 로직이 포함된 헬퍼 함수 사용
      await _createTournamentBracket(tournament.id, teamIds, "TOURNAMENT");
    }

    // 5. 대회 상태 업데이트 (ONGOING)
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
        message:
          tournament.format === "TOURNAMENT"
            ? "대진표가 생성되었습니다"
            : "조별 리그 일정이 생성되었습니다",
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "생성 실패" } });
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

    // ⭐️ [추가] 참가 팀 정보를 먼저 가져와야 합니다!
    // (이게 없으면 아래 calculateStats에서 에러가 납니다)
    const participatingTeams = await prisma.tournamentTeam.findMany({
      where: { tournamentId: parseInt(id), status: "APPROVED" },
      include: { team: true },
    });

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

    // 그룹별로 나누기
    const groups = {};
    matches.forEach((match) => {
      const groupName = match.roundName || "리그";
      if (!groups[groupName]) groups[groupName] = new Set();
      if (match.teamAId) groups[groupName].add(match.teamAId);
      if (match.teamBId) groups[groupName].add(match.teamBId);
    });

    // 팀별 통계 계산 함수
    const calculateStats = (targetTeamIds) => {
      const stats = {};
      targetTeamIds.forEach((teamId) => {
        // ⭐️ 여기서 위에서 가져온 participatingTeams를 사용합니다.
        const pt = participatingTeams.find((p) => p.teamId === teamId);
        if (pt) {
          stats[teamId] = {
            teamId: pt.teamId,
            teamName: pt.team.name,
            logo: pt.team.logo || null,
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
          const teamA = stats[match.teamAId];
          const teamB = stats[match.teamBId];

          // 안전장치: 팀 정보가 없으면 스킵
          if (!teamA || !teamB) return;

          teamA.played++;
          teamB.played++;
          teamA.goalsFor += match.teamAScore;
          teamA.goalsAgainst += match.teamBScore;
          teamB.goalsFor += match.teamBScore;
          teamB.goalsAgainst += match.teamAScore;

          if (match.teamAScore > match.teamBScore) {
            teamA.won++;
            teamA.points += 3;
            teamA.recentForm.push("W");
            teamB.lost++;
            teamB.recentForm.push("L");
          } else if (match.teamAScore < match.teamBScore) {
            teamB.won++;
            teamB.points += 3;
            teamB.recentForm.push("W");
            teamA.lost++;
            teamA.recentForm.push("L");
          } else {
            teamA.drawn++;
            teamA.points += 1;
            teamA.recentForm.push("D");
            teamB.drawn++;
            teamB.points += 1;
            teamB.recentForm.push("D");
          }
        }
      });

      return Object.values(stats).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const aGD = a.goalsFor - a.goalsAgainst;
        const bGD = b.goalsFor - b.goalsAgainst;
        if (bGD !== aGD) return bGD - aGD;
        return b.goalsFor - a.goalsFor;
      });
    };

    let resultData;
    if (Object.keys(groups).length > 0) {
      resultData = Object.keys(groups)
        .sort()
        .map((groupName) => ({
          groupName,
          standings: calculateStats(groups[groupName]),
        }));
    } else {
      // 매치가 없거나 그룹이 없는 경우, 모든 승인된 팀을 하나의 리스트로
      const allTeamIds = new Set(participatingTeams.map((pt) => pt.teamId));
      resultData = [
        {
          groupName: "리그",
          standings: calculateStats(allTeamIds),
        },
      ];
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

// ==========================================
// 9. [NEW] 경기 상세 정보 조회 (GET /api/tournaments/:id/matches/:matchId)
// ==========================================
exports.getMatchDetail_DEPRECATED = async (req, res) => {
  const { id, matchId } = req.params; // tournamentId, matchId

  try {
    // 경기 정보 조회 (팀 정보 + ⭐️ 멤버 정보 포함)
    const match = await prisma.match.findUnique({
      where: { id: parseInt(matchId) },
      include: {
        // ⭐️ [핵심] 팀 정보 가져올 때 멤버(members)와 유저(user) 정보까지 깊게 가져오기
        // 이게 있어야 TeamLineup에서 .map() 에러가 안 납니다!
        teamA: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    profiles: true,
                  },
                },
              },
            },
          },
        },
        teamB: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    profiles: true,
                  },
                },
              },
            },
          },
        },
        tournament: true,
        predictions: true,
      },
    });

    if (!match) {
      return res.status(404).json({
        success: false,
        error: { message: "경기를 찾을 수 없습니다." },
      });
    }

    // URL의 토너먼트 ID 검증
    if (match.tournamentId !== parseInt(id)) {
      return res.status(400).json({
        success: false,
        error: { message: "해당 대회의 경기가 아닙니다." },
      });
    }

    // 데이터 가공
    const totalBets = match.predictions.reduce(
      (sum, p) => sum + p.betAmount,
      0,
    );
    const teamABets = match.predictions
      .filter((p) => p.predictedTeamId === match.teamAId)
      .reduce((sum, p) => sum + p.betAmount, 0);
    const teamBBets = totalBets - teamABets;

    // 팀 멤버 데이터를 프론트엔드 포맷(players)으로 변환하는 헬퍼 함수
    const formatTeamPlayers = (team) => {
      if (!team || !team.members) {
        console.log(`[getMatchDetail] Team ${team?.id} has no members`);
        return [];
      }
      return team.members.map((member) => {
        // 해당 대회의 종목에 맞는 프로필 찾기 (없으면 첫 번째 프로필 사용)
        const profile =
          member.user.profiles.find(
            (p) =>
              p.sportType?.toLowerCase() ===
              match.tournament.sportType?.toLowerCase(),
          ) || member.user.profiles[0];

        // [디버깅 로그] 멤버 정보 확인
        /*
        console.log(
          `[getMatchDetail] Member: ${member.user.name}, SportType: ${match.tournament.sportType}, Profile Found: ${!!profile}`,
        );
        */

        return {
          id: member.user.id,
          name: member.user.nickname || member.user.name,
          position: member.position || profile?.position || "TBD",
          champion: profile?.champions || "-",
          tier: profile?.tier,
        };
      });
    };

    const teamAPlayers = match.teamA ? formatTeamPlayers(match.teamA) : [];
    const teamBPlayers = match.teamB ? formatTeamPlayers(match.teamB) : [];

    console.log(`[getMatchDetail] TeamA Players Count: ${teamAPlayers.length}`);
    console.log(`[getMatchDetail] TeamB Players Count: ${teamBPlayers.length}`);

    const data = {
      id: match.id,
      tournamentId: match.tournamentId,
      tournamentName: match.tournament.name,
      sport: match.tournament.sport,
      round: match.roundName,
      date: match.matchDate
        ? new Date(match.matchDate).toISOString().split("T")[0]
        : null,
      time: match.matchDate
        ? new Date(match.matchDate).toLocaleTimeString("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null,
      status: match.status,
      venue: match.venue,

      // 팀 정보 (여기에 members 배열이 포함되어 나갑니다)
      teamA: match.teamA ? { ...match.teamA, players: teamAPlayers } : null,
      teamB: match.teamB ? { ...match.teamB, players: teamBPlayers } : null,
      teamAScore: match.teamAScore,
      teamBScore: match.teamBScore,
      winnerId: match.winnerTeamId,

      // 승부예측 통계
      predictions: {
        totalBets,
        teamA: teamABets,
        teamB: teamBBets,
        teamAPercent:
          totalBets === 0 ? 50 : Math.round((teamABets / totalBets) * 100),
        teamBPercent:
          totalBets === 0 ? 50 : Math.round((teamBBets / totalBets) * 100),
      },

      userPoints: 0,

      // 베팅 가능 여부 (경기 시작 전이고 상태가 UPCOMING일 때만)
      // 날짜 비교 로직 개선: 경기 당일 포함 마감 처리 (predictionController와 로직 통일)
      isBettingOpen: (() => {
        if (match.status !== "UPCOMING") return false;
        if (!match.matchDate) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const matchDate = new Date(match.matchDate);
        matchDate.setHours(0, 0, 0, 0);

        // 오늘 날짜가 경기 날짜보다 작아야 함 (즉, 어제까지만 가능)
        return today.getTime() < matchDate.getTime();
      })(),
    };

    // 로그인 유저 포인트 정보 추가
    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { points: true },
      });
      if (user) data.userPoints = user.points;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "경기 상세 조회 실패" } });
  }
};
