// ENGINE START
class CalcError extends Error {}
const NUM = /(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;

function tokenize(src) {
  const out = [];
  let i = 0;
  const ops = { '+': '+', '−': '-', '-': '-', '×': '*', '*': '*', '÷': '/', '/': '/', '^': '^', '%': '%', '(': '(', ')': ')' };
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      NUM.lastIndex = i;
      const m = NUM.exec(src);
      if (!m) throw new CalcError('Invalid number');
      out.push({ t: 'n', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ops[c]) { out.push({ t: 'o', v: ops[c] }); i++; continue; }
    throw new CalcError('Unexpected "' + c + '"');
  }
  return out;
}

// Grammar, lowest precedence first:
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '/') unary | '(' ...)*        implicit multiplication: 2(3)
//   unary   := ('-' | '+') unary | power
//   power   := postfix ('^' unary)?                        right-associative, so -2^2 = -4
//   postfix := primary '%'*
//   primary := number | '(' expr ')'
function parse(tokens) {
  let p = 0;
  const peek = () => tokens[p];
  const isOp = (v) => peek() && peek().t === 'o' && peek().v === v;

  function expr() {
    let l = term();
    while (isOp('+') || isOp('-')) {
      const o = tokens[p++].v;
      const r = term();
      l = o === '+' ? l + r : l - r;
    }
    return l;
  }
  function term() {
    let l = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const o = tokens[p++].v;
        const r = unary();
        if (o === '/') {
          if (r === 0) throw new CalcError('Cannot divide by zero');
          l = l / r;
        } else l = l * r;
      } else if (isOp('(')) {
        l = l * unary();
      } else break;
    }
    return l;
  }
  function unary() {
    if (isOp('-')) { p++; return -unary(); }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power() {
    const b = postfix();
    if (isOp('^')) {
      p++;
      const e = unary();
      const r = Math.pow(b, e);
      if (Number.isNaN(r)) throw new CalcError('Undefined result');
      return r;
    }
    return b;
  }
  function postfix() {
    let v = primary();
    while (isOp('%')) { p++; v = v / 100; }
    return v;
  }
  function primary() {
    const k = peek();
    if (!k) throw new CalcError('Incomplete expression');
    if (k.t === 'n') { p++; return k.v; }
    if (isOp('(')) {
      p++;
      const v = expr();
      if (!isOp(')')) throw new CalcError('Missing )');
      p++;
      return v;
    }
    throw new CalcError('Unexpected "' + k.v + '"');
  }

  const v = expr();
  if (p < tokens.length) throw new CalcError('Unexpected input');
  return v;
}

function evaluate(src) {
  let s = src;
  const open = (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
  if (open > 0) s += ')'.repeat(open);
  if (!s.trim()) throw new CalcError('Nothing to calculate');
  const v = parse(tokenize(s));
  if (!Number.isFinite(v)) throw new CalcError('Result too large');
  return parseFloat(v.toPrecision(12));
}

function fmt(n) {
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-9) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return n.toLocaleString('en-US', { maximumFractionDigits: 12 });
}
function raw(n) { return String(n).replace('-', '−'); }
// ENGINE END

