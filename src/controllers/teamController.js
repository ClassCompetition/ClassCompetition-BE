// src/controllers/teamController.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ==========================================
// 1. 팀 목록 조회 (GET /api/teams) - "내 팀 목록"
// ==========================================
exports.getMyTeams = async (req, res) => {
  const userId = req.userId;

  try {
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      include: {
        team: {
          include: {
            _count: {
              select: { members: true, homeMatches: true, awayMatches: true },
            },
          },
        },
      },
    });

    const data = memberships.map((m) => ({
      id: m.team.id,
      name: m.team.name,
      sport: m.team.sport,
      sportType: m.team.sportType,
      inviteCode: m.team.inviteCode,
      description: m.team.description,
      wins: m.team.wins,
      losses: m.team.losses,
      matchCount: m.team._count.homeMatches + m.team._count.awayMatches,
      currentUserRole: m.role,
      memberCount: m.team._count.members,
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "팀 목록 조회 실패" } });
  }
};

// ==========================================
// 2. 팀 생성 (POST /api/teams)
// ==========================================
exports.createTeam = async (req, res) => {
  const { name, sportType, description } = req.body;
  const userId = req.userId;

  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const newTeam = await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
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
          sportType,
          description,
          inviteCode,
        },
      });

      await tx.teamMember.create({
        data: {
          userId,
          teamId: team.id,
          role: "leader",
          position: "Leader",
        },
      });

      return team;
    });

    res.status(201).json({ success: true, data: newTeam });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "팀 생성 실패" } });
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
          include: {
            user: {
              select: {
                id: true,
                name: true,
                characterImage: true,
                email: true,
              },
            },
          },
        },
        // ⭐️ [수정] status가 'pending'인 요청만 가져오도록 조건 추가
        joinRequests: {
          where: { status: "pending" },
          include: {
            user: { select: { id: true, name: true, characterImage: true } },
          },
        },
        representativeTactic: true,
      },
    });

    if (!team)
      return res
        .status(404)
        .json({ success: false, error: { message: "팀을 찾을 수 없습니다." } });

    const membership = team.members.find((m) => m.userId === userId);
    const currentUserRole = membership ? membership.role : "none"; // 'leader', 'member', 'none'

    // 멤버 정보 매핑 (characterImage -> avatarUrl 변환 for Frontend)
    const members = team.members.map((m) => ({
      ...m,
      user: { ...m.user, avatarUrl: m.user.characterImage },
    }));

    // 가입 신청 목록 처리 (리더만 볼 수 있음)
    let pendingRequests = [];
    if (currentUserRole === "leader") {
      pendingRequests = (team.joinRequests || []).map((req) => ({
        ...req,
        user: { ...req.user, avatarUrl: req.user.characterImage },
      }));
    }

    // 응답 데이터 구성 (joinRequests 원본 제외)
    const { joinRequests, ...teamInfo } = team;

    res.json({
      success: true,
      data: {
        ...teamInfo,
        members,
        currentUserRole,
        memberCount: team.members.length,
        pendingRequests,
      },
    });
  } catch (error) {
    console.error("팀 상세 조회 에러:", error);
    res
      .status(500)
      .json({ success: false, error: { message: "팀 상세 조회 실패" } });
  }
};

// ==========================================
// 4. 팀 가입 신청 (POST /api/teams/join)
// ==========================================
exports.joinTeam = async (req, res) => {
  const { inviteCode, position, introduction } = req.body;
  const userId = req.userId;

  try {
    const team = await prisma.team.findUnique({ where: { inviteCode } });
    if (!team)
      return res
        .status(404)
        .json({ success: false, error: { message: "초대 코드 불일치" } });

    // 이미 멤버인지 확인
    const existingMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId } },
    });
    if (existingMember)
      return res
        .status(400)
        .json({ success: false, error: { message: "이미 가입된 팀입니다." } });

    // 이미 신청했는지 확인 (TeamJoinRequest 모델 사용)
    const existingRequest = await prisma.teamJoinRequest.findUnique({
      where: { teamId_userId: { teamId: team.id, userId } },
    });
    if (existingRequest && existingRequest.status === "pending") {
      return res
        .status(400)
        .json({
          success: false,
          error: { message: "이미 가입 신청 중입니다." },
        });
    }

    await prisma.teamJoinRequest.create({
      data: {
        teamId: team.id,
        userId,
        position,
        status: "pending",
      },
    });

    res
      .status(201)
      .json({
        success: true,
        message: "가입 신청이 완료되었습니다. 팀장의 승인을 기다리세요.",
      });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "가입 신청 실패" } });
  }
};

