// src/controllers/uploadController.js

// POST /api/upload/image
exports.uploadImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
        success: false, 
        error: { code: "INVALID_FILE", message: "파일이 없습니다." } 
    });
  }

  // 서버의 도메인 주소 (로컬 환경 예시)
  // 배포 시에는 process.env.BASE_URL 등을 사용하세요.
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const fileUrl = `${baseUrl}/uploads/${req.file.filename}`;

  res.json({
    success: true,
    data: {
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype
    }
  });
};