(function () {
  const $ = (id) => document.getElementById(id);
  const screenEl = $('screen'), prevEl = $('prev'), exprEl = $('expr'), resultEl = $('result');
  const tapeEl = $('tape'), emptyEl = $('empty'), clearTapeBtn = $('clearTape'), toastEl = $('toast');
  const STORE = 'tape-calculator-history';

  const state = { expr: '2+3×4^2÷8', prev: '', done: false, error: '', history: [] };
  let toastTimer = 0;

  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '[]');
    if (Array.isArray(saved)) state.history = saved.filter((h) => h && typeof h.expr === 'string' && typeof h.result === 'number').slice(0, 50);
  } catch (e) { /* storage unavailable */ }
  function saveHistory() {
    try { localStorage.setItem(STORE, JSON.stringify(state.history)); } catch (e) { /* ignore */ }
  }

  const isOpCh = (c) => '+−×÷^'.includes(c);
  const lastCh = () => state.expr.slice(-1);
  const isValueEnd = (c) => /[0-9.)%]/.test(c);
  const openCount = () => (state.expr.match(/\(/g) || []).length - (state.expr.match(/\)/g) || []).length;
  const pretty = (s) => s.replace(/(?<=[\d.)%])([+−×÷])/g, ' $1 ');

  function startFresh() {
    if (state.done) { state.expr = ''; state.prev = ''; state.done = false; }
  }
  function continueFromResult() {
    if (state.done) { state.done = false; state.prev = ''; }
  }

  function digit(d) {
    startFresh();
    if (isValueEnd(lastCh()) && (lastCh() === ')' || lastCh() === '%')) state.expr += '×';
    const seg = /[0-9.]*$/.exec(state.expr)[0];
    if (seg === '0') state.expr = state.expr.slice(0, -1);
    state.expr += d;
  }
  function dot() {
    startFresh();
    if (lastCh() === ')' || lastCh() === '%') state.expr += '×';
    const seg = /[0-9.]*$/.exec(state.expr)[0];
    if (seg.includes('.')) return;
    if (seg === '') state.expr += '0';
    state.expr += '.';
  }
  function op(o) {
    continueFromResult();
    const e = state.expr;
    const last = e.slice(-1);
    if (e === '') { if (o === '−') state.expr = '−'; return; }
    if (isOpCh(last) || last === '(') {
      if (o === '−' && '×÷^('.includes(last)) { state.expr += '−'; return; }
      if (last === '(') return;
      let s = e;
      while (s && isOpCh(s.slice(-1))) s = s.slice(0, -1);
      if (s === '' || s.slice(-1) === '(') return;
      state.expr = s + o;
      return;
    }
    state.expr += o;
  }
  function percent() {
    continueFromResult();
    if (isValueEnd(lastCh())) state.expr += '%';
  }
  function openParen() {
    startFresh();
    if (isValueEnd(lastCh())) state.expr += '×';
    state.expr += '(';
  }
  function closeParen() {
    continueFromResult();
    if (openCount() > 0 && isValueEnd(lastCh())) state.expr += ')';
  }
  function backspace() {
    if (state.done) { state.done = false; state.prev = ''; }
    state.expr = state.expr.slice(0, -1);
  }
  function clearAll() { state.expr = ''; state.prev = ''; state.done = false; }

  function equals() {
    if (state.done || state.expr === '') return;
    try {
      const v = evaluate(state.expr);
      state.history.unshift({ expr: state.expr, result: v });
      state.history = state.history.slice(0, 50);
      saveHistory();
      state.prev = pretty(state.expr) + ' =';
      state.expr = raw(v);
      state.done = true;
      state.error = '';
    } catch (err) {
      state.error = err instanceof CalcError ? err.message : 'Could not calculate';
      screenEl.classList.remove('shake');
      void screenEl.offsetWidth;
      screenEl.classList.add('shake');
    }
  }

  function previewValue() {
    if (state.done || state.expr === '') return null;
    const src = state.expr.replace(/[+−×÷^]+$/, '');
    if (src === '' || /^−?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(src)) return null;
    try { return evaluate(src); } catch (e) { return null; }
  }

  function render() {
    exprEl.textContent = state.expr === '' ? '0' : pretty(state.expr);
    exprEl.classList.toggle('placeholder', state.expr === '');
    const len = exprEl.textContent.length;
    exprEl.classList.toggle('sm', len > 12 && len <= 18);
    exprEl.classList.toggle('xs', len > 18);
    prevEl.textContent = state.prev;
    if (state.error) {
      resultEl.className = 'result err';
      resultEl.textContent = state.error;
    } else {
      resultEl.className = 'result';
      const pv = previewValue();
      resultEl.textContent = pv === null ? '' : '= ' + fmt(pv);
    }
    exprEl.scrollLeft = exprEl.scrollWidth;
    renderTape();
  }

  function renderTape() {
    tapeEl.textContent = '';
    emptyEl.hidden = state.history.length > 0;
    clearTapeBtn.hidden = state.history.length === 0;
    state.history.forEach((h, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'row';
      b.type = 'button';
      b.dataset.i = String(i);
      b.setAttribute('aria-label', 'Load ' + pretty(h.expr) + ' equals ' + fmt(h.result));
      const re = document.createElement('span');
      re.className = 're';
      re.textContent = pretty(h.expr);
      const rr = document.createElement('span');
      rr.className = 'rr';
      rr.textContent = '= ' + fmt(h.result);
      b.append(re, rr);
      li.appendChild(b);
      tapeEl.appendChild(li);
    });
  }

  function toast(msg) {
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.textContent = ''; }, 2200);
  }

  function press(k) {
    state.error = '';
    if (k >= '0' && k <= '9' && k.length === 1) digit(k);
    else if (k === '.') dot();
    else if (k === '+' || k === '−' || k === '×' || k === '÷' || k === '^') op(k);
    else if (k === '%') percent();
    else if (k === '(') openParen();
    else if (k === ')') closeParen();
    else if (k === 'B') backspace();
    else if (k === 'C') clearAll();
    else if (k === '=') equals();
    render();
  }

  $('keys').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) press(b.dataset.k);
  });

  tapeEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const h = state.history[Number(b.dataset.i)];
    if (!h) return;
    state.expr = h.expr;
    state.prev = '';
    state.done = false;
    state.error = '';
    render();
  });

  clearTapeBtn.addEventListener('click', () => {
    state.history = [];
    saveHistory();
    render();
  });

  $('copy').addEventListener('click', () => {
    let text = null;
    if (state.done) text = state.expr.replace('−', '-');
    else { const v = previewValue(); if (v !== null) text = String(v); }
    if (text === null) { toast('Nothing to copy yet. Press = first.'); return; }
    try {
      navigator.clipboard.writeText(text).then(
        () => toast('Copied ' + text),
        () => toast('Copying is blocked here. Select the result instead.')
      );
    } catch (e) {
      toast('Copying is blocked here. Select the result instead.');
    }
  });

  const keyMap = { '*': '×', x: '×', X: '×', '/': '÷', '-': '−', ',': '.', Enter: '=', '=': '=', Backspace: 'B', Escape: 'C', Delete: 'C' };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let k = e.key;
    if (Object.prototype.hasOwnProperty.call(keyMap, k)) k = keyMap[k];
    else if (!/^[0-9.+^%()]$/.test(k)) return;
    e.preventDefault();
    const btn = document.querySelector('[data-k="' + k + '"]');
    if (btn) {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 110);
    }
    press(k);
  });

  render();
})();
