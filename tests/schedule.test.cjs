const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadPage } = require('./page-helper.cjs');

function generate(isF, seed) {
  const { context } = loadPage('setup.html', { seed });
  const input = isF.slice();
  const rounds = context.buildSchedule(Object.freeze(input));
  assert.deepEqual(input, isF, '입력 성별 배열을 변경하지 않는다');
  return rounds;
}

function inspect(rounds, isF) {
  const rest = Array(10).fill(0);
  const counts = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
  const games = [0, 0, 0, 0];
  assert.equal(rounds.length, 10);
  assert.match(rounds.map(row => row.join('')).join(''), /^\d{100}$/);
  for (const row of rounds) {
    assert.equal(row.length, 10);
    row.forEach(p => assert.ok(Number.isInteger(p) && p >= 0 && p < 10));
    assert.equal(Array.from(row).sort().join(''), '0123456789');
    row.slice(8).forEach(p => rest[p]++);
    for (let c = 0; c < 8; c += 4) {
      const a = isF[row[c]] + isF[row[c + 1]];
      const b = isF[row[c + 2]] + isF[row[c + 3]];
      const type = a === b ? a : 3;
      games[type]++;
      row.slice(c, c + 4).forEach(p => counts[p][type]++);
    }
  }
  assert.deepEqual(rest, Array(10).fill(2));
  counts.forEach(c => assert.equal(c.reduce((a, b) => a + b), 8));
  return { games, counts };
}

function inspectPreferred(rounds, isF) {
  const { games, counts } = inspect(rounds, isF);
  const women = isF.reduce((a, b) => a + b);
  for (const row of rounds) {
    const court1 = isF[row[0]] + isF[row[1]];
    const court2 = isF[row[4]] + isF[row[5]];
    assert.ok(court1 <= court2, '코트 순서는 남복·혼복·여복 순');
  }
  assert.deepEqual(games, [18 - 2 * women, 4, 2 * women - 2, 0]);
  for (const sex of [0, 1]) {
    const mixed = counts.filter((_, p) => isF[p] === sex).map(c => c[1]);
    assert.ok(Math.min(...mixed) >= 1, '혼복 미참여 없음');
    assert.ok(Math.max(...mixed) - Math.min(...mixed) <= 1, `혼복 편중: ${mixed}`);
  }
  counts.forEach((c, p) => {
    assert.equal(c[isF[p] ? 0 : 2], 0, '성별에 맞지 않는 동성 복식 참여 없음');
    assert.ok(c[isF[p] ? 2 : 0] >= 6, '개인별 동성 복식 최소 6회');
  });
  return { games, counts };
}

for (const women of [4, 5, 6]) {
  test(`${10 - women}남·${women}녀: 동성 복식 16경기, 혼복 4경기와 균등한 참여`, () => {
    for (let seed = 1; seed <= 20; seed++) {
      // 클럽원/게스트에 같은 성별이 몰린 경우도 포함한다.
      const isF = Array.from({ length: 10 }, (_, p) => (p * 3 + seed) % 10 < women ? 1 : 0);
      assert.doesNotThrow(() => inspectPreferred(generate(isF, seed), isF), `seed ${seed}`);
    }
  });
}

test('그 외 성별 구성도 각자 8경기·휴식 2회를 유지한다', () => {
  for (const women of [0, 1, 2, 3, 7, 8, 9, 10]) {
    const isF = Array.from({ length: 10 }, (_, p) => p < women ? 1 : 0);
    const { games } = inspect(generate(isF, women + 100), isF);
    if (women === 0) assert.deepEqual(games, [20, 0, 0, 0]);
    if (women === 10) assert.deepEqual(games, [0, 0, 20, 0]);
  }
});

for (let clubWomen = 0; clubWomen <= 5; clubWomen++) {
  for (let guestWomen = 0; guestWomen <= 5; guestWomen++) {
    test(`성별 분포: 클럽원 여성 ${clubWomen}명 / 게스트 여성 ${guestWomen}명`, () => {
      for (const [offset, seed] of [0, 0xdeadbeef, 0xffffffff].entries()) {
        const isF = [clubWomen, guestWomen].flatMap(n =>
          Array.from({ length: 5 }, (_, i) => (i * 2 + offset) % 5 < n ? 1 : 0));
        const women = clubWomen + guestWomen;
        assert.doesNotThrow(() => {
          const rounds = generate(isF, seed);
          if (women >= 4 && women <= 6) inspectPreferred(rounds, isF);
          else inspect(rounds, isF);
        }, `offset ${offset}, seed ${seed}`);
      }
    });
  }
}

