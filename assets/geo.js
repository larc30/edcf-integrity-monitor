// 수원국 리스크 대시보드
// - 지도: Leaflet + Esri 회색 무료 지도(키 없음)
// - 사업 위치: 사업명 속 도시 이름 → 도시 좌표, 없으면 수원국 중심 (projects.lat/lng 가 있으면 그 값)
// - 이벤트: Firestore meta/geo (매일 아침 monitor/geo.py 가 외교부 여행경보·USGS 지진·GDACS 재난경보·WHO 감염병·Google/네이버 뉴스로 저장)
//           + 브라우저에서 USGS 지진 실시간 (키 없음, 회사망에서 막히면 저장본만)
// - 수원국 등급: 사업지 기준 여행경보(3·4단계 경고, 2단계 주의, 일부 지역만 높은 단계는 사업지가 그 지역일 때만) + 사업지 둘레 사건(GEO_RULES)
// 국가·도시 좌표와 이벤트 분류 단어는 monitor/geo.py 와 같게 유지

// 국가: [이름, 영문명(USGS 지명 대조), 위도, 경도]
export const GEO_COUNTRY = {
  HN: ["온두라스", "Honduras", 15.2, -86.2], NI: ["니카라과", "Nicaragua", 12.9, -85.2], SV: ["엘살바도르", "El Salvador", 13.8, -88.9], CR: ["코스타리카", "Costa Rica", 9.7, -83.8], PA: ["파나마", "Panama", 8.5, -80.8], DO: ["도미니카공화국", "Dominican Republic", 18.7, -70.2], BR: ["브라질", "Brazil", -14.2, -51.9],
  TZ: ["탄자니아", "Tanzania", -6.4, 34.9], PK: ["파키스탄", "Pakistan", 30.4, 69.3], KE: ["케냐", "Kenya", 0.2, 37.9],
  MN: ["몽골", "Mongolia", 46.9, 103.8], LA: ["라오스", "Laos", 19.9, 102.5], ID: ["인도네시아", "Indonesia", -2.5, 118.0],
  KR: ["한국", "South Korea", 36.5, 127.9], VN: ["베트남", "Vietnam", 14.1, 108.3], KH: ["캄보디아", "Cambodia", 12.6, 104.9],
  BD: ["방글라데시", "Bangladesh", 23.7, 90.4], PH: ["필리핀", "Philippines", 12.9, 121.8], UZ: ["우즈베키스탄", "Uzbekistan", 41.4, 64.6],
  ET: ["에티오피아", "Ethiopia", 9.1, 40.5], GH: ["가나", "Ghana", 7.9, -1.0], MM: ["미얀마", "Myanmar", 21.9, 95.9],
  LK: ["스리랑카", "Sri Lanka", 7.9, 80.8], NP: ["네팔", "Nepal", 28.4, 84.1], RW: ["르완다", "Rwanda", -1.9, 29.9],
  UG: ["우간다", "Uganda", 1.4, 32.3], TN: ["튀니지", "Tunisia", 33.9, 9.5], EG: ["이집트", "Egypt", 26.8, 30.8],
  BO: ["볼리비아", "Bolivia", -16.3, -63.6], PY: ["파라과이", "Paraguay", -23.4, -58.4], CO: ["콜롬비아", "Colombia", 4.6, -74.3],
  PE: ["페루", "Peru", -9.2, -75.0], EC: ["에콰도르", "Ecuador", -1.8, -78.2], GT: ["과테말라", "Guatemala", 15.8, -90.2],
  SN: ["세네갈", "Senegal", 14.5, -14.5], MZ: ["모잠비크", "Mozambique", -18.7, 35.5], CM: ["카메룬", "Cameroon", 7.4, 12.4],
  NG: ["나이지리아", "Nigeria", 9.1, 8.7], TR: ["튀르키예", "Turkey", 39.0, 35.2], UA: ["우크라이나", "Ukraine", 48.4, 31.2],
  GE: ["조지아", "Georgia", 42.3, 43.4], AZ: ["아제르바이잔", "Azerbaijan", 40.1, 47.6], KZ: ["카자흐스탄", "Kazakhstan", 48.0, 66.9],
  KG: ["키르기스스탄", "Kyrgyzstan", 41.2, 74.8], TJ: ["타지키스탄", "Tajikistan", 38.9, 71.3], TL: ["동티모르", "Timor-Leste", -8.9, 125.7],
};
// 사업명에 들어 있으면 그 도시에 핀을 꽂음
export const GEO_CITY = { // [위도, 경도, 영문명, 다른 표기(선택)]
  다카르: [14.72, -17.47, "Dakar"], 티에스: [14.79, -16.93, "Thies"], 생루이: [16.03, -16.5, "Saint-Louis"], 아루샤: [-3.37, 36.68, "Arusha"], 므완자: [-2.52, 32.9, "Mwanza"],
  음베야: [-8.9, 33.46, "Mbeya"], 탕가: [-5.07, 39.1, "Tanga"], 페샤와르: [34.01, 71.58, "Peshawar"], 퀘타: [30.18, 66.99, "Quetta"], 파이살라바드: [31.42, 73.08, "Faisalabad"],
  물탄: [30.2, 71.47, "Multan"], 라왈핀디: [33.6, 73.05, "Rawalpindi"], 키수무: [-0.09, 34.77, "Kisumu"], 나쿠루: [-0.3, 36.07, "Nakuru"], 엘도레트: [0.51, 35.27, "Eldoret"],
  다르항: [49.49, 105.92, "Darkhan"], 에르데네트: [49.03, 104.08, "Erdenet"], 팍세: [15.12, 105.8, "Pakse"], 사반나켓: [16.57, 104.75, "Savannakhet"], 수라바야: [-7.25, 112.75, "Surabaya"],
  반둥: [-6.91, 107.61, "Bandung"], 메단: [3.6, 98.67, "Medan"], 마카사르: [-5.15, 119.43, "Makassar"], 덴파사르: [-8.65, 115.22, "Denpasar", "발리"], 누산타라: [0.97, 116.7, "Nusantara"],
  하이퐁: [20.86, 106.68, "Hai Phong"], 껀터: [10.03, 105.79, "Can Tho"], 후에: [16.46, 107.59, "Hue"], 냐짱: [12.24, 109.19, "Nha Trang"], 시엠레아프: [13.36, 103.86, "Siem Reap"],
  시아누크빌: [10.63, 103.52, "Sihanoukville"], 바탐방: [13.1, 103.2, "Battambang"], 쿨나: [22.85, 89.54, "Khulna"], 실렛: [24.89, 91.87, "Sylhet"], 라지샤히: [24.37, 88.6, "Rajshahi"],
  일로일로: [10.72, 122.56, "Iloilo"], 클라크: [15.19, 120.55, "Clark"], 바기오: [16.4, 120.6, "Baguio"], 부하라: [39.77, 64.42, "Bukhara"], 나망간: [41.0, 71.67, "Namangan"],
  페르가나: [40.38, 71.79, "Fergana"], 누쿠스: [42.46, 59.6, "Nukus"], 디레다와: [9.6, 41.85, "Dire Dawa"], 메켈레: [13.5, 39.47, "Mekelle"], 바하르다르: [11.59, 37.39, "Bahir Dar"],
  하와사: [7.06, 38.48, "Hawassa"], 쿠마시: [6.69, -1.62, "Kumasi"], 타말레: [9.4, -0.85, "Tamale"], 테마: [5.67, 0.0, "Tema"], 네피도: [19.76, 96.08, "Naypyidaw"],
  만달레이: [21.96, 96.09, "Mandalay"], 캔디: [7.29, 80.63, "Kandy"], 함반토타: [6.12, 81.12, "Hambantota"], 자프나: [9.66, 80.02, "Jaffna"], 포카라: [28.21, 83.99, "Pokhara"],
  비라트나가르: [26.45, 87.28, "Biratnagar"], 후예: [-2.6, 29.74, "Huye", "부타레"], 루바부: [-1.68, 29.26, "Rubavu"], 엔테베: [0.05, 32.46, "Entebbe"], 굴루: [2.77, 32.3, "Gulu"],
  진자: [0.42, 33.2, "Jinja"], 튀니스: [36.81, 10.18, "Tunis"], 스팍스: [34.74, 10.76, "Sfax"], 알렉산드리아: [31.2, 29.92, "Alexandria"], 수에즈: [29.97, 32.55, "Suez"],
  아스완: [24.09, 32.9, "Aswan"], 신행정수도: [30.02, 31.7, "New Administrative Capital"], 수크레: [-19.05, -65.26, "Sucre"], 코차밤바: [-17.39, -66.16, "Cochabamba"], 엘알토: [-16.5, -68.19, "El Alto"],
  오루로: [-17.97, -67.11, "Oruro"], 타리하: [-21.53, -64.73, "Tarija"], 포토시: [-19.58, -65.75, "Potosi"], 시우다드델에스테: [-25.51, -54.61, "Ciudad del Este"], 엔카르나시온: [-27.33, -55.87, "Encarnacion"],
  메데진: [6.24, -75.58, "Medellin", "메데인"], 바랑키야: [10.96, -74.8, "Barranquilla"], 카르타헤나: [10.39, -75.48, "Cartagena"], 아레키파: [-16.41, -71.54, "Arequipa"], 쿠스코: [-13.53, -71.97, "Cusco"],
  트루히요: [-8.11, -79.03, "Trujillo", "트루히오"], 피우라: [-5.19, -80.63, "Piura"], 이키토스: [-3.75, -73.25, "Iquitos"], 쿠엥카: [-2.9, -79.0, "Cuenca"], 만타: [-0.95, -80.73, "Manta"],
  케찰테낭고: [14.83, -91.52, "Quetzaltenango", "셸라"], 산페드로술라: [15.5, -88.03, "San Pedro Sula"], 레온: [12.44, -86.88, "Leon"], 산타아나: [13.99, -89.56, "Santa Ana"], 리몬: [9.99, -83.03, "Limon"],
  콜론: [9.36, -79.9, "Colon"], 산티아고데로스카바예로스: [19.45, -70.7, "Santiago de los Caballeros"], 리우데자네이루: [-22.91, -43.17, "Rio de Janeiro"], 마나우스: [-3.12, -60.02, "Manaus"], 마푸토: [-25.97, 32.57, "Maputo"],
  베이라: [-19.84, 34.84, "Beira"], 나칼라: [-14.56, 40.69, "Nacala"], 남풀라: [-15.12, 39.27, "Nampula"], 야운데: [3.85, 11.5, "Yaounde"], 두알라: [4.05, 9.7, "Douala"],
  아부자: [9.08, 7.4, "Abuja"], 라고스: [6.52, 3.38, "Lagos"], 카노: [12.0, 8.52, "Kano"], 포트하커트: [4.82, 7.03, "Port Harcourt"], 앙카라: [39.93, 32.86, "Ankara"],
  이스탄불: [41.01, 28.98, "Istanbul"], 이즈미르: [38.42, 27.14, "Izmir"], 키이우: [50.45, 30.52, "Kyiv", "키예프"], 리비우: [49.84, 24.03, "Lviv"], 오데사: [46.48, 30.73, "Odesa"],
  하르키우: [49.99, 36.23, "Kharkiv"], 트빌리시: [41.72, 44.79, "Tbilisi"], 바투미: [41.64, 41.64, "Batumi"], 쿠타이시: [42.27, 42.7, "Kutaisi"], 바쿠: [40.41, 49.87, "Baku"],
  아스타나: [51.17, 71.45, "Astana"], 알마티: [43.24, 76.89, "Almaty"], 쉼켄트: [42.32, 69.6, "Shymkent"], 비슈케크: [42.87, 74.59, "Bishkek", "비쉬케크"], 두샨베: [38.56, 68.79, "Dushanbe", "두산베"],
  후잔트: [40.28, 69.62, "Khujand"], 딜리: [-8.56, 125.58, "Dili"], 바우카우: [-8.47, 126.45, "Baucau"],
  리마: [-12.05, -77.04, "Lima"], 라파스: [-16.5, -68.15, "La Paz", "라파즈"], 산타크루스: [-17.78, -63.18, "Santa Cruz"], 아순시온: [-25.26, -57.58, "Asuncion"], 보고타: [4.71, -74.07, "Bogota"], 키토: [-0.18, -78.47, "Quito"], 과야킬: [-2.17, -79.92, "Guayaquil"], 과테말라시티: [14.63, -90.51, "Guatemala City"], 테구시갈파: [14.07, -87.19, "Tegucigalpa"], 마나과: [12.11, -86.24, "Managua"], 산살바도르: [13.69, -89.22, "San Salvador"], 산호세: [9.93, -84.08, "San Jose"], 파나마시티: [8.98, -79.52, "Panama City"], 산토도밍고: [18.49, -69.93, "Santo Domingo"], 브라질리아: [-15.79, -47.88, "Brasilia"], 상파울루: [-23.55, -46.63, "Sao Paulo"],
  나이로비: [-1.29, 36.82, "Nairobi"], 몸바사: [-4.04, 39.67, "Mombasa"], 다르에스살람: [-6.79, 39.21, "Dar es Salaam"], 도도마: [-6.16, 35.75, "Dodoma"], 잔지바르: [-6.17, 39.2, "Zanzibar"],
  울란바토르: [47.89, 106.91, "Ulaanbaatar", "울란바타르"], 비엔티안: [17.97, 102.63, "Vientiane", "비엔티엔"], 루앙프라방: [19.89, 102.13, "Luang Prabang"], 다카: [23.81, 90.41, "Dhaka"], 치타공: [22.36, 91.78, "Chittagong"],
  하노이: [21.03, 105.85, "Hanoi"], 호치민: [10.82, 106.63, "Ho Chi Minh City", "호찌민"], 다낭: [16.05, 108.2, "Da Nang"], 메콩델타: [10.03, 105.78, "Mekong Delta"], 프놈펜: [11.56, 104.93, "Phnom Penh"],
  타슈켄트: [41.3, 69.24, "Tashkent"], 사마르칸트: [39.65, 66.96, "Samarkand"], 민다나오: [7.6, 125.0, "Mindanao"], 다바오: [7.07, 125.61, "Davao"], 마닐라: [14.6, 120.98, "Manila"], 세부: [10.32, 123.89, "Cebu"],
  카라치: [24.86, 67.01, "Karachi"], 이슬라마바드: [33.68, 73.05, "Islamabad"], 라호르: [31.55, 74.34, "Lahore"], 자카르타: [-6.21, 106.85, "Jakarta"], 아디스아바바: [9.03, 38.74, "Addis Ababa"],
  아크라: [5.6, -0.19, "Accra"], 콜롬보: [6.93, 79.86, "Colombo"], 카트만두: [27.72, 85.32, "Kathmandu"], 키갈리: [-1.95, 30.06, "Kigali"], 캄팔라: [0.35, 32.58, "Kampala"], 카이로: [30.04, 31.24, "Cairo"], 양곤: [16.84, 96.17, "Yangon"],
};
// 이벤트 종류: [이름, 색, 아이콘(선 그림)]: 이모티콘 대신 같은 모양의 아이콘 배지
export const GEO_TYPES = {
  quake: ["지진", "#F59E0B", '<path d="M2 12h3l2-5 3 10 3-14 3 13 2-4h4"/>'],
  war: ["분쟁·전쟁", "#EF4444", '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="M5 14l4 4"/><path d="M7 17l-3 3"/><path d="M3 19l2 2"/>'],
  terror: ["테러·폭발", "#E11D48", '<path d="M12 2l1.8 4.6L18 4l-1.4 4.8L21.5 10l-4.2 2.4L20 17l-4.8-1.2L13 21l-1.8-4.4L7 19l.8-4.8L3 13l4-2.6L5 6l4.6 1.4z"/>'],
  unrest: ["시위·소요", "#A855F7", '<path d="M3 11l15-6v14L3 13z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/><path d="M21 9v6"/>'],
  flood: ["홍수", "#3B82F6", '<path d="M2 6c2 0 2-1.5 4-1.5S8 6 10 6s2-1.5 4-1.5S16 6 18 6s2-1.5 4-1.5"/><path d="M2 12c2 0 2-1.5 4-1.5S8 12 10 12s2-1.5 4-1.5S16 12 18 12s2-1.5 4-1.5"/><path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5S16 18 18 18s2-1.5 4-1.5"/>'],
  storm: ["태풍", "#06B6D4", '<circle cx="12" cy="12" r="2"/><path d="M19 7c-1.5-2.5-4.2-4-7-4-4.4 0-8 3.6-8 8"/><path d="M5 17c1.5 2.5 4.2 4 7 4 4.4 0 8-3.6 8-8"/>'],
  fire: ["산불", "#F97316", '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'],
  volcano: ["화산", "#C2410C", '<path d="M2 21l6.5-10h7L22 21z"/><path d="M10 11l2 3 2-3"/><path d="M12 7V3"/><path d="M8.5 6.5 7 5"/><path d="M15.5 6.5 17 5"/>'],
  politics: ["정치·선거", "#8B9CF6", '<path d="M3 21h18"/><path d="M5 21V10"/><path d="M19 21V10"/><path d="M9.5 21V10"/><path d="M14.5 21V10"/><path d="M2 10l10-6 10 6z"/>'],
  disease: ["감염병", "#22C55E", '<circle cx="12" cy="12" r="5"/><path d="M12 7V3M12 21v-4M7 12H3M21 12h-4M8.5 8.5 6 6M18 18l-2.5-2.5M15.5 8.5 18 6M6 18l2.5-2.5"/>'],
};
// 이벤트 요약에서 보여 주는 묶음 (누르면 그 묶음만 보임). 등급 기준(GEO_RULES)은 원래 종류 그대로 씀
export const GEO_GROUPS = { quake: ["지진·화산", ["quake", "volcano"]], war: ["분쟁·테러", ["war", "terror"]], unrest: ["시위·정치", ["unrest", "politics"]], flood: ["기상재해", ["flood", "storm", "fire"]], disease: ["감염병", ["disease"]] };
const inGroup = (e, g) => !g || (GEO_GROUPS[g]?.[1] || [g]).includes(e.type);
const icon = (t) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GEO_TYPES[t][2]}</svg>`;
const ibadge = (t, cls = "") => `<span class="ico ${cls}" style="--ec:${GEO_TYPES[t][1]}" title="${GEO_TYPES[t][0]}">${icon(t)}</span>`;
// 외교부 여행경보 단계 (색은 외교부 지도와 같은 계열)
const ALERT = { 1: ["1단계", "여행유의", "a1"], 2: ["2단계", "여행자제", "a2"], 3: ["3단계", "출국권고", "a3"], 4: ["4단계", "여행금지", "a4"] };
const LEVEL = { red: "경고", orange: "주의", none: "정상" };
const LV = { red: 2, orange: 1, none: 0 };
const DAY = 86400e3;
export const QUAKE_MIN = 5.5; // 이보다 작은 지진은 보여 주지 않음 (정말 위험한 것만)
// 수원국 리스크 기준: 사업지에서 사건까지 거리 · 기간 (숫자만 바꾸면 기준이 바뀜, 설명 창도 이 표로 만듦)
// 지진은 거리 대신 '사업지 예상 진도'(mmi): 규모·거리·깊이로 사업지가 얼마나 흔들렸을지 계산 (siteMMI)
export const GEO_RULES = [
  { lv: "red", types: ["quake"], mmi: 6, days: 7, text: "지진: 사업지 예상 진도 6 이상 (건물 피해가 생기기 시작하는 흔들림)" },
  { lv: "red", types: ["terror", "war"], km: 50, days: 14, text: "테러, 분쟁 (같은 도시권)" },
  { lv: "red", types: ["storm", "flood", "volcano", "fire"], gdacs: "Red", km: 300, days: 7, text: "GDACS 빨강 경보 (태풍, 홍수, 화산, 산불)" },
  { lv: "orange", types: ["quake"], mmi: 5, days: 7, text: "지진: 사업지 예상 진도 5 (거의 모든 사람이 느끼고 물건이 떨어지는 흔들림)" },
  { lv: "orange", types: ["terror", "war"], km: 200, days: 14, text: "테러, 분쟁 (같은 지역권)" },
  { lv: "orange", types: ["flood", "storm", "fire", "volcano"], km: 100, days: 7, text: "홍수, 태풍, 산불, 화산" },
  { lv: "orange", types: ["unrest", "disease"], km: 50, days: 7, text: "시위, 감염병" },
  { lv: "orange", types: ["storm", "flood", "volcano", "fire"], gdacs: "Orange", km: 300, days: 7, text: "GDACS 주황 경보 (태풍, 홍수, 화산, 산불)" },
  { lv: "orange", types: ["disease"], who: true, country: true, days: 30, text: "WHO 감염병 발생 발표 (같은 나라)" },
];

let ctx = null, map = null, layers = null, live = { quakes: null, at: null, err: null, loading: false };
const ui = { type: null, period: "14", lv: null, focus: null, openC: null };
const RINGS = [100, 200, 300, 400, 500]; // 사업을 누르면 사업지 둘레에 그리는 거리 원 (km)
const NEAR_KM = 600;
ui.period = "7d";
try { ui.period = localStorage.getItem("edcf_geo_period3") || "7d"; } catch {}
const PERIODS = [["all", "전체"], ["1d", "24시간"], ["7d", "최근 7일"], ["30d", "최근 30일"], ["old", "30일 이전"]];
const inP = (e, p) => { const age = Date.now() - e.ms; return p === "all" ? true : p === "old" ? age > 30 * DAY : age <= (p === "1d" ? 1 : p === "7d" ? 7 : 30) * DAY; };
const P_LABEL = { all: "전체 기간", "1d": "24시간", "7d": "최근 7일", "30d": "최근 30일", old: "30일 이전" };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const cname = (c) => GEO_COUNTRY[c]?.[0] || c || "국가 미상";
const cen = (c) => GEO_COUNTRY[c]?.[1] || c || "Unknown";
const rel = (ms) => { const h = (Date.now() - ms) / 3600e3; return h < 1 ? "방금" : h < 24 ? `${Math.floor(h)}시간 전` : `${Math.floor(h / 24)}일 전`; };
const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(5, 16).replace("-", "/").replace("T", " ");
const km = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const evMs = (e) => e.at_ms || Date.parse(String(e.at || "").replace(" ", "T") + (String(e.at || "").length <= 10 ? "T00:00:00+09:00" : "+09:00")) || 0;

// 사업 위치: 직접 넣은 좌표 → 사업명 속 도시 → 수원국 중심(여러 사업이면 조금씩 비켜서)
export function projectPoint(p, i = 0) {
  if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) return { ll: [p.lat, p.lng], how: "좌표", en: `${p.site_en || p.lat.toFixed(2) + ", " + p.lng.toFixed(2)}, ${cen(p.country)}` };
  const city = Object.keys(GEO_CITY).find((k) => String(p.name || "").includes(k) || (GEO_CITY[k][3] && String(p.name || "").includes(GEO_CITY[k][3])));
  if (city) return { ll: GEO_CITY[city].slice(0, 2), how: city, en: `${GEO_CITY[city][2]}, ${cen(p.country)}` };
  const c = GEO_COUNTRY[p.country];
  if (!c) return null;
  const a = i * 2.4; // 같은 나라 사업끼리 겹치지 않게
  return { ll: [c[2] + (i ? Math.sin(a) * 0.9 : 0), c[3] + (i ? Math.cos(a) * 0.9 : 0)], how: "국가 중심", en: `${c[1]} (country center)` };
}

// 사업지 여행경보 판단에 쓰는 정보: 핀·도시로 위치를 아는지, 사업명·지도 이름, 직접 고른 단계
export const siteOpt = (p, pt) => ({ exact: !!pt && pt.how !== "국가 중심", text: `${p.name || ""} ${p.site_en || ""}`, manual: Number.isFinite(p.alert_lv) ? p.alert_lv : null });

// ---------- 데이터 ----------
function geoDoc() { return ctx.state.geo || {}; }
// 특별여행주의보: 새 방식으로 읽은 것(special_partial 이 적힌 것)만 인정. 예전 저장본은 응답에 든 모든 나라를 발령 중으로 적어 둬서 믿지 않음
const isSpecial = (a) => !!(a && a.special && a.special_partial !== undefined);
function allEvents() {
  const stored = (geoDoc().events || []).filter((e) => e.type !== "quake" || !e.mag || e.mag >= QUAKE_MIN).map((e) => ({ ...e, ms: evMs(e) }));
  const out = [...stored];
  const have = new Set(stored.map((e) => e.id));
  for (const q of live.quakes || []) if (!have.has(q.id)) out.push(q);
  const rv = ctx.geoReviews ? ctx.geoReviews() : {};
  return out.filter((e) => e.ms && GEO_TYPES[e.type] && rv[e.id]?.s !== "no").map((e) => (rv[e.id]?.s === "ok" ? { ...e, rv: rv[e.id] } : e)).sort((a, b) => b.ms - a.ms);
}
// USGS 실시간 지진 (규모 4.5 이상, 최근 7일): 사업 위치·수원국에서 600km 안만
async function loadLiveQuakes(force) { // 돌려주는 값: 지진 목록이 달라졌는지 (같으면 화면을 다시 그릴 필요 없음)
  if (live.loading || (!force && live.at && Date.now() - live.at < 10 * 60e3)) return false;
  live.loading = true;
  const before = (live.quakes || []).map((q) => q.id).join(",");
  try {
    const r = await fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json(), pts = targets();
    live.quakes = (j.features || []).map((f) => {
      const [lng, lat] = f.geometry?.coordinates || [], p = f.properties || {};
      const near = pts.map((t) => ({ t, d: km([lat, lng], t.ll) })).sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > 600 || !(p.mag >= QUAKE_MIN)) return null;
      return { id: "usgs-" + f.id, type: "quake", mag: p.mag, title: `규모 ${(+p.mag).toFixed(1)} 지진 · ${p.place || ""}`, url: p.url, lat, lng, country: near.t.country, ms: p.time, at_ms: p.time, source: "USGS (실시간)", dist_km: Math.round(near.d), depth: f.geometry?.coordinates?.[2] };
    }).filter(Boolean);
    live.at = Date.now(); live.err = null;
  } catch (e) { live.err = String(e.message || e); live.quakes = live.quakes || []; live.at = Date.now(); } // 막혀 있으면(회사망 등) 10분 뒤에 다시: 실패할 때마다 바로 다시 받으면 화면을 끝없이 다시 그림
  live.loading = false;
  return (live.quakes || []).map((q) => q.id).join(",") !== before;
}
function targets() {
  const out = [], seen = new Set();
  const byC = {};
  const projs = ctx.state.projects.filter((p) => p.status !== "done");
  projs.forEach((p) => { const i = (byC[p.country] = (byC[p.country] ?? -1) + 1); const pt = projectPoint(p, i); if (pt) out.push({ ll: pt.ll, country: p.country }); });
  projs.forEach((p) => { const c = GEO_COUNTRY[p.country]; if (c && !seen.has(p.country)) { seen.add(p.country); out.push({ ll: [c[2], c[3]], country: p.country }); } });
  return out;
}

// 여행경보 지역 대략 범위: 외교부 문구에 이 단어가 있으면 [위도, 경도, 반경 km] 원 안을 그 지역으로 봄 (자동 판단용 근사)
// 국경 몇 km 처럼 원으로 그리기 어려운 지역은 사업 수정 창에서 직접 고름 (projects.alert_lv)
export const GEO_ZONES = {
  LA: { 골든트라이앵글: [[20.36, 100.08, 25]] },
  TZ: { 음트와라: [[-10.7, 39.3, 110]] },
  PK: { 발루치스탄: [[28.3, 65.6, 380]] },
  KE: { 만데라: [[3.5, 40.6, 110]], 와지르: [[1.75, 40.06, 140]], 가리사: [[-0.45, 39.65, 140]], 라무: [[-2.1, 40.8, 80]], 이스트레이: [[-1.275, 36.85, 3]] },
  ID: { 파푸아: [[-4.3, 138.0, 500], [-1.5, 132.5, 250]], 말루쿠: [[-3.2, 129.5, 320]], 아체: [[4.4, 96.9, 180]] },
  KH: { 시하누크빌: [[10.63, 103.52, 20]], 보코산: [[10.62, 104.02, 15]], 바벳: [[11.07, 106.15, 12]], 포이펫: [[13.66, 102.56, 12]] },
  BD: { "치타공 힐": [[22.6, 92.2, 90]] },
  PH: { 잠보앙가: [[7.2, 122.2, 70]], 술루: [[6.0, 121.0, 70]], 바실란: [[6.55, 122.0, 35]], 타위타위: [[5.2, 120.0, 80]] },
  ET: { 암하라: [[11.6, 38.0, 280]], 티그라이: [[13.9, 38.9, 170]], 소말리: [[7.0, 44.0, 380]], 베니샹굴: [[10.6, 35.4, 170]], 감벨라: [[7.8, 34.5, 120]] },
  RW: { 루바부: [[-1.7, 29.4, 30]] },
  MZ: { 카보델가도: [[-12.3, 39.6, 190]] },
  CM: { 노르드: [[8.6, 13.7, 180]], 아다모와: [[7.0, 13.3, 170]], 북서부: [[6.2, 10.3, 90]], 남서부: [[5.0, 9.4, 100]], 최북부: [[11.0, 14.5, 140]] },
  GE: { "남 오세티아": [[42.3, 44.0, 45]], 압하지아: [[43.1, 41.0, 80]] },
  EC: { 과야스: [[-2.0, -79.9, 90]], 아수아이: [[-3.0, -79.1, 70]], 로스리오스: [[-1.5, -79.5, 70]], 산타엘레나: [[-2.2, -80.6, 40]], 엘오로: [[-3.5, -79.8, 55]], 마니비: [[-0.9, -80.2, 100]], 에스메랄다: [[0.6, -79.4, 100]] },
};
// 예전 저장본(zones 없음)도 읽히게: 나머지 지역 단계(base)와 지역 목록
function alertZones(a) {
  if (!a) return { base: 0, zones: [] };
  const zones = Array.isArray(a.zones) ? a.zones : [];
  const base = Number.isFinite(a.base) ? a.base : a.partial ? Math.max(1, Math.min(2, (a.level || 1) - 1)) : a.level || 0; // 예전 저장본: 다음 수집 때 지역별로 바뀜
  return { base, zones };
}
const short = (t, n = 40) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
// 사업지에 해당하는 여행경보 단계
//  manual: 사업 수정 창에서 고른 단계(projects.alert_lv) / exact: 핀·도시로 사업지 위치를 앎 / text: 사업명·지도 이름
//  나라 안 일부 지역만 높은 단계면, 사업지가 그 지역에 들 때만 그 단계 (아니면 '나머지 지역' 단계 + 참고로 표시)
export function siteAlert(a, { ll = null, exact = false, text = "", manual = null, country = "" } = {}) {
  if (!a) return { lv: 0, how: "none", refs: [] };
  const { base, zones } = alertZones(a);
  const hi = zones.filter((z) => z.lv > base && !z.rest);
  if (Number.isFinite(manual) && manual > 0) {
    const z = zones.find((x) => x.lv === manual && !x.rest);
    return { lv: manual, how: "manual", zone: z?.text || "", refs: hi.filter((x) => x.lv > manual).map((x) => x.text) };
  }
  // 지역 문구 속 이름 → 원(대략 범위): 표(GEO_ZONES) + 문구에 나오는 주요 도시(GEO_CITY, 반경 30km)
  const table = GEO_ZONES[country] || {}, tx = String(text || "");
  const inZone = (z) => {
    const keys = Object.keys(table).filter((k) => String(z.text).includes(k)).map((k) => [k, table[k]]);
    // 도시 이름이 문구에 있어도 '나이로비 이스트레이 지역'처럼 도시 안의 한 구역만 가리키면 도시 전체로 보지 않음
    //  (2026-11-24: 나이로비 사업이 모두 3단계로 잡힌 문제 · 그 구역은 표의 작은 원으로만 판단)
    const partOf = (k, v) => keys.some(([, cs]) => cs.some(([la, ln, r]) => r < 30 && km([v[0], v[1]], [la, ln]) <= 30))
      || new RegExp(k + "\\s+(?!시(?![가-힣])|시내|전역|전체|일대|일원|지역|주변|인근|및|등(?![가-힣]))[가-힣A-Za-z]{2,}").test(String(z.text));
    Object.entries(GEO_CITY).forEach(([k, v]) => { if ((String(z.text).includes(k) || String(z.text).includes(v[2])) && !partOf(k, v)) keys.push([k, [[v[0], v[1], 30]]]); });
    return keys.some(([k, cs]) => tx.includes(k) || (exact && ll && cs.some(([la, ln, r]) => km(ll, [la, ln]) <= r)));
  };
  const hit = zones.filter((z) => !z.rest && z.lv !== base && inZone(z));
  const up = hit.filter((z) => z.lv > base).sort((x, y) => y.lv - x.lv)[0], down = hit.filter((z) => z.lv < base).sort((x, y) => x.lv - y.lv)[0];
  const z = up || down, lv = z ? z.lv : base;
  return { lv, how: exact || z ? "auto" : "base", zone: z?.text || "", refs: hi.filter((x) => x.lv > lv).map((x) => x.text) };
}
// 여행경보로 보는 등급 (사업지 단계 기준): 4·3단계 경고, 2단계 주의
// 특별여행주의보: 전 지역이면 경고, 일부 지역이면 주의 (사업지가 그 지역인지는 직접 확인)
function alertRisk(a, sa) {
  if (!a) return { lv: "none", why: [] };
  const zoneTxt = sa.zone ? ` (${short(sa.zone, 30)})` : sa.how === "base" && sa.refs.length ? " (나머지 지역 기준)" : "";
  const name = sa.lv ? `여행경보 ${ALERT[sa.lv][0]} ${ALERT[sa.lv][1]}${zoneTxt}` : "";
  if (isSpecial(a)) {
    const all = a.special_partial === undefined ? (!a.special_text || /전\s*지역|전역|전체/.test(a.special_text)) : !a.special_partial; // 수집 때 정한 일부 지역 여부를 먼저 씀
    return { lv: all ? "red" : "orange", why: [`특별여행주의보${a.special_text ? ` (${short(a.special_text, 30)})` : ""}${all ? "" : " 일부 지역"}`] };
  }
  if (sa.lv >= 3) return { lv: "red", why: [name] };
  if (sa.lv === 2) return { lv: "orange", why: [name] };
  return { lv: "none", why: [] };
}
// 사업지 예상 진도 (수정 메르칼리 진도 1~12, 기상청 진도와 같은 단계)
// USGS 가 쓰는 진도 예측식 Atkinson & Wald (2007): 규모 M, 진앙까지 거리 km, 진원 깊이 km
export function siteMMI(mag, dKm, depth = 10) {
  const R = Math.hypot(dKm, depth ?? 10, 14), lr = Math.log10(R), m = mag - 6;
  const v = 12.27 + 2.27 * m + 0.1304 * m * m - 1.30 * lr - 0.000707 * R + 1.95 * (R > 30 ? Math.log10(R / 30) : 0) - 0.577 * mag * lr;
  return Math.max(1, Math.min(12, v));
}
// 사업지 등급 = 여행경보 + 사업지 둘레 사건 (GEO_RULES). 이유는 높은 등급부터
// 다른 나라에서 난 사건은 거리가 가까워도 이 사업에 잇지 않음(2026-11-25 사용자 결정): 사람이 일으킨 사건(분쟁·테러·시위·정치·감염병)만 해당
// 예외 = 제목·요약에 이 나라 이름이 같이 나오는 분쟁·테러(두 나라 사이의 전쟁·국경 충돌). 지진·태풍·홍수·화산·산불은 국경과 무관하게 거리로 봄
const BORDER_TYPES = ["war", "terror", "unrest", "politics", "disease"];
const namesCountry = (e, c) => { const t = `${e.title || ""} ${e.title_en || ""} ${e.note || ""}`.toLowerCase(); return [cname(c), cen(c)].some((n) => n && n !== c && t.includes(String(n).toLowerCase())); };
export const concerns = (e, country) => !country || !e.country || e.country === country || !BORDER_TYPES.includes(e.type) || ((e.type === "war" || e.type === "terror") && namesCountry(e, country));
export function siteRisk(pt, country, evs, alerts, opt = {}) {
  const a = alerts[country] || null, sa = siteAlert(a, { ll: pt, country, ...opt }), base = alertRisk(a, sa);
  let lv = base.lv; const why = base.lv === "red" ? [...base.why] : [], warn = base.lv === "orange" ? [...base.why] : [];
  if (pt) for (const r of GEO_RULES) {
    const hit = evs.filter((e) => r.types.includes(e.type) && Number.isFinite(e.lat) && Date.now() - e.ms <= r.days * DAY && (!r.mmi || e.mag) && concerns(e, country)
        && (r.gdacs ? e.gdacs === r.gdacs : true) && (r.who ? e.source === "WHO" && e.country === country : !e.country_level))
      .map((e) => { const d = km(pt, [e.lat, e.lng]); return { e, d, mmi: r.mmi ? Math.round(siteMMI(+e.mag, d, e.depth)) : 0 }; })
      .filter((x) => (r.country ? true : r.mmi ? x.mmi >= r.mmi : x.d <= r.km)).sort((x, y) => y.mmi - x.mmi || x.d - y.d)[0];
    if (!hit) continue;
    const t = r.country ? `${hit.e.title.replace(/^WHO 발표 · /, "WHO 발표: ").slice(0, 70)} (${rel(hit.e.ms)})`
      : `${hit.e.gdacs ? `GDACS ${hit.e.gdacs === "Red" ? "빨강" : "주황"} · ` : ""}${GEO_TYPES[hit.e.type][0]}${hit.e.mag ? ` M${(+hit.e.mag).toFixed(1)}` : ""}, 사업지 ${fmtKm(hit.d)}${hit.mmi ? `, 예상 진도 ${hit.mmi}` : ""} (${rel(hit.e.ms)})`;
    if (r.lv === "red") { lv = "red"; if (!why.includes(t)) why.push(t); }
    else { if (lv === "none") lv = "orange"; if (!warn.includes(t) && !why.includes(t)) warn.push(t); }
  }
  return { lv, why: [...why, ...warn], alert: a, site: sa };
}
const worse = (x, y) => (LV[y.lv] > LV[x.lv] ? y : x);
// 보고서용: 사업 하나의 수원국 등급과 근거 (지도 화면과 같은 기준)
export function projectGeoRisk(p) {
  if (!ctx || !p?.country) return null;
  const pt = projectPoint(p, 0), r = siteRisk(pt?.ll, p.country, allEvents(), geoDoc().alerts || {}, siteOpt(p, pt));
  const sa = r.site || {};
  return { lv: r.lv, alert: sa.lv ? `여행경보 ${ALERT[sa.lv][0]}` : "", why: r.why.filter((w) => !/^(여행경보|특별여행주의보)/.test(w)) };
}

// ---------- 화면 ----------
export function initGeo(c) { ctx = c; }
// 지도 라이브러리(Leaflet · topojson)는 수원국 화면이나 사업지 지도를 처음 열 때만 받음 (첫 화면을 가볍게)
let libs = null;
export function ensureGeoLibs() {
  if (window.L && window.topojson) return Promise.resolve(true);
  const load = (u) => new Promise((ok, no) => { const el = document.createElement("script"); el.src = u; el.onload = ok; el.onerror = no; document.head.appendChild(el); });
  libs = libs || load("https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js")
    .then(() => load("https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js"))
    .then(() => true, () => { libs = null; return false; });
  return libs;
}
export async function renderGeo(opt = {}) {
  if (!(window.L && window.topojson)) await ensureGeoLibs();
  const { state, esc, info } = ctx;
  const scope = ctx.getScope(), ps = scope === "mine" ? state.projects.filter(ctx.isMine) : state.projects.filter((p) => p.status !== "done"); // 완료한 사업은 뺌
  const g = geoDoc(), alerts = g.alerts || {};
  const evsAll = allEvents();
  const codes = [...new Set(ps.map((p) => p.country).filter(Boolean))];
  // 사업지마다 등급을 정하고, 나라 등급은 그 나라 사업 가운데 가장 높은 등급
  const byC0 = {};
  const pins = ps.map((p) => { const i = (byC0[p.country] = (byC0[p.country] ?? -1) + 1); const pt = projectPoint(p, i); return { p, pt, r: siteRisk(pt?.ll, p.country, evsAll, alerts, siteOpt(p, pt)) }; });
  const risk = {};
  codes.forEach((c) => {
    const rs = pins.filter((x) => x.p.country === c).map((x) => x.r);
    const top = rs.reduce(worse, { lv: "none", why: [], alert: alerts[c] || null });
    risk[c] = { lv: top.lv, why: [...new Set(rs.flatMap((r) => r.why))], alert: alerts[c] || null };
  });
  const inScope = groupEvents(evsAll.filter((e) => codes.includes(e.country))); // 화면(목록·건수·지도)에서는 같은 사건을 다룬 기사를 하나로. 등급 계산은 위에서 원래 목록(evsAll)으로 이미 끝남
  const pCounts = Object.fromEntries(PERIODS.map(([k]) => [k, inScope.filter((e) => inP(e, k)).length]));
  if (!pCounts.hasOwnProperty(ui.period)) ui.period = "7d";
  const evs = inScope.filter((e) => inP(e, ui.period)), pl = P_LABEL[ui.period];

  // 최근 7일 달라진 것: 새 사건이 있는 나라 · 여행경보가 바뀐 나라 (등급 계산과는 무관, 무엇을 먼저 보여 줄지에만 씀)
  const newN = {}; inScope.filter((e) => inP(e, "7d")).forEach((e) => (newN[e.country] = (newN[e.country] || 0) + 1));
  const chg = {}; (g.alert_log || []).filter((x) => Date.now() - x.at_ms <= 7 * DAY && codes.includes(x.c)).forEach((x) => (chg[x.c] = chg[x.c] || []).push(x));
  const moved = (c) => !!(newN[c] || chg[c]);
  const chgText = (x) => x.k === "special" ? `특별여행주의보 ${x.to ? "발령" : "해제"}` : `${x.k === "level" ? "일부 지역 " : ""}여행경보 ${x.from ? x.from + "단계" : "없음"} → ${x.to ? x.to + "단계" : "없음"}`;

  // 제목
  const now = new Date(Date.now() + 9 * 3600e3);
  $("#geoDate").textContent = `COUNTRY RISK · ${now.toISOString().slice(0, 10).replace(/-/g, ".")} (${"일월화수목금토"[now.getUTCDay()]})`;
  $("#geoSub").textContent = g.updated_at ? `마지막 갱신 ${String(g.updated_at).slice(5, 16).replace("-", "/")}` : "아직 저장된 수원국 정보가 없습니다";
  const mineN = state.projects.filter(ctx.isMine).length;
  $("#geoScope").innerHTML = [["mine", ctx.mineLabel(), mineN, ctx.ICON_USER], ["all", "EDCF 전체", state.projects.filter((p) => p.status !== "done").length, ctx.ICON_ORG]]
    .map(([k, l, n, ic]) => `<button data-s="${k}" class="sc-btn ${k} ${k === scope ? "active" : ""}" title="${l}: 사업 ${n}개"><span class="sc-ic">${ic}</span>${l}<span class="sc-n">사업 ${n}</span></button>`).join("");
  $$("#geoScope button").forEach((b) => b.onclick = () => { ctx.setScope(b.dataset.s); renderGeo(); });
  const aOk = Object.keys(alerts).length; // 연결 상태는 설정 > 고급 > API 연결에서

  // 왼쪽: 수원국 등급
  const byLv = { red: [], orange: [], none: [] };
  codes.forEach((c) => byLv[risk[c].lv].push(c));
  Object.values(byLv).forEach((l) => l.sort((a, b) => moved(b) - moved(a) || cname(a).localeCompare(cname(b), "ko"))); // 달라진 나라 먼저
  const tip = `<div class="tip-p">사업지마다 정하고, 나라는 그 가운데 가장 높은 등급입니다.</div>
    <div class="tip-grid lv"><span class="badge red">경고</span><span>여행경보 3·4단계 · 진도 6 이상 지진 · 50km 안 테러·분쟁</span>
    <span class="badge orange">주의</span><span>여행경보 2단계 · 진도 5 지진 · 200km 안 테러·분쟁 · 100km 안 재난 · 50km 안 시위·감염병</span>
    <span class="badge none">정상</span><span>그 밖</span></div>`;
  $("#gboard").innerHTML = `<div class="card-head"><h2>수원국 등급 ${info(tip)}</h2></div>`
    + ["red", "orange", "none"].map((lv) => {
      const l = byLv[lv];
      const names = l.length ? cname(l[0]) + (l.length > 1 ? ` 외 ${l.length - 1}` : "") : "해당 국가 없음"; // 업체 화면과 같은 표기 (한 곳 + 외 N)
      return `<button class="rk ${lv} ${l.length ? "on" : ""} ${ui.lv === lv ? "sel" : ""}" data-glv="${lv}" ${l.length ? "" : "disabled"}>
        <div class="rk-num"><span>${l.length}</span></div>
        <div class="rk-lv">${LEVEL[lv]}</div>
        <div class="rk-names ${l.length ? "" : "zero"}">${esc(names)}</div></button>`;
    }).join("");
  $$("#gboard [data-glv]:not(:disabled)").forEach((b) => b.onclick = () => openGeoList(b.dataset.glv)); // 업체 리스크의 등급별 업체 목록과 같은 방식: 오른쪽 창에 나라별 내용

  // 왼쪽 아래: 이벤트 종류별 건수 (누르면 지도·목록 거르기)
  const tc = {}; evs.forEach((e) => (tc[e.type] = (tc[e.type] || 0) + 1));
  $("#evSummary").innerHTML = `<div class="card-head"><h2>이벤트 요약 ${info(`<div class="tip-p">수원국 안팎의 최근 사건입니다. 종류를 누르면 그것만 봅니다.</div><div class="tip-grid"><b>지진</b><span>USGS 규모 5.5 이상</span><b>재난</b><span>GDACS 주황·빨강 경보</span><b>감염병</b><span>WHO 발생 소식</span><b>그 밖</b><span>뉴스에서 찾아 AI가 판정</span></div><div class="tip-p muted">정치·선거는 참고용이라 등급에서 뺍니다.</div>`)}</h2><span class="muted small">${pl}</span></div>
    <div class="ev-grid"><button class="ev-chip all on ${ui.type ? "" : "sel"}" data-et=""><span class="lb">전체</span><b>${Object.values(tc).reduce((x, y) => x + y, 0)}</b></button>${Object.entries(GEO_GROUPS).map(([k, [label, types]]) => { const n = types.reduce((x, t) => x + (tc[t] || 0), 0); return `<button class="ev-chip ${n ? "on" : ""} ${ui.type === k ? "sel" : ""}" data-et="${k}" ${n ? "" : "disabled"}>${ibadge(k, "sm")}<span class="lb">${label}</span><b>${n}</b></button>`; }).join("")}</div>`;
  $$("#evSummary [data-et]:not(:disabled)").forEach((b) => b.onclick = () => { ui.type = !b.dataset.et || ui.type === b.dataset.et ? null : b.dataset.et; renderGeo(); });

  // 오른쪽: 나라별 묶음 + 그 아래 사업. 달라진 나라(새 사건·여행경보 변경)를 위에, 나머지는 '변동 없음'에 한 줄씩
  const own = (r) => r.why.filter((w) => !/^(여행경보|특별여행주의보)/.test(w)); // 여행경보는 칩과 같은 말이라 근거에서는 뺌
  const cOrder = [...codes].sort((a, b) => LV[risk[b].lv] - LV[risk[a].lv] || moved(b) - moved(a) || (newN[b] || 0) - (newN[a] || 0) || cname(a).localeCompare(cname(b), "ko"));
  pins.sort((a, b) => cOrder.indexOf(a.p.country) - cOrder.indexOf(b.p.country) || LV[b.r.lv] - LV[a.r.lv] || own(b.r).length - own(a.r).length || a.p.name.localeCompare(b.p.name, "ko"));
  $("#geoProjTitle").textContent = scope === "mine" ? ctx.mineLabel() : "전체 사업";
  $("#geoProjN").textContent = ps.length;
  if (ui.focus && !pins.some((x) => x.p.id === ui.focus)) ui.focus = null;
  const focusC = ui.focus ? pins.find((x) => x.p.id === ui.focus).p.country : null;
  const HOW = { manual: "직접 지정", auto: "사업지 위치로 판단", base: "사업지 위치 미상: 나머지 지역 기준" };
  const siteChip = (sa) => sa?.lv ? `<span class="alert-chip ${ALERT[sa.lv][2]}">${ALERT[sa.lv][0]} ${ALERT[sa.lv][1]}</span>` : "";
  const pShort = (p) => String(p.name || "").replace(new RegExp("^" + cname(p.country) + "\\s*"), "");
  // 고른 사업의 자세한 내용 (예전 사업 카드의 펼친 모양 그대로)
  const detail = ({ p, pt, r }) => {
    const a = r.alert, sa = r.site || { lv: 0, refs: [] }, co = ctx.companyTally(p.id), whyEv = own(r);
    const near = nearEvents(pt, evs, p.country).filter((e, i, l) => l.findIndex((x) => x.title === e.title) === i).slice(0, 6); // 같은 제목은 한 번만
    const alertHtml = a?.level || isSpecial(a) ? `${siteChip(sa)}${isSpecial(a) ? `<span class="alert-chip sp">특별여행주의보</span>` : ""}${sa.refs.length ? `<span class="muted small" title="${esc(sa.refs.join(" / "))}">일부 지역은 더 높음</span>` : ""}`
      : aOk ? `<span class="alert-chip a0">여행경보 없음</span>` : `<span class="muted small">여행경보 연결 전</span>`;
    return `<div class="gc-d"><div class="gp-row"><span class="gp-k">사업지</span><span>${esc(cname(p.country))}${pt ? ` <span class="gp-en">${esc(pt.en)}</span>` : ` <span class="muted small">· 위치 미상</span>`}</span></div>
      <div class="gp-row"><span class="gp-k">여행경보</span><span class="gp-alert">${alertHtml}</span></div>
      ${a?.level && a.partial ? `<div class="gp-reg">${esc(HOW[sa.how] || "")}${sa.zone ? `: ${esc(short(sa.zone, 60))}` : ""}${sa.refs.length ? `<br>참고 (등급에 안 넣음): ${esc(alertZones(a).zones.filter((z) => sa.refs.includes(z.text)).map((z) => `${z.lv}단계 ${short(z.text, 50)}`).join(" / "))}${sa.how === "base" ? " · 사업지가 이 지역이면 사업 수정 창에서 고르세요" : ""}` : ""}</div>` : ""}
      ${whyEv.length ? `<div class="gp-row"><span class="gp-k">근거</span><span class="gp-why">${whyEv.slice(0, 4).map((w) => `<span>${esc(w)}</span>`).join("")}</span></div>` : ""}
      <div class="gp-row"><span class="gp-k">가까운 사건</span><span class="gp-evs">${near.length ? near.map((e) => `<span class="gp-ev" title="${esc(e.title)}">${ibadge(e.type, "xs")}<span class="gp-ev-t">${esc(e.title)}</span>${e.d != null && !e.country_level ? `<b class="gp-km">${fmtKm(e.d)}</b>` : ""}</span>`).join("") : `<span class="muted small">${pl} · ${NEAR_KM}km 안 없음</span>`}</span></div>
      <div class="gp-row"><span class="gp-k">참여 업체</span><span class="pj-sum gp-cos">${co.total ? ((co.list || []).map((x) => `<button type="button" class="gp-co-b ${x.lv}" data-co="${x.id}" title="${LEVEL[x.lv]} · 누르면 업체 상세">${esc(x.name)}</button>`).join("") || `<span class="ok">이상 없음</span>`) + `<span class="tot">/ ${co.total}</span>` : `<span class="tot">연결된 업체 없음</span>`}</span></div></div>`;
  };
  const pRow = (x, same) => { const { p, r } = x, sel = ui.focus === p.id, w = own(r), co = ctx.companyTally(p.id);
    return `<div class="gc-p ${sel ? "sel" : ""}" data-gpid="${p.id}" role="button" tabindex="0"><div class="gc-pt"><span class="gp-no ${r.lv}">${pins.indexOf(x) + 1}</span><span class="pj-name" title="${esc(p.name)}">${esc(pShort(p))}</span>${same ? "" : siteChip(r.site)}${!sel && w.length ? `<span class="gc-why" title="${esc(w.join(" / "))}">${esc(w[0])}</span>` : ""}${!sel && (co.red || co.orange) ? `<span class="gp-co pj-sum">업체 ${["red", "orange"].filter((lv) => co[lv]).map((lv) => `<span class="${lv}">${LEVEL[lv]} ${co[lv]}</span>`).join("")}</span>` : ""}</div>${sel ? detail(x) : ""}</div>`; };
  const cCard = (c, mv) => {
    const xs = pins.filter((x) => x.p.country === c), a = risk[c].alert, same = new Set(xs.map((x) => x.r.site?.lv || 0)).size === 1;
    const open = ui.openC === c || focusC === c;
    const show = open ? xs : [];
    const chips = `${same ? siteChip(xs[0].r.site) || (aOk ? "" : "") : ""}${isSpecial(a) ? `<span class="alert-chip sp">특별여행주의보</span>` : ""}`;
    return `<div class="gc ${risk[c].lv} ${mv ? "" : "still"} ${open ? "open" : ""}">
      <div class="gc-h" data-gc="${c}" role="button" tabindex="0"><b class="gc-n">${esc(cname(c))}</b>${chips}${newN[c] ? `<span class="gc-new">새 사건 ${newN[c]}</span>` : ""}${(chg[c] || []).map((x) => `<span class="gc-new" title="${ymd(x.at_ms)}">${esc(chgText(x))}</span>`).join("")}<span class="gc-cnt">사업 ${xs.length}</span><span class="badge ${risk[c].lv}">${LEVEL[risk[c].lv]}</span></div>
      ${show.length ? `<div class="gc-ps">${show.map((x) => pRow(x, same)).join("")}</div>` : ""}</div>`;
  };
  const mvC = cOrder.filter(moved), stC = cOrder.filter((c) => !moved(c));
  $("#geoProjects").innerHTML = (mvC.map((c) => cCard(c, true)).join("") + (stC.length ? `<div class="gc-sec">변동 없음 ${stC.length}</div>` + stC.map((c) => cCard(c, false)).join("") : ""))
    || `<div class="empty small">${scope === "mine" ? "우리 팀 사업이 없습니다." : "등록된 사업이 없습니다."}</div>`;
  $$("#geoProjects [data-co]").forEach((el) => el.onclick = (e) => { e.stopPropagation(); ctx.openCompany?.(el.dataset.co); });
  $$("#geoProjects [data-gc]").forEach((el) => { const go = () => { const c = el.dataset.gc; ui.openC = ui.openC === c ? null : c; const drop = !!focusC; if (drop) ui.focus = null; renderGeo({ listOnly: !drop }); setTimeout(() => (ui.openC === c ? goCountry(c) : goWorld()), drop ? 60 : 0); }; el.onclick = go; el.onkeydown = (e) => { if (e.key === "Enter") go(); }; });

  // 아래: 최근 이벤트 목록
  const shown = evs.filter((e) => inGroup(e, ui.type)).filter((e) => !ui.lv || risk[e.country]?.lv === ui.lv);
  const canRv = !!(ctx.canReview && ctx.canReview());
  $("#evSeg").innerHTML = PERIODS.map(([k, l]) => `<button data-p="${k}" class="${k === ui.period ? "active" : ""}">${l} <span class="n">${pCounts[k]}</span></button>`).join("");
  $$("#evSeg button").forEach((b) => b.onclick = () => { ui.period = b.dataset.p; try { localStorage.setItem("edcf_geo_period3", ui.period); } catch {} renderGeo(); });
  $("#evCount").textContent = shown.length;
  $("#evFeed").innerHTML = shown.slice(0, 40).map((e) => `<div class="ev-item t-${e.type}" data-eid="${esc(e.id)}">
      ${ibadge(e.type, "lg")}
      <div class="ev-body"><div class="ev-top"><span class="ev-type" style="color:${GEO_TYPES[e.type][1]}">${GEO_TYPES[e.type][0]}</span><span class="ev-ctry">${esc(cname(e.country))} · ${esc(cen(e.country))}</span>${e.mag ? `<span class="ev-mag ${e.mag >= 6 ? "big" : ""}">M${(+e.mag).toFixed(1)}</span>` : ""}<span class="ev-time" title="${ymd(e.ms)}">${rel(e.ms)}</span>${canRv ? `<span class="ev-acts">${e.rv
        ? `<span class="act-done reviewed" title="${esc([e.rv.by && "처리: " + String(e.rv.by).split("@")[0], e.rv.at && String(e.rv.at).slice(0, 16)].filter(Boolean).join(" · "))}">✓ 관련 있음</span><button type="button" class="btn sm ghost" data-evrv="">되돌리기</button>`
        : `<button type="button" class="btn sm act-ok" data-evrv="ok">✓ 관련 있음</button><button type="button" class="btn sm act-no" data-evrv="no">✕ 관련 없음</button>`}</span>` : ""}</div>
      <div class="ev-title">${esc(e.title)}</div>
      ${e.note && !sameText(e.note, e.title) ? `<div class="ev-note">${esc(e.note)}</div>` : ""}
      <div class="ev-src">${String(e.id || "").startsWith("news-") ? (e.ai ? `<span class="ev-ai" title="AI가 기사 내용을 보고 사업에 영향을 줄 수 있는 사건으로 판정">AI 판정</span> · ` : `<span class="ev-ai wait" title="단어로만 분류된 상태입니다. 다음 스캔 때 AI가 판정합니다">판정 전</span> · `) : ""}${esc(e.source || "-")} · ${ymd(e.ms)}${e.url ? ` · <a href="${esc(e.url)}" target="_blank" rel="noopener">원문 ↗</a>` : ""}${e.more?.length ? ` · <button type="button" class="ev-more" data-evmore>같은 내용 ${e.more.length}건 더</button>` : ""}</div>
      ${e.more?.length ? `<div class="ev-dup hidden">${e.more.map((m) => `<div class="ev-dup-row">${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a>` : esc(m.title)} <span>${esc(String(m.source || "").split(" · ").pop())} · ${ymd(m.ms)}</span></div>`).join("")}</div>` : ""}</div></div>`).join("")
    || `<div class="ok-box">${ui.type || ui.lv ? "이 조건에 맞는 이벤트가 없습니다" : `${pl} 수원국 이벤트가 없습니다`}</div>`;
  if (shown.length > 40) $("#evFeed").insertAdjacentHTML("beforeend", `<div class="muted small">최근 40건만 보여줍니다 (전체 ${shown.length}건)</div>`);
  // 관련 없음으로 처리한 이벤트 (접힌 칸, 되돌리기)
  const rvAll = ctx.geoReviews ? ctx.geoReviews() : {};
  const gone = Object.entries(rvAll).filter(([, v]) => v?.s === "no" && codes.includes(v.country)).sort((a, b) => String(b[1].at || "").localeCompare(String(a[1].at || ""))).slice(0, 40);
  $("#evNo")?.remove();
  if (gone.length) $("#evFeed").insertAdjacentHTML("afterend", `<details class="more ev-no" id="evNo"><summary>관련 없음 ${gone.length}</summary><div class="ev-no-l">${gone.map(([id, v]) => `<div class="ev-no-row"><span class="t">${esc(v.title || id)}</span><span class="r">${esc(cname(v.country))}${v.note ? ` · ${esc(v.note)}` : ""}</span>${canRv ? `<button type="button" class="btn sm ghost" data-evback="${esc(id)}">되돌리기</button>` : ""}</div>`).join("")}</div></details>`);
  $$("#evNo [data-evback]").forEach((b) => b.onclick = () => ctx.reviewGeoEvent([{ id: b.dataset.evback }], ""));
  $$("#evFeed [data-evrv]").forEach((b) => b.onclick = (ev) => { ev.stopPropagation(); const e = shown.find((x) => x.id === b.closest("[data-eid]").dataset.eid); if (e) ctx.reviewGeoEvent([e, ...(e.more || [])], b.dataset.evrv); });

  last = { pins, evs, risk, moved, newN, chg, chgText };
  // 전체 지도의 범위는 보는 범위(우리 팀 / EDCF 전체)와 무관하게 진행 중인 모든 사업 기준: 탭을 바꿔도 지도가 같은 자리
  const cN = {}, fitPts = state.projects.filter((p) => p.status !== "done").map((p) => projectPoint(p, (cN[p.country] = (cN[p.country] ?? -1) + 1))?.ll).filter(Boolean);
  if (!opt.listOnly) drawMap(pins, evs, risk, fitPts); // 나라 줄을 펼치고 접을 때는 목록만
  else { syncBack(); declutterSoon(); }
  // 고른 사업 카드가 목록 안에서 보이게 (페이지는 움직이지 않게 목록만 스크롤)
  const selEl = ui.focus && $(`#geoProjects [data-gpid="${ui.focus}"]`), list = $("#geoProjects");
  if (selEl) { const ra = selEl.getBoundingClientRect(), rb = list.getBoundingClientRect(); if (ra.top < rb.top || ra.bottom > rb.bottom) list.scrollTo({ top: list.scrollTop + ra.top - rb.top - 8, behavior: "smooth" }); }
  $$("#geoProjects [data-gpid]").forEach((el) => {
    const pid = el.dataset.gpid;
    el.onmouseenter = () => hiPin(pid, true); el.onmouseleave = () => hiPin(pid, false);
    el.onclick = (e) => { if (!e.target.closest(".gc-d")) setFocus(ui.focus === pid ? null : pid); }; el.onkeydown = (e) => { if (e.key === "Enter") setFocus(ui.focus === pid ? null : pid); };
  });
  $$("#evFeed [data-eid]").forEach((el) => el.onclick = (e) => { if (!e.target.closest("a, button, .ev-dup")) flyEvent(el.dataset.eid); });
  $$("#evFeed [data-evmore]").forEach((bt) => bt.onclick = () => { const d = bt.closest(".ev-body").querySelector(".ev-dup"); d.classList.toggle("hidden"); bt.classList.toggle("open", !d.classList.contains("hidden")); });

  if (!live.at && !live.loading) loadLiveQuakes().then((changed) => { if (changed && $("#view-geo").classList.contains("active")) renderGeo(); });
}

