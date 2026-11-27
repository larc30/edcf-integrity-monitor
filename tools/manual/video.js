// EDCF RADAR 시연 동영상 시나리오. node video.js → vid/raw.mp4 + vid/cap.ass
const { start, writeAss } = require('./rec');
(async () => {
  const v = await start('vid/raw.mp4'); const p = v.p; const fails = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { fails.push(name + ': ' + String(e.message).split('\n')[0]); } };
  const closeDrawer = async () => { await v.click('#drawerClose', { after: 500 }); };
  const closeModal = async () => { await v.click('#modalClose', { after: 500 }); };
  const READ = 3400; // 자막 한 줄을 읽는 시간

  await v.wait(600);
  await v.card('EDCF RADAR', '사용 안내', '업체 · 수원국 리스크 모니터링  |  화면 예시는 가상 데이터입니다', 3200);

  // ─────────────── 1. 업체 리스크 화면
  v.setChapter('1  업체 리스크');
  await step('개요', async () => {
    v.cap('업체 리스크 화면입니다.\n참여 업체에 걸린 제재 · 수사 이슈를 매일 모아 등급으로 보여 줍니다.');
    await v.move('#kboard', { ms: 900 }); await v.wait(1200); await v.move('#radar', { ms: 900 }); await v.wait(900); await v.move('.d-projects', { ms: 900, fy: .3 }); await v.wait(1400);
  });
  await step('범위', async () => {
    v.cap('보기 범위를 바꾸면 아래 숫자와 목록이 모두 그 범위로 바뀝니다.');
    await v.click('#scopeSeg [data-s="all"]', { after: 2200 }); await v.click('#scopeSeg [data-s="mine"]', { after: 1600 });
  });
  await step('등급', async () => {
    v.cap('업체 등급입니다. 경고는 지금 유효한 제재,\n주의는 제재로 이어질 수 있는 진행 중 사안입니다.');
    await v.move('#kboard .rk.red'); await v.wait(1500); await v.move('#kboard .rk.orange'); await v.wait(1500); await v.move('#wkCard', { fy: .55 }); await v.wait(1200);
    v.cap('등급 숫자를 누르면 그 등급의 업체 목록이 오른쪽에 열립니다.');
    await v.click('#kboard .rk.red', { after: 2600 });
    v.cap('업체를 누르면 이슈, 업체 정보, 참여 사업, 검사 결과를 볼 수 있습니다.');
    await v.click('#drawerBody .rl-row', { after: 1800 });
    await v.move('#dFeed .item', { fx: .3 }); await v.wait(1200); await v.move('.d-info'); await v.wait(1100); await v.move('#drawerBody .ck-grid'); await v.wait(1500);
    v.cap('창은 오른쪽 위 X 로 닫습니다.');
    await closeDrawer(); await v.wait(900);
  });
  await step('레이더', async () => {
    v.cap('레이더의 점은 경고 · 주의 업체입니다.\n마우스를 올리면 이름이 보이고, 누르면 업체 상세가 열립니다.');
    await v.move('#radar .rdot.orange', { nth: 0 }); await v.wait(1500); await v.move('#radar .rdot.orange', { nth: 2 }); await v.wait(1400);
    await v.move('#radarNames .rn-chip', { nth: 0 }); await v.wait(1100); await v.move('#radarNames .rn-chip', { nth: 3 }); await v.wait(1300);
  });
  await step('사업', async () => {
    v.cap('사업 카드에 마우스를 올리면 그 사업의 업체만 레이더에 남습니다.');
    await v.move('#projectMap .pj', { nth: 1, fx: .6, fy: .3 }); await v.wait(1800); await v.move('#projectMap .pj', { nth: 2, fx: .6, fy: .3 }); await v.wait(1600);
    v.cap('카드를 누르면 역할별 참여 업체와 그 사업의 이슈가 보입니다.');
    await v.click('#projectMap .pj', { nth: 1, fx: .6, fy: .25, after: 2200 }); await v.move('#drawerBody .pd-grp', { nth: 1 }); await v.wait(1800);
    await closeDrawer();
  });
  await step('공식 명단', async () => {
    v.cap('공식 제재 명단에서는 EXIMIIS · 조달청 · MDB 명단에\n걸린 업체를 출처별로 봅니다.');
    await v.click('#noteCard', { after: 2000 }); await v.move('#modal .oc-src', { nth: 0, fx: .3 }); await v.wait(1300); await v.move('#modal .oc-src', { nth: 1, fx: .3 }); await v.wait(1300);
    v.cap('EXIMIIS 명단은 내려받은 엑셀을 여기서 올립니다.');
    await v.click('#modal details.oc-more summary', { after: 2400 });
    await closeModal();
  });
  await step('이슈', async () => {
    v.cap('아래에는 새로 잡힌 이슈가 모입니다.\n담당자가 이 업체 이야기가 맞는지 판단해 줍니다.');
    await v.scrollToSel('#issuesCard', 96, 1100); await v.move('#feed .item', { nth: 0, fx: .35 }); await v.wait(2600);
    v.cap('기간을 바꿔 볼 수 있습니다. 공식 제재 기록은 기간과 관계없이 항상 보입니다.');
    await v.click('#periodSeg [data-p="all"]', { after: 1400 }); await v.click('#periodSeg [data-p="7d"]', { after: 1500 });
    v.cap('이 업체 이야기가 맞으면 [관련 있음]을 누릅니다.\n등급은 유지되고 목록에서 빠집니다.');
    await v.move('#feed .item [data-act="reviewed"]', { nth: 2 }); await v.wait(1500); await v.click('#feed .item [data-act="reviewed"]', { nth: 2, after: 2400 });
    v.cap('이 업체 이야기가 아니면 [관련 없음]을 누르고 이유를 고릅니다.');
    await v.click('#feed .item [data-act="dismissed"]', { nth: 3, after: 1500 });
    await v.click('#drForm input[value="mention"]', { after: 1300 });
    v.cap('이유를 고르면 등급 계산에서 빠지고, AI가 비슷한 기사를 걸러낼 때 참고합니다.');
    await v.move('#modal .btn.primary'); await v.wait(1700); await v.click('#modal .btn.primary', { after: 2300 });
    v.cap('잘못 눌렀으면 아래 접힌 칸을 펼쳐 [되돌리기]를 누릅니다.');
    await v.scrollTo(await p.evaluate(() => document.querySelector('.issue-foot').getBoundingClientRect().top + scrollY - 500), 700);
    await v.click('#doneWrap summary', { after: 1500 }); await v.click('#doneWrap [data-act="new"]', { after: 2200 });
    v.cap('헷갈릴 때는 [판단 가이드]를 봅니다. 네 팀이 같이 쓰는 기준입니다.');
    await v.scrollToSel('#issuesCard', 96, 600); await v.click('#btnGuide', { after: 3600 }); await closeModal();
  });
  await step('검색', async () => {
    await v.scrollTo(0, 800);
    v.cap('위쪽 검색창에서 업체명이나 사업자번호로 바로 찾을 수 있습니다.');
    await v.click('#coFind', { after: 400 }); await v.type('도레'); await v.wait(1200); await v.click('#coFindSug > button', { nth: 0, after: 2400 }); await closeDrawer();
  });
  await step('스캔', async () => {
    v.cap('[지금 스캔]을 누르면 업체를 바로 다시 검사합니다 (관리자).\n끝나면 화면이 자동으로 바뀝니다.');
    await v.click('#btnScan', { after: 1200 }); await v.move('#jobState'); await v.wait(6500);
    v.cap('진행 중에는 [중지]로 멈출 수 있습니다.');
    await v.click('#btnStop', { after: 3600 });
  });
  await step('보고서', async () => {
    v.cap('[보고서]는 지금 상태를 PDF 로 만듭니다.\n범위와 기간을 고르면 미리보기가 바로 바뀝니다.');
    await v.wait(600); await v.click('#btnReport', { after: 2600 }); await v.click('#rpForm input[type=checkbox]', { nth: 0, after: 2200 }); await v.move('#modal .btn.primary'); await v.wait(1500);
    await closeModal();
  });

  // ─────────────── 2. 수원국 리스크 화면
  await v.card('2', '수원국 리스크', '사업지 주변의 여행경보 · 재해 · 분쟁', 2200);
  v.setChapter('2  수원국 리스크');
  await step('수원국 개요', async () => {
    await v.click('#modeSwitch [data-view="geo"]', { after: 3800 });
    v.cap('수원국 리스크 화면입니다.\n사업지 주변의 여행경보 · 재해 · 분쟁 · 감염병을 지도로 봅니다.');
    await v.move('#geoMap', { ms: 900 }); await v.wait(4300);
    v.cap('왼쪽은 등급별 나라 수와 최근 7일 사건입니다.\n종류를 누르면 그 종류만 보입니다.');
    await v.move('#gboard .rk.orange'); await v.wait(1300); await v.click('#evSummary .ev-chip', { nth: 4, after: 1800 }); await v.click('#evSummary .ev-chip', { nth: 0, after: 1300 });
  });
  await step('나라·사업', async () => {
    v.cap('나라를 누르면 그 나라로 확대되고 사업이 펼쳐집니다.');
    await v.click('#geoProjects .gc-h', { nth: 0, after: 3600 });
    v.cap('사업을 누르면 사업지 둘레 500km 안의 사건과 거리,\n등급 근거가 보입니다.');
    await v.click('#geoProjects .gc.open [data-gpid]', { after: 3200 }); await v.move('#geoMap', { fx: .5, fy: .45 }); await v.wait(2600);
    v.cap('뒤로 버튼은 한 단계씩 되돌아갑니다: 사업 → 나라 → 전체 지도.');
    await v.click('#mapAll', { after: 2400 }); await v.click('#mapAll', { after: 2600 });
  });
  await step('등급별 나라', async () => {
    v.cap('등급을 누르면 그 등급의 나라와 이유를 볼 수 있습니다.');
    await v.click('#gboard .rk.orange', { after: 2600 }); await v.move('#drawerBody [data-glc]', { nth: 1, fx: .4 }); await v.wait(1500);
    await v.click('#drawerBody [data-glc]', { nth: 1, fx: .4, after: 3200 }); await v.click('#mapAll', { after: 2200 });
  });
  await step('이벤트', async () => {
    v.cap('아래 사건 목록도 업체 이슈처럼\n[관련 있음] · [관련 없음]으로 처리합니다 (관리자).');
    await v.scrollTo(await p.evaluate(() => document.body.scrollHeight), 1100); await v.move('#evFeed .ev-item', { nth: 0, fx: .4 }); await v.wait(2000);
    await v.click('#evFeed [data-evrv="ok"]', { nth: 0, after: 2600 });
    await v.scrollTo(0, 800);
  });

  // ─────────────── 3. 관리자 모드
  await v.card('3', '관리자 모드', '업체 관리 · 사업 관리 · 설정', 2200);
  v.setChapter('3  관리자 모드');
  await step('관리자 모드', async () => {
    v.cap('오른쪽 위 [관리자 모드]를 켜면\n업체 관리 · 사업 관리 · 설정 탭이 나옵니다 (관리자 계정).');
    await v.move('#btnAdmin'); await v.wait(1500); await v.click('#btnAdmin', { after: 2400 });
  });
  await step('업체 관리', async () => {
    v.cap('업체 관리입니다. 보기 탭과 검색, 필터로 업체를 찾습니다.');
    await v.click('#coViews .cv-btn', { nth: 2, after: 1700 }); await v.click('#coViews .cv-btn', { nth: 0, after: 1100 });
    await v.click('#poolSearch', { after: 300 }); await v.type('엔지니어링'); await v.wait(1900);
    await p.fill('#poolSearch', ''); await p.dispatchEvent('#poolSearch', 'input'); await v.wait(700);
    v.cap('[+ 업체 추가]에서 업체명과 사업자등록번호를 적고\n참여 사업을 연결합니다.');
    await v.click('#btnAddCompany', { after: 1600 });
    await v.click('#coForm [name=name]', { after: 300 }); await v.type('가람솔엔지니어링'); await v.wait(700);
    await p.keyboard.press('Escape').catch(() => {});
    await v.click('#coForm [name=biz_no]', { after: 300 }); await v.type('7318624959', 90); await v.wait(900);
    v.cap('[DART 검색]을 누르면 사업자등록번호 · 대표자 · 영문명 · 업종을\nDART 에서 가져와 채웁니다.');
    await v.move('#dlBtn'); await v.wait(5200);
    v.cap('참여 사업은 사업 · 역할 · 단계를 고르고 + 를 눌러 연결합니다.');
    await v.move('#ceP'); await v.wait(500); await p.selectOption('#ceP', { index: 1 }); await v.wait(800);
    await v.move('#ceR'); await v.wait(400); await p.selectOption('#ceR', { index: 2 }); await v.wait(800);
    await v.move('#ceS'); await v.wait(400); await p.selectOption('#ceS', { index: 1 }); await v.wait(800);
    await v.click('#ceAdd', { after: 2000 });
    await closeModal(); await v.wait(600);
    v.cap('업체명을 누르면 같은 창에서 정보를 고칩니다.');
    await v.click('#coTable .co-name', { nth: 1, after: 2800 }); await closeModal();
    v.cap('[도구]에는 일괄 등록과 DART 일괄 조회가 있습니다.');
    await v.click('#coToolMenu summary', { after: 2400 }); await v.click('#coToolMenu summary', { after: 600 });
  });
  await step('사업 관리', async () => {
    await v.click('#tabs [data-view="projects"]', { after: 1800 });
    v.cap('사업 관리입니다. 왼쪽 업체를 끌어\n사업의 역할 칸에 놓으면 연결됩니다.');
    await v.wait(1500);
    const src = await v.box('#sideList .side-co', 12); const zone = await v.box('#projBoard .pbox .dropzone', 0);
    await v.moveXY(src.x + 50, src.y + src.height / 2, 800); await v.wait(500); await p.mouse.down(); await v.wait(200);
    await v.moveXY(zone.x + zone.width / 2, zone.y + zone.height / 2, 1500); await v.wait(500); await p.mouse.up(); await v.wait(2400);
    v.cap('단계(계약체결 · 우선협상 · 입찰중)를 고르고,\n휴지통으로 사업에서 뺄 수 있습니다.');
    await v.move('#projBoard .pbox .stage-sel', { nth: 0 }); await v.wait(1500); await v.move('#projBoard .pbox .corow .ibtn.del', { nth: 0 }); await v.wait(1500);
    v.cap('연필을 누르면 사업 수정 창이 열립니다.\n수원국 · 사업명 · 담당을 적고, 지도에서 사업지를 지정합니다.');
    await v.click('#projBoard .pbox-foot .ibtn[data-edit-proj]', { nth: 0, after: 2800 });
    await v.move('#pjEditForm [name=country]'); await v.wait(600); await v.move('#pjEditForm [name=name]'); await v.wait(600); await v.move('#pjEditForm [name=city]'); await v.wait(600);
    await v.click('#modal .leaflet-container', { fx: .56, fy: .5, after: 2200 });
    await closeModal();
  });
  await step('설정', async () => {
    await v.click('#tabs [data-view="settings"]', { after: 1800 });
    v.cap('설정에서는 리스크 키워드, 계정 · 권한,\n메일 받는 사람을 관리합니다.');
    await v.move('#kwForm'); await v.wait(1400); await v.move('#accForm'); await v.wait(1400); await v.move('#rcForm'); await v.wait(1400);
    v.cap('[미리보기 · 보내기]에서 오늘 메일을 확인하고\n테스트로 보낼 수 있습니다.');
    await v.click('#btnPreview', { after: 3600 }); await closeModal();
    v.cap('[관리자 모드 나가기]를 누르면 대시보드로 돌아옵니다.');
    await v.click('#btnAdmin', { after: 3600 });
  });
  await step('계정 메뉴', async () => {
    v.cap('계정 메뉴에서 글자 크기와 화면 밝기를 바꿀 수 있습니다.');
    await v.click('#acct summary', { after: 1000 }); await v.click('#fontUp', { after: 1100 }); await v.click('#fontDown', { after: 900 });
    await v.click('#btnTheme', { after: 2200 }); await v.click('#btnTheme', { after: 1200 }); await v.click('#acct summary', { after: 800 });
  });
  await v.card('EDCF RADAR', '감사합니다', '자세한 내용은 사용 매뉴얼(PDF)을 참고하세요', 3000);
  const r = await v.stop();
  writeAss(v.caps, 'vid/cap.ass', r.seconds);
  require('fs').writeFileSync('vid/caps.json', JSON.stringify(v.caps, null, 1));
  console.log(JSON.stringify(r), '\n실패:', fails.length ? fails : '없음');
})();
