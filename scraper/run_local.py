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
    ("슬림",  "hgdandae1", "vendingpay"),
    ("라면1", "hgdandae2", "vendingpay"),
    ("라면2", "hgdandae3", "vendingpay"),
    ("냉동",  "hgdandae4", "bangsopener"),
    ("냉장",  "hgdandae5", "bangsopener"),
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
STOCK_EVERY = 900   # 재고는 자주 안 바뀌므로 15분마다만 읽음

STOCK_JS = r"""
() => {
  const out = [];
  document.querySelectorAll('tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td,th')].map(c => {
      const i = c.querySelector('input,select');
      return ((i ? i.value : c.textContent) || '').trim();
    });
    let pi = cells.findIndex(v => /[가-힣]/.test(v) && v.length < 30 && v !== '상품명');
    if (pi < 0) return;
    const product = cells[pi];
    let qty = null;
    for (let j = pi + 1; j < cells.length; j++) {
      if (/^\d+$/.test(cells[j])) { qty = parseInt(cells[j], 10); break; }
    }
    if (product && qty !== null) out.push({ product: product, qty: qty });
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
                    out[name] = pg.evaluate(STOCK_JS)
                except Exception as e:
                    log(f"[{name}] 재고 읽기 실패: {e}")
        finally:
            b.close()
    return out


def log(*a): print(datetime.now(KST).strftime("%H:%M:%S"), *a, flush=True)
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
    global STOCK, LAST_STOCK
    if time.time() - LAST_STOCK >= STOCK_EVERY:
        try:
            s = read_all_stock()
            if s is not None:
                STOCK = s; LAST_STOCK = time.time()
                log("재고 갱신")
        except Exception as e:
            log("재고 갱신 실패:", e)

    return tx


def current_data():
    try:
        with open(DATA_PATH, encoding="utf-8") as f: return json.load(f)
    except Exception: return None


def git(*args):
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True)


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
    if "nothing to commit" in (c.stdout + c.stderr): return False
    git("pull", "--rebase", "--autostash")
    pr = git("push")
    if pr.returncode != 0:
        log("push 실패:", (pr.stderr or pr.stdout).strip()[:200])
    return True


def main():
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