// 등급별 수원국 목록 (오른쪽 창): 나라마다 사업별 등급·근거와 최근 이벤트. 사업을 누르면 창을 닫고 지도에서 그 사업을 보여 줌
function openGeoList(lv) {
  const { esc } = ctx, { pins, evs, risk, moved, newN, chg, chgText } = last;
  const codes = Object.keys(risk).filter((c) => risk[c].lv === lv).sort((a, b) => moved(b) - moved(a) || (newN[b] || 0) - (newN[a] || 0) || cname(a).localeCompare(cname(b), "ko"));
  const mvN = codes.filter(moved).length;
  const title = `<div class="d-name"><span class="nm">${LEVEL[lv]} 수원국</span><span class="cnt">${codes.length}개국</span><span class="tag">${esc(ctx.getScope() === "mine" ? ctx.mineLabel() : "EDCF 전체")}</span></div>`;
  const chip = (sa) => sa?.lv ? `<span class="alert-chip ${ALERT[sa.lv][2]}"${sa.zone ? ` title="${esc(sa.zone)}"` : ""}>${ALERT[sa.lv][0]} ${ALERT[sa.lv][1]}</span>` : "";
  const body = codes.map((c, ci) => {
    const sec = mvN && mvN < codes.length && (ci === 0 || ci === mvN) ? `<div class="gl-sec">${ci === 0 ? `최근 7일 변동 ${mvN}` : `변동 없음 ${codes.length - mvN}`}</div>` : "";
    const ps = pins.filter((x) => x.p.country === c);
    const ev = evs.filter((e) => e.country === c).sort((a, b) => b.ms - a.ms).slice(0, 3);
    const same = new Set(ps.map((x) => x.r.site?.lv || 0)).size === 1, top = ps.map((x) => x.r.site).sort((a, b) => (b?.lv || 0) - (a?.lv || 0))[0];
    const n = { red: 0, orange: 0, none: 0 }; ps.forEach((x) => n[x.r.lv]++);
    return `${sec}<div class="gl-c go" data-glc="${c}" role="button" tabindex="0">
      <div class="gl-top"><b class="gl-name">${esc(cname(c))}</b><span class="gl-en">${esc(cen(c))}</span>${chip(same ? ps[0].r.site : top)}${isSpecial(risk[c].alert) ? `<span class="alert-chip sp">특별여행주의보</span>` : ""}${(chg[c] || []).map((x) => `<span class="gc-new">${esc(chgText(x))}</span>`).join("")}<span class="rl-arr">›</span></div>
      ${ev.length ? `<div class="gl-evs">${ev.map((e) => `<div class="gl-ev" title="${esc(e.title)}">${ibadge(e.type, "xs")}<span class="t">${esc(e.title)}</span><span class="d">${rel(e.ms)}</span></div>`).join("")}</div>` : ""}
      <div class="gl-sum"><span>사업 ${ps.length}</span>${["red", "orange", "none"].filter((k) => n[k]).map((k) => `<span class="${k}">${LEVEL[k]} ${n[k]}</span>`).join("")}</div>
    </div>`;
  }).join("") || `<div class="empty small">해당 국가가 없습니다</div>`;
  const el = ctx.openDrawer(title, `<div class="rl">${body}</div>`);
  el.querySelectorAll("[data-glc]").forEach((x) => { const go = () => { // 창을 닫고 그 나라로: 오른쪽 목록에서 펼치고 지도를 그 나라로 확대
    const c = x.dataset.glc; ctx.closeDrawer(); ui.focus = null; ui.openC = c; renderGeo();
    setTimeout(() => { goCountry(c); const row = document.querySelector(`#geoProjects [data-gc="${c}"]`), list = $("#geoProjects"); if (row && list) list.scrollTo({ top: list.scrollTop + row.getBoundingClientRect().top - list.getBoundingClientRect().top - 8, behavior: "smooth" }); }, 80);
  }; x.onclick = go; x.onkeydown = (e) => { if (e.key === "Enter") go(); }; });
}

