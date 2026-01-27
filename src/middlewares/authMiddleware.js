// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || "junsus_secret_key";

exports.verifyToken = (req, res, next) => {
  // 헤더에서 토큰 가져오기
  const authHeader = req.headers.authorization;
  
  // [디버깅 로그] 헤더 확인
  console.log(`🔍 [AuthMiddleware] 요청 URL: ${req.originalUrl}`);
  console.log(`🔍 [AuthMiddleware] Authorization 헤더:`, authHeader);

  if (!authHeader) {
    console.log("❌ [AuthMiddleware] 헤더 없음 -> 401 반환");
    return res.status(401).json({ success: false, error: "로그인이 필요합니다." });
  }

  const token = authHeader.split(' ')[1]; // "Bearer" 떼고 토큰만

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    console.log(`✅ [AuthMiddleware] 인증 성공! UserID: ${req.userId}`);
    next(); 
  } catch (error) {
    console.log("❌ [AuthMiddleware] 토큰 검증 실패:", error.message);
    return res.status(401).json({ success: false, error: "유효하지 않은 토큰입니다." });
  }
};