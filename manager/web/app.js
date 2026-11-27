/* 한강라면 관리 — 화면 동작 (pywebview) */
'use strict';

/* ───────── 기본 도구 ───────── */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n || 0).toLocaleString('ko-KR');
const won = (n) => fmt(n) + '원';
const pad = (n) => String(n).padStart(2, '0');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const ymOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
const ymdOf = (d) => ymOf(d) + '-' + pad(d.getDate());
const hm = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const num = (v) => { const n = parseInt(String(v == null ? '' : v).replace(/[^\d-]/g, ''), 10); return isFinite(n) ? n : 0; };
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '-');
const NOW = new Date();
const TODAY = ymdOf(NOW);
const CUR = ymOf(NOW);
const dimOf = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dowOf = (key, d) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
const mLabel = (key) => { const [y, m] = key.split('-'); return y + '년 ' + Number(m) + '월'; };
const mShort = (key) => Number(key.split('-')[1]) + '월';

const CATS = {
  coupang: { label: '쿠팡 발주', color: '#3182f6' },
  fixed: { label: '고정비', color: '#8b5cf6' },
  supply: { label: '기타', color: '#ffb020' },   // 예전에 넣은 '소모품'도 '기타'로 보임
  repair: { label: '기타', color: '#ffb020' },
  fee: { label: '카드 수수료', color: '#a0a8b3' },
};
const MACH_ORDER = ['라면1', '라면2', '냉동', '냉장'];
const NONFOOD_COLOR = '#0d9488';

/* 쿠팡 주문이 음식인지 자동 구별 (틀리면 오른쪽 칸에서 바꿀 수 있음 → settings.cpFood 에 기억) */
const NONFOOD_STRONG = /트레이|거치대|스타킹|양말|후크|걸이|화이트보드|칠판|자석|케이블|충전기|충전|어댑터|멀티탭|건전지|배터리|전구|LED|조명|용기|포장|봉투|비닐|지퍼백|위생백|위생랩|크린랩|비닐랩|호일|장갑|마스크|앞치마|물티슈|티슈|휴지|키친타올|세제|세정|소독|청소|걸레|수세미|행주|빗자루|쓰레기|분리수거|방향제|탈취|살충|모기|테이프|라벨|스티커|POP|안내문|가격표|아크릴|꽂이|파일|볼펜|마커|매직|노트|가위|커터칼|커터|집게|클립|바구니|박스|상자|수납|정리함|선반|스탠드|케이스|필름|거울|시계|공구|드라이버|나사|실리콘|접착|본드|글루|전선|스위치|콘센트|온도계|저울|선풍기|히터|매트|커버|덮개|자물쇠|열쇠|도어|경첩|축구|튜브|티셔츠|신발|가방|나무젓가락|젓가락|포크|숟가락|스푼|빨대|종이컵|컵홀더|냅킨|이쑤시개|영수증|감열지|롤지|카드단말|프린터|토너|잉크/i;
const FOOD_HINT = /라면|소면|냉면|당면|짜파|짬뽕|우동|국수|밥|김밥|햇반|덮밥|김치|소시지|비엔나|햄|만두|핫도그|피자|버거|치즈|닭|고기|제육|불고기|돈까스|떡|어묵|계란|달걀|우유|음료|주스|커피|수염차|녹차|보리차|옥수수차|생수|콜라|사이다|과자|스낵|초콜릿|사탕|젤리|빵|케이크|아이스|고춧가루|양념|소스|간장|된장|고추장|설탕|소금|후추|참기름|식용유|마요|케찹|케첩|조미김|김자반|도시락김|단무지|참치|스팸|육수|스프|분말|가루|\d+\s*(g|kg|ml|L)(?![a-z])|kg|\(냉동\)|\(냉장\)|냉동|냉장/i;
const catLabel = (x) => (x.kind === 'cp' ? (x.food ? '음식' : '소모품') : CATS[x.cat].label);
function isFood(x) {
  const o = (S.settings.cpFood || {})[x.id];
  if (o === true || o === false) return o;
  const t = (x.name || '') + ' ' + (x.option || '');
  if (NONFOOD_STRONG.test(x.name || '')) return false;
  if (FOOD_HINT.test(t)) return true;
  return !NONFOOD_STRONG.test(t);
}
const ICON = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 8h6V4h-6zM4 20h6v-3H4z', sales: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  exp: 'M4 6h16v13H4zM4 10h16M8 15h3', stock: 'M3 8l9-5 9 5v9l-9 5-9-5zM3 8l9 5 9-5M12 13v9',
  report: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4', settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.4 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4z',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7', x: 'M6 6l12 12M18 6L6 18', refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  copy: 'M9 9h11v11H9zM5 15V5a1 1 0 0 1 1-1h10',
};
const svg = (name, size) => `<svg class="ic" width="${size || 15}" height="${size || 15}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[name]}"/></svg>`;

/* ───────── 프로그램(파이썬) 연결 ───────── */
const B = {
  ok: () => !!(window.pywebview && window.pywebview.api && window.pywebview.api.load_json),
  async call(name, ...args) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || !api[name]) throw new Error('프로그램과 연결되지 않았습니다');
    return api[name](...args);
  },
};

/* ───────── 상태 ───────── */
const S = {
  view: 'overview', month: CUR, months: [CUR],
  data: { daily: {}, stock: {}, machines: MACH_ORDER.slice(), platforms: {}, generated_at: '' }, status: {},
  coupang: [], checked: new Set(), expenses: [], settings: {}, snaps: {},
  sel: null, cat: 'all', q: '', stf: '라면1', pending: {}, crawling: false, crawlPages: 0, crawlAdded: 0,
  undo: null, savedAt: '', cpOpen: false, meta: {}, jobs: {}, cfg: {},
};

const saveTimers = {};
function persist(name) {
  clearTimeout(saveTimers[name]);
  saveTimers[name] = setTimeout(async () => {
    const val = { coupang_orders: S.coupang, checked: Array.from(S.checked), expenses: S.expenses, settings: S.settings, snaps: S.snaps }[name];
    try { await B.call('save_json', name, JSON.stringify(val)); }
    catch (e) { toast('저장하지 못했습니다: ' + e.message, { err: true }); }
  }, 250);
}

/* ───────── 알림 · 팝업 ───────── */
let toastTimer = null;
function toast(msg, opt) {
  opt = opt || {};
  const el = document.createElement('div');
  el.className = 'toast' + (opt.err ? ' err' : '');
  el.innerHTML = `<span>${esc(msg)}</span>` + (opt.action ? `<button type="button">${esc(opt.action)}</button>` : '');
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  document.body.appendChild(el);
  if (opt.action) el.querySelector('button').onclick = () => { el.remove(); opt.onAction && opt.onAction(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), opt.ms || (opt.action ? 6000 : 3200));
}
function busy(msg) {
  const el = document.createElement('div');
  el.className = 'busy';
  el.innerHTML = `<div><span class="spin"></span><span>${esc(msg)}</span></div>`;
  document.body.appendChild(el);
  return () => el.remove();
}
function closeLayer() { $('#layer').innerHTML = ''; }
function dialog(html) { $('#layer').innerHTML = `<div class="ovl" data-act="closeLayer"></div><div class="dlg" role="dialog">${html}</div>`; }

/* ───────── 월 범위 ───────── */
function buildMonths() {
  let min = CUR;
  Object.keys(S.data.daily).forEach((d) => { if (d.slice(0, 7) < min) min = d.slice(0, 7); });
  S.coupang.forEach((x) => { if (x.date && x.date.slice(0, 7) < min) min = x.date.slice(0, 7); });
  S.expenses.forEach((x) => { if (x.date && x.date.slice(0, 7) < min) min = x.date.slice(0, 7); });
  const out = [];
  let [y, m] = min.split('-').map(Number);
  for (let guard = 0; guard < 240; guard++) {
    const k = y + '-' + pad(m); out.push(k);
    if (k >= CUR) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  S.months = out;
  if (!out.includes(S.month)) S.month = CUR;
}

/* ───────── 지출 (쿠팡 + 직접 입력) ───────── */
const cpKey = (x) => [x.orderId || x.date, x.name, x.option, x.qty, x.final != null ? x.final : x.total].join('|');
function entriesOf(key) {
  const list = [];
  S.coupang.forEach((x) => {
    if (!x.date || x.date.slice(0, 7) !== key) return;
    const k = cpKey(x);
    list.push({ kind: 'cp', id: k, date: x.date, name: x.name, option: x.option || '', cat: 'coupang', amount: Math.round(x.final != null ? x.final : (x.total || 0)), memo: x.option ? x.option + (x.qty > 1 ? ' · ' + x.qty + '개' : '') : (x.qty > 1 ? x.qty + '개' : ''), include: S.checked.has(k), exact: !!x.exact, qty: x.qty, orderId: x.orderId });
    list[list.length - 1].food = isFood(list[list.length - 1]);
  });
  S.expenses.forEach((e) => {
    if (!e.date || e.date.slice(0, 7) !== key) return;
    list.push({ kind: 'mn', id: e.id, date: e.date, name: e.name, cat: e.cat, amount: Math.round(e.amount || 0), memo: e.memo || '', include: e.include !== false, repeat: !!e.repeat, repeatOf: e.repeatOf });
  });
  list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  return list;
}
const machinesOf = () => {
  const ms = (S.data.machines && S.data.machines.length ? S.data.machines : MACH_ORDER).slice();
  return MACH_ORDER.filter((m) => ms.includes(m)).concat(ms.filter((m) => !MACH_ORDER.includes(m)));
};
function totals(key) {
  const dim = dimOf(key), isCur = key === CUR, upto = isCur ? NOW.getDate() : dim;
  const byDay = new Array(dim).fill(0), byMach = {}, prodDay = {};
  for (let d = 1; d <= dim; d++) {
    const day = S.data.daily[key + '-' + pad(d)];
    if (!day) continue;
    Object.keys(day).forEach((m) => {
      const v = day[m].v || 0; byDay[d - 1] += v;
      if (!byMach[m]) byMach[m] = new Array(dim).fill(0);
      byMach[m][d - 1] += v;
    });
  }
  const sales = byDay.reduce((a, b) => a + b, 0);
  const list = entriesOf(key), inc = list.filter((x) => x.include);
  const rate = Number(S.settings.feeRate || 0);
  const byCat = { coupang: 0, fixed: 0, supply: 0, repair: 0, fee: Math.round(sales * rate / 100) };
  inc.forEach((x) => { byCat[x.cat] = (byCat[x.cat] || 0) + x.amount; });
  const exp = Object.keys(byCat).reduce((a, k) => a + byCat[k], 0);
  const elapsed = isCur ? Math.max(0.5, upto - 1 + (NOW.getHours() * 60 + NOW.getMinutes()) / 1440) : dim;
  return { key, dim, upto, isCur, byDay, byMach, sales, list, inc, byCat, exp, profit: sales - exp, elapsed, prodDay };
}
function partial(key, upto) {
  const t = totals(key), days = Math.min(upto, t.dim);
  const sales = t.byDay.slice(0, days).reduce((a, b) => a + b, 0);
  const byCat = { coupang: 0, fixed: 0, supply: 0, repair: 0, fee: Math.round(sales * Number(S.settings.feeRate || 0) / 100) };
  t.inc.forEach((x) => { if (num(x.date.slice(8)) <= days) byCat[x.cat] += x.amount; });
  const exp = Object.keys(byCat).reduce((a, k) => a + byCat[k], 0);
  return { sales, byCat, exp, profit: sales - exp };
}
const prevKey = (key) => { let [y, m] = key.split('-').map(Number); m--; if (m < 1) { m = 12; y--; } return y + '-' + pad(m); };

/* 매달 반복 지출: 지난 달 것을 이번 달까지 자동으로 채움 */
function ensureRepeats() {
  let changed = false;
  S.expenses.filter((e) => e.repeat && !e.repeatOf).forEach((p) => {
    const start = p.date.slice(0, 7), day = num(p.date.slice(8));
    let [y, m] = start.split('-').map(Number);
    for (let g = 0; g < 120; g++) {
      m++; if (m > 12) { m = 1; y++; }
      const k = y + '-' + pad(m);
      if (k > CUR) break;
      if ((p.repeatSkip || []).includes(k)) continue;
      if (S.expenses.some((e) => (e.repeatOf === p.id || e.id === p.id) && e.date.slice(0, 7) === k)) continue;
      const last = S.expenses.filter((e) => e.repeatOf === p.id || e.id === p.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || p;
      S.expenses.push({ id: newId(), repeatOf: p.id, date: k + '-' + pad(Math.min(day, dimOf(k))), name: p.name, cat: p.cat, amount: last.amount, memo: p.memo || '', include: true });
      changed = true;
    }
  });
  if (changed) persist('expenses');
}
const newId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ───────── 재고 ───────── */
function perDay(machine, product) {
  let c = 0;
  for (let i = 1; i <= 14; i++) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - i);
    const day = S.data.daily[ymdOf(d)];
    const p = day && day[machine] && day[machine].p && day[machine].p[product];
    if (p) c += p.c || 0;
  }
  return c / 14;
}
function stockOf(machine) {
  const items = (S.data.stock[machine] || []).slice().sort((a, b) => num(a.order) - num(b.order));
  const pend = S.pending[machine] || {};
  return items.map((it, i) => {
    const pe = pend[it.product];
    const qty = pe && pe.qty != null ? pe.qty : it.qty, price = pe && pe.price != null ? pe.price : it.price;
    const pd = perDay(machine, it.product), days = pd > 0 ? qty / pd : Infinity;
    const lv = qty <= 0 ? 3 : days < 2 ? 2 : days < 5 ? 1 : 0;
    return { i, machine, product: it.product, order: it.order, qty, price, max: it.max || 0, orig: it, changed: !!pe, perDay: pd, lv,
      state: ['충분', '부족', '품절 임박', '품절'][lv], color: ['#0b8a5c', '#b25e00', '#d0312d', '#d0312d'][lv] };
  });
}
const allLow = () => MACH_ORDER.flatMap((m) => stockOf(m)).filter((s) => s.lv > 0).sort((a, b) => b.lv - a.lv || a.qty - b.qty);
const isVP = (m) => (S.data.platforms || {})[m] === 'vendingpay' || /^라면/.test(m);

