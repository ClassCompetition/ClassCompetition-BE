// src/app.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// 라우터 파일 가져오기
const authRouter = require('./routes/authRouter'); // [추가] 인증
const tournamentRouter = require('./routes/tournamentRouter');
const matchRouter = require('./routes/matchRouter');
const teamRouter = require('./routes/teamRouter');
const userRouter = require('./routes/userRouter');
const tacticRouter = require('./routes/tacticRouter');
const predictionRouter = require('./routes/predictionRouter'); // [변경] bet -> prediction
const uploadRouter = require('./routes/uploadRouter');

dotenv.config(); 

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 정적 파일 제공 (업로드 폴더)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/uploads', express.static('uploads'));

// ================= 라우터 등록 =================
app.use('/api/auth', authRouter);              // [신규] 로그인/로그아웃
app.use('/api/users', userRouter);             // 사용자 정보
app.use('/api/teams', teamRouter);             // 팀 관련
app.use('/api/tournaments', tournamentRouter); // 대회 관련
app.use('/api/matches', matchRouter);          // 경기 관련
app.use('/api/tactics', tacticRouter);         // 전술판
app.use('/api/predictions', predictionRouter); // [신규] 승부예측 (구 bets)
app.use('/api/upload', uploadRouter);

// 헬스 체크
app.get('/', (req, res) => {
  res.send('Class Competition Backend is Running! ⚽️🔥');
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});