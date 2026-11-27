# 사용 매뉴얼 만들기 (PDF · 자막 있는 시연 동영상)

데모 화면(`index.html?demo=1`, 가상 데이터)을 자동으로 띄워 찍습니다. 실제 계정의 메일 주소·아이디는 가상 이름으로 바꿔 찍힙니다(common.js).

준비
- 저장소 맨 위에서 `python3 -m http.server 8765`
- 글꼴: `tools/font/web` 에 Pretendard 를 풀어 둠 (저장소에는 넣지 않음)
  `npm pack pretendard@1.3.9` → `tar -xzf pretendard-1.3.9.tgz -C tools/font/web --strip-components=4 package/dist/web/variable package/dist/public/variable/PretendardVariable.ttf`
- Playwright(Chromium) · ffmpeg(libx264 · libass)

PDF 매뉴얼
1. `node tools/manual/figdefs.js` → `fig/` 에 번호 표시가 얹힌 화면 32장 (화면 요소 이름이 바뀌면 '못 찾음'으로 알려 줌)
2. `python3 tools/manual/manual.py` → `manual.html` (화면 하나 = 한 쪽 · 본문·번호별 설명은 이 파일에) · `node tools/manual/fitchk.js` 로 쪽마다 넘침·빈 곳 확인
3. `node tools/manual/topdf.js` → `manual.pdf`

시연 동영상
1. `mkdir -p tools/manual/vid && node tools/manual/video.js` → `vid/raw.mp4`(화면 녹화) + `vid/cap.ass`(자막). 시나리오와 자막 문구는 video.js 에
2. `tools/manual/burn.sh vid/raw.mp4 vid/cap.ass vid/out.mp4` → 1920×1080, 아래 자막 띠

만든 중간 파일(fig · vid · manual.html · manual.pdf)은 저장소에 넣지 않습니다. 완성본은 저장소 맨 위 manual/ 에 edcf-radar-manual.pdf · edcf-radar-video.mp4 로 바꿔 넣습니다(계정 메뉴의 [사용 매뉴얼]이 이 파일을 엶).