/* ───────── 화면: 사이드바 · 툴바 · 상태줄 ───────── */
function renderSide() {
  const t = totals(S.month), low = allLow().length;
  const item = (id, label, cnt) => `<button type="button" class="sb${S.view === id ? ' on' : ''}" data-act="go" data-v="${id}">${svg(id)}${label}<span class="cnt">${cnt || ''}</span></button>`;
  const me = S.meta || {};
  const gen = me.generated_at ? me.generated_at.replace('T', ' ').slice(5, 16).replace('-', '/') : '';
  const ago = me.generated_at ? Math.round((Date.now() - new Date(me.generated_at).getTime()) / 60000) : null;
  const stale = ago != null && ago > 30;
  const dot = me.err ? 'var(--neg)' : stale ? '#e8890c' : 'var(--pos)';
  $('#side').innerHTML = `
    <div class="sh">매장</div>${item('overview', '개요')}${item('sales', '매출')}
    <div class="sh">장부</div>${item('exp', '지출', t.list.length || '')}
    <div class="sh">재고</div>${item('stock', '재고 현황', low ? '부족 ' + low : '')}
    <div class="sh">보고서</div>${item('report', '월별 손익')}
    <div style="margin-top:auto;padding:10px 6px 4px;border-top:1px solid var(--line2);font-size:11px;line-height:1.7" class="mu">
      <div style="display:flex;align-items:center;gap:6px;color:var(--tx2);font-weight:600"><span class="dot" style="background:${dot}"></span>${me.configured === false ? 'GitHub 연결 필요' : '노트북 봇 데이터'}</div>
      <div>${me.err ? '<span class="neg">' + esc(me.err) + '</span>' : gen ? gen + ' 기준' + (ago != null ? ' (' + (ago < 1 ? '방금' : ago < 60 ? ago + '분 전' : Math.round(ago / 60) + '시간 전') + ')' : '') : '불러오는 중…'}</div>
      ${stale && !me.err ? '<div class="warn">노트북 봇이 꺼져 있는지 확인해 주세요</div>' : ''}
      <button type="button" class="tb soft" style="margin-top:6px;width:100%" data-act="runNow">${svg('refresh', 13)}지금 새로고침</button>
    </div>
    ${item('settings', '설정')}`;
}
function renderToolbar() {
  const i = S.months.indexOf(S.month);
  $('#mLabel').textContent = mLabel(S.month);
  $('#mPrev').disabled = i <= 0; $('#mNext').disabled = i >= S.months.length - 1;
  $('#tbTitle').textContent = { overview: '개요', sales: '매출 — 날짜별', exp: '지출 장부', stock: '재고 현황', report: '월별 손익', settings: '설정' }[S.view];
  const add = $('#btnAdd');
  add.hidden = !(S.view === 'exp' || S.view === 'overview');
  $('#btnCoupangLabel').textContent = S.crawling ? `가져오는 중 · ${S.crawlPages}페이지 (중지)` : '쿠팡 가져오기';
  $('#btnCoupang').classList.toggle('pri', S.crawling);
}
function setStatus(l, m) { $('#stLeft').textContent = l || ''; $('#stMid').textContent = m || ''; }

/* ───────── 화면: 개요 ───────── */
function barsHtml(t, h, clickable) {
  const mx = Math.max(1, ...t.byDay);
  let out = '';
  for (let i = 0; i < t.dim; i++) {
    const v = i < t.upto ? t.byDay[i] : 0, on = S.view === 'sales' && S.sel === i + 1;
    const tip = `${num(t.key.slice(5))}/${i + 1} (${DOW[dowOf(t.key, i + 1)]}) ${won(v)}`;
    out += `<div>${i < t.upto ? `<button type="button" class="bb${on ? ' on' : (S.view === 'sales' && S.sel ? ' dim' : '')}" style="height:${Math.round(v / mx * 100)}%" title="${esc(tip)}" aria-label="${esc(tip)}" ${clickable ? `data-act="pickDay" data-d="${i + 1}"` : 'data-act="goDay" data-d="' + (i + 1) + '"'}></button>` : ''}</div>`;
  }
  const m = num(t.key.slice(5));
  return `<div class="bars" style="height:${h}px">${out}</div><div class="xl"><span>${m}/1</span><span>${m}/10</span><span>${m}/20</span><span>${m}/${t.dim}</span></div>`;
}
function renderOverview() {
  const t = totals(S.month), prev = S.months.includes(prevKey(S.month)) ? totals(prevKey(S.month)) : null;
  const avg = t.sales / t.elapsed;
  const forecast = t.isCur ? (t.sales - (t.exp - t.byCat.fixed)) / t.elapsed * t.dim - t.byCat.fixed : null;
  const ms = machinesOf().filter((m) => t.byMach[m] || MACH_ORDER.includes(m));
  const low = allLow().slice(0, 8);
  $('#content').innerHTML = `<div class="pane"><div class="pad">
    <div class="grid3">
      <div class="box"><div class="k">매출</div><div class="kv">${won(t.sales)}</div><div class="ks">하루 평균 ${won(avg)}${prev ? ' · 전월 ' + won(prev.sales / prev.elapsed) : ''}</div></div>
      <div class="box"><div class="k">지출</div><div class="kv">${won(t.exp)}</div><div class="ks">쿠팡 ${won(t.byCat.coupang)} · 그 외 ${won(t.exp - t.byCat.coupang)}</div></div>
      <div class="box" style="border-color:#b7e4cf;background:#f0faf5"><div class="k">순이익</div><div class="kv pos">${won(t.profit)}</div><div class="ks">${forecast != null ? '월말 예상 ' + won(forecast) : '마감'}</div></div>
    </div>
    <div class="box" style="padding:12px 14px 8px"><div style="display:flex;align-items:center;gap:10px;font-size:12px;margin-bottom:8px"><b>일별 매출</b><span class="mu" style="font-size:11px">막대를 누르면 그날 매출을 자세히 봐요</span></div>${barsHtml(t, 150, false)}</div>
    <div class="grid2">
      <div class="box" style="padding:0;overflow:hidden">
        <div class="th" style="grid-template-columns:1fr 110px 120px"><span>기계</span><span class="r">${t.isCur ? '오늘' : '마지막 날'}</span><span class="r">이번 달</span></div>
        ${ms.map((m) => { const a = t.byMach[m] || []; return `<div class="tr" style="grid-template-columns:1fr 110px 120px"><span>${esc(m)} <span class="mu" style="font-size:11px">${isVP(m) ? 'vendingpay' : '오프너'}</span></span><span class="r" style="display:flex">${won(a[t.upto - 1] || 0)}</span><b class="r" style="display:flex">${won(a.reduce((x, y) => x + y, 0))}</b></div>`; }).join('')}
      </div>
      <div class="box" style="padding:0;overflow:hidden">
        <div class="th" style="grid-template-columns:1fr 70px 70px 90px"><span>재고 부족</span><span>기계</span><span class="r">남음</span><span>상태</span></div>
        ${low.length ? low.map((s) => `<div class="tr" style="grid-template-columns:1fr 70px 70px 90px"><span class="ell"><button type="button" class="rb" data-act="goStock" data-m="${esc(s.machine)}" data-i="${s.i}">${esc(s.product)}</button></span><span class="mu">${esc(s.machine)}</span><b class="r" style="display:flex">${s.qty}개</b><span class="st" style="color:${s.color}"><span class="dot" style="background:${s.color}"></span>${s.state}</span></div>`).join('') : '<div class="empty" style="padding:24px">부족한 상품이 없어요</div>'}
      </div>
    </div>
  </div></div>`;
  setStatus(mLabel(S.month), '순이익 ' + won(t.profit) + ' · 마진 ' + pct(t.profit, t.sales));
}