test('첨부 명단: 여성 m4/g2/g3/g4는 여복 6회·혼복 2회씩 참여한다', () => {
  const isF = [0, 0, 0, 0, 1, 0, 0, 1, 1, 1];
  for (const seed of [0, 7, 42, 20260917, 0xffffffff]) {
    const { counts } = inspectPreferred(generate(isF, seed), isF);
    for (const p of [4, 7, 8, 9]) assert.deepEqual(counts[p], [0, 2, 6, 0]);
  }
});

test('같은 난수 시드는 재현 가능하고 다른 시드는 서로 다른 대진을 만든다', () => {
  const isF = [0, 0, 0, 0, 1, 0, 0, 1, 1, 1];
  const serialize = seed => JSON.stringify(generate(isF, seed));
  assert.equal(serialize(42), serialize(42));
  assert.equal(new Set([1, 2, 3, 4, 5].map(serialize)).size, 5);
});

// 최적화 선호는 모든 생성 결과의 강제 조건으로 취급하지 않고 비교 점수로 검증한다.
test('평가 점수는 코트·팀·팀원 표기 순서와 전체 성별 반전에 영향받지 않는다', () => {
  const { context } = loadPage('setup.html');
  const isF = [0, 0, 0, 0, 1, 0, 0, 1, 1, 1];
  const rounds = generate(isF, 42);
  const swapped = rounds.map(row => [row[7], row[6], row[5], row[4], row[3], row[2], row[1], row[0], row[9], row[8]]);
  for (const preferred of [false, true]) {
    const cost = context.scheduleCost(rounds, isF, preferred);
    assert.ok(Number.isFinite(cost));
    assert.equal(context.scheduleCost(swapped, isF, preferred), cost);
    assert.equal(context.scheduleCost(rounds, isF.map(f => 1 - f), preferred), cost);
  }
});

test('동성 복식 우선 모드는 양 팀 여성 수가 다른 대진을 거부한다', () => {
  const { context } = loadPage('setup.html');
  const isF = [0, 0, 0, 0, 1, 1, 1, 1, 0, 1];
  const rounds = Array.from({ length: 10 }, () => Array.from({ length: 10 }, (_, p) => p));
  assert.ok(Number.isFinite(context.scheduleCost(rounds, isF, true)));
  [rounds[0][0], rounds[0][4]] = [rounds[0][4], rounds[0][0]];
  assert.equal(context.scheduleCost(rounds, isF, true), Infinity);
  assert.ok(Number.isFinite(context.scheduleCost(rounds, isF, false)));
});

test('같은 경기 구성이면 휴식이 붙어 있는 순서보다 간격을 둔 순서를 선호한다', () => {
  const { context } = loadPage('setup.html');
  const rows = Array.from({ length: 5 }, (_, r) => {
    const rest = [r, r + 5];
    return [...Array.from({ length: 10 }, (_, p) => p).filter(p => !rest.includes(p)), ...rest];
  });
  const grouped = rows.flatMap(row => [row, row]);
  const separated = [...rows, ...rows];
  assert.ok(context.scheduleCost(grouped, Array(10).fill(0), false) >
    context.scheduleCost(separated, Array(10).fill(0), false));
});

test('같은 선수·휴식 구성에서는 파트너와 상대를 다양하게 만나는 대진을 선호한다', () => {
  const { context } = loadPage('setup.html');
  const row = Array.from({ length: 10 }, (_, p) => p);
  const repeated = Array.from({ length: 10 }, () => row.slice());
  const varied = Array.from({ length: 10 }, (_, r) => [
    ...Array.from({ length: 8 }, (_, p) => (p + r) % 8), 8, 9,
  ]);
  assert.ok(context.scheduleCost(repeated, Array(10).fill(0), false) >
    context.scheduleCost(varied, Array(10).fill(0), false));
});
