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

    // ⭐️ [변경] select를 제거하여, 필드 이름이 틀려도 에러가 나지 않게 함
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, error: { message: "유저 없음" } });
    }

    // ⭐️ [안전 매핑]
    // DB에 characterImage가 있든, avatarUrl이 있든, image가 있든 알아서 찾습니다.
    const avatarUrl =
      user.characterImage || user.avatarUrl || user.image || null;

    const responseData = {
      id: user.id,
      email: user.email,
      name: user.name,
      nickname: user.nickname,
      points: user.points,
      avatarUrl: avatarUrl,
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error("❌ getMe Error Log:", error); // 서버 터미널에서 상세 에러 확인 가능
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
