#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한강라면 무인매장 매출 수집기 (로그인 불필요 · 세부내역 정확 버전)

- 기계 링크는 로그인 없이 열린다. 페이지가 JavaScript로 그려지므로 진짜 브라우저
  (Playwright)로 실제 페이지를 열어서 읽는다.
- 각 기계의 영수증 목록(receipt_prev.do)을 읽고,
  * 단품 거래('외0개')는 그대로 한 줄로 담고,
  * 여러 개 담긴 거래('외1개' 등)는 그 영수증 상세(receipt.do)를 열어
    품목별(품명/수량/금액)로 쪼개서 담는다 → '잘나가는 상품'이 정확해진다.
- 결과는 docs/data.json 으로 저장. 아이디/비번/Secrets 전혀 필요 없음.
"""

import os, re, json, sys
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

KST = timezone(timedelta(hours=9))

# ── 매장 구성: (표시이름, 기계코드, 플랫폼) ──────────────────────────────
MACHINES = [
    ("슬림",  "hgdandae1", "vendingpay"),
    ("라면1", "hgdandae2", "vendingpay"),
    ("라면2", "hgdandae3", "vendingpay"),
    ("냉동",  "hgdandae4", "bangsopener"),
    ("냉장",  "hgdandae5", "bangsopener"),
]

# ── 플랫폼별 주소 (로그인 없음) ─────────────────────────────────────────
PLATFORMS = {
    "vendingpay": {
        "machine": "https://vendingpay.kr/dongseo/tech/app/{code}",
        "receipt": "https://vendingpay.kr/dongseo/tech/app/receipt_prev.do",
    },
    "bangsopener": {
        "machine": "http://bangsopener.co.kr/opener/kiosk/adminapp/{code}",
        "receipt": "http://bangsopener.co.kr/opener/kiosk/appadmin/receipt_prev.do",
    },
}

DT_RE = re.compile(r"(\d{2})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})")
MULTI_RE = re.compile(r"외\s*[1-9]")           # '외1개' 이상 = 여러 품목
SUFFIX_RE = re.compile(r"외\s*\d+\s*개\s*$")     # 이름 꼬리표 제거용


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def clean_name(s):
    return SUFFIX_RE.sub("", (s or "").strip()).strip() or "(상품)"


# 목록 페이지에서 각 행을 뽑아온다: {id, product_raw, amount, datetime, multi}
JS_EXTRACT = r"""
() => {
  const rows = [];
  document.querySelectorAll('tr').forEach(tr => {
    let id = null;
    const clickable = tr.querySelector('[onclick]');
    if (clickable) {
      const m = (clickable.getAttribute('onclick') || '').match(/receipt\('([^']+)'\)/);
      if (m) id = m[1];
    }
    const cells = [...tr.querySelectorAll('td,th')].map(c => c.textContent.replace(/\s+/g,' ').trim());
    rows.push({ id, cells });
  });
  return rows;
}
"""


def extract_rows(page):
    out = []
    for r in page.evaluate(JS_EXTRACT):
        cells = r.get("cells") or []
        dt_idx = next((i for i, c in enumerate(cells) if DT_RE.search(c)), None)
        if dt_idx is None or dt_idx < 2:
            continue
        m = DT_RE.search(cells[dt_idx])
        dt = f"20{m.group(1)}-{m.group(2)}-{m.group(3)}T{int(m.group(4)):02d}:{m.group(5)}"
        am = re.search(r"\d+", cells[dt_idx - 1].replace(",", ""))
        if not am:
            continue
        product_raw = cells[dt_idx - 2].strip()
        out.append({
            "id": r.get("id"),
            "product_raw": product_raw,
            "amount": int(am.group()),
            "datetime": dt,
            "multi": bool(MULTI_RE.search(product_raw)),
        })
    return out


def parse_detail(html):
    """영수증 상세(receipt.do)의 품명/수량/금액 표 → [{product, qty, amount(line total)}]"""
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


def expand_detail(items, machine, dt):
    """품목별 라인 → 수량만큼 단위 레코드로 (개수·금액 둘 다 정확하게)"""
    out = []
    for it in items:
        q = max(1, it["qty"])
        unit = it["amount"] // q
        rem = it["amount"] - unit * q  # 나누어 떨어지지 않으면 첫 개에 몰아줌
        for k in range(q):
            out.append({"machine": machine, "product": it["product"],
                        "amount": unit + (rem if k == 0 else 0), "datetime": dt})
    return out


def collect_machine(page, plat, name, code):
    receipt_url = plat["receipt"]
    # 1) 기계 선택 → 2) 목록 열기 → 표가 그려질 때까지 대기
    page.goto(plat["machine"].format(code=code), wait_until="networkidle", timeout=45000)
    page.wait_for_timeout(1000)
    page.goto(receipt_url, wait_until="networkidle", timeout=45000)
    try:
        page.wait_for_function("document.querySelectorAll('[onclick]').length > 0", timeout=8000)
    except Exception:
        page.wait_for_timeout(1500)

    rows = extract_rows(page)
    singles = [r for r in rows if not r["multi"]]
    multis = [r for r in rows if r["multi"] and r["id"]]

    line_items = []
    # 단품: 그대로
    for r in singles:
        line_items.append({"machine": name, "product": clean_name(r["product_raw"]),
                           "amount": r["amount"], "datetime": r["datetime"]})
    # 여러 품목: 영수증 상세를 열어 품목별로 분해
    for r in multis:
        try:
            page.goto(receipt_url, wait_until="networkidle", timeout=45000)
            page.wait_for_function("typeof receipt === 'function'", timeout=8000)
            page.evaluate(f"receipt('{r['id']}')")
            page.wait_for_url("**/receipt.do", timeout=15000)
            page.wait_for_timeout(400)
            detail = parse_detail(page.content())
            if detail:
                line_items.extend(expand_detail(detail, name, r["datetime"]))
            else:  # 상세 못 읽으면 대표상품으로 대체(총액은 유지)
                line_items.append({"machine": name, "product": clean_name(r["product_raw"]),
                                   "amount": r["amount"], "datetime": r["datetime"]})
        except Exception as e:
            log(f"    상세 실패({r['id']}): {e} → 대표상품으로 대체")
            line_items.append({"machine": name, "product": clean_name(r["product_raw"]),
                               "amount": r["amount"], "datetime": r["datetime"]})

    log(f"[{name}] 거래 {len(rows)}건(여러품목 {len(multis)}) → 품목 {len(line_items)}건")
    return line_items


def main():
    all_tx = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(ignore_https_errors=True)
        page = ctx.new_page()
        try:
            for name, code, plat_key in MACHINES:
                try:
                    all_tx.extend(collect_machine(page, PLATFORMS[plat_key], name, code))
                except Exception as e:
                    log(f"[{name}] 실패: {e}")
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
    log(f"저장 완료: {out_path} (품목 {len(all_tx)}건)")


if __name__ == "__main__":
    main()
