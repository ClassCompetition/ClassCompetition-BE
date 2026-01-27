// src/routes/uploadRouter.js
const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const upload = require('../middlewares/uploadMiddleware');
const { verifyToken } = require('../middlewares/authMiddleware');

// 이미지 업로드 (단일 파일, 필드명: 'image')
router.post('/image', verifyToken, upload.single('image'), uploadController.uploadImage);

module.exports = router;