// 사업지에서 가까운 이벤트 (거리 순). 위치를 모르면 같은 나라 이벤트
const fmtKm = (d) => d < 10 ? "10km 안" : `${Math.round(d)}km`;
const evKey = (e) => String(e.title || "").replace(new RegExp(`${cname(e.country)}|${cen(e.country)}`, "gi"), "").replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
const grams = (t) => { const g = new Set(); for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g; };
const nums = (e) => new Set(String(e.title || "").match(/\d[\d,.]*\s?(?:만\s?)?[가-힣a-zA-Z%]{1,3}/g)?.map((x) => x.replace(/\s/g, "")) || []);
// 요약이 제목을 다시 말한 것이면 제목만 보여 줌 (요약 글자 조각의 절반 이상이 제목에 있음)
const flat = (t) => String(t || "").replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
function sameText(note, title) {
  const a = grams(flat(note)), b = grams(flat(title));
  if (!a.size || !b.size) return false;
  let hit = 0; a.forEach((x) => { if (b.has(x)) hit++; });
  return hit / Math.min(a.size, b.size) >= 0.5;
}
// 자연재해·감염병은 같은 나라·같은 종류·이틀 안이면 같은 사건으로 봄 (제목이 달라도: 피해액 41조원 / 300억 달러 / 288만 헥타르)
const ONE_EVENT = new Set(["fire", "flood", "storm", "volcano", "quake", "disease"]);
function sameStory(a, b) {
  if (a.country !== b.country || a.type !== b.type || Math.abs(a.ms - b.ms) > 3 * DAY) return false;
  if (ONE_EVENT.has(a.type) && Math.abs(a.ms - b.ms) <= 2 * DAY) return true;
  const ga = a._g || (a._g = grams(evKey(a))), gb = b._g || (b._g = grams(evKey(b)));
  if (!ga.size || !gb.size) return false;
  let hit = 0; ga.forEach((x) => { if (gb.has(x)) hit++; });
  const dice = (2 * hit) / (ga.size + gb.size);
  if (dice >= 0.42) return true;
  const na = a._n || (a._n = nums(a)), nb = b._n || (b._n = nums(b));
  return dice >= 0.18 && [...na].some((x) => nb.has(x));
}
// [대표 이벤트(가장 최근) + more(같은 내용의 다른 기사)] 목록으로. 공식 자료(USGS·GDACS·WHO)는 묶지 않음
function groupEvents(list) {
  const out = [];
  [...list].sort((a, b) => b.ms - a.ms).forEach((e) => {
    const isNews = String(e.id || "").startsWith("news-");
    const root = (x) => x.same || x.id;
    const g = (e.same ? out.find((x) => root(x) === e.same || x.more.some((m) => root(m) === e.same)) : null)
      || (isNews ? out.find((x) => x.news && (root(x) === root(e) || sameStory(x, e) || x.more.some((m) => sameStory(m, e)))) : null);
    if (g) g.more.push(e); else out.push({ ...e, news: isNews, more: [] });
  });
  return out;
}
function nearEvents(pt, evs, country) {
  if (!pt) return evs.filter((e) => e.country === country);
  return evs.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng) && !e.noloc && concerns(e, country)).map((e) => ({ ...e, d: km(pt.ll, [e.lat, e.lng]) }))
    .filter((e) => e.d <= NEAR_KM).sort((a, b) => a.d - b.d);
}

