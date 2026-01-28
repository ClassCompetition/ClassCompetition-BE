// src/controllers/authController.js
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt"); // ⭐️ 패스워드 암호화 라이브러리 필요 (npm install bcrypt)

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "junsus_secret_key";

// ==========================================
// 1. 회원가입
// ==========================================
exports.register = async (req, res) => {
  const { email, password, name } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: { code: "DUPLICATE", message: "이미 존재하는 이메일입니다." },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        name,
        points: 1000, // 기본 포인트
      },
    });

    // 4. 토큰 발급
    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, {
      expiresIn: "1d",
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          points: newUser.points,
          // DB에 필드가 있으면 쓰고, 없으면 null
          avatarUrl: newUser.characterImage || newUser.avatarUrl || null,
        },
        token,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: "회원가입 실패" },
    });
  }
};

// ==========================================
// 2. 로그인
// ==========================================
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "이메일 또는 비밀번호가 잘못되었습니다.",
        },
      });
    }

    // 2. 비밀번호 확인 (소셜 로그인 유저는 비번이 없을 수 있음)
    if (!user.passwordHash) {
      return res.status(400).json({
        success: false,
        error: {
          code: "SOCIAL_USER",
          message: "소셜 로그인으로 가입된 계정입니다.",
        },
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "이메일 또는 비밀번호가 잘못되었습니다.",
        },
      });
    }

    // 3. 토큰 발급
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          points: user.points,
          // 안전한 매핑
          avatarUrl: user.characterImage || user.avatarUrl || null,
        },
        token,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: "로그인 실패" },
    });
  }
};

// ==========================================
// 3. 현재 유저 정보 (GET /api/auth/me) ⭐️ [수정됨]
// ==========================================
exports.getMe = async (req, res) => {
  try {
    const userId = req.userId;

    // ⭐️ [변경] profiles 정보도 함께 조회해야 합니다!
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profiles: true }, // 종목별 프로필 포함
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: { message: "유저 없음" } });
    }

    // ⭐️ [변경] 종목별 프로필 정리 (userController.js의 로직과 동일하게 적용)
    const profilesMap = {};
    if (user.profiles) {
      user.profiles.forEach((p) => {
        // 키 불일치 방지를 위해 소문자로 변환
        const sportKey = p.sportType ? p.sportType.toLowerCase() : '';
        if (!sportKey) return;

        // 1. JSON 데이터 파싱
        let extraData = {};
        try {
          if (p.introduction && p.introduction.startsWith("{")) {
            const parsed = JSON.parse(p.introduction);
            if (parsed.originalIntro !== undefined) {
              p.introduction = parsed.originalIntro;
              delete parsed.originalIntro;
            }
            extraData = parsed;
          }
        } catch (e) { }

        // 2. 기본 데이터 + 추가 데이터 병합
        const profileData = {
          position: p.position,
          tier: p.tier,
          champions: p.champions,
          introduction: p.introduction,
          height: p.height,
          preferredFoot: p.preferredFoot,
          ...extraData,
        };

        // 3. 프론트엔드 호환성을 위한 필드 매핑
        if (sportKey === 'lol') {
          profileData.mainLane = p.position;
          profileData.mainChampions = p.champions;
        }
        if (sportKey === 'general') {
          profileData.mainPosition = p.position;
          profileData.mainFoot = p.preferredFoot;
        }

        profilesMap[sportKey] = profileData;
      });
    }

    // ⭐️ [안전 매핑]
    const avatarUrl =
      user.characterImage || user.avatarUrl || user.image || null;

    const responseData = {
      id: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      points: user.points,
      avatarUrl: avatarUrl,
      profiles: profilesMap, // ⭐️ profiles 데이터 포함해서 반환
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error("❌ getMe Error Log:", error);
    res
      .status(500)
      .json({ success: false, error: { message: "서버 오류 (getMe)" } });
  }
};

// ==========================================
// 4. 소셜 로그인
// ==========================================
exports.socialLogin = async (req, res) => {
  const { email, name, provider, providerId } = req.body;
  // provider: 'kakao' | 'google'

  try {
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { kakaoId: provider === "kakao" ? providerId : undefined },
          { googleId: provider === "google" ? providerId : undefined },
          { email: email }, // 이메일로도 찾기 (계정 연동)
        ],
      },
    });

    if (!user) {
      const nickname = `${name}_${Math.floor(Math.random() * 10000)}`;
      user = await prisma.user.create({
        data: {
          email,
          name,
          nickname,
          points: 1000,
          // 소셜 ID 저장
          kakaoId: provider === "kakao" ? providerId : null,
          googleId: provider === "google" ? providerId : null,
          // 소셜 유저는 비밀번호가 없음
        },
      });
    } else {
      // 3. 이미 가입된 유저라면 소셜 ID 업데이트 (연동)
      if (provider === "kakao" && !user.kakaoId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { kakaoId: providerId },
        });
      } else if (provider === "google" && !user.googleId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { googleId: providerId },
        });
      }
    }

    // 4. 토큰 발급
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          points: user.points,
          avatarUrl: user.characterImage || user.avatarUrl || null,
        },
        token,
      },
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, error: { message: "소셜 로그인 실패" } });
  }
};
