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
        teamId: teamId ? parseInt(teamId) : null, // 팀 ID가 있으면 팀 전술, 없으면 개인 전술
        name,
        boardType: boardType || 'soccer', // 기본값
        type: type || 'formation',
        isPublic: isPublic || false,
        positions: positions || [] // 빈 전술판 허용
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
  const { teamId } = req.query; // ?teamId=1

  try {
    const where = {};
    
    if (teamId) {
      // [Case A] 팀 전술 조회: 해당 팀에 속한 전술만
      where.teamId = parseInt(teamId);
    } else {
      // [Case B] 개인 연습장 조회: 내가 만들고 && 팀에 속하지 않은 전술
      where.creatorId = req.userId;
      where.teamId = null; 
    }

    const tactics = await prisma.tactic.findMany({
      where,
      orderBy: { updatedAt: 'desc' }, // 최신순 정렬
      include: {
        creator: { select: { name: true } } // 작성자 이름 포함
      }
    });

    // ⭐️ 프론트엔드 편의를 위해 creator.name -> creatorName 으로 변환
    const data = tactics.map(t => ({
      ...t,
      creatorName: t.creator ? t.creator.name : '알 수 없음'
    }));

    res.json({ success: true, data });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "전술 목록 조회 실패" } });
  }
};

// ==========================================
// 3. 전술 상세 조회 (GET /api/tactics/:id)
// ==========================================
exports.getTacticDetail = async (req, res) => {
  const { id } = req.params;

  try {
    const tactic = await prisma.tactic.findUnique({
      where: { id: parseInt(id) },
      include: { creator: { select: { name: true } } }
    });

    if (!tactic) return res.status(404).json({ success: false, error: { message: "전술을 찾을 수 없습니다." } });

    // 데이터 포맷팅
    const data = {
        ...tactic,
        creatorName: tactic.creator ? tactic.creator.name : '알 수 없음'
    };

    res.json({ success: true, data });

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

    if (!tactic) return res.status(404).json({ success: false, error: { message: "전술 없음" } });

    // 권한 확인: 작성자만 수정 가능
    if (tactic.creatorId !== userId) {
      return res.status(403).json({ success: false, error: { message: "수정 권한이 없습니다." } });
    }

    const updated = await prisma.tactic.update({
      where: { id: parseInt(id) },
      data: { name, isPublic, positions }
    });

    res.json({ success: true, message: "수정 완료", data: updated });

  } catch (error) {
    console.error(error);
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
    
    if (!tactic) return res.status(404).json({ success: false, error: { message: "전술 없음" } });

    // 권한 확인: 작성자만 삭제 가능
    if (tactic.creatorId !== userId) {
      return res.status(403).json({ success: false, error: { message: "삭제 권한이 없습니다." } });
    }

    await prisma.tactic.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: "삭제 완료" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: { message: "삭제 실패" } });
  }
};