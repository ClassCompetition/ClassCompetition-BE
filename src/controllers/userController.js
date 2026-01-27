// src/controllers/userController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. 내 프로필 조회 (GET /api/users/me)
// ==========================================
exports.getMe = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ success: false, error: "로그인 필요" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profiles: true } // 종목별 프로필 함께 조회
    });

    if (!user) return res.status(404).json({ success: false, error: "유저 없음" });

    // ⭐️ [변경] 종목별 프로필 정리 (이미지는 User에 통합됨)
    const profilesMap = {};
    user.profiles.forEach(p => {
        profilesMap[p.sportType] = {
            position: p.position,
            tier: p.tier,
            champions: p.champions,
            introduction: p.introduction
            // 여기엔 이미지가 없고, user.characterImage를 공통으로 사용
        };
    });

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
  const { nickname, department } = req.body;

  try {
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

// ==========================================
// 3. 종목별 프로필 + 캐릭터 이미지 수정 (PUT /api/users/me/sports/:sportType)
// ==========================================
exports.updateSportProfile = async (req, res) => {
  const userId = req.userId;
  const { sportType } = req.params;
  
  // characterImageUrl이 들어오면 -> User 테이블(통합 이미지) 업데이트
  // 나머지 정보 -> UserProfile 테이블(종목별 정보) 업데이트
  const { position, tier, champions, introduction, characterImageUrl } = req.body;

  try {
    // 트랜잭션으로 안전하게 처리
    await prisma.$transaction(async (tx) => {
        
      // 1. 이미지가 있으면 '통합 캐릭터 이미지' 업데이트
      if (characterImageUrl) {
        await tx.user.update({
          where: { id: userId },
          data: { characterImage: characterImageUrl }
        });
      }

      // 2. 종목별 정보 업데이트 (upsert)
      await tx.userProfile.upsert({
        where: {
          userId_sportType: { userId, sportType }
        },
        update: {
          position, tier, champions, introduction
        },
        create: {
          userId, sportType, position, tier, champions, introduction
        }
      });
    });

    res.json({ success: true, message: "프로필 및 캐릭터 이미지가 업데이트되었습니다." });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "프로필 수정 실패" } });
  }
};