// ---------- 지도 ----------
let last = null;
const pinMarkers = {}, evMarkers = {};
// 지도 바탕: 완전 플랫: 바다·육지·국경선만 (assets/world-50m.json, Natural Earth 1:50m · 저장소 안 파일이라 바깥 지도 서비스·키 없음)
// 나라 이름은 지도 위에 글자로 직접 올림(그림자 없이). 사업이 있는 나라는 등급 색으로 옅게 칠함
const isLight = () => document.documentElement.dataset.theme === "light";
// 나라 숫자 코드(ISO 3166-1) ↔ 두 글자 코드
const ISO_NUM = { TZ: "834", PK: "586", KE: "404", MN: "496", LA: "418", ID: "360", KR: "410", VN: "704", KH: "116", BD: "050", PH: "608", UZ: "860", ET: "231", GH: "288", MM: "104", LK: "144", NP: "524", RW: "646", UG: "800", TN: "788", EG: "818", BO: "068", PY: "600", CO: "170", PE: "604", EC: "218", GT: "320", SN: "686", MZ: "508", CM: "120", NG: "566", TR: "792", UA: "804", GE: "268", AZ: "031", KZ: "398", KG: "417", TJ: "762", TL: "626", HN: "340", NI: "558", SV: "222", CR: "188", PA: "591", DO: "214", BR: "076" };
const NUM_ISO = Object.fromEntries(Object.entries(ISO_NUM).map(([k, v]) => [v, k]));
// 땅 그림(캔버스)은 화면 둘레 절반까지만 그려 두고 끌기가 끝나야 다시 그려서, 멀리 끌면 땅이 잠깐 비어 보였음
// → 끄는 동안에도 화면 폭·높이의 30% 넘게 움직일 때마다 다시 그림 (지도마다 그리개 하나를 계속 씀)
function landRenderer(m) {
  if (m._landRd) return m._landRd;
  const rd = m._landRd = L.canvas({ pane: "land", padding: 0.5 });
  let last = null;
  m.on("moveend zoomend", () => { last = m.containerPointToLayerPoint([0, 0]); });
  m.on("move", () => {
    if (m._animatingZoom) return;
    const now = m.containerPointToLayerPoint([0, 0]), sz = m.getSize();
    if (!last) { last = now; return; }
    if (Math.abs(now.x - last.x) > sz.x * 0.3 || Math.abs(now.y - last.y) > sz.y * 0.3) { last = now; try { rd._update(); } catch {} }
  });
  return rd;
}
let world = null, worldWrap = null, worldLayer = null, wrapLayer = null, nameLayer = null, riskNow = {}, worldLoading = null;
let cssMemo = {}; // 색 변수는 밝기를 바꿀 때만 다시 읽음 (나라 조각마다 읽으면 느림)
const cssv = (n) => cssMemo[n] ?? (cssMemo[n] = getComputedStyle(document.documentElement).getPropertyValue(n).trim());
function loadWorld() {
  if (world || worldLoading) return worldLoading;
  worldLoading = fetch("assets/world-50m.json").then((r) => r.json()).then((t) => {
    world = window.topojson.feature(t, t.objects.countries).features.filter((f) => f.id !== "010"); // 남극은 뺌
    // 날짜변경선(경도 180도)을 넘는 땅(피지·러시아 동쪽 끝)은 테두리가 지도 전체를 가로지르는 가로줄로 그려짐 → 서쪽 조각을 동쪽으로 이어 붙임
    const unwrap = (ring) => { const xs = ring.map((p) => p[0]); if (Math.max(...xs) - Math.min(...xs) > 180) ring.forEach((p) => { if (p[0] < 0) p[0] += 360; }); };
    world.forEach((f) => { const g = f.geometry; if (!g) return; (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []).forEach((poly) => poly.forEach(unwrap)); });
    // 왼쪽·오른쪽 복사본 (태평양을 가로질러 끌어도 아시아·아메리카가 끊기지 않게). 나라 이름은 가운데 한 벌만
    // 복사본은 첫 화면을 그린 뒤 한가할 때 만들어 얹음 (처음 열 때 기다리는 시간을 줄임)
    const thin = (ring) => ring.length > 24 ? ring.filter((_, i) => i % 3 === 0 || i === ring.length - 1) : ring;
    const mv = (c, dx) => typeof c[0][0] === "number" ? thin(c).map((p) => [p[0] + dx, p[1]]) : c.map((x) => mv(x, dx));
    const shift = (f, dx) => ({ ...f, geometry: { ...f.geometry, coordinates: mv(f.geometry.coordinates, dx) } });
    if (map) { drawWorld(); worldLayer._riskKey = JSON.stringify(riskNow); declutterSoon(); }
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 900)))(() => {
      worldWrap = world.filter((f) => f.geometry).flatMap((f) => [shift(f, -360), shift(f, 360)]);
      if (map && worldLayer) drawWrap();
    }, { timeout: 3000 });
  }).catch((e) => { console.warn("world map", e); });
  return worldLoading;
}
// 두 색을 섞은 불투명 색 (육지 위에 등급 색을 옅게 · 바다 색이 비치지 않게)
const mix = (a, b, k) => { const h = (c) => { c = c.replace("#", ""); if (c.length === 3) c = [...c].map((x) => x + x).join(""); return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16)); }; try { const x = h(a), y = h(b); return "#" + x.map((v, i) => Math.round(v * k + y[i] * (1 - k)).toString(16).padStart(2, "0")).join(""); } catch { return b; } };
function landStyle(f) {
  const code = NUM_ISO[f.id], lv = riskNow[code];
  const tint = lv && lv !== "none" ? cssv(lv === "red" ? "--red" : "--orange") : null; // 정상 나라는 칠하지 않음 (초록은 바다처럼 보여서)
  const dim = lv && ui.lv && ui.lv !== lv;
  return { stroke: true, color: lv ? cssv("--map-name-2") : cssv("--map-border"), weight: lv ? 1.3 : 0.7, opacity: 1, fill: true, fillColor: tint && !dim ? mix(tint, cssv("--map-land"), isLight() ? 0.2 : 0.28) : cssv("--map-land"), fillOpacity: 1 };
}
// 나라 이름 자리: 가장 큰 덩어리의 가운데 (사업 나라는 정해 둔 중심)
function labelPoint(f) {
  const code = NUM_ISO[f.id];
  if (GEO_COUNTRY[code]) return [GEO_COUNTRY[code][2], GEO_COUNTRY[code][3]];
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const ring = polys.map((p) => p[0]).sort((x, y) => y.length - x.length)[0];
  let [x0, y0, x1, y1] = [180, 90, -180, -90];
  ring.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  return { ll: [(y0 + y1) / 2, (x0 + x1) / 2], size: (x1 - x0) * (y1 - y0) };
}
function drawWrap() {
  if (wrapLayer) map.removeLayer(wrapLayer);
  wrapLayer = worldWrap ? L.geoJSON(worldWrap, { pane: "land", renderer: landRenderer(map), style: landStyle, interactive: false }).addTo(map) : null;
}
function drawWorld() {
  if (!world || !map) return;
  if (worldLayer) map.removeLayer(worldLayer);
  if (nameLayer) map.removeLayer(nameLayer);
  worldLayer = L.geoJSON(world, { pane: "land", renderer: landRenderer(map), style: landStyle, interactive: false }).addTo(map);
  drawWrap();
  nameLayer = L.layerGroup().addTo(map);
  world.forEach((f) => {
    const code = NUM_ISO[f.id], lp = labelPoint(f), mine = !!riskNow[code];
    const ll = Array.isArray(lp) ? lp : lp.ll, size = Array.isArray(lp) ? 999 : lp.size;
    if (!mine && size < 6) return; // 아주 작은 나라 이름은 생략
    const name = GEO_COUNTRY[code]?.[1] || f.properties.name;
    const tier = mine ? "mine" : size > 400 ? "big" : size > 60 ? "mid" : "small";
    L.marker(ll, { pane: "names", interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<span class="cn ${tier}">${ctx.esc(name)}</span>`, iconSize: [0, 0] }) }).addTo(nameLayer);
  });
  // 주요 도시: 조금 확대하면(4 이상) 작은 점과 영어 이름으로. 핀·사업명과 겹치면 숨김(declutter)
  Object.values(GEO_CITY).forEach(([la, ln, en]) => L.marker([la, ln], { pane: "names", interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<span class="cn city"><i></i>${ctx.esc(en)}</span>`, iconSize: [0, 0] }) }).addTo(nameLayer));
  zoomClass();
}
function zoomClass() { // 확대할수록 작은 나라 이름까지
  const z = map.getZoom(), el = $("#geoMap");
  el.classList.toggle("z-big", z >= 2); el.classList.toggle("z-mid", z >= 4); el.classList.toggle("z-small", z >= 5.5);
  declutterSoon();
}
function applyTheme() { cssMemo = {}; if (worldLayer) worldLayer.setStyle(landStyle); if (wrapLayer) wrapLayer.setStyle(landStyle); }
function ensureMap() {
  if (map || !window.L) return !!map;
  // 휠 확대·축소를 잘게(0.25단계) 나눠 부드럽게
  map = L.map("geoMap", { worldCopyJump: true, minZoom: 2, maxZoom: 10, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, wheelDebounceTime: 20, attributionControl: false }).setView([15, 80], 3); // 지도 바탕(Natural Earth)은 공개 자료라 표기 의무 없음 · 출처는 설정 > 고급에
  map.createPane("land"); map.getPane("land").style.zIndex = 200;
  map.createPane("names"); map.getPane("names").style.zIndex = 450; map.getPane("names").style.pointerEvents = "none";
  layers = { halo: L.layerGroup().addTo(map), focus: L.layerGroup().addTo(map), ev: L.layerGroup().addTo(map), pin: L.layerGroup().addTo(map) };
  map.on("zoomend", zoomClass);
  map.on("zoomend", () => { if (mapState && (pinMode() !== map._pinMode || map._pinMode === "country")) drawPins(); }); // 확대 단계가 바뀌면 나라 핀 ↔ 사업 핀 (나라 핀은 확대할 때마다 밀어내기를 다시 계산)
  map.on("zoomend moveend", declutterSoon);
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  map._fitted = false;
  loadWorld();
  return true;
}
// 핀 그리기. 멀리서(확대 PIN_ZOOM 미만) 사업을 하나씩 찍으면 190개 가까운 핀이 겹쳐 알아볼 수 없고 무거워서, 나라마다 핀 하나(사업 수 · 나라 등급 색)로 묶음
// 확대하거나 사업을 고르면 사업 핀. 나라 핀을 누르면 그 나라로 확대 + 오른쪽 목록에서 그 나라를 펼침
const PIN_ZOOM = 4.5;
// 전체 지도로 (펼친 나라를 접었을 때)
function goWorld() {
  const pts = mapState?.fitPts?.length ? mapState.fitPts : (mapState?.pins || []).filter((x) => x.pt).map((x) => x.pt.ll);
  if (map && pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 4, duration: 0.7 });
}
// 그 나라의 사업이 모두 보이게 확대 (나라 핀이나 오른쪽 목록의 나라 줄을 눌렀을 때)
function goCountry(c) {
  if (!map) return;
  // 사업지를 아는 사업이 있으면 그 사업들이 보이게, 하나도 없으면(모두 사업지 미지정) 나라 모양 전체가 보이게
  const lls = (mapState?.pins || []).filter((x) => x.pt && x.p.country === c && x.pt.how !== "국가 중심").map((x) => x.pt.ll);
  let bb = lls.length ? L.latLngBounds(lls).pad(0.4) : null;
  if (!bb) {
    const f = (world || []).find((x) => x.id === ISO_NUM[c]), pts = [];
    const walk = (co) => (typeof co[0] === "number" ? pts.push([co[1], co[0]]) : co.forEach(walk));
    if (f?.geometry) walk(f.geometry.coordinates);
    bb = pts.length ? L.latLngBounds(pts).pad(0.05) : GEO_COUNTRY[c] ? L.latLng(GEO_COUNTRY[c][2], GEO_COUNTRY[c][3]).toBounds(900e3) : null;
  }
  if (!bb) return;
  const z = Math.min(6.5, Math.max(PIN_ZOOM, map.getBoundsZoom(bb))); // 넓은 나라도 사업 핀이 보일 만큼은 확대
  map.flyTo(bb.getCenter(), z, { duration: 0.7 });
}
let mapState = null;
const pinMode = () => (mapState?.f || map.getZoom() >= PIN_ZOOM ? "pins" : "country");
function drawPins() {
  if (!mapState || !map) return;
  const { pins, risk, f } = mapState, mode = pinMode();
  map._pinMode = mode;
  layers.pin.clearLayers();
  Object.keys(pinMarkers).forEach((k) => delete pinMarkers[k]);
  $("#geoMap").classList.toggle("far", mode === "country"); // 멀리서는 사건 아이콘을 숨김 (나라 핀과 뒤섞임 · 확대하면 보임)
  if (mode === "country") {
    const by = {};
    pins.forEach((x) => { if (x.pt) (by[x.p.country] = by[x.p.country] || []).push(x); });
    // 붙어 있는 나라의 핀이 포개지지 않게 화면에서 서로 조금씩 밀어냄 (등급 높은 핀은 덜 움직임)
    const spots = Object.entries(by).map(([c, xs]) => { const lv = risk[c]?.lv || "none"; return { c, xs, lv, r: lv === "none" ? 12 : 15, p: map.latLngToContainerPoint(GEO_COUNTRY[c] ? [GEO_COUNTRY[c][2], GEO_COUNTRY[c][3]] : xs[0].pt.ll) }; });
    for (let n = 0; n < 16; n++) spots.forEach((a, i) => spots.forEach((b, k) => {
      if (k <= i) return;
      const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, d = Math.hypot(dx, dy) || 0.01, gap = a.r + b.r + 3 - d;
      if (gap <= 0) return;
      const wa = LV[b.lv] >= LV[a.lv] ? 0.6 : 0.4, ux = dx / d, uy = dy / d;
      a.p = L.point(a.p.x - ux * gap * wa, a.p.y - uy * gap * wa); b.p = L.point(b.p.x + ux * gap * (1 - wa), b.p.y + uy * gap * (1 - wa));
    }));
    spots.forEach(({ c, xs, lv, r, p }) => {
      const ll = map.containerPointToLatLng(p);
      L.marker(ll, { icon: L.divIcon({ className: "", html: `<div class="cpin ${lv}" data-cpin="${c}"><span>${xs.length}</span></div><span class="cpn">${ctx.esc(cen(c))}</span>`, iconSize: [r * 2, r * 2], iconAnchor: [r, r], tooltipAnchor: [0, -r] }), zIndexOffset: 1000 + LV[lv] * 100 })
        .bindTooltip(`<b>${ctx.esc(cname(c))}</b> · 사업 ${xs.length} · ${LEVEL[lv]}`, { direction: "top", className: "gtip" })
        .on("click", () => {
          ui.openC = c; renderGeo({ listOnly: true });
          const el = document.querySelector(`#geoProjects [data-gc="${c}"]`), list = $("#geoProjects");
          if (el && list) list.scrollTo({ top: list.scrollTop + el.getBoundingClientRect().top - list.getBoundingClientRect().top - 8, behavior: "smooth" });
          goCountry(c);
        })
        .addTo(layers.pin);
    });
  } else {
    const short = (p) => String(p.name || "").replace(new RegExp("^" + cname(p.country) + "\\s*"), "").replace(/\s*사업$/, "");
    // 사업지를 정하지 않은 사업은 나라 가운데 둘레에 하나씩 흩어 찍혀서 바다 위에 떠 보였음(인도네시아) → 나라마다 '사업지 미지정 N' 핀 하나로 묶음. 고른 사업만 제 핀으로
    const loose = {};
    pins.forEach((x) => { if (x.pt && x.pt.how === "국가 중심" && !(f && f.p.id === x.p.id)) (loose[x.p.country] = loose[x.p.country] || []).push(x); });
    Object.entries(loose).forEach(([c, xs]) => {
      const lv = xs.reduce((m, x) => (LV[x.r.lv] > LV[m] ? x.r.lv : m), "none"), dimC = !!f;
      L.marker([GEO_COUNTRY[c][2], GEO_COUNTRY[c][3]], { icon: L.divIcon({ className: "", html: `<div class="cpin loose ${lv} ${dimC ? "dim" : ""}" data-cpin="${c}"><span>${xs.length}</span></div><span class="cpn">${ctx.esc(cen(c))}</span>`, iconSize: [30, 30], iconAnchor: [15, 15], tooltipAnchor: [0, -15] }), zIndexOffset: dimC ? 400 : 900 })
        .bindTooltip(`<b>${ctx.esc(cname(c))}</b> · 사업지 미지정 ${xs.length}`, { direction: "top", className: "gtip" })
        .on("click", () => { ui.focus = null; ui.openC = c; renderGeo(); const el = document.querySelector(`#geoProjects [data-gc="${c}"]`), list = $("#geoProjects"); if (el && list) list.scrollTo({ top: list.scrollTop + el.getBoundingClientRect().top - list.getBoundingClientRect().top - 8, behavior: "smooth" }); })
        .addTo(layers.pin);
    });
    pins.forEach(({ p, pt, r }, idx) => {
      if (!pt || (pt.how === "국가 중심" && !(f && f.p.id === p.id))) return;
      const dim = f && f.p.id !== p.id;
      const side = pins.some((o, k) => k < idx && o.pt && Math.abs(o.pt.ll[0] - pt.ll[0]) < 4 && o.pt.ll[1] > pt.ll[1] - 1 && o.pt.ll[1] - pt.ll[1] < 12) ? "l" : "r"; // 오른쪽 가까이에 다른 핀이 있으면 왼쪽에
      const lb = dim ? "" : `<span class="pin-lb ${side} ${r.lv}" style="visibility:hidden" title="${ctx.esc(p.name)}">${ctx.esc(short(p))}</span>`;
      const m = L.marker(pt.ll, { icon: L.divIcon({ className: "", html: `<div class="gpin-w"><div class="gpin ${r.lv} ${dim ? "dim" : ""} ${f && f.p.id === p.id ? "hi" : ""}" data-pin="${p.id}"><span>${idx + 1}</span></div>${lb}</div>`, iconSize: [28, 36], iconAnchor: [14, 34], tooltipAnchor: [0, -30] }), zIndexOffset: dim ? 500 : 1000 })
        .bindTooltip(`<b>${ctx.esc(p.name)}</b><br><span class="en">${ctx.esc(pt.en)}</span> · ${LEVEL[r.lv]}${r.why.length ? `<br><span class="muted">${ctx.esc(r.why.join(" / "))}</span>` : ""}`, { direction: "top", className: "gtip" })
        .on("click", () => setFocus(ui.focus === p.id ? null : p.id))
        .addTo(layers.pin);
      pinMarkers[p.id] = m;
    });
  }
  declutterSoon();
}
function drawMap(pins, evs, risk, fitPts) {
  if (!ensureMap()) { $("#geoMap").innerHTML = `<div class="empty">지도를 불러오지 못했습니다 (인터넷 연결 또는 회사망 차단 확인)</div>`; return; }
  setTimeout(() => map.invalidateSize(), 0); setTimeout(() => map.invalidateSize(), 520); // 화면 전환(뒤집기) 뒤에도 크기 맞춤
  layers.halo.clearLayers(); layers.focus.clearLayers(); layers.ev.clearLayers(); layers.pin.clearLayers();
  const f = ui.focus && pins.find((x) => x.p.id === ui.focus && x.pt);
  // 수원국: 나라를 등급 색으로 옅게 칠함 (지도 자료를 받은 뒤)
  riskNow = Object.fromEntries(Object.entries(risk).map(([c, r]) => [c, r.lv]));
  if (world && (!worldLayer || worldLayer._riskKey !== JSON.stringify(riskNow))) { drawWorld(); worldLayer._riskKey = JSON.stringify(riskNow); } // 등급이 그대로면 땅을 다시 칠하지 않음 (예전에는 누를 때마다 2천여 조각을 다시 칠했음)
  // 이벤트: 종류별 아이콘 배지
  const near = f ? nearEvents(f.pt, evs, f.p.country) : [];
  const nearIds = new Set(near.map((e) => e.id));
  evs.filter((e) => inGroup(e, ui.type)).filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng) && !e.noloc).forEach((e) => { // 위치를 모르는 사건(noloc)은 지도에 찍지 않음
    const [label, color] = GEO_TYPES[e.type], fresh = Date.now() - e.ms <= 2 * DAY, big = e.type === "quake" && (e.mag || 0) >= 6;
    const dim = (ui.lv && risk[e.country]?.lv !== ui.lv) || (f && !nearIds.has(e.id));
    const d = f ? near.find((x) => x.id === e.id)?.d : null;
    const m = L.marker([e.lat, e.lng], { icon: L.divIcon({ className: "", html: `<div class="gev ${fresh ? "fresh" : ""} ${big ? "big" : ""} ${dim ? "dim" : ""}" style="--ec:${color}">${icon(e.type)}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] }), zIndexOffset: 100 })
      .bindPopup(`<div class="gpop"><div class="gpop-h" style="color:${color}">${icon(e.type)}<b>${ctx.esc(label)}</b><span>${ctx.esc(cen(e.country))}${e.mag ? ` · M${(+e.mag).toFixed(1)}` : ""}</span></div><div class="gpop-t">${ctx.esc(e.title)}</div><div class="gpop-s">${d != null ? `<b>사업지에서 ${fmtKm(d)}</b> · ` : ""}${ctx.esc(e.source || "-")} · ${ymd(e.ms)} (${rel(e.ms)})${e.url ? ` · <a href="${ctx.esc(e.url)}" target="_blank" rel="noopener">원문 ↗</a>` : ""}</div></div>`, { maxWidth: 300 })
      .addTo(layers.ev);
    evMarkers[e.id] = m;
  });
  // 사업: 핀 (멀리서는 나라별로 묶음)
  mapState = { pins, risk, f, fitPts };
  drawPins();
  drawFocus(f, near);
  declutterSoon();
  if (f) return;
  const pts = fitPts?.length ? fitPts : pins.filter((x) => x.pt).map((x) => x.pt.ll);
  if (pts.length && (!map._fitted || ui.lv !== map._fitLv || map._fitFocus)) {
    map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: ui.lv ? 6 : 4, animate: map._fitted });
    map._fitted = true; map._fitLv = ui.lv; map._fitFocus = false;
  }
}
// 고른 사업: 100km 간격 점선 원 + 가까운 이벤트까지 선과 거리 + 지도 위 안내 상자
function drawFocus(f, near) {
  const box = $("#mapFocus"), all = $("#mapAll");
  syncBack();
  box.classList.add("hidden"); // 사업 정보는 오른쪽 카드 안에 펼쳐 보여 줌 (지도를 가리지 않게)
  if (!f) { map._focusPid = null; if (map._sweepOff) map._sweepOff(); return; }
  const c = f.pt.ll, accent = cssv("--accent-2");
  // 레이더처럼: 십자선·대각선 + 실선 원 + 한 바퀴씩 도는 빛 (업체 리스크 레이더와 같은 모양)
  const line = isLight() ? "#0E7490" : "#67E8F9", R = RINGS[RINGS.length - 1], kLng = 111.2 * Math.cos((c[0] * Math.PI) / 180);
  const at = (deg, r) => [c[0] + (Math.cos((deg * Math.PI) / 180) * r) / 111.2, c[1] + (Math.sin((deg * Math.PI) / 180) * r) / kLng];
  [0, 45, 90, 135].forEach((d) => L.polyline([at(d, R), at(d + 180, R)], { color: line, weight: d % 90 ? 0.6 : 1, opacity: d % 90 ? 0.3 : 0.5, interactive: false }).addTo(layers.focus));
  for (let d = 0; d < 360; d += 10) L.polyline([at(d, R), at(d, R * (d % 30 ? 1.02 : 1.04))], { color: line, weight: 1.2, opacity: 0.8, interactive: false }).addTo(layers.focus); // 바깥 눈금
  const sweep = L.marker(c, { interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<div class="geo-sweep"></div>`, iconSize: [0, 0] }) }).addTo(layers.focus);
  const sizeSweep = () => { const el = sweep.getElement()?.firstChild; if (!el) return; const r = Math.abs(map.latLngToLayerPoint(at(90, R)).x - map.latLngToLayerPoint(c).x); el.style.cssText = `width:${2 * r}px;height:${2 * r}px;margin:${-r}px 0 0 ${-r}px`; el.classList.remove("hide"); };
  if (map._sweepOff) map._sweepOff();
  const hideSweep = () => sweep.getElement()?.firstChild?.classList.add("hide");
  map.on("zoomstart", hideSweep); map.on("zoomend", sizeSweep);
  map._sweepOff = () => { map.off("zoomstart", hideSweep); map.off("zoomend", sizeSweep); map._sweepOff = null; };
  sizeSweep();
  RINGS.forEach((r, i) => {
    L.circle(c, { radius: r * 1000, color: line, weight: i === RINGS.length - 1 ? 2.4 : 1.2, opacity: i === RINGS.length - 1 ? 0.95 : 0.7, fill: i === RINGS.length - 1, fillColor: accent, fillOpacity: 0.05, interactive: false }).addTo(layers.focus);
    const lat = c[0] - r / 111.2; // 원의 맨 아래에 거리 글씨 (위쪽은 핀 자리)
    L.marker([lat, c[1]], { interactive: false, icon: L.divIcon({ className: "", html: `<span class="ring-lb">${r}km</span>`, iconSize: [44, 16], iconAnchor: [22, 8] }) }).addTo(layers.focus);
  });
  near.slice(0, 6).forEach((e) => {
    const color = GEO_TYPES[e.type][1];
    if (e.d < 30) return; // 사업지 바로 옆은 선 대신 안내 상자에만
    L.polyline([c, [e.lat, e.lng]], { color, weight: 1.6, opacity: 0.85, dashArray: "1 5", lineCap: "round", interactive: false }).addTo(layers.focus);
    const mid = [(c[0] + e.lat) / 2, (c[1] + e.lng) / 2];
    if (e.d < 120) return; // 가까우면 거리 글씨가 핀·사건 표시를 덮음 (거리는 오른쪽 카드에 나옴)
    L.marker(mid, { interactive: false, icon: L.divIcon({ className: "", html: `<span class="dist-lb" style="--ec:${color}">${fmtKm(e.d)}</span>`, iconSize: [60, 18], iconAnchor: [30, 9] }) }).addTo(layers.focus);
  });
  const dLat = 560 / 111.2, dLng = 560 / (111.2 * Math.cos((c[0] * Math.PI) / 180));
  if (map._focusPid !== f.p.id) map.flyToBounds([[c[0] - dLat, c[1] - dLng], [c[0] + dLat, c[1] + dLng]], { duration: 0.9 }); // 다시 그릴 때는 그대로
  map._focusPid = f.p.id;
  map._fitFocus = true;
}
// 세 단계: 전체 지도 ↔ 나라 ↔ 사업. 들어간 순서의 반대로 나옴 (사업을 닫으면 그 나라, 나라를 닫으면 전체 지도)
function setFocus(pid) {
  const pins = mapState?.pins || [], was = ui.focus && pins.find((x) => x.p.id === ui.focus), now = pid && pins.find((x) => x.p.id === pid);
  ui.focus = pid;
  if (now) ui.openC = now.p.country;
  if (!pid && was) { ui.openC = was.p.country; if (map) map._fitFocus = false; renderGeo(); goCountry(was.p.country); return; }
  renderGeo();
}
// 지도 왼쪽 위 뒤로 버튼: 사업을 골랐으면 '‹ 나라 이름'(그 나라로), 나라만 펼쳤으면 '‹ 전체 지도'
function syncBack() {
  const all = $("#mapAll"), f = ui.focus && (mapState?.pins || []).find((x) => x.p.id === ui.focus);
  if (!all) return;
  const c = f ? f.p.country : ui.openC;
  all.classList.toggle("hidden", !c);
  if (!c) return;
  all.querySelector("span").textContent = f ? cname(c) : "전체 지도";
  all.title = f ? "사업 선택을 풀고 나라 지도로" : "전체 지도로";
  all.onclick = () => { if (ui.focus) return setFocus(null); ui.openC = null; renderGeo({ listOnly: true }); goWorld(); };
}
// 이름표가 겹치면 자리를 바꿔 봄: 원래 쪽 → 반대쪽 → 핀 아래 → 핀 위. 모두 막히면 숨김 (등급 높은 사업부터 자리를 차지) · 확대하면 다시 보임
const SIDES = ["r", "l", "b", "t"];
// 여러 번 불려도 한 번만 (그리기·확대·이동이 겹칠 때마다 통째로 다시 재던 것을 줄임)
let dcTimer = 0;
function declutterSoon() { clearTimeout(dcTimer); dcTimer = setTimeout(declutter, 40); }
// 이름표 자리 찾기: 화면에서 한 번만 재고(핀·이름표 크기·나라 이름) 자리는 계산으로 정한 뒤 한꺼번에 반영
// (예전에는 이름표를 하나씩 옮겨 보며 그때마다 화면 배치를 다시 계산해서, 사업이 많으면 누를 때마다 수백 ms 멈췄음)
// 이름표 위치는 style.css 의 .pin-lb(오른쪽 left 34 · top 3) · .l(오른쪽 끝이 핀 왼쪽 6) · .b(가운데 · top 34) · .t(가운데 · top -30) 와 같아야 함
function declutter() {
  const map0 = $("#geoMap"); if (!map0) return;
  // 1) 읽기만
  const edge = map0.getBoundingClientRect(); // 지도 밖으로 잘리는 자리도 안 됨
  const pins = $$("#geoMap .gpin, #geoMap .cpin").map((el) => ({ el, box: el.getBoundingClientRect() }));
  $$("#geoMap .leaflet-control-zoom, .d-map .map-all:not(.hidden)").forEach((el) => pins.push({ el: null, box: el.getBoundingClientRect() })); // 확대 버튼 · [전체 지도] 버튼 위에는 이름표를 놓지 않음
  const pinBox = new Map(pins.map((x) => [x.el, x.box]));
  const labels = $$("#geoMap .pin-lb").map((el) => ({ el, own: el.previousElementSibling, wr: el.parentElement.getBoundingClientRect(), w: el.offsetWidth, h: el.offsetHeight }));
  const evs = $$("#geoMap .gev").map((el) => el.getBoundingClientRect());
  const rank = (el) => (el.classList.contains("cpn") ? -1 : el.classList.contains("mine") ? 0 : el.classList.contains("big") ? 1 : el.classList.contains("mid") ? 2 : el.classList.contains("city") ? 4 : 3); // 사업 나라 → 큰 나라 → 중간 → 작은 나라 → 도시 (도시 이름이 나라 이름 자리를 먼저 차지하지 않게)
  const names = $$("#geoMap .cn").sort((x, y) => rank(x) - rank(y));
  const cpns = $$("#geoMap .cpn").map((el) => ({ el, q: el.getBoundingClientRect() }));
  const nameBox = names.map((el) => { const q = el.getBoundingClientRect(); return q.width && q.right >= edge.left && q.left <= edge.right && q.bottom >= edge.top && q.top <= edge.bottom ? q : null; }); // 안 보이는 것(확대 단계·화면 밖)은 건너뜀
  // 2) 계산
  const hit = (q, x) => !(q.right < x.left || q.left > x.right || q.bottom < x.top || q.top > x.bottom);
  const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h });
  const placed = [], plan = [];
  // 핀 아래 나라 이름이 먼저 자리를 잡음 (사업명 이름표·다른 이름이 그 자리를 피함). 다른 핀이나 앞선 나라 이름과 겹치면 숨김
  const cpnShow = cpns.map(({ q }) => { if (!q.width || placed.some((x) => hit(q, x)) || pins.some((x) => hit(q, x.box))) return false; placed.push(q); return true; });
  labels.forEach(({ el, own, wr, w, h }) => {
    const pb = pinBox.get(own); // 핀이 지금 화면 밖이면 이름표도 숨김 (가장자리에 화면 밖 사업 이름이 모이지 않게)
    if (!el.dataset.side) el.dataset.side = el.classList.contains("l") ? "l" : "r";
    if (!pb || !w || pb.right < edge.left || pb.left > edge.right || pb.bottom < edge.top || pb.top > edge.bottom) { plan.push([el, el.dataset.side, 0, false]); return; }
    const order = [el.dataset.side, ...SIDES.filter((k) => k !== el.dataset.side)];
    let done = null;
    for (const side of order) {
      let q, dx = 0;
      if (side === "r") q = rect(wr.left + 34, wr.top + 3, w, h);
      else if (side === "l") q = rect(wr.left - 6 - w, wr.top + 3, w, h);
      else { // 위·아래: 지도 가장자리에 걸리면 안쪽으로 밀어 넣음
        const left = wr.left + 14 - w / 2, top = wr.top + (side === "b" ? 34 : -30);
        dx = left < edge.left + 6 ? edge.left + 6 - left : left + w > edge.right - 6 ? edge.right - 6 - (left + w) : 0;
        q = rect(left + dx, top, w, h);
      }
      const inside = q.left >= edge.left + 4 && q.right <= edge.right - 4 && q.top >= edge.top + 4 && q.bottom <= edge.bottom - 4;
      if (inside && !placed.some((x) => hit(q, x)) && !pins.some((x) => x.el !== own && hit(q, x.box))) { done = [el, side, dx, true]; placed.push(q); break; }
    }
    plan.push(done || [el, el.dataset.side, 0, false]);
  });
  const nameShow = names.map((el, i) => { const q = nameBox[i]; if (!q) return true;
    if (placed.some((x) => hit(q, x)) || pins.some((x) => hit(q, x.box)) || evs.some((x) => hit(q, x))) return false;
    placed.push(q); return true; });
  // 3) 쓰기만
  plan.forEach(([el, side, dx, show]) => { SIDES.forEach((k) => el.classList.toggle(k, k === side)); el.style.marginLeft = dx ? `${dx}px` : ""; el.style.visibility = show ? "visible" : "hidden"; });
  names.forEach((el, i) => { el.style.visibility = nameShow[i] ? "" : "hidden"; });
  cpns.forEach(({ el }, i) => { el.style.visibility = cpnShow[i] ? "" : "hidden"; });
}
function hiPin(pid, on) { const el = document.querySelector(`.gpin[data-pin="${pid}"]`); if (el) el.classList.toggle("hi", on || ui.focus === pid); }
function flyEvent(id) { const m = evMarkers[id]; if (!m || !map) return; map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 5), { duration: 0.8 }); setTimeout(() => m.openPopup(), 850); }
export async function refreshGeo() { await loadLiveQuakes(true); renderGeo(); }

