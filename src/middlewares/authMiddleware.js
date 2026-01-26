// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || "junsus_secret_key";

exports.verifyToken = (req, res, next) => {
  // 헤더에서 토큰 가져오기 (Bearer xxxxx)
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ success: false, error: "로그인이 필요합니다." });
  }

  const token = authHeader.split(' ')[1]; // "Bearer" 떼고 토큰만

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId; // 다음 단계로 유저 ID 넘겨줌
    next(); // 통과!
  } catch (error) {
    return res.status(401).json({ success: false, error: "유효하지 않은 토큰입니다." });
  }
};