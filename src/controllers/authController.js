// src/controllers/authController.js
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "junsus_secret_key";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "junsus_refresh_key";

// [보조 함수] 랜덤 닉네임 생성기
async function generateUniqueNickname() {
  let nickname = '';
  let isUnique = false;
  while (!isUnique) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    nickname = `guest${randomNum}`;
    const check = await prisma.user.findUnique({ where: { nickname } });
    if (!check) isUnique = true;
  }
  return nickname;
}

// -----------------------------------------------------------

// 1.1 로그인 (소셜 로그인 통합)
// POST /api/auth/login
exports.login = async (req, res) => {
  const { provider, email, providerId, avatar } = req.body; 

  try {
    // 1. 유저 찾기 (이메일 기준)
    let user = await prisma.user.findUnique({
      where: { email: email }
    });

    // 2. 없으면 신규 가입
    if (!user) {
      const newNickname = await generateUniqueNickname();
      user = await prisma.user.create({
        data: {
          email,
          nickname: newNickname,
          avatar: avatar || null,
          kakaoId: provider === 'kakao' ? providerId : null,
          googleId: provider === 'google' ? providerId : null,
          provider: provider, // 가입 경로 저장
          points: 1000 // 기본 포인트
        }
      });
      console.log(`[신규 가입] ${newNickname}`);
    } else {
      // 3. 기존 유저면 소셜 ID 연동 (필요 시)
      const updateData = {};
      if (provider === 'kakao' && !user.kakaoId) updateData.kakaoId = providerId;
      if (provider === 'google' && !user.googleId) updateData.googleId = providerId;
      
      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData
        });
      }
    }

    // 4. 토큰 발급
    const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ userId: user.id }, REFRESH_SECRET, { expiresIn: '7d' });

    // 5. DB에 Refresh Token 저장 (명세서 구현을 위해)
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshToken }
    });

    // 6. 응답 (명세서 포맷 준수)
    res.json({
      success: true,
      data: {
        userId: user.id.toString(),
        accessToken,
        refreshToken,
        user: {
          id: user.id.toString(),
          name: user.name,
          email: user.email,
          nickname: user.nickname,
          department: user.department,
          avatar: user.avatar,
          points: user.points
        }
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "로그인 처리 중 오류 발생" });
  }
};

// 1.2 로그아웃
// POST /api/auth/logout
exports.logout = async (req, res) => {
  try {
    // 요청한 유저의 Refresh Token을 DB에서 삭제 (null 처리)
    // (실제로는 미들웨어에서 req.user.id를 받아와야 함. 여기선 body로 가정하거나 토큰 파싱)
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        await prisma.user.update({
            where: { id: decoded.userId },
            data: { refreshToken: null }
        });
    }

    res.json({ success: true, message: "로그아웃되었습니다." });
  } catch (error) {
    // 토큰 만료 등 에러가 있어도 로그아웃은 성공 처리
    res.json({ success: true, message: "로그아웃되었습니다." });
  }
};

// 1.3 토큰 갱신
// POST /api/auth/refresh
exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ success: false, error: "Refresh Token이 필요합니다." });
  }

  try {
    // 1. 토큰 검증
    const decoded = jwt.verify(refreshToken, REFRESH_SECRET);

    // 2. DB에 저장된 토큰과 일치하는지 확인
    const user = await prisma.user.findUnique({ 
        where: { id: decoded.userId } 
    });

    if (!user || user.refreshToken !== refreshToken) {
        return res.status(401).json({ success: false, error: "유효하지 않은 토큰입니다." });
    }

    // 3. 새 Access Token 발급
    const newAccessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    
    // (선택) Refresh Token도 새로 발급해서 교체할 수 있음 (Rotate)
    // 여기선 Access Token만 갱신해줌

    res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: refreshToken // 기존 것 유지
      }
    });

  } catch (error) {
    res.status(401).json({ success: false, error: "토큰 갱신 실패 (만료됨)" });
  }
};