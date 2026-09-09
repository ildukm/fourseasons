# Four Seasons 테니스 복식 대진표

클럽원 5명 + 게스트 5명이 2코트에서 복식을 치는 모임용 정적 웹페이지.
빌드 도구, 프레임워크, 패키지 매니저 없음. HTML 파일 2개가 전부다.

## 파일

| 파일 | 역할 |
|---|---|
| `index.html` | 대진표 페이지. 쿼리스트링으로 명단을 받아 렌더링 |
| `setup.html` | 명단 설정 페이지. 이름 입력 후 "생성"을 누르면 대진표 링크를 만든다 |

두 파일은 서로 독립적이며 CSS와 JS를 각각 인라인으로 갖고 있다. 공용 모듈은 없다.
`setup.html`은 기본으로 같은 폴더의 `index.html`을 대진표 주소로 사용한다.

## 배포

- 호스팅: GitHub Pages, `gh-pages` 브랜치의 루트 폴더
- 주소: https://ildukm.github.io/fourseasons/
- `gh-pages`에 푸시하면 1~2분 내 자동 반영된다. 별도 빌드 단계 없음
- 이 저장소의 기본 브랜치는 `gh-pages`다. `main`은 사용하지 않는다
- 확인: `gh api repos/ildukm/fourseasons/pages/builds/latest --jq .status` 가 `built`면 완료

## 명단 전달 규약 (쿼리스트링)

```
index.html?m=클럽원1,클럽원2,클럽원3,클럽원4,클럽원5&g=게스트1,게스트2,게스트3,게스트4,게스트5
```

- `m` 클럽원 5명, `g` 게스트 5명. 쉼표 구분, 각각 정확히 5명이어야 한다
- 이름에 쉼표는 쓸 수 없다. `setup.html`이 입력 단계에서 막는다
- 파싱 실패 시 `index.html`은 기본 명단(`DEFAULT_NAMES`)을 쓰고 상단에 안내를 띄운다
- 순서가 의미를 갖는다. 클럽원 N번과 게스트 N번은 N라운드에 휴식한다

## 대진 데이터 (`index.html`의 `SCHEDULE`)

```js
SCHEDULE[라운드][코트] = [[클럽원idx, 게스트idx], [클럽원idx, 게스트idx]]  // 팀A vs 팀B
```

- 5라운드, 2코트. 매 라운드 8명 경기, 2명 휴식
- 팀은 항상 클럽원 1명 + 게스트 1명
- 라운드 r의 휴식자는 클럽원 r, 게스트 r (배열에 명시되지 않고 코드에서 유도)
- 5라운드 동안 같은 파트너 조합은 반복되지 않는다. 배정을 수정할 때 이 조건을 유지할 것
- 라운드 수나 인원 구성을 바꾸려면 `SCHEDULE`뿐 아니라 휴식자 유도 로직(`renderRounds`의 `resting`)과
  `setup.html`의 `N`, 검증 로직도 함께 바꿔야 한다

## 클럽원 기본 명단

`setup.html`의 `CLUB_MEMBERS`와 `index.html`의 `DEFAULT_NAMES.m`에 같은 값이 중복 정의되어 있다.
클럽원이 바뀌면 두 곳을 함께 고친다.

## 클라이언트 저장소 (localStorage)

| 키 | 위치 | 내용 |
|---|---|---|
| `fs-setup` | setup.html | 마지막으로 생성한 클럽원, 게스트, 대진표 주소 |
| `fs-me` | index.html | 사용자가 선택한 본인 id (`m0`~`m4`, `g0`~`g4`) |

로컬 파일(`file://`)과 GitHub Pages는 출처가 달라 저장소가 분리된다.
"설정 페이지에 이전 값이 남아 있다"는 문의는 대부분 이 저장값 때문이다.

## 디자인 규칙

- 폰트: 표시용 Barlow Condensed, 본문 Noto Sans KR (Google Fonts)
- 색 의미: 1코트 파랑(`--court1`), 2코트 초록(`--court2`), 선택된 본인 테니스볼 노랑(`--ball`), 휴식 회색(`--rest`)
- 라이트/다크 테마는 OS 설정(`prefers-color-scheme`)을 따른다. 색 토큰은 `:root`(라이트)와
  `@media (prefers-color-scheme: dark)` 안의 `:root`(다크) 두 곳에 정의하며, 색을 추가할 때 두 곳을 모두 갱신할 것
- 컴포넌트 CSS에는 색 리터럴을 쓰지 않고 토큰(`var(--...)`)만 쓴다
- 모바일 우선. 최대 폭 640px(대진표), 560px(설정)

## 알려진 제약

- 명단이 URL에 그대로 노출된다. Pages는 공개 주소이므로 공유 범위에 주의
