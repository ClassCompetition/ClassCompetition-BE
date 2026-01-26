// src/controllers/tournamentController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. 대회 생성 (규칙 설정 단계)
// ==========================================
exports.createTournament = async (req, res) => {
  // format: 'TOURNAMENT' | 'LEAGUE' | 'HYBRID'
  // playoffTeams: 하이브리드일 때 본선 진출 팀 수 (예: 4)
  const { title, sportType, format, teamCount, playoffTeams } = req.body;
  const managerId = req.userId;

  try {
    const tournament = await prisma.tournament.create({
      data: {
        name: title,
        sport: sportType === 'lol' ? 'LoL' : '일반',
        sportType,
        format: format || 'TOURNAMENT',
        managerId,
        status: 'recruiting',
        description: `${teamCount}팀 참여 ${format} 대회`,
        
        // ⭐️ 하이브리드 설정 저장
        hasPlayoff: format === 'HYBRID',
        playoffTeams: format === 'HYBRID' ? parseInt(playoffTeams) : null
      },
    });

    // 토너먼트 방식은 처음부터 대진표 틀을 짜둠
    if (format === 'TOURNAMENT') {
      await generateEmptyBracket(tournament.id, teamCount, 'TOURNAMENT');
    }
    // 리그나 하이브리드는 팀이 다 모이고 '시작' 눌러야 매치 생성됨 (여기선 패스)

    res.status(201).json({ 
      success: true, 
      message: `${format} 대회가 생성되었습니다.`, 
      data: tournament 
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: '대회 생성 실패' });
  }
};

// ==========================================
// 2. 대회 시작 (팀 배치 및 리그/토너먼트 경기 생성)
// ==========================================
exports.startTournament = async (req, res) => {
  const { id } = req.params;
  const { teamIds, method } = req.body; // method: 'RANDOM' | 'MANUAL'

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: parseInt(id) } });
    if (!tournament) return res.status(404).json({ error: "대회 없음" });

    if (!teamIds || teamIds.length < 2) {
      return res.status(400).json({ error: "최소 2개 팀이 필요합니다." });
    }

    // 팀 순서 섞기 (랜덤일 경우)
    let orderedTeams = [...teamIds];
    if (method === 'RANDOM') {
      orderedTeams.sort(() => Math.random() - 0.5);
    }

    // 포맷별 경기 생성 로직
    if (tournament.format === 'TOURNAMENT') {
      // 이미 빈 대진표가 있으니 거기에 팀만 채워넣음
      await assignTeamsToBracket(tournament.id, orderedTeams, 'TOURNAMENT');
    
    } else {
      // LEAGUE 또는 HYBRID는 풀리그 경기 생성
      // stage를 'LEAGUE'로 설정해서 만듦
      await createLeagueSchedule(tournament.id, orderedTeams);
    }

    // 상태 변경
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: 'ongoing' }
    });

    res.json({ success: true, message: `대회가 시작되었습니다! (${tournament.format})` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: '대회 시작 실패' });
  }
};

