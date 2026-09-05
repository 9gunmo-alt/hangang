#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한강라면 무인매장 매출 수집기 (로그인 불필요 · 3개월 · 세부내역 정확)

수집 방식
- 거래 목록: 두 시스템의 JSON 주소를 HTTP로 직접 호출 (로그인/쿠키 불필요).
  * vendingpay:  .../api/sales_res_td.do?id=코드&ym=시작일&tm=종료일
  * bangsopener: .../appadmin/tsres.do?id=코드&datetime=년-월
  최근 3개월치를 각각 가져온다.
- 여러 품목 묶음거래('외1개' 등)만: 진짜 브라우저(Playwright)로 그 영수증 상세를
  열어 품명/수량/금액으로 쪼갠다. (상세는 세션 방식이라 브라우저가 필요)
- 저장은 상품·금액·시간만. 카드번호 등 다른 정보는 절대 저장하지 않는다.

결과: docs/data.json
"""

import os, re, json, sys, calendar, datetime as dt
from datetime import datetime, timezone, timedelta
import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

KST = timezone(timedelta(hours=9))
MONTHS_BACK = 3   # 최근 몇 개월치

# ── 매장 구성: (표시이름, 기계코드, 플랫폼) ──────────────────────────────
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
        "list_params": lambda code, y, m: {
            "id": code,
            "ym": f"{y}-{m:02d}-01",
            "tm": f"{y}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}",
        },
    },
    "bangsopener": {
        "list":    "http://bangsopener.co.kr/opener/appadmin/tsres.do",
        "machine": "http://bangsopener.co.kr/opener/kiosk/adminapp/{code}",
        "receipt": "http://bangsopener.co.kr/opener/kiosk/appadmin/receipt_prev.do",
        "f_product": "product", "f_amount": "amount", "f_dt": "datetime", "f_id": "ordern",
        "list_params": lambda code, y, m: {"id": code, "datetime": f"{y}-{m:02d}"},
    },
}

DT_RE = re.compile(r"(\d{2,4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})")
MULTI_RE = re.compile(r"외\s*[1-9]")
SUFFIX_RE = re.compile(r"외\s*\d+\s*개\s*$")
UA = {"User-Agent": "Mozilla/5.0 (sales-collector)"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def clean_name(s):
    return SUFFIX_RE.sub("", (s or "").strip()).strip() or "(상품)"


def to_int(v):
    d = re.sub(r"\D", "", str(v or ""))
    return int(d) if d else 0


def norm_dt(v):
    m = DT_RE.search(str(v or ""))
    if not m:
        return None
    y, mo, d, hh, mm = m.groups()
    if len(y) == 2:
        y = "20" + y
    return f"{y}-{int(mo):02d}-{int(d):02d}T{int(hh):02d}:{mm}"


def recent_months(n):
    out = []
    today = datetime.now(KST)
    y, m = today.year, today.month
    for _ in range(n):
        out.append((y, m))
        m -= 1
        if m == 0:
            m = 12; y -= 1
    return out


def fetch_list(plat, code, y, m):
    params = plat["list_params"](code, y, m)
    r = requests.get(plat["list"], params=params, headers=UA, timeout=30, verify=True)
    r.raise_for_status()
    j = r.json()
    if isinstance(j, dict):
        for k in ("list", "data", "rows"):
            if isinstance(j.get(k), list):
                return j[k]
        return []
    return j if isinstance(j, list) else []


def parse_detail(html):
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for tr in soup.select("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if len(cells) < 3:
            continue
        name = cells[0].strip()
        if not name or "품명" in name or "합계" in name:
            continue
        qty_m = re.fullmatch(r"\d+", cells[1].replace(",", "").strip())
        amt_m = re.search(r"\d+", cells[2].replace(",", ""))
        if not qty_m or not amt_m:
            continue
        items.append({"product": name, "qty": int(qty_m.group()), "amount": int(amt_m.group())})
    return items


def expand_detail(items, machine, when):
    out = []
    for it in items:
        q = max(1, it["qty"]); unit = it["amount"] // q; rem = it["amount"] - unit * q
        for k in range(q):
            out.append({"machine": machine, "product": it["product"],
                        "amount": unit + (rem if k == 0 else 0), "datetime": when})
    return out


def main():
    months = recent_months(MONTHS_BACK)
    all_tx = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(ignore_https_errors=True)
        page = ctx.new_page()
        try:
            for name, code, plat_key in MACHINES:
                plat = PLATFORMS[plat_key]
                singles, bundles = [], []   # bundles: list of (order_id, datetime)
                for (y, m) in months:
                    try:
                        rows = fetch_list(plat, code, y, m)
                    except Exception as e:
                        log(f"[{name} {y}-{m:02d}] 목록 실패: {e}")
                        continue
                    for row in rows:
                        stat = str(row.get("stat", ""))
                        if "취소" in stat or "실패" in stat:
                            continue  # 취소/실패 거래 제외
                        product_raw = str(row.get(plat["f_product"], "")).strip()
                        when = norm_dt(row.get(plat["f_dt"]))
                        if not when:
                            continue
                        if MULTI_RE.search(product_raw):
                            oid = str(row.get(plat["f_id"], "")).strip()
                            if oid:
                                bundles.append((oid, when))
                            else:
                                singles.append({"machine": name, "product": clean_name(product_raw),
                                                "amount": to_int(row.get(plat["f_amount"])), "datetime": when})
                        else:
                            singles.append({"machine": name, "product": clean_name(product_raw),
                                            "amount": to_int(row.get(plat["f_amount"])), "datetime": when})

                all_tx.extend(singles)

                # 묶음거래: 브라우저로 상세를 열어 품목별로 분해
                if bundles:
                    try:
                        page.goto(plat["machine"].format(code=code), wait_until="networkidle", timeout=45000)
                        page.wait_for_timeout(800)
                    except Exception as e:
                        log(f"[{name}] 기계 열기 실패: {e}")
                    for oid, when in bundles:
                        try:
                            page.goto(plat["receipt"], wait_until="networkidle", timeout=45000)
                            page.wait_for_function("typeof receipt === 'function'", timeout=8000)
                            page.evaluate(f"receipt('{oid}')")
                            page.wait_for_url("**/receipt.do", timeout=15000)
                            page.wait_for_timeout(300)
                            detail = parse_detail(page.content())
                            if detail:
                                all_tx.extend(expand_detail(detail, name, when))
                            else:
                                log(f"[{name}] 상세 비어있음 {oid}")
                        except Exception as e:
                            log(f"[{name}] 상세 실패 {oid}: {e}")

                log(f"[{name}] 단품 {len(singles)} + 묶음 {len(bundles)} 처리")
        finally:
            browser.close()

    all_tx.sort(key=lambda t: t["datetime"], reverse=True)
    data = {
        "generated_at": datetime.now(KST).isoformat(timespec="minutes"),
        "machines": [m[0] for m in MACHINES],
        "transactions": all_tx,
    }
    out_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs", "data.json"))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log(f"저장 완료: {out_path} (품목 {len(all_tx)}건, 최근 {MONTHS_BACK}개월)")


if __name__ == "__main__":
    main()