// 사업지 고르기 (사업 수정 창의 작은 지도): 눌러서 핀을 놓고 끌어서 옮김. onPick(lat, lng)
export function mountSitePicker(el, { lat, lng, country }, onPick) {
  const has = Number.isFinite(lat) && Number.isFinite(lng), cc = GEO_COUNTRY[country];
  const m = L.map(el, { minZoom: 2, maxZoom: 11, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, attributionControl: false, worldCopyJump: true })
    .setView(has ? [lat, lng] : cc ? [cc[2], cc[3]] : [15, 80], has ? 7 : cc ? 5 : 3);
  m.createPane("land"); m.getPane("land").style.zIndex = 200;
  const draw = () => {
    if (!world || !el.isConnected) return;
    L.geoJSON(worldWrap || world, { pane: "land", renderer: landRenderer(m), interactive: false, style: () => ({ stroke: true, color: cssv("--map-border"), weight: 0.8, opacity: 1, fill: true, fillColor: cssv("--map-land"), fillOpacity: 1 }) }).addTo(m);
    // 자리를 찾기 쉽게: 아는 도시를 작은 점과 이름으로
    // 처음(나라 전체가 보이는 배율)에는 이름을 뿌리지 않고, 확대하면(5.5 이상) 보이는 범위의 도시만 · 서로 겹치면 뒤의 것을 숨김
    // 나라 이름은 늘 보이게 (어느 나라를 보고 있는지 알 수 있게): 수원국 영문 이름을 나라 가운데에
    Object.values(GEO_COUNTRY).forEach(([, en, la, ln]) => L.marker([la, ln], { interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<span class="sp-country">${en}</span>`, iconSize: [0, 0] }) }).addTo(m));
    const cityLayer = L.layerGroup();
    Object.values(GEO_CITY).forEach(([la, ln, en]) => L.marker([la, ln], { interactive: false, keyboard: false, icon: L.divIcon({ className: "", html: `<span class="sp-city"><i></i>${en}</span>`, iconSize: [0, 0] }) }).addTo(cityLayer));
    const tidy = () => {
      if (!el.isConnected) return;
      const on = m.getZoom() >= 5.5;
      if (on && !m.hasLayer(cityLayer)) cityLayer.addTo(m); else if (!on && m.hasLayer(cityLayer)) m.removeLayer(cityLayer);
      if (!on) return;
      const edge = el.getBoundingClientRect(), placed = [...el.querySelectorAll(".sp-country")].map((x) => x.getBoundingClientRect()); // 나라 이름 자리를 먼저 잡고, 겹치는 도시 이름은 숨김
      el.querySelectorAll(".sp-city").forEach((x) => {
        x.style.visibility = "";
        const q = x.getBoundingClientRect();
        if (q.right < edge.left || q.left > edge.right || q.bottom < edge.top || q.top > edge.bottom) return;
        if (placed.some((p) => !(q.right + 4 < p.left || q.left - 4 > p.right || q.bottom + 2 < p.top || q.top - 2 > p.bottom))) x.style.visibility = "hidden"; else placed.push(q);
      });
    };
    m.on("zoomend moveend", () => setTimeout(tidy, 30)); setTimeout(tidy, 80);
  };
  const w = loadWorld(); if (w && w.then) w.then(draw); else draw();
  // 지도 오른쪽 위에 고른 수원국 이름 (확대해서 나라 이름이 화면 밖으로 나가도 어느 나라인지 보이게)
  const chip = document.createElement("div"); chip.className = "sp-chip"; el.appendChild(chip);
  const showChip = (code) => { const c = GEO_COUNTRY[code]; chip.textContent = c ? `${c[0]} · ${c[1]}` : ""; chip.style.display = c ? "" : "none"; };
  showChip(country);
  let pin = null;
  const put = (ll, silent) => {
    if (pin) pin.setLatLng(ll);
    else pin = L.marker(ll, { draggable: true, keyboard: false, icon: L.divIcon({ className: "", html: `<span class="sp-pin"></span>`, iconSize: [0, 0] }) }).addTo(m)
      .on("dragend", () => { const p = pin.getLatLng(); onPick(p.lat, p.lng); });
    if (!silent) onPick(ll[0], ll[1]);
  };
  if (has) put([lat, lng], true);
  m.on("click", (e) => put([e.latlng.lat, e.latlng.lng]));
  setTimeout(() => m.invalidateSize(), 60);
  return {
    set(ll) { put(ll); m.setView(ll, Math.max(m.getZoom(), 7)); },
    clear() { if (pin) { m.removeLayer(pin); pin = null; } },
    country(code, move = true) { showChip(code); const c = GEO_COUNTRY[code]; if (c && move) m.setView([c[2], c[3]], 5); },
  };
}
