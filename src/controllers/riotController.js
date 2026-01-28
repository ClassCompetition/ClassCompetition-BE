const axios = require('axios');

const RIOT_API_KEY = process.env.RIOT_API_KEY;

console.log("🔑 현재 적용된 라이엇 키:", RIOT_API_KEY);
// API 요청 헬퍼
const riotClient = axios.create({
  headers: { "X-Riot-Token": RIOT_API_KEY }
});

exports.getSummonerData = async (req, res) => {
  try {
    const { summonerName } = req.body; // 예: "Hide on bush" 또는 "Hide on bush#KR1"

    if (!summonerName) {
      return res.status(400).json({ success: false, error: "소환사 닉네임을 입력해주세요." });
    }

    // 1. 이름과 태그 분리 (태그 없으면 KR1 기본값)
    let [gameName, tagLine] = summonerName.split('#');
    if (!tagLine) tagLine = 'KR1';

    console.log(`🔎 Riot API 검색: ${gameName} #${tagLine}`);

    // 2. [Account V1] PUUID 조회 (ASIA 서버)
    const accountRes = await riotClient.get(
      `https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${tagLine}`
    );
    const { puuid } = accountRes.data;

    // 3. [Summoner V4] 암호화된 소환사 ID 조회 (KR 서버)
    const summonerRes = await riotClient.get(
      `https://kr.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`
    );
    const { id: encryptedSummonerId } = summonerRes.data;

    // 4. [League V4] 솔로 랭크 티어 조회 (KR 서버)
    const leagueRes = await riotClient.get(
      `https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`
    );
    
    // 솔로랭크 정보 찾기
    const soloRank = leagueRes.data.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
    let tierInfo = "Unranked";
    if (soloRank) {
      tierInfo = `${soloRank.tier} ${soloRank.rank} (${soloRank.leaguePoints}LP)`;
    }

    // 5. [Champion Mastery V4] 모스트 챔피언 조회 (KR 서버) - 상위 3개
    const masteryRes = await riotClient.get(
      `https://kr.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=5`
    );

    // 6. [Data Dragon] 챔피언 ID -> 한글 이름 변환
    // 최신 버전 정보 가져오기
    const versionRes = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
    const latestVersion = versionRes.data[0];
    
    // 챔피언 데이터 가져오기
    const championDataRes = await axios.get(`https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/ko_KR/champion.json`);
    const championsJson = championDataRes.data.data;

    // ID로 챔피언 이름 찾기
    const topChampions = masteryRes.data.map(mastery => {
      const champInfo = Object.values(championsJson).find(c => c.key == mastery.championId);
      return champInfo ? champInfo.name : "알 수 없음";
    });

    // 7. 결과 반환
    res.json({
      success: true,
      data: {
        name: `${gameName}#${tagLine}`,
        tier: tierInfo,
        mainChampions: topChampions.join(', '), // "아리, 리신, 야스오" 형태
        // 주 라인은 Riot API에서 직접 제공하지 않음 (최근 매치 분석 필요). 
        // 여기서는 유저가 직접 선택하게 하거나, 빈 값으로 둡니다.
        mainLane: "" 
      }
    });

  } catch (error) {
    console.error("❌ Riot API Error:", error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ success: false, error: "소환사를 찾을 수 없습니다." });
    }
    if (error.response?.status === 403) {
      return res.status(403).json({ success: false, error: "Riot API 키가 만료되었습니다." });
    }
    
    res.status(500).json({ success: false, error: "Riot 데이터 불러오기 실패" });
  }
};