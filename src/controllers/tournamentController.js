// src/controllers/tournamentController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. 대회 목록 조회 (GET /api/tournaments)
// ==========================================
exports.getAllTournaments = async (req, res) => {
  const { status, sport, page = 1 } = req.query; // 필터링

  try {
    const where = {};
    if (status) where.status = status;
    if (sport) where.sport = sport; // 'LoL', 'Soccer' 등

    const tournaments = await prisma.tournament.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10, // 페이지당 10개 (임시)
      skip: (parseInt(page) - 1) * 10,
      include: {
        _count: { select: { participatingTeams: true } } // 참가 팀 수
      }
    });

    const data = tournaments.map(t => ({
      id: t.id,
      name: t.name,
      sport: t.sport,
      status: t.status,
      isPrivate: t.isPrivate,
      description: t.description,
      startDate: t.startDate,
      endDate: t.endDate,
      teamCount: t._count.participatingTeams
    }));

    res.json({ success: true, data });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "대회 목록 조회 실패" } });
  }
};

// ==========================================
// 2. 대회 생성 (POST /api/tournaments)
// ==========================================
exports.createTournament = async (req, res) => {
  const { name, sport, description, isPrivate, startDate, endDate } = req.body;
  const managerId = req.userId;

  try {
    const newTournament = await prisma.tournament.create({
      data: {
        name,
        sport, // 'LoL', 'Soccer' ...
        description,
        isPrivate: isPrivate || false,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: 'UPCOMING', // 초기 상태
        managerId,
        inviteCode: isPrivate ? Math.random().toString(36).substring(2, 8).toUpperCase() : null
      }
    });

    res.status(201).json({ success: true, data: newTournament });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "대회 생성 실패" } });
  }
};

// ==========================================
// 3. 대회 상세 조회 (GET /api/tournaments/:id)
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

    const responseData = {
      id: tournament.id,
      name: tournament.name,
      sport: tournament.sport,
      status: tournament.status,
      isPrivate: tournament.isPrivate,
      description: tournament.description,
      managerId: tournament.managerId,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      teams: tournament.participatingTeams.map(pt => ({
        id: pt.team.id,
        name: pt.team.name,
        logo: pt.team.logo // 로고 필드가 있다면
      }))
    };

    res.json({ success: true, data: responseData });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "상세 조회 실패" } });
  }
};

// ==========================================
// 4. 대회 참가 신청 (POST .../join)
// ==========================================
exports.joinTournament = async (req, res) => {
  const { id } = req.params;
  const { teamId } = req.body; // 참가할 팀 ID

  try {
    // 이미 참가했는지 확인
    const existing = await prisma.tournamentTeam.findUnique({
      where: {
        tournamentId_teamId: {
          tournamentId: parseInt(id),
          teamId: parseInt(teamId)
        }
      }
    });

    if (existing) {
      return res.status(400).json({ success: false, error: { message: "이미 참가 중인 팀입니다." } });
    }

    await prisma.tournamentTeam.create({
      data: {
        tournamentId: parseInt(id),
        teamId: parseInt(teamId)
      }
    });

    res.json({ success: true, message: "대회 참가 신청이 완료되었습니다." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "참가 신청 실패" } });
  }
};

// ==========================================
// 5. 대회 설정 변경 & 시작 (PUT .../settings)
// ==========================================
exports.updateSettings = async (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;
  const managerId = req.userId;

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: parseInt(id) } });
    
    // 권한 체크
    if (tournament.managerId !== managerId) {
      return res.status(403).json({ success: false, error: { message: "권한이 없습니다." } });
    }

    // 상태가 'ONGOING'으로 바뀌면 대진표 자동 생성 (토너먼트 시작!)
    if (status === 'ONGOING' && tournament.status !== 'ONGOING') {
      await generateBracket(tournament.id);
    }

    const updated = await prisma.tournament.update({
      where: { id: parseInt(id) },
      data: { name, description, status }
    });

    res.json({ success: true, message: "대회 설정이 업데이트되었습니다.", data: updated });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "설정 업데이트 실패" } });
  }
};

// ==========================================
// 6. 대진표 조회 (GET .../bracket)
// ==========================================
exports.getBracket = async (req, res) => {
  const { id } = req.params;
  try {
    const matches = await prisma.match.findMany({
      where: { tournamentId: parseInt(id) },
      include: { teamA: true, teamB: true },
      orderBy: { id: 'asc' }
    });

    // 라운드별 그룹화 (예: 8강, 4강)
    const bracketData = matches.reduce((acc, match) => {
      const roundName = match.roundName || 'Unassigned';
      if (!acc[roundName]) acc[roundName] = [];
      
      acc[roundName].push({
        id: match.id,
        status: match.status,
        teamA: match.teamA ? { id: match.teamA.id, name: match.teamA.name, score: match.teamAScore } : null,
        teamB: match.teamB ? { id: match.teamB.id, name: match.teamB.name, score: match.teamBScore } : null,
        winnerId: match.winnerTeamId
      });
      return acc;
    }, {});

    // 배열 형태로 변환
    const result = Object.keys(bracketData).map(key => ({
      roundName: key,
      matches: bracketData[key]
    }));

    res.json({ success: true, data: result });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "대진표 조회 실패" } });
  }
};

// --- [Internal Helper] 대진표 생성 함수 ---
async function generateBracket(tournamentId) {
  // 1. 참가 팀 가져오기 (랜덤 섞기)
  const participation = await prisma.tournamentTeam.findMany({
    where: { tournamentId },
    select: { teamId: true }
  });
  
  let teams = participation.map(p => p.teamId).sort(() => Math.random() - 0.5);
  const teamCount = teams.length;

  // 2. 라운드 계산 (2, 4, 8, 16강...)
  // 예: 5팀이면 8강부터 시작 (부전승 포함)
  let roundSize = 2;
  while (roundSize < teamCount) roundSize *= 2;

  // 3. 첫 라운드 매치 생성
  // (복잡한 부전승 로직 대신 단순화: 빈 자리는 NULL로 둬서 부전승 처리)
  const matchesToCreate = [];
  const totalRounds = Math.log2(roundSize);

  // 라운드별 경기 수 (8강=4경기, 4강=2경기, 결승=1경기)
  // 여기서는 '첫 라운드'만 팀을 배정하고, 상위 라운드는 빈 경기로 생성해둠
  
  // (A) 상위 라운드부터 거꾸로 생성해서 ID 연결? (복잡함)
  // (B) 그냥 모든 슬롯을 생성해두고 나중에 업데이트? (쉬움) -> 이 방식 선택

  // 간단하게: 8강전(4경기) 생성 -> 팀 배정
  const matchCount = roundSize / 2;
  for (let i = 0; i < matchCount; i++) {
    const teamAId = teams[i * 2] || null; // 팀이 없으면 부전승
    const teamBId = teams[i * 2 + 1] || null;

    // 만약 한쪽만 있으면 자동 승자 처리 로직도 필요하나, 일단 'scheduled'로 둠
    matchesToCreate.push({
      tournamentId,
      roundName: `${roundSize}강`, // 8강, 4강 등
      teamAId,
      teamBId,
      status: (teamAId && teamBId) ? 'UPCOMING' : 'DONE', // 둘 다 있어야 경기 예정
      winnerTeamId: (!teamBId && teamAId) ? teamAId : (!teamAId && teamBId) ? teamBId : null // 부전승 처리
    });
  }

  await prisma.match.createMany({ data: matchesToCreate });
}