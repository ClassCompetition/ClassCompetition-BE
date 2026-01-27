// src/controllers/tournamentController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. 대회 생성 (규칙 설정)
// ==========================================
exports.createTournament = async (req, res) => {
  const { name, sport, description, isPrivate, startDate, endDate, format, playoffTeams } = req.body;
  const managerId = req.userId;

  try {
    const newTournament = await prisma.tournament.create({
      data: {
        name,
        sport, // 'LoL', 'Soccer'
        description,
        isPrivate: isPrivate || false,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: 'UPCOMING',
        managerId,
        inviteCode: isPrivate ? Math.random().toString(36).substring(2, 8).toUpperCase() : null,
        
        // ⭐️ [복구] 대회 포맷 설정
        format: format || 'TOURNAMENT', // 'TOURNAMENT', 'LEAGUE', 'HYBRID'
        playoffTeams: format === 'HYBRID' ? parseInt(playoffTeams) : null
      }
    });

    res.status(201).json({ success: true, data: newTournament });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "대회 생성 실패" } });
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
    if (sport) where.sport = sport;

    const tournaments = await prisma.tournament.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      skip: (parseInt(page) - 1) * 10,
      include: {
        _count: { select: { participatingTeams: true } }
      }
    });

    const data = tournaments.map(t => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      status: t.status,
      format: t.format, // 포맷 정보 추가
      isPrivate: t.isPrivate,
      description: t.description,
      startDate: t.startDate,
      endDate: t.endDate,
      teamCount: t._count.participatingTeams
    }));

    res.json({ success: true, data });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "목록 조회 실패" } });
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
          include: { team: true }
        }
      }
    });

    if (!tournament) return res.status(404).json({ success: false, error: { message: "대회 없음" } });

    res.json({
      success: true,
      data: {
        ...tournament,
        teams: tournament.participatingTeams.map(pt => ({
          id: pt.team.id,
          name: pt.team.name,
          logo: pt.team.logo
        }))
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "상세 조회 실패" } });
  }
};

// ==========================================
// 4. 대회 참가 신청 (기존 유지)
// ==========================================
exports.joinTournament = async (req, res) => {
  const { id } = req.params;
  const { teamId } = req.body;

  try {
    const existing = await prisma.tournamentTeam.findUnique({
      where: { tournamentId_teamId: { tournamentId: parseInt(id), teamId: parseInt(teamId) } }
    });

    if (existing) {
      return res.status(400).json({ success: false, error: { message: "이미 참가 중인 팀입니다." } });
    }

    await prisma.tournamentTeam.create({
      data: { tournamentId: parseInt(id), teamId: parseInt(teamId) }
    });

    res.json({ success: true, message: "참가 신청 완료" });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "참가 신청 실패" } });
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
      include: { participatingTeams: true }
    });

    // 권한 및 상태 체크
    if (tournament.managerId !== managerId) return res.status(403).json({ message: "권한 없음" });
    if (tournament.status === 'ONGOING') return res.status(400).json({ message: "이미 진행 중입니다." });

    const teamIds = tournament.participatingTeams.map(pt => pt.teamId);
    if (teamIds.length < 2) return res.status(400).json({ message: "최소 2팀이 필요합니다." });

    // 팀 섞기 (랜덤)
    teamIds.sort(() => Math.random() - 0.5);

    // 포맷에 따른 경기 생성
    if (tournament.format === 'LEAGUE' || tournament.format === 'HYBRID') {
      // 리그전 스케줄 생성 (HYBRID는 예선전으로 리그 진행)
      await _createLeagueSchedule(tournament.id, teamIds);
    } else {
      // 토너먼트 대진표 생성
      await _createTournamentBracket(tournament.id, teamIds, 'TOURNAMENT');
    }

    // 상태 변경
    await prisma.tournament.update({
      where: { id: parseInt(id) },
      data: { status: 'ONGOING' }
    });

    res.json({ success: true, message: `대회가 시작되었습니다! (${tournament.format})` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "대회 시작 실패" } });
  }
};

