// src/controllers/teamController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. 팀 목록 조회 (GET /api/teams) - "내 팀 목록"
// ==========================================
exports.getMyTeams = async (req, res) => {
  const userId = req.userId;

  try {
    // 내가 멤버로 속한 팀들 조회
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            _count: { select: { members: true, homeMatches: true, awayMatches: true } }
          }
        }
      }
    });

    // 명세서 형식으로 변환
    const data = memberships.map(m => ({
      id: m.team.id,
      name: m.team.name,
      sport: m.team.sport,
      sportType: m.team.sportType,
      inviteCode: m.team.inviteCode,
      description: m.team.description,
      wins: m.team.wins,
      losses: m.team.losses,
      matchCount: m.team._count.homeMatches + m.team._count.awayMatches,
      currentUserRole: m.role, // 'leader' or 'member'
      memberCount: m.team._count.members
    }));

    res.json({ success: true, data });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "팀 목록 조회 실패" } });
  }
};

// ==========================================
// 2. 팀 생성 (POST /api/teams)
// ==========================================
exports.createTeam = async (req, res) => {
  const { name, sportType, description } = req.body; 
  const userId = req.userId;

  // 초대 코드 생성 (랜덤 6자리)
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    // 트랜잭션: 팀 생성 + 작성자를 리더로 등록
    const newTeam = await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name,
          sport: sportType === 'lol' ? 'LoL' : 
                 sportType === 'soccer' ? 'Soccer' : 
                 sportType === 'basketball' ? 'Basketball' : 'Futsal',
          sportType,
          description,
          inviteCode
        }
      });

      // 리더로 멤버 추가
      await tx.teamMember.create({
        data: {
          userId,
          teamId: team.id,
          role: 'leader',
          position: 'Leader' // 기본 포지션
        }
      });

      return team;
    });

    res.status(201).json({ success: true, data: newTeam });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "팀 생성 실패" } });
  }
};

// ==========================================
// 3. 팀 상세 조회 (GET /api/teams/:id)
// ==========================================
exports.getTeamDetail = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const team = await prisma.team.findUnique({
      where: { id: parseInt(id) },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } }
        },
        joinRequests: {
          where: { status: 'pending' }, // 대기 중인 요청만
          include: { user: { select: { id: true, name: true } } }
        }
      }
    });

    if (!team) return res.status(404).json({ success: false, error: { message: "팀 없음" } });

    // 현재 접속자의 역할 확인
    const myMembership = team.members.find(m => m.userId === userId);
    const currentUserRole = myMembership ? myMembership.role : null;

    // 응답 데이터 구성
    const responseData = {
      id: team.id,
      name: team.name,
      sport: team.sport,
      sportType: team.sportType,
      inviteCode: team.inviteCode,
      description: team.description,
      wins: team.wins,
      losses: team.losses,
      currentUserRole,
      members: team.members.map(m => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        position: m.position,
        joinedAt: m.joinedAt
      })),
      // 팀장일 때만 가입 신청 목록 보임
      pendingRequests: currentUserRole === 'leader' ? team.joinRequests.map(r => ({
        id: r.id,
        userId: r.user.id,
        name: r.user.name,
        position: r.position,
        appliedAt: r.appliedAt
      })) : []
    };

    res.json({ success: true, data: responseData });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "팀 상세 조회 실패" } });
  }
};

// ==========================================
// 4. 팀 가입 신청 (POST /api/teams/join)
// ==========================================
exports.joinTeam = async (req, res) => {
  const { inviteCode, position } = req.body;
  const userId = req.userId;

  try {
    const team = await prisma.team.findUnique({ where: { inviteCode } });
    if (!team) return res.status(404).json({ success: false, error: { message: "초대 코드 불일치" } });

    // 이미 멤버인지 확인
    const existingMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId } }
    });
    if (existingMember) return res.status(400).json({ success: false, error: { message: "이미 가입된 팀입니다." } });

    // 이미 신청했는지 확인
    const existingRequest = await prisma.teamJoinRequest.findUnique({
      where: { teamId_userId: { teamId: team.id, userId } }
    });
    if (existingRequest && existingRequest.status === 'pending') {
      return res.status(400).json({ success: false, error: { message: "이미 가입 신청 중입니다." } });
    }

    // 가입 신청 생성 (명세서의 Team_Join_Requests 테이블 사용)
    await prisma.teamJoinRequest.create({
      data: {
        teamId: team.id,
        userId,
        position,
        status: 'pending'
      }
    });

    res.status(201).json({ success: true, message: "가입 신청이 완료되었습니다. 팀장의 승인을 기다리세요." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "가입 신청 실패" } });
  }
};

// ==========================================
// 5. 가입 신청 승인 (POST .../approve)
// ==========================================
exports.approveRequest = async (req, res) => {
  const { id, requestId } = req.params; // teamId, requestId
  const userId = req.userId;

  try {
    // 권한 확인 (팀장인지)
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: parseInt(id), userId } }
    });
    if (!membership || membership.role !== 'leader') {
      return res.status(403).json({ success: false, error: { message: "권한이 없습니다." } });
    }

    // 신청 정보 확인
    const request = await prisma.teamJoinRequest.findUnique({ where: { id: parseInt(requestId) } });
    if (!request || request.status !== 'pending') {
      return res.status(400).json({ success: false, error: { message: "유효하지 않은 신청입니다." } });
    }

    // 트랜잭션: 신청 상태 업데이트 + 멤버 추가
    await prisma.$transaction([
      prisma.teamJoinRequest.update({
        where: { id: parseInt(requestId) },
        data: { status: 'approved', processedAt: new Date() }
      }),
      prisma.teamMember.create({
        data: {
          teamId: parseInt(id),
          userId: request.userId,
          role: 'member',
          position: request.position
        }
      })
    ]);

    res.json({ success: true, message: "가입 신청이 승인되었습니다." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "승인 처리 실패" } });
  }
};

// ==========================================
// 6. 가입 신청 거절 (POST .../reject)
// ==========================================
exports.rejectRequest = async (req, res) => {
  const { id, requestId } = req.params;
  const userId = req.userId;

  try {
    // 권한 확인
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: parseInt(id), userId } }
    });
    if (!membership || membership.role !== 'leader') {
      return res.status(403).json({ success: false, error: { message: "권한이 없습니다." } });
    }

    await prisma.teamJoinRequest.update({
      where: { id: parseInt(requestId) },
      data: { status: 'rejected', processedAt: new Date() }
    });

    res.json({ success: true, message: "가입 신청이 거절되었습니다." });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "거절 처리 실패" } });
  }
};