// ==========================================
// 3. ⭐️ [NEW] 플레이오프 시작 (리그 종료 후)
// ==========================================
exports.startPlayoff = async (req, res) => {
  const { id } = req.params; // tournamentId

  try {
    const tournament = await prisma.tournament.findUnique({ where: { id: parseInt(id) } });
    
    // 검증: 하이브리드 모드인가?
    if (!tournament.hasPlayoff || !tournament.playoffTeams) {
      return res.status(400).json({ error: "플레이오프 설정이 없는 대회입니다." });
    }

    // 1. 리그 경기 결과 집계 (순위 산정)
    // stage가 'LEAGUE'이고 끝난 경기만 가져옴
    const leagueMatches = await prisma.match.findMany({
      where: { 
        tournamentId: tournament.id,
        stage: 'LEAGUE',
        status: 'completed'
      }
    });

    // 승수 계산
    const scores = {}; 
    leagueMatches.forEach(m => {
      if (m.winnerId) {
        scores[m.winnerId] = (scores[m.winnerId] || 0) + 1;
      }
    });

    // 승수 내림차순 정렬
    const ranking = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]) // [ [teamId, wins], ... ]
      .map(entry => parseInt(entry[0]));

    // 상위 N팀 뽑기
    const advancedTeams = ranking.slice(0, tournament.playoffTeams);

    if (advancedTeams.length < tournament.playoffTeams) {
        return res.status(400).json({ error: "경기 데이터 부족으로 순위를 매길 수 없습니다." });
    }

    // 2. 플레이오프 대진표 생성 (stage: 'TOURNAMENT')
    // 상위 팀 수(예: 4강)에 맞춰 빈 대진표 생성
    await generateEmptyBracket(tournament.id, tournament.playoffTeams, 'TOURNAMENT');

    // 3. 상위 팀들을 대진표에 배치 (1위 vs 4위, 2위 vs 3위 등은 로직에 따라 다름)
    // 여기선 순서대로(랜덤) 배치
    await assignTeamsToBracket(tournament.id, advancedTeams, 'TOURNAMENT');

    res.json({ 
      success: true, 
      message: `리그 종료! 상위 ${advancedTeams.length}팀이 플레이오프에 진출했습니다.`,
      data: { advancedTeams }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "플레이오프 전환 실패" });
  }
};

// 대회 정보 조회 (대진표 포함)
exports.getBracket = async (req, res) => {
  const { id } = req.params;
  try {
    const matches = await prisma.match.findMany({
      where: { tournamentId: parseInt(id) },
      orderBy: { id: 'asc' },
      include: { team1: true, team2: true }
    });
    res.json({ success: true, data: matches });
  } catch (error) {
    res.status(500).json({ success: false, error: '조회 실패' });
  }
};

// ------------------------------------------------------------------
// 🔒 내부 함수들 (Helper Functions)
// ------------------------------------------------------------------

// [1] 빈 대진표 틀 만들기 (8강, 4강 등)
async function generateEmptyBracket(tournamentId, teamCount, stage) {
  const totalRounds = Math.log2(teamCount);
  let nextRoundMatches = []; 

  for (let r = 0; r < totalRounds; r++) {
    const matchCount = Math.pow(2, r); 
    const currentRoundMatches = [];

    for (let i = 0; i < matchCount; i++) {
      const match = await prisma.match.create({
        data: {
          tournamentId,
          stage: stage, // 'TOURNAMENT'
          round: `Round ${totalRounds - r}`, // 결승=1, 4강=2...
          status: 'scheduled',
          // nextMatchId 연결 로직은 복잡도를 위해 생략 (필요 시 추가)
        }
      });
      currentRoundMatches.push(match);
    }
    nextRoundMatches = currentRoundMatches;
  }
}

// [2] 대진표에 팀 집어넣기
async function assignTeamsToBracket(tournamentId, teamIds, stage) {
  // 해당 스테이지의 가장 첫 라운드(가장 최근에 생성된 ID들) 찾기
  // 이유: generateEmptyBracket이 결승 -> 4강 -> 8강 순으로 만들었다면
  // ID가 가장 큰 것들이 8강(첫 라운드)임
  const matches = await prisma.match.findMany({
    where: { tournamentId, stage },
    orderBy: { id: 'desc' }
  });

  const firstRoundMatchCount = teamIds.length / 2;
  const targetMatches = matches.slice(0, firstRoundMatchCount);

  for (let i = 0; i < targetMatches.length; i++) {
    await prisma.match.update({
      where: { id: targetMatches[i].id },
      data: {
        team1Id: teamIds[i * 2],
        team2Id: teamIds[i * 2 + 1],
        status: 'scheduled'
      }
    });
  }
}

// [3] 리그전 스케줄 만들기 (Round Robin)
async function createLeagueSchedule(tournamentId, teamIds) {
  const matches = [];
  const n = teamIds.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      matches.push({
        tournamentId,
        stage: 'LEAGUE', // ⭐️ 리그 경기임을 표시
        round: "League", 
        team1Id: teamIds[i],
        team2Id: teamIds[j],
        status: 'scheduled'
      });
    }
  }
  await prisma.match.createMany({ data: matches });
}