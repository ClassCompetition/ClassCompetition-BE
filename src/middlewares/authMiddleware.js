// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || "junsus_secret_key";

exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ success: false, error: "로그인이 필요합니다." });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next(); 
  } catch (error) {
    // 에러 발생 시에만 간단히 로그 출력 (선택 사항)
    // console.error("Token verification failed:", error.message);
    return res.status(401).json({ success: false, error: "유효하지 않은 토큰입니다." });
  }
};