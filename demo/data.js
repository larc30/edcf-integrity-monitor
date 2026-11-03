// 데모용 가상 데이터 — 실제 업체·실제 제재와 무관합니다 (업체명은 모두 가상)
import { ALLOWED_EMAILS } from "../assets/firebase-config.js";

const DAY = 86400e3;
const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().replace("T", " ").slice(0, 19);
const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

export function seed() {
  const now = Date.now(), ME = ALLOWED_EMAILS[0], OTHER = "colleague@example.com";
  const projects = {
    p1: { name: "가나국 스마트시티 구축사업", country: "KE", owner: ME, created_at: "1" },
    p2: { name: "다라국 국토정보 인프라 개선사업", country: "TZ", owner: ME, created_at: "2" },
    p3: { name: "마바국 ITS 고도화 2차", country: "MN", owner: ME, created_at: "3" },
    p4: { name: "사아국 병원 현대화사업", country: "LA", owner: ME, created_at: "4" },
    p5: { name: "자차국 상수도 확충사업", country: "VN", owner: OTHER, created_at: "5" },
    p6: { name: "카타국 철도 신호체계 개선", country: "KH", owner: OTHER, created_at: "6" },
  };
  const lc = (o = {}) => ({
    at: kst(now - 2 * 3600e3), mode: "집중·데일리", analyzer: "claude",
    news: { engines: ["Google", "Naver"], queries: 3, fetched: 60, mentioned: 4, new_analyzed: 1 },
    mdb: { lists: 5, names: ["SAMPLE"], status: o.noEn ? "no_en" : "ok" },
    pps: o.noBiz ? { status: "no_bizno" } : { status: "ok", bizno: "0000000000", hits: 0 },
    identity: { notes: [] },
  });
  const eng = (pid, role, stage, rank) => ({ project_id: pid, role, stage: stage || "계약", rank: rank || null });
  const C = (name, engs, extra = {}) => ({ name, country: "KR", engagements: engs, last_check: lc(extra), biz_no: extra.noBiz ? null : "0000000000", name_en: extra.noEn ? null : name, category: extra.cat || null });
  const companies = {
    c1: C("가나다엔지니어링", [eng("p1", "컨설턴트")], { cat: "엔지니어링·설계·CM·감리" }),
    c2: C("라마바건설", [eng("p1", "본구매", "우선협상", 1)], { cat: "건설·시공" }),
    c3: C("사아자기술", [eng("p1", "F/S")], { cat: "엔지니어링·설계·CM·감리" }),
    c4: C("차카타정보통신", [eng("p2", "본구매")], { cat: "IT·통신" }),
    c5: C("파하시스템", [eng("p2", "컨설턴트")], { cat: "IT·통신" }),
    c6: C("가나측량", [eng("p2", "F/S")], { cat: "엔지니어링·설계·CM·감리", noBiz: true }),
    c7: C("다라교통", [eng("p3", "컨설턴트")], { cat: "엔지니어링·설계·CM·감리" }),
    c8: C("마바이엔지", [eng("p3", "본구매", "입찰중")], { cat: "건설·시공" }),
    c9: C("아자설계", [eng("p3", "F/S")], { cat: "엔지니어링·설계·CM·감리" }),
    c10: C("카타메디칼", [eng("p4", "본구매")], { cat: "제조·장비" }),
    c11: C("타파컨설팅", [eng("p5", "컨설턴트")], { cat: "엔지니어링·설계·CM·감리" }),
    c12: C("바사통신", [eng("p6", "본구매")], { cat: "IT·통신" }),
  };
  const cats = ["건설·시공", "엔지니어링·설계·CM·감리", "IT·통신", "제조·장비"];
  for (let i = 1; i <= 28; i++) companies["b" + i] = C(`예시업체${String(i).padStart(2, "0")}`, [], { cat: cats[i % 4], noEn: i % 9 === 0 });

  const F = (cid, level, daysAgo, o) => ({
    company_id: cid, company_name: companies[cid].name, source_type: o.src || "news", source_name: o.sn || "example.com (Google News)",
    title: o.title, url: "https://example.com/", published_at: ymd(now - daysAgo * DAY), level, category: o.cat,
    summary: o.sum, rationale: o.why || "AI 판정 (예시)", analyzer: "claude", relevant: true, status: o.status || "new",
    first_seen_ms: now - (o.seen ?? Math.min(daysAgo, 1)) * DAY - 3 * 3600e3,
  });
  const findings = {
    f1: F("c2", "red", 3, { src: "official", sn: "EDCF 부정당업자 (EXIMIIS)", title: "[EDCF 제재 등록] 라마바건설 · 2026.01.01 ~ 2027.12.31", cat: "부정당업자 제재", sum: "[예시] EDCF 부정당업자로 현재 등록되어 있습니다 (제재기간 2026.01.01 ~ 2027.12.31, 사유: 허위 서류 제출).", why: "EXIMIIS 부정당업자 명단과 사업자번호 일치" }),
    f2: F("c4", "red", 1, { src: "official", sn: "조달청 나라장터 부정당제재", title: "[조달청 부정당제재] 차카타정보통신 — 입찰참가자격 제한 6개월", cat: "부정당업자 제재", sum: "[예시] 수요기관이 통보한 입찰참가자격 제한(6개월)이 현재 유효합니다.", why: "나라장터 공식 데이터 (조회 시점 유효 제재)" }),
    f3: F("c7", "orange", 0, { title: "[예시 기사] 공정위, 교통 설계 용역 담합 업체에 과징금", cat: "입찰담합", sum: "[예시] 다라교통이 설계 용역 입찰 담합으로 과징금 처분을 받았다는 보도입니다.", seen: 0.1 }),
    f4: F("c5", "orange", 1, { title: "[예시 기사] 경찰, 공공 시스템 납품 비리 관련 압수수색", cat: "수사·기소", sum: "[예시] 파하시스템 본사가 납품 비리 의혹으로 압수수색을 받았습니다.", sn: "example.co.kr (네이버 뉴스)" }),
    f5: F("b7", "orange", 5, { title: "[예시 기사] 하도급법 위반 과징금 부과", cat: "과징금·행정처분", sum: "[예시] 예시업체07이 하도급 대금 미지급으로 과징금을 부과받았습니다." }),
    f6: F("c9", "yellow", 12, { title: "[예시 기사] 설계 하자 둘러싼 손해배상 소송", cat: "소송·분쟁", sum: "[예시] 아자설계가 발주처와 설계 하자 관련 손해배상 소송 중입니다." }),
    f7: F("c1", "yellow", 2200, { title: "[예시 기사] 2020년 감리 부실 의혹 보도", cat: "중대재해·부실시공", sum: "[예시] 가나다엔지니어링의 2020년 감리 부실 의혹 (과거 이력).", why: "AI 판정 (예시) · 2020년 기사 → 과거 이력", seen: 1 }),
    f8: F("b15", "yellow", 20, { title: "[예시 기사] 대표 배임 의혹 제기", cat: "횡령·배임", sum: "[예시] 예시업체15 대표의 배임 의혹이 제기됐습니다 (수사 착수 전)." }),
    f9: F("c11", "orange", 2, { title: "[예시 기사] 해외사업 뇌물 공여 혐의 구속", cat: "뇌물·부패", sum: "[예시] 타파컨설팅 전 임원이 해외사업 뇌물 공여 혐의로 구속됐습니다." }),
  };
  return {
    projects, companies, findings,
    keywords: {}, recipients: { r1: { email: "team@example.com", active: true } },
    runs: { run1: { kind: "scan", at: kst(now - 2 * 3600e3), at_ms: now - 2 * 3600e3, ok: true, detail: { companies: 40, fetched: 2310, new_findings: 3, seconds: 14.2 } } },
    requests: {},
    edcf_sanctions: { e1: { name: "라마바건설", status: "등록", period: "2026.01.01 ~ 2027.12.31", reason: "[예시] 허위 서류 제출", biz_no: "0000000000" } },
    meta: {
      status: {
        last_scan_at: kst(now - 2 * 3600e3), last_scan_seconds: 14.2, last_daily_at: kst(now - 2 * 3600e3), analyzer: "claude", claude_model: "claude-haiku-5-5", claude_error: null,
        connections: { naver: true, google_news: true, claude: true, dart: true, pps: true, smtp: true },
        sanction_lists: { worldbank_debarred: 1418, adb_sanctions: 1457, afdb_sanctions: 1148, iadb_sanctions: 1237, ebrd_ineligible: 1221 },
      },
      settings: { keywords_version: 3, edcf_sanctions_at: kst(now - 5 * DAY), edcf_sanctions_count: 1 },
      mdb_korea: { count: 2, at: kst(now - 2 * 3600e3), items: [
        { name: "SAMPLE KOREA CO., LTD. (예시)", dataset: "worldbank_debarred", url: "https://www.opensanctions.org/", sanctions: "예시" },
        { name: "EXAMPLE KR CONSTRUCTION (예시)", dataset: "iadb_sanctions", url: "https://www.opensanctions.org/", sanctions: "예시" },
      ] },
      report_preview: { html: "<p style='font-family:sans-serif;padding:24px;color:#667085'>데모에서는 메일 미리보기를 제공하지 않습니다.</p>", generated_at: kst(now), items: 0 },
    },
  };
}
export { kst };
