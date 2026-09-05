#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한강라면 무인매장 매출 수집기 (로그인 불필요 버전)

- 기계 링크는 로그인 없이 열린다. 다만 '기계 선택'과 '표 그리기'가 JavaScript로
  동작하므로, 진짜 브라우저(Playwright)로 실제 페이지를 열어서 읽는다.
- 흐름: [기계 링크 열기 → 잠깐 대기(JS가 그 기계로 맞춤) → 영수증 페이지 열기 →
        표가 그려질 때까지 대기 → 거래 파싱] 을 5대 반복.
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


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def parse_receipt(html, machine_name):
    """렌더된 영수증 HTML → 거래 리스트. 결제시간 셀 기준으로 금액/상품을 잡는다."""
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for tr in soup.select("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
        if not cells:
            continue
        dt_idx = next((i for i, c in enumerate(cells) if DT_RE.search(c)), None)
        if dt_idx is None or dt_idx < 2:
            continue  # 헤더/제목 행
        m = DT_RE.search(cells[dt_idx])
        dt = f"20{m.group(1)}-{m.group(2)}-{m.group(3)}T{int(m.group(4)):02d}:{m.group(5)}"
        m2 = re.search(r"\d+", cells[dt_idx - 1].replace(",", ""))
        if not m2:
            continue
        amount = int(m2.group())
        product = cells[dt_idx - 2].strip() or "(상품)"
        out.append({"machine": machine_name, "product": product,
                    "amount": amount, "datetime": dt})
    return out


def collect_machine(page, plat, name, code):
    # 1) 기계 링크 열기 → JS가 '현재 기계'를 이 기계로 맞출 시간을 준다
    page.goto(plat["machine"].format(code=code),
              wait_until="networkidle", timeout=45000)
    page.wait_for_timeout(1200)
    # 2) 영수증 페이지 열기 → 표가 그려질 때까지 대기
    page.goto(plat["receipt"], wait_until="networkidle", timeout=45000)
    try:
        page.wait_for_selector("text=거래승인", timeout=8000)
    except Exception:
        page.wait_for_timeout(1500)  # 거래가 없을 수도 있으니 그냥 잠깐 대기
    return parse_receipt(page.content(), name)


def main():
    all_tx = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(ignore_https_errors=True)
        page = ctx.new_page()
        try:
            for name, code, plat_key in MACHINES:
                plat = PLATFORMS[plat_key]
                try:
                    rows = collect_machine(page, plat, name, code)
                    log(f"[{name}] {len(rows)}건")
                    all_tx.extend(rows)
                except Exception as e:
                    log(f"[{name}] 실패: {e}")  # 한 대 실패해도 나머지는 저장
        finally:
            browser.close()

    # 중복 제거
    seen, uniq = set(), []
    for t in all_tx:
        k = (t["machine"], t["product"], t["amount"], t["datetime"])
        if k not in seen:
            seen.add(k); uniq.append(t)
    uniq.sort(key=lambda t: t["datetime"], reverse=True)

    data = {
        "generated_at": datetime.now(KST).isoformat(timespec="minutes"),
        "machines": [m[0] for m in MACHINES],
        "transactions": uniq,
    }
    out_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "docs", "data.json"))
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log(f"저장 완료: {out_path} (총 {len(uniq)}건)")


if __name__ == "__main__":
    main()
