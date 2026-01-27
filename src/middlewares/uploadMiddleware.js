// src/middlewares/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 업로드 폴더가 없으면 생성
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// 저장소 설정 (로컬 디스크)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // 프로젝트 루트의 uploads 폴더
  },
  filename: (req, file, cb) => {
    // 파일명 중복 방지: user{ID}_{타임스탬프}.확장자
    const userId = req.userId || 'guest';
    const uniqueSuffix = Date.now() + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `user${userId}_${uniqueSuffix}${ext}`);
  }
});

// 파일 필터링 (이미지만 허용)
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('이미지 파일만 업로드 가능합니다.'), false);
  }
};

// 미들웨어 생성 (최대 5MB)
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: fileFilter
});

module.exports = upload;