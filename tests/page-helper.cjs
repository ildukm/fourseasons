const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// HTML 안의 실제 스크립트를 실행한다. DOM은 이 테스트에서 사용하는 입출력만 제공한다.
function loadPage(file, { seed = 1, url = `https://example.test/${file}`, form = {} } = {}) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        value: '', innerHTML: '', textContent: '', hidden: true,
        classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
        addEventListener() {}, scrollIntoView() {},
      });
    }
    return elements.get(id);
  }
  const storage = new Map();
  const math = Object.create(Math);
  math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const context = vm.createContext({
    Math: math, URL, URLSearchParams,
    location: new URL(url),
    document: { getElementById: element, addEventListener() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    FormData: class { get(key) { return form[key] ?? null; } },
  });
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!script) throw new Error(`${file}: 인라인 스크립트 없음`);
  vm.runInContext(script[1], context, { filename: file });
  return { context, element, read: expression => vm.runInContext(expression, context) };
}

module.exports = { loadPage };
