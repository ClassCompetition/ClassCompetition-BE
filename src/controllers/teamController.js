// src/controllers/teamController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. 팀 생성하기
exports.createTeam = async (req, res) => {
  const { name, sportType } = req.body; 
  const userId = req.userId; // ⭐️ 보안 강화: 토큰에서 가져옴

  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    const newTeam = await prisma.team.create({
      data: {
        name,
        sport: sportType === 'lol' ? 'LoL' : '축구', // 표시용 이름 자동 설정
        sportType,
        inviteCode,
        members: {
          create: {
            userId: userId,
            role: 'leader', // 소문자로 통일 (명세서 기준)
            status: 'accepted'
          }
        }
      },
    });

    res.status(201).json({ success: true, message: '팀 생성 완료!', data: newTeam });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: '팀 생성 중 오류 발생' });
  }
};

// 2. 모든 팀 조회
exports.getAllTeams = async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
        include: { _count: { select: { members: true } } } // 멤버 수 같이 보기
    });
    res.status(200).json({ success: true, data: teams });
  } catch (error) {
    res.status(500).json({ success: false, error: '조회 실패' });
  }
};

// 3. 초대 코드로 팀 가입
exports.joinTeam = async (req, res) => {
  const { inviteCode } = req.body;
  const userId = req.userId; // ⭐️ 토큰 사용

  try {
    const team = await prisma.team.findUnique({
      where: { inviteCode: inviteCode }
    });

    if (!team) return res.status(404).json({ success: false, error: '코드 불일치' });

    // 중복 가입 체크
    const existing = await prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId: team.id } }
    });

    if (existing) return res.status(400).json({ success: false, error: '이미 가입됨' });

    await prisma.teamMember.create({
      data: {
        userId,
        teamId: team.id,
        role: 'member',
        status: 'accepted' // 혹은 'pending'으로 해서 승인 대기
      }
    });

    res.json({ success: true, message: `환영합니다! ${team.name} 팀원이 되셨습니다.` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: '가입 실패' });
  }
};