// ==========================================
// 6. ⭐️ [복구] 플레이오프 시작 (하이브리드 전용)
// ==========================================
exports.startPlayoff = async (req, res) => {
  const { id } = req.params;
  const managerId = req.userId;

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: parseInt(id) } });

    // 검증
    if (tournament.managerId !== managerId) return res.status(403).json({ message: "권한 없음" });
    if (tournament.format !== 'HYBRID') return res.status(400).json({ message: "하이브리드 대회가 아닙니다." });
    if (!tournament.playoffTeams) return res.status(400).json({ message: "본선 진출 팀 수가 설정되지 않았습니다." });

    // 1. 리그 경기(예선) 결과 집계
    const leagueMatches = await prisma.match.findMany({
      where: { 
        tournamentId: parseInt(id), 
        stage: 'LEAGUE',
        status: { in: ['DONE', 'COMPLETED'] } // 완료된 경기만
      }
    });

    // 2. 승점 계산
    const scores = {};
    leagueMatches.forEach(m => {
      if (m.winnerTeamId) {
        scores[m.winnerTeamId] = (scores[m.winnerTeamId] || 0) + 1; // 승리 +1점
      }
    });

    // 3. 순위 산정 (승수 내림차순)
    const ranking = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]) // [[teamId, wins], ...]
      .map(entry => parseInt(entry[0]));

    // 4. 상위 N팀 선발
    const advancedTeams = ranking.slice(0, tournament.playoffTeams);
    if (advancedTeams.length < tournament.playoffTeams) {
        return res.status(400).json({ error: "경기 데이터 부족으로 순위를 매길 수 없습니다." });
    }

    // 5. 플레이오프(토너먼트) 대진표 생성
    // stage를 'TOURNAMENT'로 명시하여 생성
    await _createTournamentBracket(tournament.id, advancedTeams, 'TOURNAMENT');

    res.json({ 
        success: true, 
        message: `예선 종료! 상위 ${advancedTeams.length}팀이 본선에 진출했습니다.`,
        data: { advancedTeams } 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "플레이오프 전환 실패" } });
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
      orderBy: { id: 'asc' }
    });

    // 라운드별 그룹화
    const bracketData = matches.reduce((acc, match) => {
      // stage가 있으면 stage별로도 묶을 수 있음 (예: 예선/본선)
      const groupKey = match.stage === 'LEAGUE' ? '예선 리그' : (match.roundName || 'Unassigned');
      
      if (!acc[groupKey]) acc[groupKey] = [];
      
      acc[groupKey].push({
        id: match.id,
        stage: match.stage,
        teamA: match.teamA ? { id: match.teamA.id, name: match.teamA.name, score: match.teamAScore } : null,
        teamB: match.teamB ? { id: match.teamB.id, name: match.teamB.name, score: match.teamBScore } : null,
        winnerId: match.winnerTeamId,
        status: match.status
      });
      return acc;
    }, {});

    const result = Object.keys(bracketData).map(key => ({
      roundName: key,
      matches: bracketData[key]
    }));

    res.json({ success: true, data: result });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "대진표 조회 실패" } });
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
        stage: 'LEAGUE', // ⭐️ 리그 경기
        roundName: 'League Round',
        teamAId: teamIds[i],
        teamBId: teamIds[j],
        status: 'UPCOMING'
      });
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
      status: (teamAId && teamBId) ? 'UPCOMING' : 'DONE', 
      winnerTeamId: (!teamBId && teamAId) ? teamAId : (!teamAId && teamBId) ? teamBId : null
    });
  }

  await prisma.match.createMany({ data: matchesToCreate });
}

// ==========================================
// 8. 대회 설정 변경 (기존 유지)
// ==========================================
exports.updateSettings = async (req, res) => {
    // ... 기존 코드와 동일 ...
    // (단, startTournament와 로직이 겹치므로 여기선 단순 정보 수정만 담당하는 게 좋음)
    const { id } = req.params;
    const { name, description } = req.body;
    // ...
    const updated = await prisma.tournament.update({
        where: { id: parseInt(id) },
        data: { name, description }
    });
    res.json({ success: true, message: "수정 완료", data: updated });
};