/* ───────── 화면: 매출 ───────── */
function renderSales() {
  const t = totals(S.month), pk = prevKey(S.month), prev = S.months.includes(pk) ? totals(pk) : null;
  const avg = t.sales / t.elapsed, pavg = prev ? prev.sales / prev.elapsed : null, d = pavg ? (avg - pavg) / pavg * 100 : null;
  const mx = Math.max(0, ...t.byDay.slice(0, t.upto)), bi = t.byDay.indexOf(mx);
  const ms = machinesOf().filter((m) => t.byMach[m] || MACH_ORDER.includes(m));
  const cols = `110px repeat(${ms.length}, minmax(0, 1fr)) minmax(0, 1.1fr)`;
  let rows = '';
  for (let i = t.upto - 1; i >= 0; i--) {
    const w = dowOf(t.key, i + 1), dc = w === 0 ? '#d0312d' : w === 6 ? '#1b64da' : 'inherit';
    rows += `<div class="tr${S.sel === i + 1 ? ' sel' : ''}" style="grid-template-columns:${cols}"><span><button type="button" class="rb" data-act="pickDay" data-d="${i + 1}" style="color:${dc};font-weight:600">${num(t.key.slice(5))}/${i + 1} (${DOW[w]})</button></span>${ms.map((m) => `<span class="r" style="display:flex">${fmt((t.byMach[m] || [])[i] || 0)}</span>`).join('')}<b class="r acc" style="display:flex">${fmt(t.byDay[i])}</b></div>`;
  }
  const last = t.upto - 1;
  $('#content').innerHTML = `
    <div style="flex-shrink:0;padding:14px 16px 12px;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid var(--line)">
      <div class="grid4">
        <div class="box"><div class="k">${mShort(t.key)} 매출</div><div class="kv">${won(t.sales)}</div><div class="ks">${t.upto}일${t.isCur ? '치 (오늘 포함)' : ' 전체'}</div></div>
        <div class="box"><div class="k">하루 평균</div><div class="kv">${won(avg)}</div><div class="ks">전월 ${pavg != null ? won(pavg) : '-'} ${d != null ? `<b class="${d >= 0 ? 'pos' : 'neg'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}%</b>` : ''}</div></div>
        <div class="box"><div class="k">${t.isCur ? '오늘 (진행 중)' : '마지막 날 (' + num(t.key.slice(5)) + '/' + t.dim + ')'}</div><div class="kv">${won(t.byDay[last])}</div><div class="ks">지난주 같은 요일 ${last >= 7 ? won(t.byDay[last - 7]) : '-'}</div></div>
        <div class="box"><div class="k">가장 많이 판 날</div><div class="kv">${won(mx)}</div><div class="ks">${mx ? num(t.key.slice(5)) + '월 ' + (bi + 1) + '일 (' + DOW[dowOf(t.key, bi + 1)] + ')' : '-'}</div></div>
      </div>
      <div class="box" style="padding:10px 14px 6px"><div style="display:flex;align-items:center;gap:10px;font-size:12px;margin-bottom:6px"><b>일별 매출</b><span class="mu" style="font-size:11px">막대를 누르면 그날 기계별 매출이 오른쪽에 떠요</span></div>${barsHtml(t, 130, true)}</div>
    </div>
    <div class="pane">
      <div class="th" style="grid-template-columns:${cols}"><span>날짜</span>${ms.map((m) => `<span class="r">${esc(m)}</span>`).join('')}<span class="r">합계</span></div>
      <div class="tr tot" style="grid-template-columns:${cols}"><span>월 합계</span>${ms.map((m) => `<span class="r" style="display:flex">${fmt((t.byMach[m] || []).reduce((a, b) => a + b, 0))}</span>`).join('')}<span class="r" style="display:flex">${fmt(t.sales)}</span></div>
      ${rows || '<div class="empty">이 달 매출 데이터가 없어요</div>'}
    </div>`;
  setStatus(mLabel(S.month) + ' · ' + t.upto + '일치', '합계 ' + won(t.sales));
}

/* ───────── 화면: 지출 ───────── */
function renderExp() {
  const t = totals(S.month), q = S.q.trim().toLowerCase();
  const rows = t.list.filter((x) => (S.cat === 'all' || x.cat === S.cat) && (!q || (x.name + ' ' + x.memo).toLowerCase().includes(q)));
  const cols = '34px 64px minmax(200px, 1fr) 96px minmax(120px, .7fr) 112px';
  const seg = [['all', '전체'], ['coupang', '쿠팡 발주'], ['fixed', '고정비']]
    .map((f) => `<button type="button" class="${S.cat === f[0] ? 'on' : ''}" data-act="cat" data-c="${f[0]}">${f[1]}</button>`).join('');
  $('#content').innerHTML = `
    <div class="subbar"><div class="seg">${seg}</div></div>
    <div class="pane">
      <div class="th" style="grid-template-columns:${cols}"><label style="display:flex;justify-content:center">${rows.length ? `<input type="checkbox" class="chk" id="incAll" data-chg="incAll" ${rows.every((x) => x.include) ? 'checked' : ''} aria-label="보이는 지출 전체 선택 / 전체 해제" title="전체 선택 / 전체 해제">` : ''}</label><span>날짜</span><span>내용</span><span>분류</span><span>메모</span><span class="r">금액</span></div>
      ${rows.map((x) => `<div class="tr${S.sel === x.id ? ' sel' : ''}${x.include ? '' : ' off'}" style="grid-template-columns:${cols}">
        <label style="display:flex;justify-content:center"><input type="checkbox" class="chk" data-chg="inc" data-kind="${x.kind}" data-id="${esc(x.id)}" ${x.include ? 'checked' : ''} aria-label="${esc(x.name)} 손익 반영" title="손익 반영"></label>
        <span class="mu">${x.date.slice(5).replace('-', '.')}</span>
        <span style="display:flex;align-items:center;gap:6px;min-width:0"><button type="button" class="rb strike" data-act="pickExp" data-id="${esc(x.id)}" style="flex:1${x.kind === 'cp' && !x.food ? ';color:' + NONFOOD_COLOR + ';font-weight:600' : ''}"${x.kind === 'cp' && !x.food ? ' title="음식 아닌 것 (소모품)"' : ''}>${esc(x.name)}</button>${x.kind === 'cp' && !x.exact ? '<span class="dot" style="background:#e8890c" title="실제 결제액 미확인 (목록가)"></span>' : ''}${x.repeat || x.repeatOf ? '<span class="mu" style="font-size:11px">매달</span>' : ''}</span>
        <span class="st"${x.kind === 'cp' && !x.food ? ` style="color:${NONFOOD_COLOR}"` : ''}><span class="dot" style="background:${x.kind === 'cp' && !x.food ? NONFOOD_COLOR : CATS[x.cat].color}"></span>${catLabel(x)}</span>
        <span class="mu ell">${esc(x.memo)}</span>
        <b class="r strike" style="display:flex">${won(x.amount)}</b></div>`).join('') || `<div class="empty">${t.list.length ? '조건에 맞는 지출이 없어요' : '이 달 지출이 없어요.<br>위쪽 [쿠팡 가져오기]나 [지출 추가]로 넣어 주세요.'}</div>`}
    </div>`;
  const ia = $('#incAll'); if (ia) ia.indeterminate = rows.some((x) => x.include) && !rows.every((x) => x.include);
  const shown = rows.filter((x) => x.include).reduce((a, x) => a + x.amount, 0);
  setStatus(rows.length + '개 항목' + (S.sel ? ' · 선택: ' + ((t.list.find((x) => x.id === S.sel) || {}).name || '') : ''), '표시된 지출 합계 ' + won(shown) + (t.byCat.fee ? ' · 카드 수수료 ' + won(t.byCat.fee) + ' 별도' : ''));
}

/* ───────── 화면: 재고 ───────── */
function renderStock() {
  const m = S.stf, items = stockOf(m), q = S.q.trim().toLowerCase();
  const rows = items.filter((s) => !q || s.product.toLowerCase().includes(q));
  const pend = Object.keys(S.pending[m] || {}).length;
  const op = !isVP(m);
  const cols = 'minmax(150px, 1fr) 150px 110px 90px 110px' + (op ? ' 44px' : '');
  const seg = MACH_ORDER.map((x) => `<button type="button" class="${S.stf === x ? 'on' : ''}" data-act="stf" data-m="${x}">${x}</button>`).join('');
  $('#content').innerHTML = `
    <div class="subbar"><div class="seg">${seg}</div>
      <button type="button" class="tb soft ico" data-act="refreshStock" title="재고 새로 읽기" aria-label="재고 새로 읽기">${svg('refresh', 14)}</button>
      <span style="margin-left:auto;display:flex;align-items:center;gap:6px">
        ${pend ? `<span class="pchip"><b>${pend}건 바뀜</b><button type="button" class="cib" data-act="pendCancel" title="되돌리기" aria-label="되돌리기"><svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button><button type="button" class="cib ok" data-act="pendApply" title="기계에 반영" aria-label="기계에 반영"${jobsFor(m).some(([, j]) => j.type === 'apply') ? ' disabled' : ''}><svg class="ic" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg></button></span><span class="vsep"></span>` : ''}
        ${isVP(m) ? `<div class="seg"><button type="button" data-act="snapView" title="저장된 정보 보기" aria-label="저장된 정보 보기" style="padding:0 8px;display:inline-flex;align-items:center">${svg('save', 14)}</button><button type="button" data-act="vpSave" title="벤딩페이에 지금 수량·가격 저장">현재 정보 저장</button><button type="button" data-act="vpLoad" title="벤딩페이에 저장해둔 수량·가격으로 되돌림" style="color:var(--ac)">불러오기</button></div>` : `<button type="button" class="tb pri" style="height:28px" data-act="addProd"><svg class="ic" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>상품 추가</button>`}
      </span></div>
    ${jobsFor(m).map(([id, j]) => `<div class="strip"><span class="spin" style="width:12px;height:12px;border-color:#c9dcf7;border-top-color:#1b64da"></span><b>노트북 봇에 '${JOB_LABEL[j.type]}'${j.type === 'refresh' ? '' : ' (' + esc(j.machine) + (j.label ? ' · ' + esc(j.label) : '') + ')'} 요청함</b><span class="mu">${esc(String(j.at || '').slice(11, 16))} · 처리 기다리는 중 (노트북이 켜져 있어야 해요)</span><button type="button" class="tb soft" style="margin-left:auto;height:26px" data-act="cancelJob" data-id="${esc(id)}">요청 취소</button></div>`).join('')}
    <div class="pane">
      <div class="th" style="grid-template-columns:${cols}"><span>상품</span><span class="c">현재 수량</span><span class="c">판매가격</span><span class="r">하루 판매</span><span>상태</span>${op ? '<span></span>' : ''}</div>
      ${rows.map((s) => `<div class="tr${S.sel === s.i ? ' sel' : ''}${s.changed ? ' chg' : ''}" style="grid-template-columns:${cols}">
        <span><button type="button" class="rb" data-act="pickStock" data-i="${s.i}" style="font-weight:600">${esc(s.product)}</button></span>
        <span style="display:flex;justify-content:center"><span class="step"><button type="button" data-act="qtyDec" data-i="${s.i}" aria-label="${esc(s.product)} 1개 빼기">−</button><input value="${s.qty}" data-chg="qty" data-i="${s.i}" inputmode="numeric" aria-label="${esc(s.product)} 현재 수량" title="숫자를 입력하고 Enter"><button type="button" data-act="qtyInc" data-i="${s.i}" aria-label="${esc(s.product)} 1개 더하기">+</button></span></span>
        <span style="display:flex;justify-content:center"><input class="fld r" style="height:24px;width:84px" value="${s.price != null ? fmt(s.price) : ''}" data-chg="price" data-i="${s.i}" inputmode="numeric" aria-label="${esc(s.product)} 판매가격"></span>
        <span class="r" style="display:flex">${s.perDay ? s.perDay.toFixed(1) + '개' : '-'}</span>
        <span class="st" style="color:${s.color}"><span class="dot" style="background:${s.color}"></span>${s.state}</span>${op ? `<span style="display:flex;justify-content:center"><button type="button" class="tb" style="width:30px;height:28px;padding:0;color:var(--mu)" data-act="delProd" data-i="${s.i}" title="상품 삭제" aria-label="${esc(s.product)} 삭제"><svg class="ic" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3"/></svg></button></span>` : ''}</div>`).join('') || `<div class="empty">${(S.data.stock[m] || []).length ? '검색 결과가 없어요' : '재고 정보가 아직 없어요. [재고 새로 읽기]를 눌러 주세요.'}</div>`}
    </div>`;
  const low = items.filter((s) => s.lv > 0).length;
  setStatus(rows.length + '개 상품' + (S.sel != null && items[S.sel] ? ' · 선택: ' + items[S.sel].product : ''), '부족 ' + low + '개' + (S.data.generated_at ? ' · 재고 기준 ' + S.data.generated_at.replace('T', ' ').slice(5, 16) : ''));
}

/* ───────── 화면: 월별 손익 ───────── */
function renderReport() {
  const t = totals(S.month), pk = prevKey(S.month);
  const prev = S.months.includes(pk) ? (t.isCur ? partial(pk, t.upto) : totals(pk)) : null;
  const dfx = (a, b, inv) => {
    if (b == null) return { t: '-', c: 'var(--mu)' };
    if (!b) return { t: a ? '새로' : '-', c: 'var(--mu)' };
    const d = (a - b) / b * 100; if (Math.abs(d) < 0.05) return { t: '같음', c: 'var(--mu)' };
    return { t: (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(1) + '%', c: (inv ? d <= 0 : d >= 0) ? '#0b8a5c' : '#d0312d' };
  };
  const tile = (label, a, b, inv, extra) => { const d = dfx(a, b, inv); return `<div class="box" style="${extra || ''}"><div class="k">${label}</div><div class="kv"${label === '순이익' ? ' style="color:#0b8a5c"' : ''}>${won(a)}</div><div class="ks">전월 ${b != null ? won(b) : '-'} <b style="color:${d.c}">${d.t}</b></div></div>`; };
  const lines = [{ k: 'sales', label: '매출', color: '#3182f6', fw: 700 }].concat(['coupang', 'fixed', 'etc', 'fee'].map((k) => ({ k, label: k === 'etc' ? '기타' : CATS[k].label, color: k === 'etc' ? CATS.repair.color : CATS[k].color, fw: 400 }))).concat([{ k: 'profit', label: '순이익', color: '#0b8a5c', fw: 700 }]);
  const val = (r, k) => (k === 'sales' ? r.sales : k === 'profit' ? r.profit : k === 'etc' ? (r.byCat.supply || 0) + (r.byCat.repair || 0) : r.byCat[k]);
  $('#content').innerHTML = `<div class="pane"><div class="pad">
    <div style="display:flex;align-items:center;gap:10px"><b style="font-size:17px">${mLabel(S.month)} 손익</b>${t.isCur ? '<span style="font-size:11px;font-weight:700;color:#b25e00;background:#fff4e0;border-radius:5px;padding:2px 7px">진행 중</span>' : ''}
      <span style="margin-left:auto;display:flex;gap:6px"><button type="button" class="tb soft" data-act="copyText">글자로 복사</button><button type="button" class="tb soft" data-act="exportPdf">PDF</button><button type="button" class="tb soft" data-act="exportXlsx">엑셀</button></span></div>
    <div class="grid3">${tile('매출', t.sales, prev && prev.sales, false)}${tile('지출', t.exp, prev && prev.exp, true)}${tile('순이익', t.profit, prev && prev.profit, false, 'border-color:#b7e4cf;background:#f0faf5')}</div>
    <div class="box" style="padding:6px 16px">
      <div style="display:grid;grid-template-columns:130px 1fr 120px 90px;gap:14px;padding:8px 0;font-size:11px;font-weight:700;color:var(--mu);border-bottom:1px solid var(--line)"><span>항목</span><span>매출 대비</span><span class="r">금액</span><span class="r">전월 대비</span></div>
      ${lines.filter((l) => l.k !== 'etc' || val(t, 'etc') || (prev && val(prev, 'etc'))).map((l, i) => { const v = val(t, l.k), d = dfx(v, prev ? val(prev, l.k) : null, l.k !== 'sales' && l.k !== 'profit'); const p = t.sales ? Math.max(0, v / t.sales * 100) : 0;
        return `<div style="display:grid;grid-template-columns:130px 1fr 120px 90px;gap:14px;align-items:center;min-height:38px;border-top:${i === 0 ? '0' : l.k === 'profit' ? '2px solid var(--line)' : '1px solid var(--line2)'};font-weight:${l.fw}">
          <span style="display:flex;align-items:center;gap:8px;font-size:14px"><span class="dot" style="background:${l.color}"></span>${l.label}</span>
          <div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1;height:8px"><i style="width:${Math.min(100, p).toFixed(1)}%;background:${l.color}"></i></div><span class="mu" style="font-size:11px;width:40px;text-align:right">${pct(v, t.sales)}</span></div>
          <span class="r" style="font-size:14px;color:${l.k === 'sales' ? 'inherit' : l.k === 'profit' ? '#0b8a5c' : '#d0312d'}">${(l.k === 'sales' || l.k === 'profit' || !v ? '' : '-') + won(v)}</span>
          <span class="r" style="font-size:12px;font-weight:600;color:${d.c}">${d.t}</span></div>`; }).join('')}
    </div>
    ${!S.settings.feeRate ? '<div class="mu" style="font-size:12px">카드 수수료율이 0%로 돼 있어요. 설정에서 바꾸면 자동으로 지출에 들어가요.</div>' : ''}
  </div></div>`;
  setStatus(mLabel(S.month), '순이익 ' + won(t.profit) + ' · 마진 ' + pct(t.profit, t.sales));
}

/* ───────── 화면: 설정 ───────── */
function renderSettings() {
  const st = S.settings, c = S.cfg || {}, sy = (S.meta && S.meta.sync) || {};
  const sw = (key, on) => `<button type="button" class="sw${on ? ' on' : ''}" data-act="toggleSet" data-k="${key}" aria-pressed="${on ? 'true' : 'false'}"></button>`;
  const row = (title, sub, right) => `<div style="display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:1px solid var(--line2)"><div style="flex:1"><b style="font-size:14px">${title}</b><div class="mu" style="font-size:12px;margin-top:2px;line-height:1.6">${sub}</div></div>${right}</div>`;
  $('#content').innerHTML = `<div class="pane"><div class="pad" style="max-width:760px">
    <div class="box" style="padding:4px 18px">
      ${row('GitHub 연결', c.tokenSet ? `연결됨 · 장부 ${esc(c.dataRepo)} · 매출 ${esc(c.salesRepo)}<br>토큰 끝자리 ****${esc(c.tokenTail)} · 장부 ${sy.state === 'saved' ? '저장됨 ' + esc(sy.at || '') : esc(sy.err || sy.state || '')}` : '<span class="neg">아직 연결 안 됨</span> — 연결해야 매출을 받고 장부를 저장해요', `<button type="button" class="tb ${c.tokenSet ? 'soft' : 'pri'}" data-act="setup">${c.tokenSet ? '바꾸기' : '연결하기'}</button>`)}
      ${row('변경 기록', '장부를 바꿀 때마다 GitHub에 기록이 남아요. 잘못 지웠으면 여기서 예전 내용을 볼 수 있어요.', '<button type="button" class="tb soft" data-act="openHistory">기록 보기</button>')}
    </div>
    <div class="box" style="padding:4px 18px">
      ${row('카드 수수료율', '매달 매출에 곱해서 지출에 자동으로 넣어요. 0이면 안 넣어요.', `<input class="fld r" style="width:90px" value="${esc(st.feeRate || 0)}" data-chg="feeRate" inputmode="decimal"><span class="mu">%</span>`)}
      ${row('쿠팡 자동 반영 키워드', '켜면 가져올 때 이 단어가 든 상품만 손익에 넣고 나머지는 빼요. 끄면 전부 넣어요.', sw('autoOn', !!st.autoOn))}
      <div style="padding:0 0 14px"><input class="fld" value="${esc(st.autoKw || '')}" data-chg="autoKw" placeholder="예: 라면, 생수, 김밥, 용기 (쉼표로 구분)"></div>
    </div>
    <div class="box" style="padding:4px 18px">
      ${row('이 PC의 설정 폴더', '토큰과 빠른 시작용 캐시만 있어요 (장부 원본은 GitHub).', '<button type="button" class="tb soft" data-act="openData">폴더 열기</button>')}
    </div>
  </div></div>`;
  setStatus('설정', '');
}
function setupDialog(msg) {
  const c = S.cfg || {};
  dialog(`<div class="dh"><b style="font-size:15px">GitHub 연결</b>${c.tokenSet ? `<button type="button" class="tb" style="margin-left:auto;width:30px;padding:0" data-act="closeLayer" aria-label="닫기">${svg('x', 14)}</button>` : ''}</div>
    <div class="db" style="font-size:13px;line-height:1.7">
      <div class="grp"><b>1. 비공개 저장소 만들기 (처음 한 번)</b><div class="mu">이름 <b>hangang-data</b>, <b>Private</b> 선택, Add a README 체크 → Create</div><button type="button" class="tb soft" style="margin-top:6px" data-act="openNewRepo">GitHub에서 새 저장소 만들기</button></div>
      <div class="grp"><b>2. 토큰 만들기</b><div class="mu">Fine-grained token → Expiration 길게 (1년) → Repository access: <b>Only select</b> 에서 hangang-data, hangang 선택 → Permissions에서 <b>Contents: Read and write</b> → Generate</div><button type="button" class="tb soft" style="margin-top:6px" data-act="openToken">GitHub에서 토큰 만들기</button></div>
      <div><label class="fl" for="cfgToken">3. 만든 토큰 붙여넣기</label><input id="cfgToken" class="fld" style="height:34px" placeholder="${c.tokenSet ? '그대로 두면 지금 토큰 유지 (****' + esc(c.tokenTail) + ')' : 'github_pat_로 시작하는 긴 글자'}" autocomplete="off"></div>
      <details><summary class="mu" style="cursor:pointer">저장소 이름이 다르면</summary><div class="grid2" style="margin-top:8px;gap:8px"><div><label class="fl" for="cfgData">장부 저장소 (비공개)</label><input id="cfgData" class="fld" value="${esc(c.dataRepo || '9gunmo-alt/hangang-data')}"></div><div><label class="fl" for="cfgSales">매출 저장소 (봇)</label><input id="cfgSales" class="fld" value="${esc(c.salesRepo || '9gunmo-alt/hangang')}"></div></div></details>
      <div id="cfgMsg" class="neg" style="font-weight:600">${esc(msg || '')}</div>
      <div class="mu" style="font-size:12px">노트북에서도 이 프로그램을 한 번 켜서 같은 토큰으로 연결해 두면, 노트북 봇이 그 설정으로 재고 작업을 받아요.</div>
    </div>
    <div class="df">${c.tokenSet ? '<button type="button" class="tb soft" data-act="closeLayer">취소</button>' : ''}<button type="button" class="tb pri" data-act="setupSave">연결</button></div>`);
}
async function setupSave() {
  const msgEl = $('#cfgMsg'); if (msgEl) msgEl.textContent = '확인하는 중…';
  try {
    const r = await B.call('config_set', $('#cfgToken').value, $('#cfgData').value, $('#cfgSales').value);
    if (!r.ok) { if (msgEl) msgEl.textContent = r.msg; return; }
    S.cfg = await B.call('config_get');
    closeLayer(); toast('연결했어요. 매출과 장부를 받아오는 중이에요'); render();
  } catch (e) { if (msgEl) msgEl.textContent = e.message; }
}

/* ───────── 오른쪽 정보 칸 ───────── */
function renderIns() {
  const t = totals(S.month);
  let h = '';
  if (S.view === 'exp' && S.sel) {
    const x = t.list.find((e) => e.id === S.sel);
    if (x && x.kind === 'mn') {
      h = `<div class="insb">
        <div style="display:flex;align-items:center"><b style="font-size:14px">지출 정보</b><span class="mu" style="font-size:11px;margin-left:auto">직접 입력</span></div>
        <div><label class="fl" for="i-name">내용</label><input id="i-name" class="fld" value="${esc(x.name)}" data-chg="eName" placeholder="예: 전기료, 위생장갑"></div>
        <div class="grid2" style="gap:8px"><div><label class="fl" for="i-amt">금액 (원)</label><input id="i-amt" class="fld r" style="font-weight:700" value="${x.amount ? fmt(x.amount) : ''}" data-chg="eAmt" inputmode="numeric" placeholder="0"></div>
          <div><label class="fl" for="i-date">날짜</label><input id="i-date" type="date" class="fld" value="${x.date}" data-chg="eDate"></div></div>
        <div><label class="fl" for="i-cat">분류</label><select id="i-cat" class="fld" data-chg="eCat">${['fixed', 'coupang', 'repair'].concat(x.cat === 'supply' ? ['supply'] : []).map((k) => `<option value="${k}"${x.cat === k ? ' selected' : ''}>${CATS[k].label}</option>`).join('')}</select></div>
        <div><label class="fl" for="i-memo">메모</label><textarea id="i-memo" class="fld" data-chg="eMemo">${esc(x.memo)}</textarea></div>
        <div class="grp" style="display:flex;align-items:center;gap:10px"><div style="flex:1"><b style="font-size:12px">손익에 반영</b><div class="mu" style="font-size:11px">끄면 계산에서 빠짐</div></div><button type="button" class="sw${x.include ? ' on' : ''}" data-act="eInc" aria-label="손익에 반영"></button></div>
        ${x.repeatOf ? '<div class="grp mu" style="font-size:12px">매달 반복 지출로 자동으로 들어간 항목이에요. 금액이 다르면 여기서 고치면 돼요.</div>'
          : `<div class="grp" style="display:flex;align-items:center;gap:10px"><div style="flex:1"><b style="font-size:12px">매달 반복</b><div class="mu" style="font-size:11px">다음 달부터 같은 날 자동 추가</div></div><button type="button" class="sw${x.repeat ? ' on' : ''}" data-act="eRep" aria-label="매달 반복"></button></div>`}
        <button type="button" class="tb soft danger" style="height:30px" data-act="eDel">이 지출 삭제</button>
        <div class="mu" style="font-size:11px;line-height:1.6">고치면 바로 저장돼요.</div></div>`;
    } else if (x) {
      h = `<div class="insb">
        <div style="display:flex;align-items:center"><b style="font-size:14px">쿠팡 주문</b><span class="mu" style="font-size:11px;margin-left:auto">쿠팡에서 가져옴</span></div>
        <div style="font-size:14px;font-weight:600;line-height:1.5;user-select:text">${esc(x.name)}</div>
        <div class="grp" style="display:grid;grid-template-columns:auto 1fr;row-gap:8px;column-gap:12px;font-size:13px">
          <span class="mu">주문일</span><b class="r">${x.date}</b>
          ${x.option ? `<span class="mu">옵션</span><span class="r">${esc(x.option)}</span>` : ''}
          <span class="mu">수량</span><span class="r">${x.qty || 1}개</span>
          <span class="mu">결제금액</span><b class="r">${won(x.amount)}</b>
          <span class="mu">주문번호</span><span class="r" style="user-select:text">${esc(x.orderId || '-')}</span>
        </div>
        ${x.exact ? '' : '<div class="grp warn" style="font-size:12px">실제 결제액을 확인하지 못해 목록 가격으로 들어갔어요. 다시 가져오면 확인돼요.</div>'}
        <div class="grp" style="display:flex;align-items:center;gap:10px"><div style="flex:1"><b style="font-size:12px">손익에 반영</b><div class="mu" style="font-size:11px">개인 구매면 끄세요</div></div><button type="button" class="sw${x.include ? ' on' : ''}" data-act="cpInc" aria-label="손익에 반영"></button></div>
        <div class="grp" style="display:flex;align-items:center;gap:10px"><div style="flex:1"><b style="font-size:12px">종류</b><div class="mu" style="font-size:11px">자동으로 구별해요. 틀리면 바꿔 주세요</div></div><div class="seg"><button type="button" class="${x.food ? 'on' : ''}" data-act="cpFood" data-v="1">음식</button><button type="button" class="${x.food ? '' : 'on'}" data-act="cpFood" data-v="0" style="${x.food ? '' : 'color:' + NONFOOD_COLOR}">소모품</button></div></div></div>`;
    }
  } else if (S.view === 'stock' && S.sel != null) {
    const s = stockOf(S.stf)[S.sel];
    if (s) {
      const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - i); const day = S.data.daily[ymdOf(d)]; const p = day && day[s.machine] && day[s.machine].p && day[s.machine].p[s.product]; days.push({ l: (d.getMonth() + 1) + '/' + d.getDate(), c: p ? p.c : 0 }); }
      const mx = Math.max(1, ...days.map((d) => d.c));
      h = `<div class="insb">
        <div><b style="font-size:15px">${esc(s.product)}</b><div class="mu" style="font-size:12px">${esc(s.machine)} · 하루 ${s.perDay ? s.perDay.toFixed(1) : 0}개 판매</div></div>
        <div class="grp" style="display:flex;align-items:center;gap:12px"><div style="flex:1"><div class="k">현재 수량</div><div style="font-size:30px;font-weight:700;color:${s.color}">${s.qty}<span class="mu" style="font-size:13px;font-weight:600">개</span></div></div>
          <span class="step" style="height:30px"><button type="button" style="height:28px;width:30px" data-act="qtyDec" data-i="${s.i}" aria-label="1개 빼기">−</button><button type="button" style="height:28px;width:30px" data-act="qtyInc" data-i="${s.i}" aria-label="1개 더하기">+</button></span></div>
        <div class="grp"><div class="fl">최근 7일 판매</div><div style="display:flex;align-items:flex-end;gap:6px;height:70px">${days.map((d) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:3px"><b style="font-size:11px">${d.c}</b><div style="width:70%;background:var(--ac);border-radius:3px 3px 0 0;height:${Math.round(d.c / mx * 70)}%;min-height:2px"></div></div>`).join('')}</div><div style="display:flex;gap:6px;margin-top:4px">${days.map((d) => `<span class="mu" style="flex:1;text-align:center;font-size:10px">${d.l}</span>`).join('')}</div></div>
        ${s.changed ? '<div class="grp warn" style="font-size:12px">바꾼 값이 아직 기계에 반영 안 됐어요. 위쪽 [기계에 반영]을 눌러 주세요.</div>' : ''}</div>`;
    }
  } else if (S.view === 'sales' && S.sel) {
    const i = S.sel - 1, ms = machinesOf().filter((m) => t.byMach[m]);
    const mx = Math.max(1, ...ms.map((m) => t.byMach[m][i] || 0));
    const day = S.data.daily[t.key + '-' + pad(S.sel)] || {};
    const prods = []; Object.keys(day).forEach((m) => Object.keys(day[m].p || {}).forEach((p) => prods.push({ m, p, c: day[m].p[p].c, v: day[m].p[p].v })));
    prods.sort((a, b) => b.v - a.v);
    h = `<div class="insb">
      <div><b style="font-size:15px">${num(t.key.slice(5))}월 ${S.sel}일 (${DOW[dowOf(t.key, S.sel)]})</b><div class="mu" style="font-size:12px">합계 ${won(t.byDay[i])}</div></div>
      ${ms.map((m) => `<div><div style="display:flex;font-size:12px;margin-bottom:5px"><span>${esc(m)}</span><b style="margin-left:auto">${won(t.byMach[m][i] || 0)}</b></div><div class="bar"><i style="width:${Math.round((t.byMach[m][i] || 0) / mx * 100)}%;background:var(--ac)"></i></div></div>`).join('')}
      ${prods.length ? `<div class="grp"><div class="fl">많이 팔린 상품</div>${prods.slice(0, 10).map((p) => `<div style="display:flex;gap:8px;font-size:12px;padding:4px 0"><span class="ell" style="flex:1">${esc(p.p)} <span class="mu">${esc(p.m)}</span></span><span class="mu">${p.c}개</span><b>${fmt(p.v)}</b></div>`).join('')}</div>` : ''}</div>`;
  }
  if (!h) {
    const nf = t.list.filter((x) => x.kind === 'cp' && x.include && !x.food).reduce((a, x) => a + x.amount, 0);
    const cats = ['coupang', 'fixed', 'repair', 'fee'].filter((k) => (k === 'repair' ? t.byCat.supply + t.byCat.repair : t.byCat[k]) > 0);
    h = `<div class="insb"><b style="font-size:14px">${mShort(S.month)} 요약</b>
      <div class="grp" style="display:grid;grid-template-columns:1fr auto;row-gap:8px;font-size:13px">
        <span class="mu">매출</span><b class="r">${won(t.sales)}</b><span class="mu">쿠팡 발주</span><b class="r">${won(t.byCat.coupang)}</b><span class="mu">그 외 지출</span><b class="r">${won(t.exp - t.byCat.coupang)}</b>
        <span style="border-top:1px solid var(--line);padding-top:8px;font-weight:700">순이익</span><b class="r pos" style="border-top:1px solid var(--line);padding-top:8px">${won(t.profit)}</b></div>
      ${cats.length ? '<div class="fl" style="margin-top:4px">지출 구성</div>' + cats.map((k) => { const v = k === 'repair' ? t.byCat.supply + t.byCat.repair : t.byCat[k]; return `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0"><span class="dot" style="background:${CATS[k].color}"></span>${CATS[k].label}<span class="mu">${pct(v, t.exp)}</span><b style="margin-left:auto">${won(v)}</b></div>` + (k === 'coupang' && nf ? `<div style="display:flex;gap:8px;font-size:11px;padding:0 0 3px 16px;color:${NONFOOD_COLOR}">└ 그중 소모품<b style="margin-left:auto">${won(nf)}</b></div>` : ''); }).join('') : ''}
      <div class="mu" style="font-size:11px;line-height:1.6;margin-top:4px">${{ overview: '왼쪽에서 화면을 고르고, 위쪽 ‹ › 로 달을 바꿔요.', sales: '날짜를 누르면 그날 기계별 매출이 여기 떠요.', exp: '표에서 지출을 누르면 여기서 고칠 수 있어요.', stock: '상품 이름을 누르면 자세히 볼 수 있어요. 수량·가격을 바꾸고 [기계에 반영]을 누르면 노트북 봇이 실제 기계에 넣어요 (30초~1분).', report: '지출을 고치면 손익이 바로 다시 계산돼요.', settings: '' }[S.view]}</div></div>`;
  }
  $('#ins').innerHTML = h;
}

let scrollKey = '';
function render() {
  // 화면을 다시 그려도 같은 화면이면 스크롤 위치 유지 (− / + 누를 때 맨 위로 튀지 않게)
  const key = S.view + '|' + (S.view === 'stock' ? S.stf : S.month) + '|' + S.cat;
  const keep = key === scrollKey ? [...document.querySelectorAll('#content, #content .pane, #ins, #ins .insb')].map((el) => el.scrollTop) : null;
  const ae = document.activeElement, focusSel = ae && ae.closest && ae.closest('#content') && ae.dataset && ae.dataset.chg ? `[data-chg="${ae.dataset.chg}"][data-i="${ae.dataset.i || ''}"]` : null;
  renderToolbar(); renderSide();
  ({ overview: renderOverview, sales: renderSales, exp: renderExp, stock: renderStock, report: renderReport, settings: renderSettings })[S.view]();
  renderIns();
  if (keep) [...document.querySelectorAll('#content, #content .pane, #ins, #ins .insb')].forEach((el, i) => { if (keep[i]) el.scrollTop = keep[i]; });
  if (focusSel) { const f = document.querySelector('#content ' + focusSel); if (f && f !== document.activeElement) { try { f.focus({ preventScroll: true }); } catch (e) {} } }
  scrollKey = key;
}

/* ───────── 동작 ───────── */
function setQty(i, qty, price) {
  const m = S.stf, it = stockOf(m)[i];
  if (!it) return;
  const orig = it.orig;
  const p = Object.assign({}, (S.pending[m] || {})[it.product] || {});
  if (qty != null) p.qty = Math.max(0, qty);
  if (price != null) p.price = Math.max(0, price);
  const same = (p.qty == null || p.qty === orig.qty) && (p.price == null || p.price === orig.price);
  S.pending[m] = Object.assign({}, S.pending[m]);
  if (same) delete S.pending[m][it.product]; else S.pending[m][it.product] = p;
  render();
}
function updExp(id, patch) {
  const e = S.expenses.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  persist('expenses'); buildMonths();
  if (patch.date && patch.date.slice(0, 7) !== S.month && S.months.includes(patch.date.slice(0, 7))) S.month = patch.date.slice(0, 7);
  render();
}
const ACT = {
  closeLayer,
  go: (d) => { S.view = d.v; S.sel = null; render(); },
  goDay: (d) => { S.view = 'sales'; S.sel = num(d.d); render(); },
  pickDay: (d) => { S.sel = S.sel === num(d.d) ? null : num(d.d); render(); },
  goStock: (d) => { S.view = 'stock'; S.stf = d.m; S.sel = num(d.i); render(); },
  cat: (d) => { S.cat = d.c; render(); },
  stf: (d) => { S.stf = d.m; S.sel = null; render(); },
  pickExp: (d) => { S.sel = d.id; render(); },
  pickStock: (d) => { S.sel = num(d.i); render(); },
  qtyInc: (d) => { const s = stockOf(S.stf)[num(d.i)]; if (s) setQty(s.i, s.qty + 1); },
  qtyDec: (d) => { const s = stockOf(S.stf)[num(d.i)]; if (s) setQty(s.i, s.qty - 1); },
  qtyFull: (d) => { const s = stockOf(S.stf)[num(d.i)]; if (s && s.max) setQty(s.i, s.max); },
  pendCancel: () => { delete S.pending[S.stf]; render(); },
  pendApply: applyPending,
  refreshStock: refreshStock,
  copyReorder: () => {
    const low = allLow();
    if (!low.length) { toast('부족한 상품이 없어요'); return; }
    const txt = MACH_ORDER.map((m) => { const l = low.filter((s) => s.machine === m); return l.length ? `[${m}]\n` + l.map((s) => `${s.product} ${Math.max(1, (s.max || Math.ceil(s.perDay * 14)) - s.qty)}개 (남음 ${s.qty})`).join('\n') : ''; }).filter(Boolean).join('\n\n');
    copyText(txt).then((ok) => toast(ok ? '발주할 목록을 복사했어요 (' + low.length + '개)' : '복사하지 못했어요', { err: !ok }));
  },
  snapView, vpSave, vpLoad,
  addProd: () => {
    const m = S.stf;
    dialog(`<div class="dh"><b style="font-size:15px">${esc(m)} 상품 추가</b><button type="button" class="tb" style="margin-left:auto;width:30px;padding:0" data-act="closeLayer" aria-label="닫기">${svg('x', 14)}</button></div>
      <div class="db"><div><label class="fl" for="apName">상품명</label><input id="apName" class="fld" style="height:34px" placeholder="예: 치즈 핫도그"></div>
        <div class="grid2" style="gap:8px"><div><label class="fl" for="apQty">수량</label><input id="apQty" class="fld r" style="height:34px" inputmode="numeric" placeholder="0"></div><div><label class="fl" for="apPrice">판매가격 (원)</label><input id="apPrice" class="fld r" style="height:34px" inputmode="numeric" placeholder="0"></div></div>
        <div id="apMsg" class="neg" style="font-weight:600"></div>
        <div class="mu" style="font-size:12px;line-height:1.6">오프너 앱의 [상품입고]에 그대로 등록돼요. 노트북 봇이 30초~1분 안에 처리해요.</div></div>
      <div class="df"><button type="button" class="tb soft" data-act="closeLayer">취소</button><button type="button" class="tb pri" data-act="addProdSave">추가</button></div>`);
    setTimeout(() => { const el = $('#apName'); const a = document.activeElement; if (el && !(a && a.closest && a.closest('#layer'))) el.focus(); }, 30);
  },
  addProdSave: () => {
    const m = S.stf, name = ($('#apName').value || '').trim(), qty = num($('#apQty').value), price = num($('#apPrice').value);
    const msg = $('#apMsg');
    if (!name) { msg.textContent = '상품명을 입력해 주세요'; return; }
    if (!price) { msg.textContent = '판매가격을 입력해 주세요'; return; }
    if ((S.data.stock[m] || []).some((it) => it.product === name)) { msg.textContent = '같은 이름의 상품이 이미 있어요'; return; }
    closeLayer();
    requestJob('apply', m, [{ action: 'add', name, qty, price }], '상품 추가: ' + name);
  },
  delProd: (d) => {
    const s = stockOf(S.stf)[num(d.i)]; if (!s) return;
    dialog(`<div class="dh"><b style="font-size:15px">상품 삭제</b></div>
      <div class="db" style="line-height:1.7"><div><b>${esc(s.product)}</b> 상품을 <b>${esc(s.machine)}</b> 기계에서 삭제할까요?</div><div class="mu" style="font-size:12px">오프너 앱의 [재고 및 수정]에서 삭제돼요. 되돌릴 수 없어서 다시 쓰려면 [상품 추가]로 새로 넣어야 해요.</div></div>
      <div class="df"><button type="button" class="tb soft" data-act="closeLayer">취소</button><button type="button" class="tb pri" style="background:var(--neg)" data-act="delProdOk" data-i="${s.i}">삭제</button></div>`);
  },
  delProdOk: (d) => {
    const s = stockOf(S.stf)[num(d.i)]; closeLayer(); if (!s) return;
    if (S.pending[s.machine]) { delete S.pending[s.machine][s.product]; }
    S.sel = null;
    requestJob('apply', s.machine, [{ action: 'delete', oldName: s.product, name: s.product }], '삭제: ' + s.product);
  },
  eInc: () => { const x = S.expenses.find((e) => e.id === S.sel); if (x) updExp(x.id, { include: x.include === false }); },
  eRep: () => { const x = S.expenses.find((e) => e.id === S.sel); if (x) { updExp(x.id, { repeat: !x.repeat }); if (x.repeat) { ensureRepeats(); render(); } } },
  eDel: () => {
    const x = S.expenses.find((e) => e.id === S.sel); if (!x) return;
    S.undo = JSON.parse(JSON.stringify(S.expenses));
    if (x.repeatOf) { const p = S.expenses.find((e) => e.id === x.repeatOf); if (p) p.repeatSkip = (p.repeatSkip || []).concat([x.date.slice(0, 7)]); }
    S.expenses = S.expenses.filter((e) => e.id !== x.id);
    S.sel = null; persist('expenses'); render();
    toast('‘' + (x.name || '지출') + '’ 삭제했어요', { action: '되돌리기', onAction: () => { if (S.undo) { S.expenses = S.undo; S.undo = null; persist('expenses'); render(); toast('되돌렸어요'); } } });
  },
  cpFood: (d) => { S.settings.cpFood = Object.assign({}, S.settings.cpFood || {}, { [S.sel]: d.v === '1' }); persist('settings'); render(); },
  cpInc: () => { if (S.checked.has(S.sel)) S.checked.delete(S.sel); else S.checked.add(S.sel); persist('checked'); render(); },
  runNow: async () => { try { await B.call('refresh_now'); toast('최신 매출·재고를 받고 있어요'); } catch (e) { toast(e.message, { err: true }); } },
  toggleSet: (d) => {
    S.settings[d.k] = !S.settings[d.k];
    persist('settings'); render();
  },
  openData: () => B.call('open_data_folder').catch(() => {}),
  copyText: async () => { const ok = await copyText(monthText()); toast(ok ? mShort(S.month) + ' 손익을 글자로 복사했어요' : '복사하지 못했어요', { err: !ok }); },
  exportPdf: () => exportPdf(),
  exportXlsx: () => exportXlsx(),
  setup: () => setupDialog(), setupSave,
  openNewRepo: () => B.call('open_url', 'https://github.com/new'),
  openToken: () => B.call('open_url', 'https://github.com/settings/personal-access-tokens/new'),
  openHistory: () => B.call('open_url', 'https://github.com/' + ((S.cfg && S.cfg.dataRepo) || '9gunmo-alt/hangang-data') + '/commits/main'),
  cancelJob,
  cpStart: startCrawl, cpOpen: openCoupangOnly, cpRange: (d) => setRange(num(d.n)),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-chg]');
  if (!el) return;
  const k = el.dataset.chg, v = el.value;
  if (k === 'qty') { const s = stockOf(S.stf)[num(el.dataset.i)]; if (s && v.trim() !== '') setQty(s.i, num(v)); else render(); }
  else if (k === 'price') { const s = stockOf(S.stf)[num(el.dataset.i)]; if (s && v.trim() !== '') setQty(s.i, null, num(v)); else render(); }
  else if (k === 'inc') { if (el.dataset.kind === 'mn') updExp(el.dataset.id, { include: el.checked }); else { if (el.checked) S.checked.add(el.dataset.id); else S.checked.delete(el.dataset.id); persist('checked'); render(); } }
  else if (k === 'incAll') {
    const t = totals(S.month), q = S.q.trim().toLowerCase(), on = el.checked;
    const rows = t.list.filter((x) => (S.cat === 'all' || x.cat === S.cat) && (!q || (x.name + ' ' + x.memo).toLowerCase().includes(q)));
    let cp = false, mn = false;
    rows.forEach((x) => {
      if (x.kind === 'mn') { const e = S.expenses.find((y) => y.id === x.id); if (e) { e.include = on; mn = true; } }
      else { if (on) S.checked.add(x.id); else S.checked.delete(x.id); cp = true; }
    });
    if (cp) persist('checked'); if (mn) { persist('expenses'); buildMonths(); }
    toast(on ? rows.length + '개 모두 손익에 넣었어요' : rows.length + '개 모두 손익에서 뺐어요'); render();
  }
  else if (k === 'eName') updExp(S.sel, { name: v.trim() || '지출' });
  else if (k === 'eAmt') updExp(S.sel, { amount: num(v) });
  else if (k === 'eDate') { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) updExp(S.sel, { date: v }); }
  else if (k === 'eCat') updExp(S.sel, { cat: v });
  else if (k === 'eMemo') updExp(S.sel, { memo: v });
  else if (k === 'feeRate') { const r = parseFloat(String(v).replace(/[^\d.]/g, '')); S.settings.feeRate = isFinite(r) ? Math.min(r, 20) : 0; persist('settings'); render(); }
  else if (k === 'autoKw') { S.settings.autoKw = v; persist('settings'); }
});
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (el && el.dataset && el.dataset.chg === 'qty') {
    if (e.key === 'Enter') el.blur();
    if (e.key === 'Escape') { el.value = (stockOf(S.stf)[num(el.dataset.i)] || {}).qty; el.blur(); }
  }
  if (e.key === 'Escape' && $('#layer').innerHTML) closeLayer();
});
document.addEventListener('focusin', (e) => { if (e.target && e.target.dataset && e.target.dataset.chg === 'qty') e.target.select(); });

$('#mPrev').onclick = () => { const i = S.months.indexOf(S.month); if (i > 0) { S.month = S.months[i - 1]; if (S.view !== 'stock') S.sel = null; render(); } };
$('#mNext').onclick = () => { const i = S.months.indexOf(S.month); if (i < S.months.length - 1) { S.month = S.months[i + 1]; if (S.view !== 'stock') S.sel = null; render(); } };
$('#q').oninput = (e) => { S.q = e.target.value; if (S.view === 'exp' || S.view === 'stock') { ({ exp: renderExp, stock: renderStock })[S.view](); } };
$('#btnAdd').onclick = () => {
  const day = S.month === CUR ? TODAY : S.month + '-' + pad(dimOf(S.month));
  const e = { id: newId(), date: day, name: '새 지출', cat: 'fixed', amount: 0, memo: '', include: true };
  S.expenses.push(e); persist('expenses');
  S.view = 'exp'; S.cat = 'all'; S.sel = e.id; render();
  setTimeout(() => { const el = $('#i-name'); if (el) { el.focus(); el.select(); } }, 30);
};
$('#btnExport').onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  $('#layer').innerHTML = `<div class="ovl" style="background:transparent" data-act="closeLayer"></div><div class="menu" style="top:${r.bottom + 4}px;left:${Math.max(8, r.right - 220)}px">
    <button type="button" data-act="exportXlsx">엑셀로 저장 (지출 · 매출 · 월별 손익)</button>
    <button type="button" data-act="exportPdf">${mShort(S.month)} 손익 PDF</button>
    <button type="button" data-act="copyText">${mShort(S.month)} 손익 글자로 복사</button></div>`;
};
$('#btnCoupang').onclick = () => { if (S.crawling) { B.call('coupang_extract', 'stop').catch(() => {}); return; } openCpModal(); };

/* ───────── 재고: 노트북 봇에 작업 요청 ───────── */
const JOB_LABEL = { apply: '재고 반영', vp_save: '현재 정보 저장', vp_load: '불러오기', refresh: '재고 새로 읽기' };
async function requestJob(type, machine, changes, label) {
  try {
    const r = await B.call('job_create', type, machine, changes || [], label || '');
    if (!r.ok) { toast('요청하지 못했어요: ' + r.msg, { err: true }); return null; }
    S.jobs[r.id] = { type, machine, at: TODAY + 'T' + hm(), label, changes: changes || [] };
    render();
    toast(`노트북 봇에 '${JOB_LABEL[type]}' 요청했어요. 보통 30초~1분 안에 처리돼요`);
    return r.id;
  } catch (e) { toast(e.message, { err: true }); return null; }
}
const jobsFor = (m) => Object.entries(S.jobs || {}).filter(([, j]) => j.machine === m || j.type === 'refresh');
async function applyPending() {
  const m = S.stf, pend = S.pending[m] || {};
  const items = stockOf(m).filter((s) => pend[s.product]);
  if (!items.length) return;
  const changes = items.map((s) => ({ action: 'update', oldName: s.product, name: s.product, qty: s.qty, price: s.price != null ? s.price : (s.orig.price || 0), order: s.order }));
  await requestJob('apply', m, changes, changes.length + '건');
}
function refreshStock() { requestJob('refresh', 'all'); }
async function cancelJob(d) {
  const r = await B.call('job_cancel', d.id).catch((e) => ({ ok: false, msg: e.message }));
  delete S.jobs[d.id]; render();
  toast(r && r.late ? '이미 노트북이 처리 중이라 취소하지 못했을 수 있어요' : '요청을 취소했어요', { err: !!(r && r.late) });
}
function onJob(p) {
  const res = p.result || {}, info = p.info || {}, m = res.machine || info.machine;
  delete S.jobs[p.id];
  const at = String(res.done_at || (TODAY + 'T' + hm())).slice(0, 16);
  if (res.items && m) { S.data.stock[m] = res.items; JOB_STOCK[m] = { items: res.items, at }; }
  if (res.stock) { S.data.stock = Object.assign({}, S.data.stock, res.stock); Object.keys(res.stock).forEach((k) => { JOB_STOCK[k] = { items: res.stock[k], at }; }); }
  const t = res.type || info.type;
  if (t === 'apply') {
    const okNames = new Set((res.results || []).filter((x) => x.ok).map((x) => x.name));
    if (S.pending[m]) { okNames.forEach((n) => delete S.pending[m][n]); if (!Object.keys(S.pending[m]).length) delete S.pending[m]; }
    const bad = (res.results || []).filter((x) => !x.ok);
    if (!res.ok) toast(`${m} 재고 반영: ${res.msg || ''}` + (bad.length ? '\n' + bad.map((b) => b.name + ': ' + b.msg).join('\n') : ''), { err: true, ms: 9000 });
    else toast(`${m} 기계에 반영했어요 (${res.msg || ''})`);
  } else if (t === 'vp_save') {
    if (res.ok) {
      S.snaps[m] = { at: (res.done_at || TODAY + 'T' + hm()).slice(5, 16).replace('T', ' ').replace('-', '/'), items: (S.data.stock[m] || []).map((it) => ({ product: it.product, qty: it.qty, price: it.price, order: it.order })) };
      persist('snaps'); toast(`${m} 현재 수량·가격을 벤딩페이에 저장했어요`);
    } else toast(`${m} 현재 정보 저장 실패: ${res.msg || ''}`, { err: true });
  } else if (t === 'vp_load') {
    if (res.ok) { delete S.pending[m]; toast(`${m}을(를) 저장해둔 수량·가격으로 불러왔어요`); }
    else toast(`${m} 불러오기 실패: ${res.msg || ''}`, { err: true });
  } else if (t === 'refresh') toast(res.ok ? '재고를 새로 읽었어요' : '재고 읽기 실패: ' + (res.msg || ''), { err: !res.ok });
  render();
}
function snapView() {
  const m = S.stf, sn = S.snaps[m], cur = {};
  (S.data.stock[m] || []).forEach((it) => { cur[it.product] = it; });
  dialog(`<div class="dh"><div style="width:32px;height:32px;border-radius:8px;background:#e8f3ff;color:#1b64da;display:flex;align-items:center;justify-content:center">${svg('save', 17)}</div>
    <div><b style="font-size:15px">${esc(m)} 저장된 정보</b><div class="mu" style="font-size:12px">${sn ? esc(sn.at) + ' 저장 (이 프로그램에서 저장한 기록)' : '저장 기록 없음'}</div></div>
    <button type="button" class="tb" style="margin-left:auto;width:30px;padding:0" data-act="closeLayer" aria-label="닫기">${svg('x', 14)}</button></div>
    ${sn ? `<div style="display:grid;grid-template-columns:1fr 90px 90px 100px;padding:8px 18px;font-size:11px;font-weight:700;color:var(--mu);background:var(--bar)"><span>상품</span><span class="r">저장된 수량</span><span class="r">지금 수량</span><span class="r">판매가격</span></div>
      <div style="overflow:auto;max-height:50vh">${sn.items.map((it) => { const c = cur[it.product]; return `<div style="display:grid;grid-template-columns:1fr 90px 90px 100px;padding:9px 18px;border-top:1px solid var(--line2);font-size:13.5px"><span class="ell">${esc(it.product)}</span><b class="r">${it.qty}개</b><span class="r" style="color:${c && c.qty !== it.qty ? '#b25e00' : 'inherit'}">${c ? c.qty + '개' : '-'}</span><span class="r">${it.price != null ? fmt(it.price) + '원' : '-'}</span></div>`; }).join('')}</div>`
      : '<div class="db mu" style="line-height:1.7">이 프로그램에서 [현재 정보 저장]을 누른 기록이 아직 없어요.<br>벤딩페이에 예전에 저장해 둔 정보는 [불러오기]로 바로 적용할 수 있어요.</div>'}
    <div class="df"><button type="button" class="tb soft" data-act="closeLayer">닫기</button><button type="button" class="tb pri" data-act="vpLoad">벤딩페이 저장 정보로 불러오기</button></div>`);
}
function vpSave() {
  closeLayer();
  if (Object.keys(S.pending[S.stf] || {}).length) { toast('먼저 바꾼 것을 [기계에 반영]하거나 되돌려 주세요', { err: true }); return; }
  requestJob('vp_save', S.stf);
}
function vpLoad() { closeLayer(); requestJob('vp_load', S.stf); }

/* ───────── 쿠팡 가져오기 ───────── */
function monthOpts(sel) {
  const out = []; const d = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
  for (let i = 0; i < 24; i++) { const k = ymOf(d); out.push(`<option value="${k}"${k === sel ? ' selected' : ''}>${mLabel(k)}</option>`); d.setMonth(d.getMonth() - 1); }
  return out.join('');
}
function setRange(n) {
  const to = new Date(NOW.getFullYear(), NOW.getMonth(), 1), from = new Date(NOW.getFullYear(), NOW.getMonth() - n, 1);
  const f = $('#cpFrom'), t = $('#cpTo'); if (f) f.value = ymOf(from); if (t) t.value = ymOf(to);
}
function openCpModal() {
  const from = ymOf(new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1));
  dialog(`<div class="dh"><b style="font-size:15px">쿠팡에서 가져오기</b><button type="button" class="tb" style="margin-left:auto;width:30px;padding:0" data-act="closeLayer" aria-label="닫기">${svg('x', 14)}</button></div>
    <div class="db">
      <div style="display:flex;gap:6px"><button type="button" class="chip" data-act="cpRange" data-n="0">이번 달</button><button type="button" class="chip" data-act="cpRange" data-n="1">지난달 ~ 이번 달</button><button type="button" class="chip" data-act="cpRange" data-n="2">최근 3개월</button></div>
      <div style="display:flex;align-items:center;gap:8px"><select class="fld" id="cpFrom" style="height:34px">${monthOpts(from)}</select><span class="mu">~</span><select class="fld" id="cpTo" style="height:34px">${monthOpts(CUR)}</select></div>
      <div class="mu" style="font-size:12px;line-height:1.7">쿠팡 창이 열리면 직접 로그인하세요 (아이디·비밀번호는 저장 안 해요).<br>로그인되면 주문목록을 알아서 넘기며 기간 안의 주문을 전부 가져와 지출 장부에 넣어요.</div>
    </div>
    <div class="df"><button type="button" class="tb soft" data-act="cpOpen">쿠팡 주문내역만 열기</button><button type="button" class="tb pri" data-act="cpStart">자동으로 가져오기</button></div>`);
}
async function startCrawl() {
  const f = $('#cpFrom').value, t = $('#cpTo').value;
  const from = f <= t ? f : t, to = f <= t ? t : f;
  closeLayer();
  try {
    const r = await B.call('coupang_crawl', from, to);
    if (r && r.ok === false) { toast(r.msg, { err: true }); return; }
    S.crawling = true; S.crawlPages = 0; S.crawlAdded = 0; S.autoAdded = 0; renderToolbar();
    toast('쿠팡 창에서 로그인하면 ' + from + ' ~ ' + to + ' 주문을 자동으로 가져와요', { ms: 5000 });
  } catch (e) { toast(e.message, { err: true }); }
}
async function openCoupangOnly() { closeLayer(); try { await B.call('coupang_open'); } catch (e) { toast(e.message, { err: true }); } }

const kwList = () => String(S.settings.autoKw || '').split(/[,\n]/).map((k) => k.trim().toLowerCase().replace(/\s+/g, '')).filter(Boolean);
const kwMatch = (name, kws) => { const n = String(name || '').toLowerCase().replace(/\s+/g, ''); return kws.some((k) => n.includes(k)); };
function mergeCoupang(items) {
  const incoming = new Map();
  items.forEach((x) => { if (x && x.orderId) { const oid = String(x.orderId); if (!incoming.has(oid)) incoming.set(oid, new Set()); incoming.get(oid).add(cpKey({ date: x.date || '', orderId: oid, name: String(x.name || '').trim(), option: x.option || '', qty: x.qty || 1, final: x.final, total: x.total })); } });
  const wasChecked = new Set(), wasUnchecked = new Set();
  if (incoming.size) {
    S.coupang = S.coupang.filter((o) => {
      const ks = o.orderId && incoming.get(String(o.orderId));
      if (!ks || ks.has(cpKey(o))) return true;
      if (S.checked.has(cpKey(o))) wasChecked.add(String(o.orderId)); else wasUnchecked.add(String(o.orderId));
      S.checked.delete(cpKey(o));
      return false;
    });
  }
  const have = new Set(S.coupang.map(cpKey));
  const kws = S.settings.autoOn ? kwList() : null;
  let added = 0;
  items.forEach((x) => {
    const it = { date: x.date || '', orderId: x.orderId || '', name: String(x.name).trim(), option: x.option || '', qty: x.qty || 1, unit_price: x.unit_price, total: x.total, discount: x.discount, final: x.final, status: x.status || '', exact: x.exact === true, listFinal: x.listFinal != null ? x.listFinal : null };
    const k = cpKey(it);
    if (have.has(k)) return;
    have.add(k); S.coupang.push(it); added++;
    let inc = kws ? kwMatch(it.name, kws) : true;
    if (it.orderId && wasChecked.has(String(it.orderId))) inc = true;
    else if (it.orderId && wasUnchecked.has(String(it.orderId))) inc = false;
    if (inc) S.checked.add(k);
  });
  persist('coupang_orders'); persist('checked');
  return added;
}
async function onCoupangData(raw) {
  let p;
  try { p = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { toast('쿠팡에서 받은 데이터를 읽지 못했어요', { err: true }); return; }
  if (p.kind === 'dump') {
    const slug = /order\/list|orderlist/i.test(p.url || '') ? 'list' : /order/i.test(p.url || '') ? 'detail' : 'page';
    const extra = '\n<!-- CC_DEBUG ' + JSON.stringify({ url: p.url, captured: p.captured, raw: p.raw || [] }).replace(/--/g, '- -') + ' -->\n';
    await saveBytes('coupang_' + slug + '_dump.html', new TextEncoder().encode((p.html || '') + extra), '진단 파일을 저장했어요. 이 파일을 보내 주세요 (개인정보가 들어 있을 수 있어요)');
    return;
  }
  if (p.kind === 'crawl-done') {
    S.crawling = false; renderToolbar();
    const ok = ['done', 'end', 'nonext'].includes(p.reason);
    const why = { stopped: ' (중지함)', empty: ' — 주문 상품을 찾지 못했어요', nodate: ' — 주문 날짜를 찾지 못했어요', stuck: ' — 다음 페이지로 넘어가지 않았어요', limit: ' — 80페이지 제한', send: ' — 전달 실패' }[p.reason] || '';
    const msg = '쿠팡 가져오기 ' + (ok ? '완료' : '멈춤') + why + '\n' + p.from + ' ~ ' + p.to + ' · ' + p.pages + '페이지 · 새로 추가 ' + S.crawlAdded + '개' +
      '\n실제 결제액 확인: 주문 ' + (p.exactOk || 0) + '건' + (p.exactFail ? ' · 확인 못 한 주문 ' + p.exactFail + '건 (목록가로 표시)' : '');
    if (!ok && p.reason !== 'stopped') toast(msg, { err: true, action: '진단 파일 저장', onAction: () => B.call('coupang_extract', 'dump'), ms: 10000 });
    else toast(msg, { ms: 7000 });
    buildMonths(); if (p.to && S.months.includes(p.to) && S.view === 'exp') S.month = p.to;
    render();
    return;
  }
  const items = (p.items || []).filter((x) => x && x.name);
  if (p.crawl) {
    S.crawling = true; S.crawlPages = p.crawl.page;
    S.crawlAdded += mergeCoupang(items);
    buildMonths(); render();
    return;
  }
  if (!items.length) { toast('이 화면에서 주문 상품을 찾지 못했어요.\n주문목록 화면이 맞는데도 안 되면 [진단 파일 저장]을 눌러 주세요.', { err: true, action: '진단 파일 저장', onAction: () => B.call('coupang_extract', 'dump') }); return; }
  const added = mergeCoupang(items);
  buildMonths(); S.view = 'exp'; S.cat = 'all'; S.sel = null;
  if (items[0] && items[0].date && S.months.includes(items[0].date.slice(0, 7))) S.month = items[0].date.slice(0, 7);
  render();
  toast('쿠팡에서 ' + items.length + '개를 읽었어요 (새로 추가 ' + added + '개' + (p.skipped ? ', 취소·반품 ' + p.skipped + '개 제외' : '') + ')' + (added ? '' : '\n이미 가져온 주문이에요'));
}

/* ───────── 내보내기 ───────── */
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch (e) { /* 아래 방법 */ }
  try { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
}
function monthText() {
  const t = totals(S.month);
  const L = [`[한강라면 ${mLabel(S.month)} 손익]${t.isCur ? ' (' + t.upto + '일까지)' : ''}`, '', `매출 ${won(t.sales)}`];
  [['coupang', t.byCat.coupang], ['fixed', t.byCat.fixed], ['repair', t.byCat.supply + t.byCat.repair], ['fee', t.byCat.fee]].forEach(([k, v]) => { if (v) L.push(`- ${CATS[k].label} ${won(v)}`); });
  L.push(`지출 합계 ${won(t.exp)}`, `순이익 ${won(t.profit)} (마진 ${pct(t.profit, t.sales)})`, '', '기계별 매출');
  machinesOf().forEach((m) => { const a = t.byMach[m]; if (a) L.push(`- ${m} ${won(a.reduce((x, y) => x + y, 0))}`); });
  return L.join('\n');
}
function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
async function saveBytes(name, u8, okMsg) {
  try {
    const r = await B.call('save_file', name, toB64(u8));
    if (!r) return;
    if (r.error) { toast(r.error, { err: true }); return; }
    toast((okMsg || '저장했어요') + '\n' + r, { action: '열기', onAction: () => B.call('open_path', r) });
  } catch (e) { toast('저장하지 못했어요: ' + e.message, { err: true }); }
}
async function exportXlsx() {
  closeLayer();
  if (!window.ExcelJS) { toast('엑셀 기능을 불러오지 못했어요', { err: true }); return; }
  const wb = new ExcelJS.Workbook(); wb.creator = '한강라면 관리';
  const head = (ws, cols) => { ws.columns = cols; const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333D4B' } }; r.alignment = { vertical: 'middle' }; r.height = 22; ws.views = [{ state: 'frozen', ySplit: 1 }]; };
  const t = totals(S.month), money = '#,##0"원"';
  const ws1 = wb.addWorksheet(mShort(S.month) + ' 지출 내역');
  head(ws1, [{ header: '날짜', key: 'd', width: 12 }, { header: '분류', key: 'c', width: 12 }, { header: '내용', key: 'n', width: 44 }, { header: '메모', key: 'm', width: 26 }, { header: '금액', key: 'a', width: 14, style: { numFmt: money } }, { header: '손익 반영', key: 'i', width: 10 }]);
  t.list.forEach((x) => ws1.addRow({ d: x.date, c: x.kind === 'cp' ? '쿠팡 · ' + catLabel(x) : CATS[x.cat].label, n: x.name, m: x.memo, a: x.amount, i: x.include ? 'O' : 'X' }));
  if (t.byCat.fee) ws1.addRow({ d: '', c: CATS.fee.label, n: '카드 수수료 (' + S.settings.feeRate + '%)', m: '매출 × 수수료율', a: t.byCat.fee, i: 'O' });
  const n1 = ws1.rowCount; const tr = ws1.addRow({ n: '손익 반영 합계', a: { formula: `SUMIF(F2:F${n1},"O",E2:E${n1})` } }); tr.font = { bold: true };
  const ms = machinesOf().filter((m) => t.byMach[m]);
  const ws2 = wb.addWorksheet(mShort(S.month) + ' 날짜별 매출');
  head(ws2, [{ header: '날짜', key: 'd', width: 14 }].concat(ms.map((m, i) => ({ header: m, key: 'm' + i, width: 13, style: { numFmt: '#,##0' } }))).concat([{ header: '합계', key: 's', width: 14, style: { numFmt: '#,##0' } }]));
  for (let i = 0; i < t.upto; i++) { const row = { d: t.key + '-' + pad(i + 1) + ' (' + DOW[dowOf(t.key, i + 1)] + ')', s: t.byDay[i] }; ms.forEach((m, j) => { row['m' + j] = t.byMach[m][i] || 0; }); ws2.addRow(row); }
  const ws3 = wb.addWorksheet('월별 손익');
  head(ws3, [{ header: '월', key: 'k', width: 10 }, { header: '매출', key: 's', width: 14 }, { header: '쿠팡 발주', key: 'c', width: 13 }, { header: '고정비', key: 'f', width: 12 }, { header: '소모품', key: 'u', width: 12 }, { header: '수리·기타', key: 'r', width: 12 }, { header: '카드 수수료', key: 'e', width: 12 }, { header: '지출 합계', key: 'x', width: 14 }, { header: '순이익', key: 'p', width: 14 }, { header: '마진율', key: 'g', width: 9 }]);
  S.months.forEach((k) => {
    const r = totals(k); const rn = ws3.rowCount + 1;
    ws3.addRow({ k, s: r.sales, c: r.byCat.coupang, f: r.byCat.fixed, u: r.byCat.supply, r: r.byCat.repair, e: r.byCat.fee, x: { formula: `SUM(C${rn}:G${rn})` }, p: { formula: `B${rn}-H${rn}` }, g: { formula: `IF(B${rn}=0,"",I${rn}/B${rn})` } });
  });
  ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].forEach((c) => { ws3.getColumn(c).numFmt = money; }); ws3.getColumn('J').numFmt = '0.0%';
  const buf = await wb.xlsx.writeBuffer();
  await saveBytes('한강라면_' + S.month + '.xlsx', new Uint8Array(buf), '엑셀로 저장했어요');
}
async function exportPdf() {
  closeLayer();
  if (!window.PDFLib || !window.fontkit) { toast('PDF 기능을 불러오지 못했어요', { err: true }); return; }
  const done = busy('PDF 만드는 중…');
  try {
    const [r1, r2] = await Promise.all([fetch('fonts/pdf-Pretendard-Regular.ttf'), fetch('fonts/pdf-Pretendard-Bold.ttf')]);
    const doc = await PDFLib.PDFDocument.create(); doc.registerFontkit(fontkit);
    const F = await doc.embedFont(await r1.arrayBuffer(), { subset: false }), FB = await doc.embedFont(await r2.arrayBuffer(), { subset: false });
    const { rgb } = PDFLib, W = 595.28, H = 841.89, M = 44;
    const pg = doc.addPage([W, H]);
    const tx = (s, x, y, size, bold, color, right) => { const f = bold ? FB : F; const w = f.widthOfTextAtSize(s, size); pg.drawText(s, { x: right ? x - w : x, y, size, font: f, color: color || rgb(0.1, 0.12, 0.16) }); };
    const t = totals(S.month), gray = rgb(0.31, 0.35, 0.41), green = rgb(0.04, 0.54, 0.36), red = rgb(0.82, 0.19, 0.18);
    tx('한강라면 ' + mLabel(S.month) + ' 손익', M, H - 70, 22, true);
    tx((t.isCur ? t.upto + '일까지 · ' : '') + '만든 날 ' + TODAY, M, H - 92, 10, false, gray);
    const cw = (W - M * 2 - 20) / 3;
    [['매출', t.sales, null], ['지출', t.exp, null], ['순이익', t.profit, green]].forEach((c, i) => {
      const x = M + i * (cw + 10), y = H - 180;
      pg.drawRectangle({ x, y, width: cw, height: 64, borderColor: rgb(0.9, 0.91, 0.92), borderWidth: 1, color: i === 2 ? rgb(0.94, 0.98, 0.96) : rgb(1, 1, 1) });
      tx(c[0], x + 12, y + 44, 10, true, gray); tx(won(c[1]), x + 12, y + 16, 17, true, c[2] || undefined);
    });
    let y = H - 230;
    tx('항목', M, y, 10, true, gray); tx('금액', W - M - 70, y, 10, true, gray, true); tx('매출 대비', W - M, y, 10, true, gray, true);
    y -= 10; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.85, 0.87, 0.89) });
    const lines = [['매출', t.sales, true]].concat([['coupang', t.byCat.coupang], ['fixed', t.byCat.fixed], ['etc', t.byCat.supply + t.byCat.repair], ['fee', t.byCat.fee]].filter((a) => a[0] !== 'etc' || a[1]).map((a) => ['− ' + (a[0] === 'etc' ? '기타' : CATS[a[0]].label), a[1], false])).concat([['= 순이익', t.profit, true]]);
    lines.forEach((l, i) => {
      y -= 26;
      if (i === lines.length - 1) pg.drawLine({ start: { x: M, y: y + 18 }, end: { x: W - M, y: y + 18 }, thickness: 1.2, color: rgb(0.75, 0.78, 0.8) });
      tx(l[0], M, y, 12, l[2]); tx(won(l[1]), W - M - 70, y, 12, l[2], i === lines.length - 1 ? green : (i ? red : undefined), true); tx(pct(l[1], t.sales), W - M, y, 11, false, gray, true);
    });
    y -= 44; tx('기계별 매출', M, y, 12, true); y -= 8;
    machinesOf().forEach((m) => { const a = t.byMach[m]; if (!a) return; y -= 22; tx(m, M, y, 11); tx(won(a.reduce((p, q) => p + q, 0)), W - M, y, 11, true, undefined, true); });
    tx('한강라면 관리 프로그램', M, 30, 9, false, gray);
    const bytes = await doc.save();
    done();
    await saveBytes('한강라면_' + S.month + '_손익.pdf', bytes, 'PDF로 저장했어요');
  } catch (e) { done(); toast('PDF를 만들지 못했어요: ' + e.message, { err: true }); }
}

/* ───────── 파이썬 → 화면 ───────── */
let dataTimer = null;
/* 노트북 봇이 방금 기계에 반영한 재고. 봇이 그보다 새 데이터를 올리기 전까지는 이 값을 보여줌 (옛날 값으로 되돌아가 보이지 않게) */
const JOB_STOCK = {};
async function loadData() {
  try {
    const d = await B.call('get_data');
    S.data = Object.assign(S.data, { daily: d.daily || {}, stock: d.stock || {}, machines: (d.machines && d.machines.length ? d.machines : MACH_ORDER), generated_at: (d.meta && d.meta.generated_at) || '' });
    if (d.meta) { S.meta = d.meta; S.jobs = Object.assign({}, d.meta.jobs || {}); }
    const gen = String(S.data.generated_at || '').slice(0, 16);
    Object.keys(JOB_STOCK).forEach((k) => {
      if (gen && gen > JOB_STOCK[k].at) delete JOB_STOCK[k];
      else S.data.stock = Object.assign({}, S.data.stock, { [k]: JOB_STOCK[k].items });
    });
    buildMonths(); render();
  } catch (e) { toast('데이터를 불러오지 못했어요: ' + e.message, { err: true }); }
}
async function loadLedger() {
  const j = async (name, def) => { try { const t = await B.call('load_json', name); return t ? JSON.parse(t) : def; } catch (e) { return def; } };
  S.coupang = await j('coupang_orders', []);
  S.checked = new Set(await j('checked', []));
  S.expenses = await j('expenses', []);
  S.settings = await j('settings', {});
  S.snaps = await j('snaps', {});
}
function syncText(sy) {
  const el = $('#stSaveTxt'); if (!el || !sy) return;
  el.textContent = { saved: '저장됨' + (sy.at ? ' ' + sy.at : ''), saving: '저장하는 중…', offline: '오프라인 — 연결되면 자동 저장', error: '저장 오류: ' + (sy.err || ''), loading: '불러오는 중…' }[sy.state] || '';
  el.parentElement.querySelector('.dot').style.background = sy.state === 'saved' ? 'var(--pos)' : sy.state === 'saving' || sy.state === 'loading' ? '#e8890c' : 'var(--neg)';
}
window.__onPy = async (ev, data) => {
  if (ev === 'data') { clearTimeout(dataTimer); dataTimer = setTimeout(loadData, 300); }
  else if (ev === 'meta') { S.meta = data || {}; if (data && data.jobs) S.jobs = Object.assign({}, data.jobs); renderSide(); syncText(data && data.sync); }
  else if (ev === 'sync') { if (S.meta) S.meta.sync = data; syncText(data); }
  else if (ev === 'ledger') { await loadLedger(); ensureRepeats(); buildMonths(); render(); }
  else if (ev === 'job') onJob(data || {});
  else if (ev === 'coupang') { S.cpOpen = data === 'opened'; if (data === 'closed' && S.crawling) { S.crawling = false; renderToolbar(); } }
};
window.__onCoupang = (raw) => { onCoupangData(raw); };

async function start() {
  await loadLedger();
  try { S.cfg = await B.call('config_get'); } catch (e) { S.cfg = {}; }
  ensureRepeats();
  buildMonths(); render();
  await loadData();
  if (!S.cfg.tokenSet) setupDialog();
}
if (B.ok()) start(); else window.addEventListener('pywebviewready', start);
