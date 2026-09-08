#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한강라면 매장 노트북용 실시간 수집 봇 (1분마다)

- 목록은 HTTP로 3개월치를 가져오고(빠름), 여러 품목 묶음거래는 영수증 상세를
  '한 번만' 열어 캐시(bundle_cache.json)에 저장해 재사용한다 → 매 사이클이 가볍다.
- 결과 docs/data.json 이 바뀌었을 때만 git commit & push 한다.
- 노트북이 켜져 있는 동안 계속 돌고, 끄면 멈춘다(다시 켜면 재개).

한 번만 설치: setup.bat  /  실행: run.bat
"""

import os, re, json, sys, time, calendar, subprocess
from datetime import datetime, timezone, timedelta
import requests

KST = timezone(timedelta(hours=9))
MONTHS_BACK = 3
INTERVAL = 60  # 초

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATA_PATH = os.path.join(REPO, "docs", "data.json")
CACHE_PATH = os.path.join(HERE, "bundle_cache.json")

MACHINES = [
    ("라면1", "hgdandae2", "vendingpay"),
    ("라면2", "hgdandae3", "vendingpay"),
    ("냉동",  "hgdandae4", "bangsopener"),
    ("냉장",  "hgdandae5", "bangsopener"),
    ("슬림",  "hgdandae1", "vendingpay"),
]
PLATFORMS = {
    "vendingpay": {
        "list":    "https://vendingpay.kr/dongseo/tech/app/api/sales_res_td.do",
        "machine": "https://vendingpay.kr/dongseo/tech/app/{code}",
        "receipt": "https://vendingpay.kr/dongseo/tech/app/receipt_prev.do",
        "f_product": "product", "f_amount": "price", "f_dt": "datetime", "f_id": "orderno",
        "stock": "https://vendingpay.kr/dongseo/tech/app/ipgo.do",
        "params": lambda code, y, m: {"id": code, "ym": f"{y}-{m:02d}-01",
                                      "tm": f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"},
    },
    "bangsopener": {
        "list":    "http://bangsopener.co.kr/opener/appadmin/tsres.do",
        "machine": "http://bangsopener.co.kr/opener/kiosk/adminapp/{code}",
        "receipt": "http://bangsopener.co.kr/opener/kiosk/appadmin/receipt_prev.do",
        "f_product": "product", "f_amount": "amount", "f_dt": "datetime", "f_id": "ordern",
        "stock": "http://bangsopener.co.kr/opener/kiosk/appadmin/proup.do",
        "params": lambda code, y, m: {"id": code, "datetime": f"{y}-{m:02d}"},
    },
}

DT_RE = re.compile(r"(\d{2,4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})")
MULTI_RE = re.compile(r"외\s*[1-9]")
SUFFIX_RE = re.compile(r"외\s*\d+\s*개\s*$")
UA = {"User-Agent": "Mozilla/5.0 (hanriver-local-bot)"}

# ── 재고(읽기) ─────────────────────────────────────────────
STOCK = {}          # {기계이름: [{product, qty}]}
LAST_STOCK = 0.0
STOCK_EVERY = 300   # 재고 읽기 주기(초). 재고 페이지는 브라우저로 읽어서 무거워 5분 간격
MAX_PATH = os.path.join(HERE, "stock_max.json")   # 상품별 역대/설정 최대치(게이지 기준)

def load_max():
    try:
        with open(MAX_PATH, encoding="utf-8") as f: return json.load(f)
    except Exception: return {}
def save_max(m):
    try:
        with open(MAX_PATH, "w", encoding="utf-8") as f: json.dump(m, f, ensure_ascii=False)
    except Exception: pass

STOCK_MAX = {}   # {"기계\x01상품": 최대수량(게이지 기준)}

# 고정 최대치 규칙: 라면1·라면2 기계는 상품별 최대가 정해져 있음
CAP_MACHINES = {"라면1", "라면2"}
CAP_SPECIAL = {"용기1": 50, "용기2": 30}   # 특정 상품
CAP_DEFAULT = 8                             # 그 외(라면류)

def fixed_max(machine, product):
    """정해진 최대치가 있으면 반환, 없으면 None(=자동 최고수량 방식)."""
    if machine in CAP_MACHINES:
        return CAP_SPECIAL.get(product, CAP_DEFAULT)
    return None

STOCK_JS = r"""
(cols) => {
  const out = [];
  document.querySelectorAll('tr').forEach(tr => {
    const cs = [...tr.querySelectorAll('td,th')];
    const val = i => { const c = cs[i]; if (!c) return ''; const inp = c.querySelector('input,select'); return ((inp ? inp.value : c.textContent) || '').trim(); };
    const name = val(cols.name);
    if (!name || name === '상품명' || !/[가-힣]/.test(name)) return;
    const q = val(cols.qty); if (!/^\d+$/.test(q)) return;
    const p = val(cols.price); const o = val(cols.order);
    out.push({ product: name, qty: parseInt(q, 10), price: /^\d+$/.test(p) ? parseInt(p, 10) : null, order: o });
  });
  return out;
}
"""


def read_all_stock():
    """각 기계의 '재고 및 수정' 페이지를 열어 상품·수량을 읽는다(읽기 전용)."""
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return None
    out = {}
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(ignore_https_errors=True).new_page()
        try:
            for name, code, plat_key in MACHINES:
                plat = PLATFORMS[plat_key]
                try:
                    pg.goto(plat["machine"].format(code=code), wait_until="networkidle", timeout=45000)
                    pg.wait_for_timeout(600)
                    pg.goto(plat["stock"], wait_until="networkidle", timeout=45000)
                    pg.wait_for_timeout(800)
                    out[name] = pg.evaluate(STOCK_JS, EDIT[plat_key]["cols"])
                except Exception as e:
                    log(f"[{name}] 재고 읽기 실패: {e}")
        finally:
            b.close()
    return out


def log(*a): print(datetime.now(KST).strftime("%H:%M:%S"), *a, flush=True)


# ── 재고 쓰기(수정·삭제·추가) ─────────────────────────────
# 각 플랫폼의 편집 페이지와 열(입력칸) 위치
EDIT = {
    "vendingpay": {
        "edit_url": "https://vendingpay.kr/dongseo/tech/app/ipgo.do",
        "cols": {"order": 0, "name": 1, "qty": 2, "price": 3},
        "add_url": "https://vendingpay.kr/dongseo/tech/app/ipgo.do",
        "add_cols": {"order": 0, "name": 1, "qty": 2, "price": 3},
        "add_btn": "입고",
    },
    "bangsopener": {
        "edit_url": "http://bangsopener.co.kr/opener/kiosk/appadmin/proup.do",
        "cols": {"order": 0, "name": 1, "qty": 2, "price": 4},   # 유통기한이 3번
        "add_url": "http://bangsopener.co.kr/opener/kiosk/appadmin/ipgo.do",
        "add_cols": {"name": 0, "qty": 1, "price": 2},
        "add_btn": "저장",
    },
}

# 한 행을 찾아(이름 또는 추가버튼 기준) 입력칸을 채우고 버튼을 누른다.
JS_CONFIRM_YES = r"""
() => {
  const btns = [...document.querySelectorAll('button,a,input[type=button],input[type=submit],[onclick]')];
  const yes = btns.filter(b => { const t=(b.textContent||b.value||'').trim(); return t==='예'||t==='확인'; });
  for (let i = yes.length - 1; i >= 0; i--) {
    const b = yes[i], r = b.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) { b.click(); return true; }
  }
  return false;
}
"""

JS_FIND_ROW = r"""
(a) => {
  const rows = [...document.querySelectorAll('tr')];
  for (let i = 0; i < rows.length; i++) {
    const ins = rows[i].querySelectorAll('input');
    if (a.findBy === 'name') {
      if (ins.length > a.nameIdx && (ins[a.nameIdx].value||'').trim() === a.oldName) return i;
    } else {
      const b = [...rows[i].querySelectorAll('button,a,[onclick]')].find(x=>(x.textContent||'').trim().indexOf(a.btnText)>=0);
      if (b && ins.length >= a.minInputs) return i;
    }
  }
  return -1;
}
"""


def _sets_for_update(cols, ch):
    s = [{"idx": cols["name"], "val": ch["name"]},
         {"idx": cols["qty"], "val": int(ch["qty"])},
         {"idx": cols["price"], "val": int(ch["price"])}]
    if "order" in cols and ch.get("order") not in (None, ""):
        s.append({"idx": cols["order"], "val": ch["order"]})
    return s

def _sets_for_add(add_cols, ch):
    s = [{"idx": add_cols["name"], "val": ch["name"]},
         {"idx": add_cols["qty"], "val": int(ch["qty"])},
         {"idx": add_cols["price"], "val": int(ch["price"])}]
    if "order" in add_cols and ch.get("order") not in (None, ""):
        s.append({"idx": add_cols["order"], "val": ch["order"]})
    return s


def write_stock(machine, changes):
    """changes: [{action:'update'|'delete'|'add', oldName, order,name,qty,price}]
    실제 편집 페이지에서 행을 찾아 수정/삭제/추가한다. 마지막에 다시 읽어 확인."""
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return [{"action": c.get("action"), "name": c.get("name"), "ok": False, "msg": "Playwright 없음"} for c in changes]
    minfo = {name: (code, plat_key) for name, code, plat_key in MACHINES}
    if machine not in minfo:
        return [{"action": c.get("action"), "name": c.get("name"), "ok": False, "msg": "기계 없음"} for c in changes]
    code, plat_key = minfo[machine]; plat = PLATFORMS[plat_key]; ed = EDIT[plat_key]
    ops = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(ignore_https_errors=True).new_page()
        pg.on("dialog", lambda d: d.accept())
        try:
            pg.goto(plat["machine"].format(code=code), wait_until="networkidle", timeout=45000)
            pg.wait_for_timeout(500)
            for ch in changes:
                act = ch.get("action")
                try:
                    if act == "add":
                        pg.goto(ed["add_url"], wait_until="networkidle", timeout=45000); pg.wait_for_timeout(800)
                        find = {"findBy": "addbtn", "btnText": ed["add_btn"], "minInputs": len(ed["add_cols"])}
                        sets = _sets_for_add(ed["add_cols"], ch); btn = ed["add_btn"]
                    elif act == "delete":
                        pg.goto(ed["edit_url"], wait_until="networkidle", timeout=45000); pg.wait_for_timeout(800)
                        find = {"findBy": "name", "nameIdx": ed["cols"]["name"], "oldName": ch["oldName"]}
                        sets = []; btn = "삭제"
                    else:
                        pg.goto(ed["edit_url"], wait_until="networkidle", timeout=45000); pg.wait_for_timeout(800)
                        find = {"findBy": "name", "nameIdx": ed["cols"]["name"], "oldName": ch.get("oldName", ch["name"])}
                        sets = _sets_for_update(ed["cols"], ch); btn = "수정"
                    idx = pg.evaluate(JS_FIND_ROW, find)
                    if idx < 0:
                        ops.append((ch, False)); log(f"[{machine}] {act} 행 못 찾음: {ch.get('name') or ch.get('oldName')}"); continue
                    row = pg.locator("tr").nth(idx)
                    for s in sets:                       # 실제 타이핑처럼 입력
                        inp = row.locator("input").nth(s["idx"])
                        inp.click(); inp.fill(str(s["val"]))
                    row.get_by_text(btn, exact=False).first.click()   # 수정/삭제/입고 버튼
                    pg.wait_for_timeout(700)
                    try: pg.evaluate(JS_CONFIRM_YES)                    # '예' 확인 팝업 승인
                    except Exception: pass
                    pg.wait_for_timeout(1800)
                    ops.append((ch, True))
                except Exception as e:
                    ops.append((ch, False)); log(f"[{machine}] {act} 오류: {e}")
            try:
                pg.goto(ed["edit_url"], wait_until="networkidle", timeout=45000); pg.wait_for_timeout(900)
                cur = {r["product"]: r for r in pg.evaluate(STOCK_JS, ed["cols"])}
            except Exception:
                cur = {}
        finally:
            b.close()

    results = []
    for ch, clicked in ops:
        act = ch.get("action"); nm = ch.get("name") or ch.get("oldName")
        if not clicked:
            results.append({"action": act, "name": nm, "ok": False, "msg": "행/버튼 못 찾음"}); continue
        row = cur.get(ch.get("name") or "")
        if act == "delete":
            ok = ch["oldName"] not in cur
            results.append({"action": act, "name": ch["oldName"], "ok": ok, "msg": "삭제됨" if ok else "실패(아직 남음)"})
        else:
            ok = row is not None and str(row.get("qty")) == str(ch["qty"])
            results.append({"action": act, "name": nm, "ok": ok,
                            "msg": ("추가됨" if act == "add" else "반영됨") if ok else f"실패(현재 {row.get('qty') if row else '없음'})"})
    # 저장 뒤 재고 다시 읽어서 폰에도 반영되게
    LAST_STOCK_RESET()
    return results


def LAST_STOCK_RESET():
    global LAST_STOCK
    LAST_STOCK = 0.0
def clean_name(s): return SUFFIX_RE.sub("", (s or "").strip()).strip() or "(상품)"
def to_int(v):
    d = re.sub(r"\D", "", str(v or "")); return int(d) if d else 0
def norm_dt(v):
    m = DT_RE.search(str(v or ""))
    if not m: return None
    y, mo, d, hh, mm = m.groups()
    if len(y) == 2: y = "20" + y
    return f"{y}-{int(mo):02d}-{int(d):02d}T{int(hh):02d}:{mm}"
def recent_months(n):
    out = []; t = datetime.now(KST); y, m = t.year, t.month
    for _ in range(n):
        out.append((y, m)); m -= 1
        if m == 0: m = 12; y -= 1
    return out
def fetch_list(plat, code, y, m):
    r = requests.get(plat["list"], params=plat["params"](code, y, m), headers=UA, timeout=25)
    r.raise_for_status(); j = r.json()
    if isinstance(j, dict):
        for k in ("list", "data", "rows"):
            if isinstance(j.get(k), list): return j[k]
        return []
    return j if isinstance(j, list) else []


def load_cache():
    try:
        with open(CACHE_PATH, encoding="utf-8") as f: return json.load(f)
    except Exception: return {}
def save_cache(c):
    try:
        with open(CACHE_PATH, "w", encoding="utf-8") as f: json.dump(c, f, ensure_ascii=False)
    except Exception as e: log("캐시 저장 실패:", e)


def parse_detail(html):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser"); items = []
    for tr in soup.select("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if len(cells) < 3: continue
        name = cells[0].strip()
        if not name or "품명" in name or "합계" in name: continue
        qty = re.fullmatch(r"\d+", cells[1].replace(",", "").strip())
        amt = re.search(r"\d+", cells[2].replace(",", ""))
        if not qty or not amt: continue
        items.append({"product": name, "qty": int(qty.group()), "amount": int(amt.group())})
    return items


def resolve_bundles(need):
    """need: {(platform,code): [oid,...]}. 새 묶음거래만 브라우저로 상세를 열어 캐시에 저장."""
    cache = load_cache()
    todo = {k: [o for o in v if o not in cache] for k, v in need.items()}
    todo = {k: v for k, v in todo.items() if v}
    if not todo: return cache
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        log("Playwright 없음 → 묶음거래는 대표상품으로 처리 (설치하면 정확해짐)")
        for k, ids in todo.items():
            for o in ids: cache[o] = None   # None = 미해결(대표상품 사용)
        save_cache(cache); return cache
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(ignore_https_errors=True).new_page()
        try:
            for (plat_key, code), ids in todo.items():
                plat = PLATFORMS[plat_key]
                try:
                    page.goto(plat["machine"].format(code=code), wait_until="networkidle", timeout=45000)
                except Exception as e:
                    log("기계 열기 실패", code, e)
                for oid in ids:
                    try:
                        page.goto(plat["receipt"], wait_until="networkidle", timeout=45000)
                        page.wait_for_function("typeof receipt === 'function'", timeout=8000)
                        page.evaluate(f"receipt('{oid}')")
                        page.wait_for_url("**/receipt.do", timeout=15000)
                        page.wait_for_timeout(250)
                        cache[oid] = parse_detail(page.content()) or None
                    except Exception as e:
                        log("상세 실패", oid, e); cache[oid] = None
        finally:
            browser.close()
    save_cache(cache); return cache


def build():
    months = recent_months(MONTHS_BACK)
    rows_by_machine = []   # (name, [row,...])
    need = {}
    for name, code, plat_key in MACHINES:
        plat = PLATFORMS[plat_key]; rows = []
        for (y, m) in months:
            try: data = fetch_list(plat, code, y, m)
            except Exception as e: log(f"목록 실패 {name} {y}-{m:02d}:", e); continue
            for row in data:
                if "취소" in str(row.get("stat", "")) or "실패" in str(row.get("stat", "")): continue
                praw = str(row.get(plat["f_product"], "")).strip()
                when = norm_dt(row.get(plat["f_dt"]))
                if not when: continue
                oid = str(row.get(plat["f_id"], "")).strip()
                amt = to_int(row.get(plat["f_amount"]))
                bundle = bool(MULTI_RE.search(praw))
                rows.append({"praw": praw, "when": when, "oid": oid, "amt": amt, "bundle": bundle})
                if bundle and oid:
                    need.setdefault((plat_key, code), []).append(oid)
        rows_by_machine.append((name, rows))

    cache = resolve_bundles(need)

    tx = []
    for name, rows in rows_by_machine:
        for r in rows:
            if r["bundle"] and r["oid"] and cache.get(r["oid"]):
                for it in cache[r["oid"]]:
                    q = max(1, it["qty"]); unit = it["amount"] // q; rem = it["amount"] - unit * q
                    for k in range(q):
                        tx.append({"machine": name, "product": it["product"],
                                   "amount": unit + (rem if k == 0 else 0), "datetime": r["when"]})
            else:
                tx.append({"machine": name, "product": clean_name(r["praw"]),
                           "amount": r["amt"], "datetime": r["when"]})
    tx.sort(key=lambda t: t["datetime"], reverse=True)

    # 재고는 15분마다만 갱신 (읽기 실패해도 매출엔 영향 없음)
    global STOCK, LAST_STOCK, STOCK_MAX
    if time.time() - LAST_STOCK >= STOCK_EVERY:
        try:
            s = read_all_stock()
            if s is not None:
                for mname, items in s.items():
                    for it in items:
                        cap = fixed_max(mname, it["product"])
                        if cap is not None:
                            it["max"] = cap                     # 정해진 최대치
                        else:
                            k = mname + "\x01" + it["product"]
                            STOCK_MAX[k] = max(STOCK_MAX.get(k, 0), it["qty"])  # 역대 최고
                            it["max"] = STOCK_MAX[k]
                STOCK = s; LAST_STOCK = time.time(); save_max(STOCK_MAX)
                log("재고 갱신")
        except Exception as e:
            log("재고 갱신 실패:", e)

    return tx


def current_data():
    try:
        with open(DATA_PATH, encoding="utf-8") as f: return json.load(f)
    except Exception: return None


def git(*args):
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True,
                          encoding="utf-8", errors="replace")


def push_if_changed(tx):
    prev = current_data()
    if prev and prev.get("transactions") == tx and prev.get("stock") == STOCK:
        return False  # 매출·재고 둘 다 변화 없음 → 커밋 안 함
    data = {"generated_at": datetime.now(KST).isoformat(timespec="minutes"),
            "machines": [m[0] for m in MACHINES], "transactions": tx, "stock": STOCK}
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    git("add", "docs/data.json")
    c = git("commit", "-m", "매출/재고 갱신 [skip ci]")
    if "nothing to commit" in ((c.stdout or "") + (c.stderr or "")): return False
    git("pull", "--rebase", "--autostash")
    pr = git("push")
    if pr.returncode != 0:
        log("push 실패:", ((pr.stderr or "") or (pr.stdout or "")).strip()[:200])
    return True


def main():
    global STOCK_MAX
    STOCK_MAX = load_max()
    log(f"봇 시작 — {INTERVAL}초마다 수집 (Ctrl+C로 종료). 저장소: {REPO}")
    while True:
        t0 = time.time()
        try:
            tx = build()
            changed = push_if_changed(tx)
            log(f"거래 {len(tx)}건" + (" · 갱신 push" if changed else " · 변화 없음"))
        except Exception as e:
            log("사이클 오류:", e)
        time.sleep(max(1, INTERVAL - (time.time() - t0)))


if __name__ == "__main__":
    main()
