// src/routes/userRouter.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middlewares/authMiddleware'); // 토큰 검사기
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// --- 1. Multer 설정 (사진 업로드용) ---
try { fs.readdirSync('uploads'); } 
catch (error) { fs.mkdirSync('uploads'); }

const storage = multer.diskStorage({
  destination(req, file, done) { done(null, 'uploads/'); },
  filename(req, file, done) {
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    done(null, basename + '_' + Date.now() + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// --- 2. 라우터 정의 ---

// (1) 내 정보 조회 & 수정 (토큰 필요)
router.get('/me', verifyToken, userController.getMe);
router.patch('/me', verifyToken, userController.updateProfile);

// (2) 내 팀 목록 조회 (토큰 필요)
// 기존: POST /me/teams -> 변경: GET /me/teams (조회는 GET이 정석)
router.get('/me/teams', verifyToken, userController.getMyTeams);

// (3) 프로필 사진 업로드 (토큰 필요)
// POST /api/users/me/avatar (명세서 스타일로 주소 약간 변경 추천, 기능은 동일)
// 기존 주소(:id/profile-image) 대신 토큰 기반으로 내 사진을 바꿉니다.
router.post('/me/avatar', verifyToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "파일 없음" });
    
    const imageUrl = `/uploads/${req.file.filename}`;
    
    // 로그인한 유저(req.userId)의 사진 업데이트
    await prisma.user.update({
      where: { id: req.userId },
      data: { avatar: imageUrl } // DB 컬럼명이 avatar로 바뀌었으므로 수정
    });

    res.json({ success: true, data: { avatarUrl: imageUrl } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "업로드 실패" });
  }
});

module.exports = router;