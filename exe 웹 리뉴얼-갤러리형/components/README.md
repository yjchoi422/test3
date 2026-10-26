# 공통 컴포넌트

헤더·CTA·푸터처럼 모든 페이지에 반복되는 마크업의 **원본**입니다. 페이지에 직접 수정하지 말고 여기서 고친 뒤 동기화하세요.

| 파일 | 내용 |
|---|---|
| `header.html` | 스크롤 진행 바 + GNB + 서브 메뉴 패널 5종 |
| `cta.html` | 「비슷한 과제가 있나요」 문의 섹션 (`#contact`) |
| `footer.html` | 푸터 (`#footer`) |
| `floating-cta.html` | 화면 우하단 고정 「GEO 진단 체험」 플로팅 버튼 (호버 시 왼쪽으로 펼침) |

## 동기화

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\sync-components.ps1
```

(프로젝트 루트 폴더에서 실행합니다.)

프로젝트 폴더 안의 모든 `.html` 페이지에서 아래 표시 사이를 컴포넌트 내용으로 다시 채웁니다.

```html
<!-- @component header active=project -->
(자동 생성 — 이 사이는 직접 수정하지 마세요)
<!-- /@component -->
```

- `{{root}}` → 페이지 위치에 맞는 상대 경로(`./`, `../`)로 바뀝니다.
- `active=geo|ga|project|insight|exelient` → 해당 메인 메뉴에 현재 위치 표시(`class="active"`, `aria-current="page"`)를 넣습니다.
- 결과는 완성된 정적 HTML이라 별도 빌드 결과물 폴더 없이 그대로 열고 배포할 수 있습니다. 메뉴 링크가 초기 HTML에 있으므로 검색엔진도 그대로 읽습니다.

## HTML 정렬

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\format-html.ps1
```

`<p>`, `<span>`을 제외한 모든 태그는 여는 태그 · 내용 · 닫는 태그를 각각 다른 줄에 두고 2칸씩 들여씁니다. `<p>`, `<span>`(안쪽 포함)과 `<img>` 같은 빈 태그는 한 줄로 둡니다. 여러 번 실행해도 결과가 같습니다. 컴포넌트를 정렬했다면 이어서 동기화 스크립트를 실행하세요.

## 새 페이지 만들기

1. 비슷한 페이지를 복사합니다 (상세페이지는 `projects/samsung-medical-center.html`).
2. 본문만 바꾸고 컴포넌트 표시는 그대로 둡니다.
3. 동기화 스크립트를 실행합니다.

## 폴더 구조

```
index.html          프로젝트 목록 (사이트 진입점)
projects/           프로젝트 상세페이지
components/         공통 HTML 원본 (header · cta · footer)
css/                common(공통) · index(목록) · project-detail(상세) · interaction(커서)
js/                 common(공통) · app(목록) · project-detail(상세) · smooth-scroll · interaction
assets/images/      svg · png · jpg
assets/fonts/       Pretendard woff2
tools/              sync-components.ps1 (컴포넌트 동기화) · format-html.ps1 (HTML 정렬)
```

공통 스타일은 `css/common.css`, 공통 동작은 `js/common.js`(헤더·서브 메뉴·스크롤 진행·FAQ)·`js/smooth-scroll.js`·`js/interaction.js`에 있습니다.
