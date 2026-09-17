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

function formValues(isF = Array(10).fill(0)) {
  return Object.fromEntries([...members, ...guests].flatMap((name, p) => [
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
  ['게스트 4명', { g: guests.slice(0, 4).join(',') }],
  ['게스트 6명', { g: [...guests, '추가'].join(',') }],
  ['빈 이름', { m: '권순범,김일두, ,정선진,조진희' }],
  ['명단 누락', { m: null, g: null }],
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