// ==========================================
// 5. 가입 신청 승인 (POST .../approve)
// ==========================================
exports.approveRequest = async (req, res) => {
  const { id, requestId } = req.params;
  const userId = req.userId;

  try {
    // 권한 확인 (TeamMember 테이블 조회)
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: parseInt(id), userId } },
    });
    if (!membership || membership.role !== "leader") {
      return res
        .status(403)
        .json({ success: false, error: { message: "권한이 없습니다." } });
    }

    const request = await prisma.teamJoinRequest.findUnique({
      where: { id: parseInt(requestId) },
    });
    if (!request || request.status !== "pending") {
      return res
        .status(400)
        .json({
          success: false,
          error: { message: "유효하지 않은 신청입니다." },
        });
    }

    await prisma.$transaction([
      prisma.teamJoinRequest.update({
        where: { id: parseInt(requestId) },
        data: { status: "approved", processedAt: new Date() },
      }),
      prisma.teamMember.create({
        data: {
          teamId: parseInt(id),
          userId: request.userId,
          role: "member",
          position: request.position,
        },
      }),
    ]);

    res.json({ success: true, message: "가입 신청이 승인되었습니다." });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "승인 처리 실패" } });
  }
};

// ==========================================
// 6. 가입 신청 거절 (POST .../reject)
// ==========================================
exports.rejectRequest = async (req, res) => {
  const { id, requestId } = req.params;
  const userId = req.userId;

  try {
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: parseInt(id), userId } },
    });
    if (!membership || membership.role !== "leader") {
      return res
        .status(403)
        .json({ success: false, error: { message: "권한이 없습니다." } });
    }

    await prisma.teamJoinRequest.update({
      where: { id: parseInt(requestId) },
      data: { status: "rejected", processedAt: new Date() },
    });

    res.json({ success: true, message: "가입 신청이 거절되었습니다." });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: { message: "거절 처리 실패" } });
  }
};

// ==========================================
// 7. 초대 코드로 팀 검색 (GET /api/teams/seek)
// ==========================================
exports.seekTeam = async (req, res) => {
  const { inviteCode } = req.query;

  try {
    if (!inviteCode)
      return res
        .status(400)
        .json({
          success: false,
          error: { message: "초대 코드를 입력해주세요." },
        });

    const team = await prisma.team.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: {
        members: {
          where: { role: "leader" },
          include: { user: { select: { name: true } } },
        },
        _count: { select: { members: true } },
      },
    });

    if (!team)
      return res
        .status(404)
        .json({
          success: false,
          error: { message: "해당 코드의 팀을 찾을 수 없습니다." },
        });

    const leaderName = team.members[0]?.user.name || "알 수 없음";

    res.json({
      success: true,
      data: {
        id: team.id,
        name: team.name,
        sport: team.sport,
        sportType: team.sportType,
        description: team.description,
        members: team._count.members,
        maxMembers: 50,
        leader: leaderName,
        inviteCode: team.inviteCode,
      },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "팀 검색 실패" } });
  }
};

// ==========================================
// 8. 대표 전술 설정 (PUT /api/teams/:id/representative-tactic) ⭐️ [신규 추가]
// ==========================================
exports.updateRepresentativeTactic = async (req, res) => {
  const { id } = req.params;
  const { tacticId } = req.body; // 설정할 전술 ID
  const userId = req.userId;

  try {
    // 1. 권한 확인 (팀장만 가능)
    const membership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: parseInt(id), userId } },
    });

    if (!membership || membership.role !== "leader") {
      return res
        .status(403)
        .json({
          success: false,
          error: { message: "팀장만 대표 전술을 설정할 수 있습니다." },
        });
    }

    // 2. 전술 유효성 확인 (우리 팀 전술인지)
    const tactic = await prisma.tactic.findFirst({
      where: { id: parseInt(tacticId), teamId: parseInt(id) },
    });

    if (!tactic) {
      return res
        .status(404)
        .json({
          success: false,
          error: {
            message: "해당 전술을 찾을 수 없거나 우리 팀의 전술이 아닙니다.",
          },
        });
    }

    // 3. 업데이트
    await prisma.team.update({
      where: { id: parseInt(id) },
      data: { representativeTacticId: parseInt(tacticId) },
    });

    res.json({ success: true, message: "대표 전술이 설정되었습니다." });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "대표 전술 설정 실패" } });
  }
};
