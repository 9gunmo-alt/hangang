/*
 * 쿠팡 창 안에서 실행되는 스크립트 (쿠팡 페이지에 주입됨)
 * - 주문목록 화면에 [프로그램으로 가져오기] 버튼을 띄움
 * - 주문 상품 찾기: 페이지 데이터(JSON) + 페이지가 새로 받아온 데이터(네트워크) + 화면 글자
 *   → 지금 화면에 실제로 보이는 상품만 인정 (페이지를 넘겼는데 옛날 데이터를 다시 읽는 문제 방지)
 * - 자동 가져오기: 기간(월)을 받아서 페이지를 알아서 넘기며 모두 담고, 더 오래된 주문이 나오면 멈춤
 * - 프로그램과는 coupang_push(결과 보내기), coupang_poll(자동 가져오기 요청 확인) 두 가지만 사용 (pywebview)
 */
(function () {
  'use strict';
  if (window.__ccLoaded) return;
  window.__ccLoaded = true;

  const ORDER_URL = 'https://mc.coupang.com/ssr/desktop/order/list';
  const NAME_KEYS = ['productName', 'vendorItemName', 'itemName', 'productTitle', 'dealName', 'title', 'name'];
  const OPTION_KEYS = ['optionName', 'vendorItemName', 'itemName', 'optionValue', 'option', 'optionTitle'];
  const QTY_KEYS = ['quantity', 'orderQuantity', 'qty', 'count', 'itemCount', 'purchaseCount'];
  const UNIT_KEYS = ['unitPrice', 'salesPrice', 'salePrice', 'sellingPrice', 'originPrice', 'price'];
  const TOTAL_KEYS = ['totalPrice', 'orderPrice', 'productPrice', 'itemPrice', 'totalProductPrice'];
  const FINAL_KEYS = ['paymentAmount', 'payAmount', 'paidAmount', 'finalPrice', 'totalPayment', 'realPrice', 'amount'];
  const DISC_KEYS = ['discountAmount', 'discountPrice', 'couponDiscount', 'instantDiscount', 'totalDiscount', 'discount'];
  const DATE_KEYS = ['orderedAt', 'orderDate', 'orderedDate', 'orderDateTime', 'orderTime', 'paidAt', 'paymentDate', 'paidDate', 'createdAt'];
  const ORDER_KEYS = ['orderId', 'orderNo', 'orderNumber'];
  const STATUS_KEYS = ['status', 'orderStatus', 'deliveryStatus', 'statusText', 'statusName', 'itemStatus'];
  const BAD_STATUS = /취소|반품|환불|CANCEL|RETURN|REFUND/i;

  // 프로그램(파이썬)과 연결: pywebview 가 넣어주는 window.pywebview.api 사용 (준비될 때까지 잠깐 기다림)
  const bridge = () => new Promise((res, rej) => {
    const ok = () => window.pywebview && window.pywebview.api && window.pywebview.api.coupang_push;
    if (ok()) return res(window.pywebview.api);
    let n = 0;
    const t = setInterval(() => { if (ok()) { clearInterval(t); res(window.pywebview.api); } else if (++n > 80) { clearInterval(t); rej(new Error('프로그램과 연결되지 않았습니다')); } }, 100);
  });
  const invoke = (cmd, args) => bridge().then((api) => cmd === 'coupang_push' ? api.coupang_push(String((args || {}).payload || '')) : api.coupang_poll(!!(args || {}).take));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const num = (v) => {
    if (v == null || typeof v === 'boolean') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'object') {
      for (const k of ['amount', 'value', 'price']) if (k in v) return num(v[k]);
      return null;
    }
    const s = String(v).replace(/[^\d.-]/g, '');
    if (!s || s === '-' || s === '.') return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };
  const toDate = (v) => {
    if (v == null || v === '') return '';
    if (typeof v === 'number') {
      const ms = v > 1e12 ? v : v > 1e9 ? v * 1000 : null;
      if (ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
      const s = String(v);
      if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
      return '';
    }
    const m = String(v).match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    const m2 = String(v).match(/^(\d{4})(\d{2})(\d{2})/);
    return m2 ? m2[1] + '-' + m2[2] + '-' + m2[3] : '';
  };
  const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return null; };
  const pickNum = (o, keys) => { for (const k of keys) { const n = num(o[k]); if (n != null) return n; } return null; };
  const pickStr = (o, keys) => { for (const k of keys) { const v = o[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; };
  const squash = (s) => String(s || '').replace(/\s+/g, '');

  /* ================= 데이터(JSON)에서 주문 상품 찾기 ================= */
  function isItem(o) {
    const name = pickStr(o, NAME_KEYS);
    if (!name || name.length < 2 || /^https?:/.test(name)) return false;
    return [...UNIT_KEYS, ...TOTAL_KEYS, ...FINAL_KEYS].some((k) => num(o[k]) != null);
  }
  function walk(node, ctx, out, depth, seen) {
    if (!node || typeof node !== 'object' || depth > 40 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach((c) => walk(c, ctx, out, depth + 1, seen)); return; }
    const c = Object.assign({}, ctx);
    const d = pick(node, DATE_KEYS); if (d != null) { const s = toDate(d); if (s) c.date = s; }
    const oid = pick(node, ORDER_KEYS); if (oid != null && typeof oid !== 'object') c.orderId = String(oid);
    const st = pickStr(node, STATUS_KEYS); if (st) c.status = st;
    if (isItem(node)) {
      const name = pickStr(node, NAME_KEYS);
      let option = pickStr(node, OPTION_KEYS);
      if (option === name) option = '';
      else if (option.startsWith(name)) option = option.slice(name.length).replace(/^[\s,·\-/]+/, '');
      const qty = pickNum(node, QTY_KEYS) || 1;
      const unit = pickNum(node, UNIT_KEYS);
      const total = pickNum(node, TOTAL_KEYS);
      const fin = pickNum(node, FINAL_KEYS);
      const disc = pickNum(node, DISC_KEYS);
      out.push({
        date: c.date || '', orderId: c.orderId || '', status: pickStr(node, STATUS_KEYS) || c.status || '',
        name, option, qty, unit_price: unit, total: total != null ? total : (unit != null ? unit * qty : null),
        discount: disc != null ? Math.abs(disc) : null, final: fin,
      });
      return;
    }
    for (const k of Object.keys(node)) walk(node[k], c, out, depth + 1, seen);
  }
  /* 쿠팡 주문목록의 실제 구조로 정확히 읽기
   *  orderList[] → deliveryGroupList[](배송 상자) → productList[](상품)
   *  - 한 상품을 여러 상자로 나눠 보내면 상자마다 같은 상품이 또 나오므로 vendorItemId로 한 번만
   *  - 수량 = 주문 수량 − 취소 수량, 전부 취소면 제외
   *  - 할인금액 = (정가 unitPrice − 할인가 discountedUnitPrice) × 수량
   *  - bundleReceiptList(영수증 묶음)는 같은 상품의 반복이라 읽지 않음 */
  function coupangOrders(json) {
    const orders = [];
    const seen = new WeakSet();
    (function find(n, d) {
      if (!n || typeof n !== 'object' || d > 12 || seen.has(n)) return;
      seen.add(n);
      if (Array.isArray(n)) { n.forEach((c) => find(c, d + 1)); return; }
      if (Array.isArray(n.orderList) && n.orderList.some((o) => o && o.orderId != null && Array.isArray(o.deliveryGroupList))) { orders.push(...n.orderList); return; }
      Object.keys(n).forEach((k) => find(n[k], d + 1));
    })(json, 0);
    if (!orders.length) return null;
    const out = [];
    let skipped = 0;
    const done = new Set();
    orders.forEach((o) => {
      if (!o || o.orderId == null || done.has(String(o.orderId))) return;
      done.add(String(o.orderId));
      const r = orderItems(o);
      skipped += r.skipped;
      out.push(...r.items);
    });
    out.__skipped = skipped;
    return out;
  }
  // 주문 객체 하나 → 상품 목록 (주문목록 데이터·주문 상세 데이터 둘 다 같은 모양)
  function orderItems(o) {
      let skipped = 0;
      const out = [];
      const date = toDate(o.orderedAt);
      const byItem = new Map();
      (o.deliveryGroupList || []).forEach((g) => {
        const status = (g.groupStatus && g.groupStatus.status) || '';
        (g.productList || []).forEach((p) => {
          const vid = String(p.vendorItemId != null && p.vendorItemId !== -1 ? p.vendorItemId : (p.productId + '/' + p.itemId));
          if (byItem.has(vid)) return; // 나눠 배송된 같은 상품
          const qty = (num(p.quantity) || 1) - (num(p.cancelQuantity) || 0);
          if (o.allCanceled || p.allCanceled || qty <= 0) { byItem.set(vid, null); skipped++; return; }
          const unit = num(p.unitPrice);
          let du = num(p.discountedUnitPrice);
          if (du == null) du = num(p.combinedUnitPrice);
          if (du == null || (unit != null && du > unit)) du = unit;
          const name = String(p.productName || p.vendorItemName || '').trim();
          let option = String(p.vendorItemName || '').trim();
          if (option === name) option = '';
          else if (option.startsWith(name)) option = option.slice(name.length).replace(/^[\s,·\-/]+/, '');
          const total = unit != null ? unit * qty : null;
          const fin = du != null ? du * qty : total;
          byItem.set(vid, {
            date, orderId: String(o.orderId), status, name, option, qty,
            unit_price: unit, total, discount: total != null && fin != null ? Math.max(0, total - fin) : null, final: fin,
          });
        });
      });
      byItem.forEach((v) => { if (v && v.name) out.push(v); });
      return { items: out, skipped };
  }
  function findOrder(json, oid) {
    let hit = null;
    const seen = new WeakSet();
    (function f(n, d) {
      if (hit || !n || typeof n !== 'object' || d > 14 || seen.has(n)) return;
      seen.add(n);
      if (!Array.isArray(n) && String(n.orderId) === oid && Array.isArray(n.deliveryGroupList)) { hit = n; return; }
      (Array.isArray(n) ? n : Object.values(n)).forEach((c) => f(c, d + 1));
    })(json, 0);
    return hit;
  }
  const itemsIn = (json) => {
    const exact = coupangOrders(json);
    if (exact) return exact;
    const out = []; walk(json, {}, out, 0, new WeakSet()); return out.filter((x) => x.date || x.orderId);
  };

  function tryParse(t) { try { return JSON.parse(t); } catch (e) { return null; } }
  // React Server Components 응답 (줄마다 "id:JSON")
  function parseRsc(text) {
    const out = [];
    String(text).split('\n').forEach((line) => {
      const i = line.indexOf(':');
      if (i < 0 || i > 8) return;
      const body = line.slice(i + 1);
      if (body[0] === '{' || body[0] === '[') { const j = tryParse(body); if (j) out.push(j); }
    });
    return out;
  }

  /* 페이지가 새로 받아오는 데이터 기록 (페이지 넘길 때 JSON/RSC로 받아오는 경우) */
  const captured = [];
  function record(url, data) {
    try {
      const arr = Array.isArray(data) && data.__rsc ? data : [data];
      let items = [];
      arr.forEach((j) => { items = items.concat(itemsIn(j)); });
      if (items.length) { captured.push({ url: String(url), t: Date.now(), items }); if (captured.length > 40) captured.shift(); }
    } catch (e) { /* 무시 */ }
  }
  const rawBodies = []; // 진단용: 페이지가 받아온 데이터 원본 (최근 10개, 각 20만 자까지)
  function handleBody(url, ct, text) {
    if (!text || text.length > 6000000) return;
    try { rawBodies.push({ url: String(url), ct, text: text.slice(0, 200000) }); if (rawBodies.length > 10) rawBodies.shift(); } catch (e) { /* 무시 */ }
    if (/json/i.test(ct)) { const j = tryParse(text); if (j) record(url, j); }
    else if (/x-component/i.test(ct)) { const a = parseRsc(text); a.__rsc = true; record(url, a); }
  }
  try {
    const of = window.fetch;
    if (of) {
      window.fetch = function (input) {
        const p = of.apply(this, arguments);
        p.then((r) => {
          try {
            const ct = (r.headers && r.headers.get('content-type')) || '';
            if (/json|x-component/i.test(ct)) r.clone().text().then((t) => handleBody(typeof input === 'string' ? input : (input && input.url) || '', ct, t)).catch(() => {});
          } catch (e) { /* 무시 */ }
        }).catch(() => {});
        return p;
      };
    }
    const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__ccUrl = u; return XO.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', () => {
        try {
          const ct = this.getResponseHeader('content-type') || '';
          if (this.responseType === '' || this.responseType === 'text') handleBody(this.__ccUrl, ct, this.responseText);
          else if (this.responseType === 'json' && this.response) record(this.__ccUrl, this.response);
        } catch (e) { /* 무시 */ }
      });
      return XS.apply(this, arguments);
    };
  } catch (e) { /* 무시 */ }

  function pageJsonItems() {
    let items = [];
    document.querySelectorAll('script#__NEXT_DATA__, script[type="application/json"]').forEach((s) => {
      const j = tryParse(s.textContent); if (j) items = items.concat(itemsIn(j));
    });
    ['__NEXT_DATA__', '__INITIAL_STATE__', '__PRELOADED_STATE__', '__APOLLO_STATE__', '__NUXT__'].forEach((k) => {
      try { if (window[k] && typeof window[k] === 'object' && !(window[k] instanceof Element)) items = items.concat(itemsIn(window[k])); } catch (e) { /* 무시 */ }
    });
    try {
      if (Array.isArray(window.__next_f)) {
        const txt = window.__next_f.map((x) => (Array.isArray(x) && typeof x[1] === 'string' ? x[1] : '')).join('');
        parseRsc(txt).forEach((j) => { items = items.concat(itemsIn(j)); });
        (txt.match(/\{"[^\n]{50,}\}/g) || []).forEach((t) => { const j = tryParse(t); if (j) items = items.concat(itemsIn(j)); });
      }
    } catch (e) { /* 무시 */ }
    captured.forEach((c) => { items = items.concat(c.items); });
    return items;
  }

  /* ================= 화면에서 주문 상품 찾기 ================= */
  const DATE_RE = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\s*(주문|결제)?/;
  function domItems() {
    const root = document.body;
    const heads = [];
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const t = tw.currentNode.nodeValue.trim();
      if (t.length < 40 && DATE_RE.test(t) && /주문|결제|^\s*20\d{2}/.test(t)) heads.push({ node: tw.currentNode.parentElement, date: toDate(t) });
    }
    const links = Array.from(document.querySelectorAll('a[href*="/vp/products/"], a[href*="/products/"], a[href*="productId="]'));
    const items = [];
    const used = new Set();
    links.forEach((a) => {
      let name = (a.innerText || a.textContent || '').trim().split('\n').map((s) => s.trim()).filter(Boolean).sort((x, y) => y.length - x.length)[0] || '';
      if (!name || name.length < 3) { const img = a.querySelector('img[alt]'); name = img ? img.alt.trim() : ''; }
      if (!name || name.length < 3 || /리뷰|재구매|장바구니|배송조회/.test(name)) return;
      let box = a, text = '';
      for (let i = 0; i < 8 && box && box !== root; i++) {
        box = box.parentElement;
        text = box ? box.innerText || '' : '';
        if (/[\d,]+\s*원/.test(text)) break;
      }
      if (!box || used.has(box)) return;
      used.add(box);
      const prices = (text.match(/[\d,]{3,}\s*원/g) || []).map((s) => num(s)).filter((n) => n != null && n > 0);
      if (!prices.length) return;
      const rest = text.split(name).join(' ');
      const qm = rest.match(/수량\s*:?\s*(\d+)/) || rest.match(/(?:^|[\s·|/])(\d+)\s*개(?![가-힣])/m);
      const qty = qm ? +qm[1] : 1;
      let date = '';
      for (const h of heads) {
        if (h.node.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) date = h.date; else break;
      }
      const status = (text.match(/(배송완료|배송중|결제완료|상품준비중|주문취소|취소완료|반품[가-힣]*|환불[가-힣]*|교환[가-힣]*)/) || [])[1] || '';
      // 줄 그어진 원래 가격(할인 전)이 있으면 할인금액 계산
      let orig = null;
      box.querySelectorAll('del, s, strike, [class*="origin"], [class*="Origin"], [class*="before"], [class*="strike"], span, em, div, p').forEach((el) => {
        if (el.children.length > 2) return;
        const tx = (el.innerText || el.textContent || '').trim();
        const m = tx.match(/^[^\d]{0,6}([\d,]{3,})\s*원$/);
        if (!m) return;
        const tag = el.tagName;
        const struck = tag === 'DEL' || tag === 'S' || tag === 'STRIKE' || /line-through/.test(getComputedStyle(el).textDecorationLine || '');
        if (!struck) return;
        const n = num(m[1]);
        if (n && (!orig || n > orig)) orig = n;
      });
      const fin = orig ? (prices.find((p) => p !== orig) || prices[0]) : prices[0];
      let total = null, discount = null;
      if (orig && orig > fin) { total = orig; discount = orig - fin; }
      else if (orig && qty > 1 && orig * qty > fin) { total = orig * qty; discount = total - fin; }
      items.push({ date, orderId: '', status, name, option: '', qty, unit_price: null, total, discount, final: fin });
    });
    return items;
  }

  /* ================= 지금 화면 기준으로 모으기 ================= */
  // 데이터(JSON)는 정확하지만 페이지를 넘기면 옛날 것이 남아 있을 수 있음
  // → 상품명이 지금 화면 글자에 실제로 있는 것만 인정. 하나도 없으면 화면에서 직접 읽기.
  function extractNow() {
    const screen = squash(document.body ? document.body.innerText : '');
    const onScreen = (x) => { const n = squash(x.name).slice(0, 24); return n.length >= 2 && screen.includes(n); };
    const seen = new Set();
    const all = pageJsonItems();
    // 주문 카드에 상품이 일부만 보여도 그 주문의 상품은 전부 인정 (주문 단위로 화면에 있는지 판단)
    const liveOrders = new Set(all.filter((x) => x.orderId && onScreen(x)).map((x) => x.orderId));
    let items = all.filter((x) => (x.orderId ? liveOrders.has(x.orderId) : onScreen(x))).filter((x) => {
      const k = [x.orderId, x.date, x.name, x.option, x.qty, x.final].join('|');
      if (seen.has(k)) return false; seen.add(k); return true;
    });
    let strategy = 'json';
    if (!items.length) { strategy = 'dom'; items = domItems(); }
    const good = items.filter((x) => !BAD_STATUS.test(x.status || ''));
    return { strategy, items: good, skipped: items.length - good.length };
  }

  /* ================= 주문 상세로 실제 결제액 맞추기 =================
   * 주문목록 가격은 상품 할인가까지만 반영됨. 쿠폰·카드 즉시할인·쿠팡캐시·배송비·부분 환불은
   * 주문 상세 데이터(domains.payment)에만 있으므로 주문마다 상세 데이터를 받아서
   *   실제 결제액 = totalPayedAmount − totalCancelAmount
   * 를 그 주문의 상품들에 (할인가 기준) 금액 비율대로 나눠 결제금액으로 씀. */
  const payCache = new Map(); // orderId → {paid, payed, ...} (한 번 받은 주문은 다시 안 받음)
  try { const c = JSON.parse(sessionStorage.getItem('__ccPay') || '{}'); Object.keys(c).forEach((k) => payCache.set(k, c[k])); } catch (e) { /* 무시 */ }
  const savePayCache = () => { try { const o = {}; payCache.forEach((v, k) => { o[k] = v; }); sessionStorage.setItem('__ccPay', JSON.stringify(o)); } catch (e) { /* 무시 */ } };
  function nextInfo() {
    let nd = null;
    // window.__NEXT_DATA__ 는 같은 id의 <script> 태그를 가리킬 수도 있어서, 태그 내용을 먼저 읽음
    try { nd = JSON.parse((document.getElementById('__NEXT_DATA__') || {}).textContent || 'null'); } catch (e) { nd = null; }
    if (!nd || !nd.buildId) { const w = window.__NEXT_DATA__; if (w && !(w instanceof Element) && w.buildId) nd = w; }
    const prefix = location.pathname.startsWith('/ssr/') ? '/ssr' : '';
    return { buildId: nd && nd.buildId, prefix };
  }
  function findPayment(json, oid) {
    let hit = null;
    const seen = new WeakSet();
    (function f(n, d) {
      if (hit || !n || typeof n !== 'object' || d > 14 || seen.has(n)) return;
      seen.add(n);
      if (!Array.isArray(n) && String(n.orderId) === oid && n.totalPayedAmount != null) { hit = n; return; }
      (Array.isArray(n) ? n : Object.values(n)).forEach((c) => f(c, d + 1));
    })(json, 0);
    return hit;
  }
  async function fetchPayment(oid) {
    if (payCache.has(oid)) return payCache.get(oid);
    const { buildId, prefix } = nextInfo();
    let json = null;
    if (buildId) {
      try {
        const r = await fetch(prefix + '/_next/data/' + buildId + '/desktop/order/' + oid + '.json?orderId=' + oid, { credentials: 'include', headers: { 'x-nextjs-data': '1' } });
        if (r.ok) json = await r.json();
      } catch (e) { json = null; }
    }
    if (!json || !findPayment(json, oid)) { // 안 되면 상세 페이지 HTML에서 읽기
      try {
        const r = await fetch(prefix + '/desktop/order/' + oid, { credentials: 'include' });
        if (r.ok) {
          const t = await r.text();
          const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
          if (m) json = tryParse(m[1]);
        }
      } catch (e) { /* 무시 */ }
    }
    const pay = json ? findPayment(json, oid) : null;
    if (!pay) return null;
    const payed = num(pay.totalPayedAmount) || 0, cancel = num(pay.totalCancelAmount) || 0;
    const ord = findOrder(json, oid);
    const detailItems = ord ? orderItems(ord).items.filter((x) => !BAD_STATUS.test(x.status || '')) : null;
    const res = { paid: Math.max(0, payed - cancel), payed, cancel, waiting: !!pay.paymentWaiting || pay.payed === false, items: detailItems };
    payCache.set(oid, res); savePayCache();
    return res;
  }
  // 주문별로: 상세 데이터의 전체 상품 목록으로 맞추고 실제 결제액을 상품에 나눠 넣음. onProgress(done, total)
  // → { items(새 목록), ok, fail, orders }
  async function applyExact(items, onProgress) {
    const byOrder = new Map();
    const noId = [];
    items.forEach((x) => { if (x.orderId) { if (!byOrder.has(x.orderId)) byOrder.set(x.orderId, []); byOrder.get(x.orderId).push(x); } else noId.push(x); });
    let done = 0, ok = 0, fail = 0, filled = 0;
    const out = [];
    for (const [oid, group] of byOrder) {
      if (stopFlag) { out.push(...group); continue; }
      const needFetch = !payCache.has(oid);
      const pay = await fetchPayment(oid);
      done++;
      if (onProgress) onProgress(done, byOrder.size);
      if (!pay || pay.waiting) { fail++; group.forEach((x) => { x.exact = false; }); out.push(...group); if (needFetch) await sleep(250); continue; }
      // 상세의 상품 목록이 있으면 그걸 기준으로 (목록 카드에 안 보이던 상품까지)
      let list = group;
      if (pay.items && pay.items.length) {
        const d0 = group[0].date;
        list = pay.items.map((x) => Object.assign({}, x, { date: x.date || d0 }));
        if (list.length > group.length) filled += list.length - group.length;
      }
      const base = list.reduce((a, x) => a + (x.final || 0), 0);
      if (!base) { fail++; out.push(...group); continue; }
      let rem = pay.paid;
      list.forEach((x, i) => {
        const share = i === list.length - 1 ? rem : Math.round(pay.paid * (x.final || 0) / base);
        rem -= share;
        x.listFinal = x.final;        // 주문목록 할인가 기준 금액 (참고용)
        x.final = share;              // 실제 결제액 (쿠폰·카드할인·캐시·배송비·환불 반영)
        x.discount = Math.max(0, (x.total != null ? x.total : x.listFinal) - share);
        x.exact = true;
      });
      out.push(...list);
      ok++;
      if (needFetch) await sleep(250); // 쿠팡에 부담 안 주게 천천히
    }
    out.push(...noId);
    return { items: out, ok, fail, orders: byOrder.size, filled };
  }

  const send = (payload) => invoke('coupang_push', { payload: JSON.stringify(Object.assign({ url: location.href, at: new Date().toISOString() }, payload)) });

  /* ================= 수동: 현재 페이지 가져오기 ================= */
  async function runItems() {
    const r = extractNow();
    stopFlag = false;
    const exr = r.items.length ? await applyExact(r.items, (d, t) => toast('주문 상세에서 실제 결제액 확인 중… ' + d + ' / ' + t)) : { items: [], ok: 0, fail: 0 };
    r.items = exr.items;
    const ex = { ok: exr.ok, fail: exr.fail, filled: exr.filled };
    try { await send(Object.assign({ kind: 'items', exact: ex }, r)); } catch (e) { toast('보내지 못했습니다: ' + e, true); return; }
    if (r.items.length) toast(r.items.length + '개 상품을 프로그램으로 보냈습니다' + (r.skipped ? ' (취소·반품 ' + r.skipped + '개 제외)' : '') +
      '\n실제 결제액 확인: 주문 ' + ex.ok + '건' + (ex.fail ? ' · 확인 못 한 주문 ' + ex.fail + '건 (목록 가격으로 들어감)' : ''));
    else toast('이 화면에서 주문 상품을 찾지 못했습니다.\n주문목록 화면인지 확인해 주세요.', true);
  }
  async function runDump() {
    const html = document.documentElement.outerHTML;
    const cap = captured.map((c) => ({ url: c.url, count: c.items.length, sample: c.items.slice(0, 3) }));
    try {
      await send({ kind: 'dump', html: html.slice(0, 3000000), captured: cap, pager: pagerInfo(), raw: rawBodies.slice(-10) });
      toast('진단 정보를 프로그램으로 보냈습니다');
    } catch (e) { toast('보내지 못했습니다: ' + e, true); }
  }

  /* ================= 자동: 기간 안의 주문 모두 가져오기 ================= */
  const KEY = '__ccCrawl';
  const loadCrawl = () => { try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return s && Date.now() - s.started < 20 * 60000 ? s : null; } catch (e) { return null; } };
  const saveCrawl = (s) => { try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY); } catch (e) { /* 무시 */ } };
  const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  const disabled = (el) => el.disabled || el.getAttribute('aria-disabled') === 'true' || /(^|[\s_-])(disabled?|dim|inactive)([\s_-]|$)/i.test(String(el.className || ''));

  const NUM_RE = /^\d{1,3}$/;
  const CAROUSEL_RE = /carousel|swiper|slick|slider|banner|recommend|rolling/i;
  const inCarousel = (el) => { for (let a = el, i = 0; a && i < 8; a = a.parentElement, i++) if (CAROUSEL_RE.test(String(a.className || '') + ' ' + (a.id || ''))) return true; return false; };
  const numEls = (root) => Array.from((root || document).querySelectorAll('a,button,[role="button"],li,span'))
    .filter((e) => visible(e) && NUM_RE.test((e.textContent || '').trim()) && e.children.length <= 1);
  const lastOrderLink = () => { const a = document.querySelectorAll('a[href*="/vp/products/"], a[href*="/products/"]'); return a.length ? a[a.length - 1] : null; };
  const after = (ref, el) => !ref || !!(ref.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

  // 페이지 번호가 모여 있는 줄(페이지 표시줄) 찾기
  function pagerBox() {
    const ref = lastOrderLink();
    const boxes = new Map();
    numEls().forEach((e) => {
      let a = e.parentElement;
      for (let i = 0; i < 4 && a && a !== document.body; i++, a = a.parentElement) {
        const vals = new Set(numEls(a).map((x) => +x.textContent.trim()));
        if (vals.size >= 2) { boxes.set(a, vals.size); break; }
      }
    });
    let best = null, bestScore = -1e9;
    boxes.forEach((n, box) => {
      const score = n + (after(ref, box) ? 20 : 0) - (inCarousel(box) ? 50 : 0);
      if (score > bestScore) { best = box; bestScore = score; }
    });
    return best;
  }
  function currentNum(box, hint) {
    const nums = numEls(box);
    const byAttr = nums.find((e) => [e, e.parentElement, e.closest('a,button,li')].filter(Boolean).some((x) =>
      x.getAttribute('aria-current') === 'page' || x.getAttribute('aria-current') === 'true' || x.getAttribute('aria-selected') === 'true' ||
      /(active|selected|current|is-on|(^|[\s_-])on([\s_-]|$))/i.test(String(x.className || ''))));
    if (byAttr) return byAttr;
    // 클래스로 모르면 혼자만 굵거나 색이 다른 번호를 현재 페이지로
    const sty = nums.map((e) => { const c = getComputedStyle(e); return c.fontWeight + '|' + c.color + '|' + c.backgroundColor; });
    const odd = nums.filter((e, i) => sty.filter((x) => x === sty[i]).length === 1);
    if (odd.length === 1 && nums.length > 2) return odd[0];
    const w = nums.map((e) => parseInt(getComputedStyle(e).fontWeight, 10) || 400);
    const maxW = Math.max(...w);
    if (w.filter((x) => x === maxW).length === 1 && Math.min(...w) < maxW) return nums[w.indexOf(maxW)];
    // 그래도 모르면 지금까지 넘긴 페이지 수로 추정 (1페이지부터 시작한 경우)
    return hint ? nums.find((e) => +e.textContent.trim() === hint) || null : null;
  }
  const isNextLike = (e) => {
    const t = (e.textContent || '').trim();
    const al = (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '') + ' ' + (e.getAttribute('alt') || '');
    const cls = String(e.className && e.className.baseVal != null ? e.className.baseVal : e.className || '').split(/\s+/);
    return /^(다음|다음\s*페이지|next|›|»|>|>>)$/i.test(t) || /다음|next/i.test(al) ||
      cls.some((c) => /^next/i.test(c) || /next$/i.test(c) || /[_-]next/i.test(c) || /Next/.test(c));
  };
  const clickable = (e) => e.closest('a,button,[role="button"]') || e;

  function pagerInfo() {
    const box = pagerBox();
    const cur = box ? currentNum(box) : null;
    return { hasBox: !!box, nums: box ? numEls(box).map((e) => e.textContent.trim()) : [], current: cur ? +cur.textContent.trim() : null, boxClass: box ? String(box.className || '') : '' };
  }

  // 다음 페이지로 가는 방법들을 가능성 높은 순서로
  function nextCandidates(hint) {
    const out = [];
    const seen = new Set();
    const add = (el, how) => { if (!el) return; const c = clickable(el); if (seen.has(c) || disabled(c) || !visible(c)) return; seen.add(c); out.push({ el: c, how }); };
    const box = pagerBox();
    let lastPage = false, maybeLast = false;
    if (box) {
      const cur = currentNum(box, hint);
      const nums = numEls(box);
      const area = box.parentElement && box.parentElement !== document.body ? box.parentElement : box;
      const arrows = Array.from(area.querySelectorAll('a,button,[role="button"],li,span,i,svg')).filter((e) => visible(e) && !NUM_RE.test((e.textContent || '').trim()) && isNextLike(e));
      if (cur) {
        const n = +cur.textContent.trim();
        add(nums.find((e) => +e.textContent.trim() === n + 1), 'page ' + (n + 1));
        arrows.forEach((e) => add(e, 'next'));
        const maxNum = Math.max(...nums.map((e) => +e.textContent.trim()));
        const liveArrow = arrows.some((e) => !disabled(clickable(e)));
        if (n >= maxNum && !liveArrow) lastPage = true;
        if (n >= maxNum) maybeLast = true; // 화살표가 있어도 안 넘어가면 마지막 페이지로 봄
      } else {
        arrows.forEach((e) => add(e, 'next'));
      }
    }
    // 페이지 표시줄을 못 찾았거나 거기서 못 찾았을 때: 주문목록 아래쪽의 다음/더보기 (추천 상품 넘기기 버튼 제외)
    if (!out.length && !lastPage) {
      const ref = lastOrderLink();
      const els = Array.from(document.querySelectorAll('a,button,[role="button"]')).filter((e) => visible(e) && !inCarousel(e));
      // 글자가 정확히 "다음"인 버튼을 먼저 (쿠팡 주문목록의 이전/다음 버튼), 그다음 다른 다음 모양
      const nexts = els.filter((e) => isNextLike(e) && after(ref, e));
      nexts.filter((e) => /^다음(\s*페이지)?$/.test((e.textContent || '').trim())).forEach((e) => add(e, 'next'));
      nexts.forEach((e) => add(e, 'next'));
      els.filter((e) => /^(더\s*보기|주문\s*더\s*보기|more)$/i.test((e.textContent || '').trim())).forEach((e) => add(e, 'more'));
    }
    // 주소에 페이지 번호가 있으면 주소로 이동
    try {
      const u = new URL(location.href);
      for (const k of Array.from(u.searchParams.keys())) {
        if (/^(page|pageIndex|pageNo|pageNum|pageNumber|p)$/i.test(k) && /^\d+$/.test(u.searchParams.get(k))) {
          u.searchParams.set(k, String(+u.searchParams.get(k) + 1));
          out.push({ url: u.toString(), how: 'url ' + k });
          break;
        }
      }
    } catch (e) { /* 무시 */ }
    return { list: out, lastPage, maybeLast };
  }
  const signature = () => extractNow().items.map((x) => x.name + x.final).join('|');

  async function waitForItems(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (extractNow().items.length) return true; await sleep(400); }
    return false;
  }

  let stopFlag = false;
  async function crawlStep() {
    const st = loadCrawl();
    if (!st) return;
    showStatus(st);
    if (!(await waitForItems(10000))) return finish(st, st.pages ? 'end' : 'empty');
    if (stopFlag) return finish(st, 'stopped');
    const r = extractNow();
    const from = st.from + '-01', toEnd = st.to + '-31';
    const inRange = r.items.filter((x) => x.date && x.date >= from && x.date <= toEnd);
    const dates = r.items.map((x) => x.date).filter(Boolean).sort();
    st.pages++;
    st.found += inRange.length;
    saveCrawl(st);
    const exr = inRange.length ? await applyExact(inRange, (d, t) => showStatus(st, '주문 상세 확인 ' + d + '/' + t)) : { items: [], ok: 0, fail: 0 };
    const ex = { ok: exr.ok, fail: exr.fail, filled: exr.filled };
    st.found += exr.items.length - inRange.length; // 상세에서 더 찾은 상품
    st.exactOk = (st.exactOk || 0) + ex.ok; st.exactFail = (st.exactFail || 0) + ex.fail;
    saveCrawl(st);
    if (stopFlag) return finish(st, 'stopped');
    try { await send({ kind: 'items', strategy: r.strategy, items: exr.items, skipped: r.skipped, exact: ex, crawl: { page: st.pages, found: st.found } }); } catch (e) { return finish(st, 'send'); }
    showStatus(st);
    if (!dates.length) return finish(st, 'nodate');
    if (dates[0] < from) return finish(st, 'done');       // 기간보다 오래된 주문까지 왔음
    if (st.pages >= 80) return finish(st, 'limit');
    const nc = nextCandidates(st.pages);
    if (nc.lastPage) return finish(st, 'end');
    if (!nc.list.length) return finish(st, 'nonext');
    const before = signature();
    const beforeCount = r.items.length;
    // 후보를 차례로 눌러 보고, 화면이 바뀌면 다음 단계로 (새로고침형이면 새 페이지에서 이어서 실행됨)
    for (const c of nc.list) {
      if (stopFlag) return finish(st, 'stopped');
      st.lastTry = c.how; saveCrawl(st);
      if (c.url) { location.href = c.url; await sleep(15000); return finish(st, 'stuck'); }
      try { c.el.scrollIntoView({ block: 'center' }); } catch (e) { /* 무시 */ }
      c.el.click();
      const end = Date.now() + 7000;
      while (Date.now() < end) {
        await sleep(400);
        if (stopFlag) return finish(st, 'stopped');
        const now = extractNow();
        if (now.items.length && (signature() !== before || now.items.length > beforeCount)) { await sleep(600); return crawlStep(); }
      }
    }
    return finish(st, nc.maybeLast ? 'end' : 'stuck');
  }
  async function finish(st, reason) {
    saveCrawl(null);
    hideStatus();
    try { await send({ kind: 'crawl-done', reason, pages: st.pages, found: st.found, from: st.from, to: st.to, exactOk: st.exactOk || 0, exactFail: st.exactFail || 0, lastTry: st.lastTry || '', pager: pagerInfo() }); } catch (e) { /* 무시 */ }
    const msg = {
      done: '다 가져왔습니다', end: '마지막 페이지까지 가져왔습니다', nonext: '다음 페이지가 없어 멈췄습니다', stopped: '중지했습니다',
      empty: '주문 상품을 찾지 못했습니다', nodate: '주문 날짜를 찾지 못해 멈췄습니다', stuck: '다음 페이지로 넘어가지 않아 멈췄습니다', limit: '80페이지까지만 가져왔습니다', send: '프로그램으로 보내지 못했습니다',
    }[reason] || reason;
    toast(msg + '\n' + st.pages + '페이지 · ' + st.from + ' ~ ' + st.to + ' 주문 ' + st.found + '개', !['done', 'end', 'nonext'].includes(reason));
  }
  function startCrawl(req) {
    if (!/^\d{4}-\d{2}$/.test(req.from || '') || !/^\d{4}-\d{2}$/.test(req.to || '')) return;
    stopFlag = false;
    saveCrawl({ from: req.from <= req.to ? req.from : req.to, to: req.from <= req.to ? req.to : req.from, pages: 0, found: 0, started: Date.now() });
    crawlStep();
  }
  // 계산기에서 요청한 자동 가져오기가 있는지 확인
  async function poll() {
    if (/login/i.test(location.host) || /login/i.test(location.pathname)) return; // 로그인 중에는 대기
    let req = null;
    try { req = await invoke('coupang_poll', { take: location.host === 'mc.coupang.com' }); } catch (e) { return; }
    if (!req) return;
    if (location.host !== 'mc.coupang.com') { location.href = ORDER_URL; return; } // 로그인 후 홈으로 갔으면 주문목록으로
    startCrawl(typeof req === 'string' ? JSON.parse(req) : req);
  }

  window.__ccRun = function (mode) {
    if (mode === 'dump') return runDump();
    if (mode === 'poll') return poll();
    if (mode === 'stop') { stopFlag = true; if (!loadCrawl()) hideStatus(); return; }
    return runItems();
  };

  /* ================= 버튼 · 알림 · 진행 상태 ================= */
  const FONT = '"Pretendard","Malgun Gothic",sans-serif';
  let toastEl = null, toastT = null, statusEl = null;
  function toast(msg, warn) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText = 'position:fixed;right:24px;bottom:92px;z-index:2147483647;max-width:360px;padding:12px 16px;border-radius:10px;color:#fff;font:600 13px/1.5 ' + FONT + ';white-space:pre-line;box-shadow:0 8px 24px rgba(0,0,0,.2)';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.background = warn ? '#8a4b08' : '#1b2233';
    toastEl.style.display = 'block';
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.style.display = 'none'; }, 6000);
  }
  function showStatus(st, extra) {
    if (!document.body) return;
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 18px;border-radius:24px;background:#1b2233;color:#fff;font:600 14px ' + FONT + ';box-shadow:0 8px 24px rgba(0,0,0,.25)';
      const t = document.createElement('span'); t.id = '__ccStatusText';
      const b = document.createElement('button'); b.type = 'button'; b.textContent = '중지';
      b.style.cssText = 'height:32px;padding:0 14px;border:1px solid rgba(255,255,255,.5);border-radius:16px;background:none;color:#fff;font:600 13px ' + FONT + ';cursor:pointer';
      b.onclick = () => { stopFlag = true; saveCrawl(null); hideStatus(); toast('중지했습니다'); };
      statusEl.append(t, b);
      document.body.appendChild(statusEl);
    }
    statusEl.querySelector('#__ccStatusText').textContent = '자동으로 가져오는 중 · ' + st.from + ' ~ ' + st.to + ' · ' + st.pages + '페이지 · ' + st.found + '개' + (extra ? ' · ' + extra : '');
    statusEl.style.display = 'flex';
  }
  function hideStatus() { if (statusEl) statusEl.style.display = 'none'; }

  function addButton() {
    if (!document.body || document.getElementById('__ccBtn')) return;
    const b = document.createElement('button');
    b.id = '__ccBtn';
    b.type = 'button';
    b.textContent = '이 페이지 가져오기';
    b.title = '지금 화면에 보이는 주문을 프로그램으로 보냅니다';
    b.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483646;height:52px;padding:0 22px;border:0;border-radius:26px;background:#2f6bff;color:#fff;font:700 15px ' + FONT + ';cursor:pointer;box-shadow:0 8px 24px rgba(47,107,255,.45)';
    b.onclick = () => { b.disabled = true; b.style.opacity = '.6'; Promise.resolve(runItems()).finally(() => { b.disabled = false; b.style.opacity = '1'; }); };
    document.body.appendChild(b);
  }
  const isOrderPage = () => /order|myorder|mypage|mc\.coupang\.com/i.test(location.href) && !/login/i.test(location.host + location.pathname);
  function tick() { if (isOrderPage()) addButton(); else { const b = document.getElementById('__ccBtn'); if (b) b.remove(); } }

  function onReady() {
    tick();
    setInterval(tick, 1500);
    if (loadCrawl()) crawlStep(); // 새로고침형 페이지 넘김이면 여기서 이어서
    else poll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady); else onReady();
})();
