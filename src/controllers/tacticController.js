// src/controllers/tacticController.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// 1. 전술 생성/저장 (선발, 후보, 감독 분리 저장)
// ==========================================
exports.createTactic = async (req, res) => {
  const userId = req.userId; // 작성자 ID
  const { 
    teamId, 
    name,       // 전술 이름 (예: "공격 올인")
    formation,  // 예: "4-3-3"
    coachName,  // 예: "Mourinho"
    starters,   // 선발 선수 배열 [{id, name, number, x, y, pos}, ...]
    subs        // 후보 선수 배열 [{id, name, number}, ...]
  } = req.body;

  try {
    // 1. 데이터 검증 (최소한의 안전장치)
    if (!starters || starters.length === 0) {
      return res.status(400).json({ error: "선발 선수가 배치되지 않았습니다." });
    }

    // 2. JSON 구조 만들기 (라인업 애니메이션에 필요한 모든 정보 통합)
    const tacticData = {
      formation: formation || "CUSTOM",
      coach: { name: coachName || "Head Coach" },
      starters: starters,
      substitutes: subs || [] // 후보가 없으면 빈 배열
    };

    // 3. DB 저장
    const newTactic = await prisma.tactic.create({
      data: {
        teamId: parseInt(teamId),
        name: name,
        writerId: userId,
        // positions 컬럼에 통째로 넣습니다.
        positions: tacticData, 
        isLocked: false
      }
    });

    res.status(201).json({ success: true, message: '전술이 완벽하게 저장되었습니다!', data: newTactic });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: '전술 저장 실패' });
  }
};

// ==========================================
// 2. 전술 목록 조회
// ==========================================
exports.getTeamTactics = async (req, res) => {
    const { teamId } = req.params;
    try {
        const list = await prisma.tactic.findMany({ 
            where: { teamId: parseInt(teamId) },
            orderBy: { createdAt: 'desc' },
            include: { 
              // 작성자 이름도 같이 보여주면 좋음 (선택)
              // team: true 
            }
        });
        res.json({ success: true, data: list });
    } catch (error) {
        res.status(500).json({ success: false, error: '목록 조회 실패' });
    }
}

// ==========================================
// 3. 전술 상세 조회 (애니메이션 재생용 데이터)
// ==========================================
exports.getTacticDetail = async (req, res) => {
  const { id } = req.params; 

  try {
    const tactic = await prisma.tactic.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!tactic) return res.status(404).json({ success: false, error: "전술 없음" });

    // DB에 저장된 JSON을 그대로 줍니다.
    // 프론트에서는 이걸 받아서 teamData로 쓰면 됩니다.
    res.json({ 
      success: true, 
      data: {
        id: tactic.id,
        name: tactic.name,
        // 아래 정보들이 lineup2.html의 teamData가 됩니다.
        teamData: tactic.positions 
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: '조회 실패' });
  }
};

// ==========================================
// 4. 전술 수정 (배치 변경, 후보 교체 등)
// ==========================================
exports.updateTactic = async (req, res) => {
  const { id } = req.params; 
  const { name, formation, coachName, starters, subs } = req.body;

  try {
    // 기존 데이터 가져오기 (덮어쓰기 위해)
    const existingTactic = await prisma.tactic.findUnique({ where: { id: parseInt(id) } });
    if (!existingTactic) return res.status(404).json({ error: "전술 없음" });

    // 기존 JSON 데이터를 기반으로 업데이트할 내용만 덮어쓰기
    const oldData = existingTactic.positions;
    
    const newTacticData = {
      formation: formation || oldData.formation,
      coach: { name: coachName || oldData.coach.name },
      starters: starters || oldData.starters,
      substitutes: subs || oldData.substitutes
    };

    const updated = await prisma.tactic.update({
      where: { id: parseInt(id) },
      data: {
        name: name || existingTactic.name,
        positions: newTacticData
      }
    });

    res.json({ success: true, message: '전술 수정 완료', data: updated });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: '수정 실패' });
  }
};

// 5. 삭제 (기존 동일)
exports.deleteTactic = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.tactic.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: '삭제 완료' });
  } catch (error) {
    res.status(500).json({ success: false, error: '삭제 실패' });
  }
};