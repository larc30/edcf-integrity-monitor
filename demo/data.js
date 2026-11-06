// 데모용 가상 데이터 — 실제 업체·실제 제재와 무관합니다 (업체명·사업명은 모두 지어낸 이름, 규모만 실제 운영과 비슷하게: 업체 216 · 사업 9)
import { ALLOWED_EMAILS } from "../assets/firebase-config.js";
import { MAIL_HTML, MAIL_SUBJECT } from "./mail.js";

const DAY = 86400e3;
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19);
const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
// 메일 미리보기의 날짜 자리표시({{D0}} = 오늘, {{D3}} = 3일 전, {{WD}} = 요일)를 데모를 여는 날 기준으로
const fillDates = (s, now) => s.replace(/\{\{D(\d+)\}\}/g, (_, k) => ymd(now - k * DAY)).replace(/\{\{WD\}\}/g, "일월화수목금토"[new Date(now + 9 * 3600e3).getUTCDay()]);

export function seed() {
  const now = Date.now(), ME = ALLOWED_EMAILS[0], OTHER = "colleague@example.com";
  // 사업 9개 (실제 운영 규모와 같게) — 사업명·업체명은 모두 지어낸 이름
  const projects = {
    p1: { name: "케냐 나이로비 스마트시티 구축사업", country: "KE", owner: ME, created_at: "1" },
    p2: { name: "탄자니아 국가공간정보 기반 구축사업", country: "TZ", owner: ME, created_at: "2" },
    p3: { name: "몽골 울란바토르 교통관제센터 확충사업", country: "MN", owner: ME, created_at: "3" },
    p4: { name: "라오스 비엔티안 국립병원 현대화사업", country: "LA", owner: ME, created_at: "4" },
    p7: { name: "방글라데시 다카 행정정보망 고도화사업", country: "BD", owner: ME, created_at: "5" },
    p5: { name: "베트남 메콩델타 상수도 확충사업", country: "VN", owner: OTHER, created_at: "6" },
    p6: { name: "캄보디아 프놈펜 철도 신호체계 개선사업", country: "KH", owner: OTHER, created_at: "7" },
    p8: { name: "우즈베키스탄 타슈켄트 변전소 현대화사업", country: "UZ", owner: OTHER, created_at: "8" },
    p9: { name: "필리핀 민다나오 홍수 조기경보 시스템 구축사업", country: "PH", owner: OTHER, created_at: "9" },
  };
  const lc = (o = {}) => ({
    at: kst(now - 2 * 3600e3), mode: o.base ? "기본·데일리" : "집중·데일리", analyzer: "claude",
    news: o.base ? { engines: ["Google", "Naver"], queries: 0, fetched: 0, mentioned: 0, new_analyzed: 0 } : { engines: ["Google", "Naver"], queries: 4, fetched: 60, mentioned: 4, new_analyzed: 1 },
    mdb: { lists: 5, names: ["SAMPLE"], status: o.noEn ? "no_en" : "ok" },
    pps: o.noBiz ? { status: "no_bizno" } : { status: "ok", bizno: "0000000000", hits: 0 },
    identity: { notes: [] },
  });
  const eng = (pid, role, stage, rank) => ({ project_id: pid, role, stage: stage || "계약", rank: rank || null });
  const EN = { 건설: "CONSTRUCTION", 종합건설: "CONSTRUCTION", 이앤씨: "E&C", 토건: "CONSTRUCTION", 엔지니어링: "ENGINEERING", 기술: "TECHNOLOGY", 설계: "DESIGN", 기술단: "ENGINEERING", 건축사사무소: "ARCHITECTS", 측량: "SURVEY", 교통기술: "TRAFFIC ENGINEERING", 정보통신: "INFORMATION & COMMUNICATION", 시스템: "SYSTEMS", 아이티: "IT", 통신: "TELECOM", 데이타: "DATA", 산업: "INDUSTRIAL", 전기: "ELECTRIC", 테크: "TECH", 중공업: "HEAVY INDUSTRIES", 메디칼: "MEDICAL", 상사: "TRADING", 인터내셔널: "INTERNATIONAL", 컨설팅: "CONSULTING" };
  const ROMA = { 서: "Seo", 마: "Ma", 루: "ru", 휘: "Hwi", 담: "dam", 도: "Do", 레: "re", 온: "on", 한: "Han", 올: "ol", 터: "teo", 새: "Sae", 벼: "byeo", 리: "ri", 미: "mi", 청: "Cheong", 누: "nu", 솔: "sol", 아: "A", 라: "ra", 태: "Tae", 뫼: "moe", 채: "chae", 품: "pum", 움: "um", 세: "se", 정: "jeong", 수: "su", 바: "ba", 든: "deun", 길: "gil", 래: "rae", 림: "rim", 름: "reum", 나: "na", 루: "ru", 솜: "som", 정: "jeong", 하: "ha", 로: "ro", 르: "reu", 벨: "bel", 윤: "Yun", 가: "Ga", 별: "Byeol", 해: "Hae", 운: "un", 은: "Eun", 빛: "bit", 결: "Gyeol", 람: "ram", 들: "deul", 샘: "saem", 울: "ul", 다: "da", 소: "so", 나: "na", 비: "bi", 우: "u", 단: "dan", 진: "jin", 율: "yul", 지: "ji", 늘: "neul", 봄: "Bom", 여: "Yeo", 름: "reum", 이: "i", 음: "eum", 슬: "seul", 결: "gyeol" };
  const roman = (root) => { const r = [...root].map((ch) => ROMA[ch] || "").join(""); return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase(); };
  const C = (name, root, suffix, cat, engs, extra = {}) => ({
    name, country: "KR", engagements: engs, last_check: lc(extra), biz_no: extra.noBiz ? null : "0000000000",
    name_en: extra.noEn ? null : `${roman(root).toUpperCase()} ${EN[suffix] || "CO."} CO., LTD.`, category: cat, category_source: "명단",
  });
  const K = (root, suffix, cat, engs, extra) => C(root + suffix, root, suffix, cat, engs, extra);
  // 집중 감시: 사업에 연결된 업체 22곳
  const companies = {
    c1: K("서마루", "엔지니어링", "엔지니어링·설계·감리", [eng("p1", "F/S")]),
    c3: K("휘담", "기술", "엔지니어링·설계·감리", [eng("p1", "컨설턴트")]),
    c2: K("도레온", "건설", "건설·시공", [eng("p1", "본구매", "우선협상", 1)]),
    c13: K("한올터", "이앤씨", "건설·시공", [eng("p1", "본구매", "우선협상", 2)]),
    c6: K("새벼리", "측량", "엔지니어링·설계·감리", [eng("p2", "F/S")], { noBiz: true }),
    c5: K("온새미", "정보통신", "ICT·시스템", [eng("p2", "컨설턴트")]),
    c4: K("청누리", "시스템", "ICT·시스템", [eng("p2", "본구매")]),
    c9: K("솔마루", "설계", "엔지니어링·설계·감리", [eng("p3", "F/S")]),
    c7: K("아라온", "교통기술", "엔지니어링·설계·감리", [eng("p3", "컨설턴트")]),
    c8: K("태하로", "건설", "건설·시공", [eng("p3", "본구매", "입찰중")]),
    c10: K("미르벨", "메디칼", "제조·플랜트", [eng("p4", "본구매")]),
    c14: K("윤담", "건축사사무소", "엔지니어링·설계·감리", [eng("p4", "컨설턴트")]),
    c15: K("가온결", "컨설팅", "기타", [eng("p7", "컨설턴트")]),
    c16: K("별하솔", "정보통신", "ICT·시스템", [eng("p7", "본구매", "우선협상", 1)]),
    c11: K("해솔담", "엔지니어링", "엔지니어링·설계·감리", [eng("p5", "컨설턴트")]),
    c17: K("로운터", "건설", "건설·시공", [eng("p5", "본구매")]),
    c12: K("은빛누리", "통신", "ICT·시스템", [eng("p6", "본구매")]),
    c18: K("결담", "기술단", "엔지니어링·설계·감리", [eng("p6", "F/S")]),
    c19: K("도담마루", "전기", "제조·플랜트", [eng("p8", "본구매", "입찰중")]),
    c20: K("새온결", "엔지니어링", "엔지니어링·설계·감리", [eng("p8", "컨설턴트")]),
    c21: K("하람솔", "시스템", "ICT·시스템", [eng("p9", "본구매")]),
    c22: K("온결", "기술", "엔지니어링·설계·감리", [eng("p9", "F/S")]),
  };
  // 기본 감시: 명단만 있는 업체 — 전체 216곳이 되도록 지어낸 이름으로 채움
  const ROOTS = ["서담", "도윤", "해람", "태솔", "윤솔", "가온", "새온", "은솔", "봄길", "여울", "다온", "새길", "늘봄", "솔길", "해든", "다솜", "나래", "이음", "지음", "소담",
    "단비", "온빛", "해온", "서율", "하진", "태온", "은결", "정담", "세움", "늘품", "미담", "로하", "도래", "누림", "아름길", "한누리", "솔뫼", "다올길", "가람채", "새솔",
    "윤빛", "하솔", "온담", "서해든", "도솔뫼", "은하수", "들빛", "청솔뫼", "바다솔", "해나루"];
  const SUF = [["건설", "건설·시공"], ["종합건설", "건설·시공"], ["이앤씨", "건설·시공"], ["토건", "건설·시공"], ["엔지니어링", "엔지니어링·설계·감리"], ["기술", "엔지니어링·설계·감리"], ["기술단", "엔지니어링·설계·감리"], ["건축사사무소", "엔지니어링·설계·감리"],
    ["정보통신", "ICT·시스템"], ["시스템", "ICT·시스템"], ["아이티", "ICT·시스템"], ["데이타", "ICT·시스템"], ["산업", "제조·플랜트"], ["전기", "제조·플랜트"], ["테크", "제조·플랜트"], ["중공업", "제조·플랜트"], ["상사", "상사·유통"], ["인터내셔널", "상사·유통"], ["컨설팅", "기타"], ["엔지니어링", "엔지니어링·설계·감리"]];
  const used = new Set(Object.values(companies).map((c) => c.name));
  let bi = 0;
  for (let k = 0; Object.keys(companies).length < 216 && k < 4000; k++) {
    const root = ROOTS[k % ROOTS.length], [suf, cat] = SUF[(k * 7 + Math.floor(k / ROOTS.length)) % SUF.length], name = root + suf;
    if (used.has(name)) continue;
    used.add(name); bi++;
    companies["b" + bi] = C(name, root, suf, cat, [], { base: true, noBiz: bi % 5 === 0, noEn: bi % 7 === 0 });
  }

  const F = (cid, level, daysAgo, o) => ({
    company_id: cid, company_name: companies[cid].name, source_type: o.src || "news", source_name: o.sn || "example.com (Google News)",
    title: o.title, url: o.url || `https://example.com/news/${cid}-${daysAgo}`, published_at: ymd(now - daysAgo * DAY), level, category: o.cat,
    summary: o.sum, rationale: o.why || "AI 판정", analyzer: o.src === "official" ? "list-match" : "claude", relevant: true, status: o.status || "new",
    dedup_key: o.key || `demo-${cid}-${daysAgo}-${level}`,
    first_seen_ms: now - (o.seen ?? Math.min(daysAgo, 1)) * DAY - 3 * 3600e3,
    ...((o.seen ?? Math.min(daysAgo, 1)) >= 1 ? { reported_at: kst(now - Math.min(daysAgo, 30) * DAY) } : {}), // 어제 이전에 본 기록은 이미 메일로 보낸 것
  });
  const n = (cid) => companies[cid].name;
  const findings = {
    f1: F("c2", "red", 3, { src: "official", key: "edcf-demo-1", sn: "EDCF 부정당업자 (EXIMIIS)", title: `[EDCF 제재 등록] ${n("c2")} · 2026.01.01 ~ 2027.12.31`, cat: "부정당업자 제재", sum: "EDCF 부정당업자로 현재 등록 중입니다 (사유: 허위 서류 제출).", why: "EXIMIIS 명단 사업자번호 일치 · 상태 '등록'" }),
    f12: F("c2", "yellow", 900, { src: "official", key: "edcf-demo-2", sn: "EDCF 부정당업자 (EXIMIIS)", title: `[EDCF 제재 해지] ${n("c2")} · 2023.01.01 ~ 2023.06.30`, cat: "부정당업자 제재", sum: "과거 EDCF 부정당업자 제재 이력 (해지).", why: "EXIMIIS 명단 · 상태 '해지'" }),
    f2: F("c4", "red", 1, { seen: 0.4, src: "official", sn: "조달청 나라장터 부정당제재", title: `[조달청 부정당제재] ${n("c4")} — 입찰참가자격 제한 6개월`, cat: "부정당업자 제재", sum: "계약 이행 부실로 입찰참가자격 제한 6개월 (현재 유효).", why: "나라장터 부정당제재 조회 · 사업자번호 일치" }),
    f13: F("c19", "red", 4, { seen: 0.4, title: `${n("c19")}, 한전 발주 입찰참가자격 제한 3개월 처분 확정`, cat: "입찰참가자격 제한", sum: "납품 기준 위반으로 공공기관 입찰참가자격 제한 3개월 처분이 확정돼 현재 제재 기간 중입니다." }),
    f3: F("c7", "orange", 0, { title: "공정위, 교통 설계 용역 입찰 담합 3개사에 과징금 14억 원", cat: "입찰담합", sum: `${n("c7")} — 지자체 교통 설계 용역 입찰 담합으로 공정위 과징금 처분.`, url: "https://example.com/a/2001" }),
    f10: F("c7", "orange", 0, { title: `${n("c7")} 등 3개사, 교통 설계 입찰 담합 과징금 부과`, cat: "입찰담합", sum: "같은 담합 사건을 다른 매체가 보도했습니다.", sn: "example.net (Naver)", url: "https://example.net/a/77", seen: 0.3 }),
    f11: F("c9", "orange", 0, { title: "공정위, 교통 설계 용역 입찰 담합 3개사에 과징금 14억 원", cat: "입찰담합", sum: `같은 기사에 ${n("c9")}도 함께 언급됐습니다.`, url: "https://example.com/a/2001", seen: 0.3 }),
    f4: F("c5", "orange", 1, { seen: 0.4, title: `경찰, ${n("c5")} 본사 압수수색…공공 시스템 납품 비리 의혹`, cat: "수사·기소", sum: "공공 정보시스템 납품 과정의 금품 제공 의혹으로 본사 압수수색." }),
    f9: F("c11", "orange", 2, { seen: 0.4, title: `${n("c11")} 전 임원, 해외사업 뇌물 공여 혐의 구속`, cat: "뇌물·부패", sum: "해외 상수도 사업 수주 과정의 뇌물 공여 혐의로 전 임원 구속." }),
    f14: F("c16", "orange", 6, { seen: 0.4, title: `${n("c16")}, 하도급 대금 미지급으로 공정위 과징금`, cat: "과징금·행정처분", sum: "하도급 대금 지연 지급으로 공정위 과징금 처분." }),
    f6: F("c9", "yellow", 12, { title: `발주처, ${n("c9")} 상대 설계 하자 손해배상 소송`, cat: "소송·분쟁", sum: "도로 설계 하자 관련 손해배상 소송 진행 중." }),
    f7: F("c1", "yellow", 2200, { title: `2020년 ${n("c1")} 감리 현장 부실 의혹`, cat: "중대재해·부실시공", sum: "2020년 감리 부실 의혹 (과거 이력).", why: "AI 판정 · 2020년 기사라 과거 이력" }),
    f15: F("c13", "yellow", 40, { title: `${n("c13")} 시공 현장서 근로자 추락 사고`, cat: "중대재해·부실시공", sum: "시공 현장 추락 사고로 노동부 조사 중 (처분 전)." }),
    f16: F("c14", "yellow", 75, { title: `${n("c14")} 대표 배임 의혹 고발장 접수`, cat: "횡령·배임", sum: "대표 배임 의혹 고발 (수사 착수 전)." }),
    f17: F("c22", "yellow", 150, { title: `${n("c22")}, 국토부 벌점 부과`, cat: "과징금·행정처분", sum: "건설기술진흥법 위반으로 벌점 부과." }),
  };
  // 기본 감시 업체 이슈 — 전체 등급 분포가 실제 운영과 비슷하도록 (업체 기준 위험 7 · 경고 16 · 주의 58)
  const T = {
    red: [["{n}, 공공기관 입찰참가자격 제한 6개월 처분 확정", "입찰참가자격 제한", "허위 실적 제출로 입찰참가자격 제한 6개월 — 현재 제재 기간 중."],
          ["국토부, {n} 영업정지 3개월 처분", "영업정지", "부실시공 책임으로 영업정지 3개월 — 현재 처분 기간 중."]],
    orange: [["공정위, {n} 등 하수관로 공사 입찰 담합 적발", "입찰담합", "공공 하수관로 공사 입찰 담합으로 과징금 부과."],
             ["검찰, {n} 전 대표 횡령 혐의 기소", "횡령·배임", "회사 자금 횡령 혐의로 전 대표 기소."],
             ["경찰, {n} 본사 압수수색…공사비 부풀리기 의혹", "수사·기소", "공사비 과다 청구 의혹으로 압수수색."],
             ["{n}, 법원에 기업회생절차 신청", "부도·회생", "유동성 악화로 기업회생절차 신청."],
             ["국토부, {n}에 영업정지 처분 예고", "과징금·행정처분", "안전관리 위반으로 영업정지 처분 사전 통지."]],
    yellow: [["{n} 시공 현장서 근로자 부상 사고", "중대재해·부실시공", "현장 안전사고 — 처분 전 단계."],
             ["발주처, {n} 상대 공사 지연 손해배상 소송", "소송·분쟁", "공사 지연 관련 민사 소송 진행 중."],
             ["{n} 대표 배임 의혹 제기", "횡령·배임", "배임 의혹 제기 (수사 착수 전)."],
             ["{n}, 2021년 입찰참가자격 제한 처분 이력", "부정당업자 제재", "2021년 입찰 제한 처분 (1년 지난 과거 이력)."],
             ["{n}, 건설기술진흥법 위반 벌점", "과징금·행정처분", "벌점 부과 (경미)."],
             ["{n} 하청 노동자 임금체불 논란", "기타", "하청 임금체불 논란 (회사 직접 처분 없음)."]],
  };
  const bases = Object.keys(companies).filter((k) => k.startsWith("b"));
  const plan = [["red", 4, 60], ["orange", 11, 45], ["yellow", 53, 400]];
  let bp = 0, fi = 100;
  for (const [lv, count, span] of plan) for (let i = 0; i < count; i++) {
    const cid = bases[(bp++ * 3) % bases.length], [title, cat, sum] = T[lv][i % T[lv].length], days = (i * 37 + 2) % span;
    findings["f" + fi++] = F(cid, lv, days, { title: title.replace("{n}", n(cid)), cat, sum: `${n(cid)} — ${sum}`, status: i % 6 === 5 ? "reviewed" : "new", seen: days < 2 ? days : undefined });
  }
  return {
    projects, companies, findings,
    keywords: {}, recipients: { r1: { email: "team@example.com", active: true } },
    runs: {
      run1: { kind: "scan", at: kst(now - 2 * 3600e3), at_ms: now - 2 * 3600e3, ok: true, detail: { companies: 216, fetched: 2930, new_findings: 6, seconds: 61.8 } },
      run0: { kind: "scan", at: kst(now - 26 * 3600e3), at_ms: now - 26 * 3600e3, ok: false, detail: { companies: 216, fetched: 2870, new_findings: 4, seconds: 64.3, errors: [
        "새벼리측량 / 조달청 부정당제재: (데모 예시) Read timed out", "윤솔정보통신 / 조달청 부정당제재: (데모 예시) Read timed out",
        "해람테크 / Naver '해람테크': (데모 예시) 429 Too Many Requests"] } },
    },
    requests: {},
    edcf_sanctions: Object.fromEntries([
      [companies.c2.name, "등록", "2026.01.01 ~ 2027.12.31", "허위 서류 제출"], [companies.c2.name, "해지", "2023.01.01 ~ 2023.06.30", "계약 이행 지연"],
      ["청솔하이텍", "등록", "2025.09.01 ~ 2027.08.31", "입찰 담합"], ["미래온건설", "해지", "2022.03.01 ~ 2022.08.31", "허위 서류 제출"], ["한빛솔루션즈", "등록", "2026.04.01 ~ 2028.03.31", "뇌물 제공"],
      ["태원로지텍", "해지", "2021.05.01 ~ 2021.10.31", "계약 불이행"], ["가람플랜트", "등록", "2025.11.01 ~ 2026.12.31", "입찰 담합"], ["서해솔엔지니어링", "해지", "2020.02.01 ~ 2020.07.31", "허위 실적"],
      ["누리온테크", "해지", "2022.10.01 ~ 2023.03.31", "계약 이행 부실"], ["동하마루건설", "등록", "2026.02.01 ~ 2027.01.31", "허위 서류 제출"], ["새길로이앤씨", "해지", "2021.08.01 ~ 2022.01.31", "하도급 위반"],
      ["별누리통상", "해지", "2023.06.01 ~ 2023.11.30", "계약 불이행"], ["윤슬바이오텍", "해지", "2020.09.01 ~ 2021.02.28", "허위 서류 제출"],
    ].map(([name, status, period, reason], i) => ["e" + (i + 1), { name, status, period, reason, biz_no: "" }])),
    meta: {
      status: {
        last_scan_at: kst(now - 2 * 3600e3), last_scan_seconds: 61.8, last_tick_at: kst(now - 4 * 60e3), last_daily_at: kst(now - 2 * 3600e3), analyzer: "claude", claude_model: "claude-haiku-5-5", claude_error: null,
        connections: { naver: true, google_news: true, claude: true, dart: true, pps: true, smtp: true },
        sanction_lists: { worldbank_debarred: 1418, adb_sanctions: 1457, afdb_sanctions: 1148, iadb_sanctions: 1237, ebrd_ineligible: 1221 },
      },
      settings: { keywords_version: 3, edcf_sanctions_at: kst(now - 5 * DAY), edcf_sanctions_count: 13 },
      mdb_korea: { count: 2, at: kst(now - 2 * 3600e3), items: [
        { name: "SAMPLE KOREA CO., LTD. (예시)", dataset: "worldbank_debarred", url: "https://www.opensanctions.org/", sanctions: "예시" },
        { name: "EXAMPLE KR CONSTRUCTION (예시)", dataset: "iadb_sanctions", url: "https://www.opensanctions.org/", sanctions: "예시" },
      ] },
      report_preview: { html: fillDates(MAIL_HTML, now), subject: fillDates(MAIL_SUBJECT, now), generated_at: kst(now), items: 12 },
    },
  };
}
export { kst };
