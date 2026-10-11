const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadPage } = require('./page-helper.cjs');

const members = ['권순범', '김일두', '손원식', '정선진', '조진희'];
const guests = ['문경신', '남기정', '최주영', '김희정', '윤진주'];
const validSchedule = '0123456789'.repeat(10);
const plain = value => JSON.parse(JSON.stringify(value));
const pid = p => p < 5 ? `m${p}` : `g${p - 5}`;

function link(overrides = {}) {
  const url = new URL('https://example.test/index.html');
  const params = { m: members.join(','), g: guests.join(','), s: validSchedule, ...overrides };
  for (const [key, value] of Object.entries(params)) if (value !== null) url.searchParams.set(key, value);
  return url.href;
}

function formValues(isF = Array(10).fill(0), guestNames = guests) {
  return Object.fromEntries([...members, ...guestNames].flatMap((name, p) => [
    [pid(p), name], [`s${pid(p)}`, isF[p] ? 'f' : 'm'],
  ]));
}

function summaryRows(html) {
  return [...html.matchAll(/<tr>(.*?)<\/tr>/gs)].slice(1).map(match => {
    const cells = [...match[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(m => m[1]);
    return { name: cells[0], counts: cells.slice(1).map(Number) };
  });
}

// 코트 4명의 성별 16가지 조합을 고정된 기대값으로 검증한다.
const courtTypes = [0, 3, 3, 3, 3, 1, 1, 3, 3, 1, 1, 3, 3, 3, 3, 2];
for (const [mask, type] of courtTypes.entries()) {
  test(`요약표·대진표 경기 분류: 코트 성별 패턴 ${mask.toString(2).padStart(4, '0')}`, () => {
    const { context } = loadPage('setup.html');
    const isF = Array.from({ length: 10 }, (_, p) => p < 4 ? (mask >> p) & 1 : 0);
    const rounds = Array.from({ length: 10 }, () => Array.from({ length: 10 }, (_, p) => p));
    const names = ['김<&">', ...members.slice(1), ...guests];
    const html = context.summaryHtml(rounds, isF, names);
    assert.equal(html.includes('<th>기타</th>'), type === 3);
    const rows = summaryRows(html);
    assert.equal(rows.length, 10);
    assert.match(rows[0].name, /김&lt;&amp;&quot;&gt;/);
    assert.equal(html.includes('김<&">'), false);
    rows.forEach((row, p) => {
      const expected = Array(type === 3 ? 4 : 3).fill(0);
      if (p < 4) expected[type] = 10;
      else if (p < 8) expected[0] = 10;
      assert.deepEqual(row.counts, expected, `선수 ${p}`);
      assert.equal(row.name.includes('class="f"'), Boolean(isF[p]));
    });
    assert.match(html, /class="zero">0<\/td>/);
    const w = isF.flatMap((f, p) => f ? [pid(p)] : []).join(',');
    const page = loadPage('index.html', { url: link({ w }) });
    assert.deepEqual(plain(page.read('SCHEDULE.map(r => r.courts.map(c => c.type))')),
      Array.from({ length: 10 }, () => [['남복', '혼복', '여복', null][type], '남복']));
  });
}

for (const women of [0, 1, 4, 5, 6, 10]) {
  test(`생성→요약표→링크→대진표: 여성 ${women}명`, () => {
    const isF = Array.from({ length: 10 }, (_, p) => (p * 3) % 10 < women ? 1 : 0);
    const form = formValues(isF);
    form.m0 = ' 김<&"> ';
    const setup = loadPage('setup.html', { seed: 42, form });
    // 이전 URL의 쿼리가 있더라도 현재 입력으로 대체한다.
    setup.element('base').value = link({ w: 'g4', s: 'old' });
    setup.context.build();
    assert.equal(setup.element('error').hidden, true);
    assert.equal(setup.element('result').classList.contains('show'), true);
    const url = new URL(setup.element('url').textContent);
    assert.equal(setup.element('open').href, url.href);
    assert.equal(url.searchParams.get('m').split(',')[0], '김<&">');
    assert.equal(url.searchParams.get('w'), women ? isF.flatMap((f, p) => f ? [pid(p)] : []).join(',') : null);
    const schedule = url.searchParams.get('s');
    assert.match(schedule, /^\d{100}$/);
    const page = loadPage('index.html', { url: url.href });
    assert.equal(page.element('notice').hidden, true);
    assert.equal(page.read('names.s'), schedule);
    assert.equal(page.read('names.m[0]'), '김<&">');
    const loaded = plain(page.read('SCHEDULE'));
    const counts = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
    loaded.forEach((round, r) => {
      const order = [...round.courts.flatMap(c => c.teams.flat()), ...round.rest];
      assert.deepEqual(order, [...schedule.slice(r * 10, r * 10 + 10)].map(d => pid(+d)));
      round.courts.forEach(court => {
        const type = ['남복', '혼복', '여복', null].indexOf(court.type);
        court.teams.flat().forEach(id => counts[Number(id[1]) + (id[0] === 'g' ? 5 : 0)][type]++);
      });
    });
    const hasOther = counts.some(c => c[3] > 0);
    const summary = summaryRows(setup.element('summary').innerHTML);
    summary.forEach((row, p) => assert.deepEqual(row.counts, hasOther ? counts[p] : counts[p].slice(0, 3)));
    assert.equal((page.element('rounds').innerHTML.match(/class="court c/g) || []).length, 20);
    assert.match(page.element('rounds').innerHTML, /김&lt;&amp;&quot;&gt;/);
    // 다시 열어도 저장된 대진을 그대로 사용한다.
    const reopened = loadPage('index.html', { url: url.href, seed: 999 });
    assert.deepEqual(plain(reopened.read('SCHEDULE')), loaded);
  });
}

for (const absent of [['m2'], ['m0', 'm4']]) {
  test(`클럽원 결석 ${absent.join(',')}: 생성 링크와 대진표에서 결석자를 뺀다`, () => {
    const isF = [0, 0, 0, 0, 1, 0, 0, 1, 1, 1];
    const form = formValues(isF);
    for (const id of absent) form[`x${id}`] = 'on';
    const setup = loadPage('setup.html', { seed: 7, form });
    setup.context.build();
    assert.equal(setup.element('error').hidden, true);
    const url = new URL(setup.element('url').textContent);
    const n = 10 - absent.length;
    assert.equal(url.searchParams.get('x'), absent.join(','));
    assert.equal(url.searchParams.get('m'), members.join(','));
    // 결석한 여성 클럽원(m4)은 w에서 빠진다.
    assert.equal(url.searchParams.get('w'), absent.includes('m4') ? 'g2,g3,g4' : 'm4,g2,g3,g4');
    assert.match(url.searchParams.get('s'), new RegExp(`^\\d{${10 * n}}$`));
    const summary = summaryRows(setup.element('summary').innerHTML);
    const present = [...members, ...guests].filter((_, p) => !absent.includes(pid(p)));
    assert.deepEqual(summary.map(row => row.name.replace(/<.*/, '')), present);
    assert.equal(JSON.parse(setup.context.localStorage.getItem('fs-setup')).x.join(','), absent.join(','));

    const page = loadPage('index.html', { url: url.href });
    assert.equal(page.element('notice').hidden, true);
    const loaded = plain(page.read('SCHEDULE'));
    loaded.forEach(round => {
      const ids = [...round.courts.flatMap(c => c.teams.flat()), ...round.rest];
      assert.equal(ids.length, n);
      assert.equal(round.rest.length, n - 8);
      absent.forEach(id => assert.equal(ids.includes(id), false));
    });
    const chips = page.element('chipsM').innerHTML;
    absent.forEach(id => assert.equal(chips.includes(`data-pid="${id}"`), false));
    const meta = page.element('meta').innerHTML;
    assert.match(meta, n === 9 ? /9명 · 10라운드 · 각 8~9게임, 휴식 1~2회/ : /8명 · 10라운드 · 각 10게임, 휴식 없음/);
    assert.match(meta, new RegExp(`결석 ${absent.map(id => members[+id[1]]).join(', ')}`));
    if (n === 8) assert.match(page.element('rounds').innerHTML, /휴식 없음/);
  });
}

test('결석한 클럽원이 본인으로 저장되어 있으면 선택하지 않은 상태로 연다', () => {
  const url = link({ x: 'm2', s: '013456789'.repeat(10) });
  const absent = loadPage('index.html', { url, stored: { 'fs-me': 'm2' } });
  assert.equal(absent.element('notice').hidden, true);
  assert.equal(absent.read('me'), null);
  const present = loadPage('index.html', { url, stored: { 'fs-me': 'm3' } });
  assert.equal(present.read('me'), 'm3');
  assert.match(present.element('me').innerHTML, /정선진.*클럽원 · 10게임 · 휴식 없음/s);
});

for (const [name, guestCount, absent] of [
  ['게스트 5명·결석 3명', 5, ['m0', 'm1', 'm2']],
  ['게스트 2명', 2, []],
  ['게스트 3명·결석 1명', 3, ['m1']],
  ['게스트 없음', 0, []],
]) {
  test(`설정 입력 검증: 참가자 8명 미만 (${name})`, () => {
    const extra = Array.from({ length: guestCount }, (_, i) => `게스트${i + 1}`);
    const form = formValues(Array(5 + guestCount).fill(0), extra);
    for (const id of absent) form[`x${id}`] = 'on';
    const page = loadPage('setup.html', { form });
    page.context.buildSchedule = () => assert.fail('잘못된 입력으로 대진을 생성하면 안 된다');
    page.context.build();
    assert.equal(page.element('error').hidden, false);
    assert.match(page.element('error').textContent, new RegExp(`8명 이상.*지금은 ${5 + guestCount - absent.length}명`));
  });
}

const invalidLinks = [
  ['대진 누락', { s: null }], ['빈 대진', { s: '' }],
  ['99자리', { s: validSchedule.slice(1) }], ['101자리', { s: validSchedule + '0' }],
  ['영문 포함', { s: 'x' + validSchedule.slice(1) }],
  ['공백 포함', { s: ' ' + validSchedule.slice(1) }],
  ['전각 숫자', { s: '０' + validSchedule.slice(1) }],
  ['첫 라운드 중복', { s: '1123456789' + validSchedule.slice(10) }],
  ['중간 라운드 중복', { s: validSchedule.slice(0, 50) + '0123456788' + validSchedule.slice(60) }],
  ['마지막 라운드 중복', { s: validSchedule.slice(0, 90) + '0123456788' }],
  ['클럽원 4명', { m: members.slice(0, 4).join(',') }],
  ['클럽원 6명', { m: [...members, '추가'].join(',') }],
  ['게스트 4명에 10명 대진', { g: guests.slice(0, 4).join(',') }],
  ['게스트 6명에 10명 대진', { g: [...guests, '추가'].join(',') }],
  ['게스트 2명(참가 7명)', { g: guests.slice(0, 2).join(','), s: '0123456'.repeat(10) }],
  ['게스트 6명인데 없는 선수 b', { g: [...guests, '추가'].join(','), s: '0123456789b'.repeat(10) }],
  ['대문자 인덱스', { g: [...guests, '추가'].join(','), s: '0123456789A'.repeat(10) }],
  ['빈 이름', { m: '권순범,김일두, ,정선진,조진희' }],
  ['명단 누락', { m: null, g: null }],
  ['결석 표시 없이 90자리', { s: '123456789'.repeat(10) }],
  ['결석자가 대진에 포함', { x: 'm0', s: '012345678'.repeat(10) }],
  ['결석 1명에 100자리', { x: 'm0' }],
  ['결석 3명', { x: 'm0,m1,m2', s: '3456789'.repeat(10) }],
  ['게스트 결석', { x: 'g0', s: '012346789'.repeat(10) }],
];
for (const [name, params] of invalidLinks) {
  test(`잘못된 링크는 안내와 기본 명단·대진을 표시: ${name}`, () => {
    const page = loadPage('index.html', { url: link(params) });
    assert.equal(page.element('notice').hidden, false);
    assert.deepEqual(plain(page.read('names')), plain(page.read('DEFAULT_NAMES')));
    assert.equal(page.read('isValidSchedule(names.s)'), true);
  });
}

test('여성 ID는 m0~m4/g0~g4만 인정하고 이름의 앞뒤 공백을 제거한다', () => {
  const page = loadPage('index.html', { url: link({
    m: members.map(n => ` ${n} `).join(','),
    w: 'm0,m4,g0,g4,m5,g5,m-1,M0,x0,<script>',
  }) });
  assert.deepEqual(plain(page.read('names.w')), ['m0', 'm4', 'g0', 'g4']);
  assert.deepEqual(plain(page.read('names.m')), members);
});

test('여성 ID가 없는 유효 링크는 전원 남성으로 표시한다', () => {
  const page = loadPage('index.html', { url: link() });
  assert.deepEqual(plain(page.read('names.w')), []);
  assert.equal(page.read('SCHEDULE.every(r => r.courts.every(c => c.type === "남복"))'), true);
});

for (const [name, changes, base, message] of [
  ['빈 이름', { m0: '', g4: '  ' }, null, /클럽원 1.*게스트 5/],
  ['이름에 쉼표', { g2: '최,주영' }, null, /쉼표/],
  ['잘못된 주소', {}, 'not-a-url', /올바른 URL/],
]) {
  test(`설정 입력 검증: ${name}`, () => {
    const page = loadPage('setup.html', { form: { ...formValues(), ...changes } });
    if (base) page.element('base').value = base;
    page.context.buildSchedule = () => assert.fail('잘못된 입력으로 대진을 생성하면 안 된다');
    page.context.build();
    assert.equal(page.element('error').hidden, false);
    assert.match(page.element('error').textContent, message);
    assert.equal(page.element('url').textContent, '');
    assert.equal(page.element('result').classList.contains('show'), false);
  });
}

// ---- 요구사항: 게스트 수 가변 ----
for (const [guestCount, absent] of [[3, []], [4, ['m0']], [6, ['m1', 'm2', 'm3']], [7, []], [10, ['m2']]]) {
  test(`게스트 ${guestCount}명·결석 ${absent.length}명: 생성 링크를 대진표가 그대로 그린다`, () => {
    const extra = Array.from({ length: guestCount }, (_, i) => `손님${i + 1}`);
    const total = 5 + guestCount, n = total - absent.length;
    const isF = Array.from({ length: total }, (_, p) => p === 4 || p % 3 === 0 ? 1 : 0);
    const form = formValues(isF, extra);
    for (const id of absent) form[`x${id}`] = 'on';
    const setup = loadPage('setup.html', { seed: guestCount, form });
    setup.context.build();
    assert.equal(setup.element('error').hidden, true, setup.element('error').textContent);
    const url = new URL(setup.element('url').textContent);
    assert.equal(url.searchParams.get('g'), extra.join(','));
    const schedule = url.searchParams.get('s');
    assert.match(schedule, new RegExp(`^[0-9a-z]{${10 * n}}$`));
    // 10번째 이후 선수(인덱스 10~)는 a~ 문자로 담긴다.
    if (total > 10) assert.match(schedule, /[a-z]/);
    const present = Array.from({ length: total }, (_, p) => pid(p)).filter(id => !absent.includes(id));
    const summary = summaryRows(setup.element('summary').innerHTML);
    assert.deepEqual(summary.map(row => row.name.replace(/<.*/, '')),
      [...members, ...extra].filter((_, p) => !absent.includes(pid(p))));
    assert.deepEqual(JSON.parse(setup.context.localStorage.getItem('fs-setup')).g, extra);

    const page = loadPage('index.html', { url: url.href });
    assert.equal(page.element('notice').hidden, true);
    assert.deepEqual(plain(page.read('PLAYERS')), present);
    const loaded = plain(page.read('SCHEDULE'));
    loaded.forEach((round, r) => {
      const order = [...round.courts.flatMap(c => c.teams.flat()), ...round.rest];
      assert.deepEqual(order, [...schedule.slice(r * n, r * n + n)].map(d => pid(parseInt(d, 36))));
      assert.equal(round.rest.length, n - 8);
    });
    const chips = page.element('chipsG').innerHTML;
    extra.forEach((name, i) => assert.match(chips, new RegExp(`data-pid="g${i}"[^>]*>${name}<`)));
    assert.match(page.element('meta').innerHTML, new RegExp(`${n}명 · 10라운드`));
    // 10번 이후 게스트도 본인으로 선택하면 해당 이름의 일정이 나온다.
    const last = `g${guestCount - 1}`;
    const mine = loadPage('index.html', { url: url.href, stored: { 'fs-me': last } });
    assert.equal(mine.read('me'), last);
    assert.match(mine.element('me').innerHTML, new RegExp(`<strong>${extra[guestCount - 1]}</strong>`));
  });
}

test('기존 10명 링크(숫자 100자리)는 그대로 열린다', () => {
  const page = loadPage('index.html', { url: link({ w: 'm4' }) });
  assert.equal(page.element('notice').hidden, true);
  assert.equal(page.read('PLAYERS.length'), 10);
});

function guestRows(html) {
  return [...html.matchAll(/name="(g\d+)" value="([^"]*)"/g)].map(([, id, value]) => {
    const female = new RegExp(`name="s${id}" value="f" checked`).test(html);
    return `${value}${female ? '(여)' : ''}`;
  });
}

test('게스트 추가: 입력값과 성별을 유지한 채 빈 칸을 하나 늘린다', () => {
  const isF = [0, 0, 0, 0, 1, 0, 1, 0, 0, 1];
  const page = loadPage('setup.html', { form: formValues(isF) });
  page.context.addGuest();
  assert.deepEqual(guestRows(page.element('guests').innerHTML),
    ['문경신', '남기정(여)', '최주영', '김희정', '윤진주(여)', '']);
  assert.equal(page.element('addGuest').disabled, false);
});

test('게스트 삭제: 뒤쪽 게스트의 이름과 성별이 한 칸씩 당겨진다', () => {
  const isF = [0, 0, 0, 0, 1, 0, 1, 1, 0, 1];
  const page = loadPage('setup.html', { form: formValues(isF) });
  page.context.removeGuest(1);
  assert.deepEqual(guestRows(page.element('guests').innerHTML),
    ['문경신', '최주영(여)', '김희정', '윤진주(여)']);
  assert.match(page.element('guests').innerHTML, /data-remove="3"/);
  assert.doesNotMatch(page.element('guests').innerHTML, /data-remove="4"/);
});

test(`게스트는 최대 10명까지 추가할 수 있다`, () => {
  const extra = Array.from({ length: 9 }, (_, i) => `손님${i + 1}`);
  const page = loadPage('setup.html', { form: formValues(Array(14).fill(0), extra) });
  page.context.addGuest();
  assert.equal(guestRows(page.element('guests').innerHTML).length, 10);
  assert.equal(page.element('addGuest').disabled, true);
});

test('저장된 게스트 수대로 입력 칸을 만들고, 저장값이 없으면 5칸으로 시작한다', () => {
  const saved = { m: members, g: ['가', '나', '다', '라', '마', '바', '사'], w: ['g6'], x: [], base: 'https://example.test/index.html' };
  const restored = loadPage('setup.html', { stored: { 'fs-setup': JSON.stringify(saved) } });
  assert.deepEqual(guestRows(restored.element('guests').innerHTML), ['가', '나', '다', '라', '마', '바', '사(여)']);
  const fresh = loadPage('setup.html');
  assert.deepEqual(guestRows(fresh.element('guests').innerHTML), ['', '', '', '', '']);
});

test('결석 3명이어도 게스트가 6명이면 8명으로 생성한다', () => {
  const extra = [...guests, '추가'];
  const form = formValues(Array(11).fill(0), extra);
  for (const id of ['m0', 'm1', 'm2']) form[`x${id}`] = 'on';
  const setup = loadPage('setup.html', { form });
  setup.context.build();
  assert.equal(setup.element('error').hidden, true);
  assert.match(new URL(setup.element('url').textContent).searchParams.get('s'), /^[0-9a]{80}$/);
});

// ---- 요구사항: 조진희는 항상 2코트 / 남남 vs 여여 금지 (생성 링크 기준) ----
function courtsOf(page) {
  return plain(page.read('SCHEDULE')).map(round => round.courts.map(c => c.teams));
}

for (const [label, guestCount, isFemaleGuest, absent] of [
  ['기본 10명, 여성 4명', 5, [0, 1, 1, 0, 1], []],
  ['기본 10명, 여성 6명', 5, [1, 1, 1, 0, 1], []],
  ['결석 1명, 여성 2명', 5, [0, 1, 0, 0, 0], ['m0']],
  ['게스트 7명, 여성 5명', 7, [1, 0, 1, 0, 1, 0, 0], []],
  ['게스트 3명, 여성 3명', 3, [1, 1, 0], []],
]) {
  test(`조진희 2코트·남남 vs 여여 없음: ${label}`, () => {
    for (const seed of [1, 2, 3]) {
      const extra = Array.from({ length: guestCount }, (_, i) => `손님${i + 1}`);
      const isF = [0, 0, 0, 0, 1, ...isFemaleGuest];
      const form = formValues(isF, extra);
      for (const id of absent) form[`x${id}`] = 'on';
      const setup = loadPage('setup.html', { seed, form });
      setup.context.build();
      const page = loadPage('index.html', { url: setup.element('url').textContent });
      assert.equal(page.element('notice').hidden, true);
      const female = id => isF[id[0] === 'm' ? +id.slice(1) : 5 + +id.slice(1)];
      courtsOf(page).forEach((courts, r) => {
        assert.equal(courts[0].flat().includes('m4'), false, `seed ${seed} ${r + 1}라운드 조진희 1코트`);
        courts.forEach(([a, b]) => {
          const fa = female(a[0]) + female(a[1]), fb = female(b[0]) + female(b[1]);
          assert.ok(!(fa + fb === 2 && fa !== fb), `seed ${seed} ${r + 1}라운드 남남 vs 여여`);
        });
      });
      assert.ok(courtsOf(page).some(courts => courts[1].flat().includes('m4')), '조진희가 경기한 라운드가 있다');
    }
  });
}

test('조진희가 게스트 칸에 있어도 2코트에 배정한다', () => {
  const memberNames = ['권순범', '김일두', '손원식', '정선진', '홍길동'];
  const guestNames = ['문경신', '조진희', '최주영', '김희정', '윤진주'];
  const isF = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
  const form = Object.fromEntries([...memberNames, ...guestNames].flatMap((name, p) => [
    [pid(p), name], [`s${pid(p)}`, isF[p] ? 'f' : 'm'],
  ]));
  for (const seed of [1, 2, 3]) {
    const setup = loadPage('setup.html', { seed, form });
    setup.context.build();
    const page = loadPage('index.html', { url: setup.element('url').textContent });
    courtsOf(page).forEach(courts => assert.equal(courts[0].flat().includes('g1'), false));
  }
});

test('조진희가 결석하면 2코트 고정 없이 코트 순서 규칙만 적용한다', () => {
  const isF = [0, 0, 0, 0, 1, 0, 1, 1, 1, 1];
  const form = { ...formValues(isF), xm4: 'on' };
  const setup = loadPage('setup.html', { seed: 5, form });
  let court2;
  const original = setup.context.buildSchedule;
  setup.context.buildSchedule = (...args) => { court2 = args[2]; return original(...args); };
  setup.context.build();
  assert.deepEqual(plain(court2), []);
});
