// src/controllers/tacticController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. 전술 생성 (POST /api/tactics)
// ==========================================
exports.createTactic = async (req, res) => {
  const userId = req.userId;
  const { teamId, name, boardType, type, isPublic, positions } = req.body;

  try {
    const newTactic = await prisma.tactic.create({
      data: {
        creatorId: userId,
        teamId: teamId ? parseInt(teamId) : null, // 개인 전술이면 null
        name,
        boardType: boardType || 'soccer', // 'soccer', 'lol'
        type: type || 'formation',
        isPublic: isPublic || false,
        positions: positions // JSON 데이터 그대로 저장
      }
    });

    res.status(201).json({ success: true, data: newTactic });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "전술 생성 실패" } });
  }
};

// ==========================================
// 2. 전술 목록 조회 (GET /api/tactics)
// ==========================================
exports.getTactics = async (req, res) => {
  const { teamId, isPublic, boardType } = req.query;

  try {
    const where = {};
    if (teamId) where.teamId = parseInt(teamId);
    if (isPublic) where.isPublic = (isPublic === 'true');
    if (boardType) where.boardType = boardType;

    const tactics = await prisma.tactic.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { creator: { select: { name: true } } }
    });

    res.json({ success: true, data: tactics });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "목록 조회 실패" } });
  }
};

// ==========================================
// 3. 전술 상세 조회 (GET /api/tactics/:id)
// ==========================================
exports.getTacticDetail = async (req, res) => {
  const { id } = req.params;

  try {
    const tactic = await prisma.tactic.findUnique({
      where: { id: parseInt(id) }
    });

    if (!tactic) return res.status(404).json({ success: false, error: { message: "전술 없음" } });

    res.json({ success: true, data: tactic });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "상세 조회 실패" } });
  }
};

// ==========================================
// 4. 전술 수정 (PUT /api/tactics/:id)
// ==========================================
exports.updateTactic = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  const { name, isPublic, positions } = req.body;

  try {
    const tactic = await prisma.tactic.findUnique({ where: { id: parseInt(id) } });

    // 본인 확인
    if (tactic.creatorId !== userId) {
      return res.status(403).json({ success: false, error: { message: "권한이 없습니다." } });
    }

    const updated = await prisma.tactic.update({
      where: { id: parseInt(id) },
      data: { name, isPublic, positions }
    });

    res.json({ success: true, message: "수정 완료", data: updated });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "수정 실패" } });
  }
};

// ==========================================
// 5. 전술 삭제 (DELETE /api/tactics/:id)
// ==========================================
exports.deleteTactic = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;

  try {
    const tactic = await prisma.tactic.findUnique({ where: { id: parseInt(id) } });
    if (tactic.creatorId !== userId) {
      return res.status(403).json({ success: false, error: { message: "권한이 없습니다." } });
    }

    await prisma.tactic.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: "삭제 완료" });

  } catch (error) {
    res.status(500).json({ success: false, error: { message: "삭제 실패" } });
  }
};