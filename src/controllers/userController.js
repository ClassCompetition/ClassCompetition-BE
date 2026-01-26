// src/controllers/userController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 1. 내 프로필 조회 (신규)
// GET /api/users/me
exports.getMe = async (req, res) => {
  try {
    const userId = req.userId; // authMiddleware에서 넣어줌
    if (!userId) return res.status(401).json({ success: false, error: "로그인 필요" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { sportProfiles: true }
    });

    if (!user) return res.status(404).json({ success: false, error: "유저 없음" });

    // 비밀번호 등 민감한 정보는 빼고 주기 (선택사항)
    const { password, ...userData } = user;
    res.json({ success: true, data: userData });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "서버 에러" });
  }
};

// 2. 프로필 수정 (닉네임 등) - authController에서 이사 옴!
// PATCH /api/users/me
exports.updateProfile = async (req, res) => {
  const userId = req.userId;
  const { nickname, department } = req.body;

  try {
    // 닉네임 중복 체크
    if (nickname) {
      const check = await prisma.user.findUnique({ where: { nickname } });
      if (check && check.id !== userId) {
        return res.status(400).json({ success: false, error: "이미 사용 중인 닉네임입니다." });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { nickname, department }
    });

    res.json({ success: true, message: "수정 완료", data: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "수정 실패" });
  }
};

// 3. 내 팀 목록 조회 (기존 기능 유지 + 업데이트)
// GET /api/users/me/teams
exports.getMyTeams = async (req, res) => {
  const userId = req.userId; // 이제 미들웨어에서 가져옴!

  try {
    const myTeams = await prisma.teamMember.findMany({
      where: { userId: userId },
      include: { team: true }
    });
    res.json({ success: true, data: myTeams });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "팀 목록 조회 실패" });
  }
};