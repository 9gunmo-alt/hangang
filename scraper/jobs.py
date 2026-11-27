# -*- coding: utf-8 -*-
"""
노트북 봇용: '한강라면 관리' 프로그램이 보낸 재고 작업을 처리한다.

- 프로그램(아무 PC)이 비공개 저장소 hangang-data 에 jobs/<id>.json 을 올리면
- 이 스레드가 15초마다 확인해서 실제 기계에 반영하고
- results/<id>.json 으로 결과를 올린 뒤 jobs/<id>.json 을 지운다.

작업 종류
  apply    : 재고 수정 (changes = [{action:'update', oldName, name, qty, price, order}])
  vp_save  : 벤딩페이 상품입고 화면의 [현재정보저장] 누르기
  vp_load  : 벤딩페이 상품입고 화면의 [불러오기] 누르기
  refresh  : 기계 4대 재고 새로 읽기

GitHub 토큰은 아래 중 하나에서 읽는다 (둘 다 git 에 올라가지 않음)
  1) scraper/github_token.json   {"token": "...", "dataRepo": "9gunmo-alt/hangang-data"}
  2) 이 노트북에서 '한강라면 관리' 프로그램을 한 번 켜서 연결 설정을 해 두면 그 설정(%APPDATA%\\HangangManager\\config.json)
"""
import os, json, time, base64, threading, traceback
from datetime import datetime

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://api.github.com"
POLL = 15          # 초
MAX_AGE_H = 6      # 이보다 오래된 요청은 건너뜀 (노트북이 오래 꺼져 있었을 때 옛날 수정이 덮어쓰지 않게)


def _cfg():
    for p in (os.path.join(HERE, "github_token.json"),
              os.path.join(os.environ.get("APPDATA", ""), "HangangManager", "config.json")):
        try:
            with open(p, encoding="utf-8") as f:
                c = json.load(f)
            if c.get("token"):
                c.setdefault("dataRepo", "9gunmo-alt/hangang-data")
                return c
        except Exception:
            pass
    return None


class _GH:
    def __init__(self, token):
        self.s = requests.Session()
        self.s.headers.update({"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                               "User-Agent": "hangang-bot", "Authorization": "Bearer " + token.strip()})

    def get(self, url, **kw):
        return self.s.get(API + url, timeout=25, **kw)

    def put(self, repo, path, obj, msg):
        body = {"message": msg, "content": base64.b64encode(json.dumps(obj, ensure_ascii=False).encode("utf-8")).decode("ascii")}
        r = self.s.get(f"{API}/repos/{repo}/contents/{path}", timeout=25)
        if r.status_code == 200:
            body["sha"] = r.json()["sha"]
        r = self.s.put(f"{API}/repos/{repo}/contents/{path}", json=body, timeout=30)
        r.raise_for_status()

    def delete(self, repo, path, sha, msg):
        r = self.s.delete(f"{API}/repos/{repo}/contents/{path}", json={"message": msg, "sha": sha}, timeout=30)
        if r.status_code not in (200, 404):
            r.raise_for_status()


# ── 벤딩페이 [현재정보저장] / [불러오기] ─────────────────────────────
JS_CLICK_TEXT = r"""
(t) => {
  const els = [...document.querySelectorAll('button,a,input[type=button],input[type=submit],[onclick]')];
  const hit = els.find(e => ((e.textContent || e.value || '').replace(/\s+/g, '') === t));
  if (!hit) return false;
  hit.click(); return true;
}
"""


def _with_max(bot, machine, items):
    for it in items:
        cap = bot.fixed_max(machine, it["product"])
        if cap is not None:
            it["max"] = cap
        else:
            k = machine + "\x01" + it["product"]
            bot.STOCK_MAX[k] = max(bot.STOCK_MAX.get(k, 0), it["qty"])
            it["max"] = bot.STOCK_MAX[k]
    return items


def _read_one(bot, machine):
    """기계 한 대만 '재고 및 수정' 페이지에서 읽음 (입력칸이 다 채워질 때까지 기다림)."""
    from playwright.sync_api import sync_playwright
    minfo = {name: (code, plat) for name, code, plat in bot.MACHINES}
    if machine not in minfo:
        return None
    code, plat_key = minfo[machine]
    plat = bot.PLATFORMS[plat_key]
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(ignore_https_errors=True).new_page()
        try:
            pg.goto(plat["machine"].format(code=code), wait_until="networkidle", timeout=45000)
            pg.wait_for_timeout(500)
            pg.goto(plat["stock"], wait_until="networkidle", timeout=45000)
            try:
                pg.wait_for_function("document.querySelectorAll('input').length > 3", timeout=8000)
            except Exception:
                pass
            pg.wait_for_timeout(1200)
            return pg.evaluate(bot.STOCK_JS, bot.EDIT[plat_key]["cols"])
        finally:
            b.close()


def _bump(bot):
    """재고를 바꿨다고 표시 → 그 사이에 돌던 5분 재고 읽기(옛날 값)가 덮어쓰지 못하게."""
    try:
        bot.STOCK_EPOCH = getattr(bot, "STOCK_EPOCH", 0) + 1
    except Exception:
        pass


def _apply_known(items, changes, results):
    """기계에 실제로 반영된 것(확인됨)은 그 값으로 확정 — 읽은 값이 늦게 바뀌어도 화면이 되돌아가지 않게."""
    items = [dict(it) for it in (items or [])]
    ok = {}
    for r in results or []:
        if r.get("ok"):
            ok[(r.get("action"), (r.get("name") or "").strip())] = True
    for c in changes or []:
        act, nm = c.get("action", "update"), (c.get("name") or c.get("oldName") or "").strip()
        if act == "delete":
            if ok.get(("delete", (c.get("oldName") or nm).strip())):
                items = [it for it in items if (it.get("product") or "").strip() != (c.get("oldName") or nm).strip()]
            continue
        if not ok.get((act, nm)):
            continue
        old = (c.get("oldName") or nm).strip()
        hit = next((it for it in items if (it.get("product") or "").strip() in (nm, old)), None)
        if hit is None:
            hit = {"product": nm, "qty": 0}
            items.append(hit)
        hit["product"] = nm
        if c.get("qty") is not None:
            hit["qty"] = int(c["qty"])
        if c.get("price") is not None:
            hit["price"] = int(c["price"])
    return items


def _read_machine(bot, machine, changes=None, results=None):
    try:
        rows = _read_one(bot, machine)
    except Exception:
        rows = None
    base = rows if rows else (bot.STOCK.get(machine) or [])
    items = _with_max(bot, machine, _apply_known(base, changes, results))
    bot.STOCK[machine] = items
    bot.save_max(bot.STOCK_MAX)
    _bump(bot)
    return items


def vp_button(bot, machine, label):
    from playwright.sync_api import sync_playwright
    minfo = {name: (code, plat) for name, code, plat in bot.MACHINES}
    if machine not in minfo or minfo[machine][1] != "vendingpay":
        return {"ok": False, "msg": "벤딩페이 기계(라면1·라면2)만 됩니다"}
    code, plat_key = minfo[machine]
    plat = bot.PLATFORMS[plat_key]
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(ignore_https_errors=True).new_page()
        pg.on("dialog", lambda d: d.accept())
        try:
            pg.goto(plat["machine"].format(code=code), wait_until="networkidle", timeout=45000)
            pg.wait_for_timeout(500)
            pg.goto(plat["stock"], wait_until="networkidle", timeout=45000)
            try:
                pg.wait_for_function("document.querySelectorAll('input').length > 3", timeout=8000)
            except Exception:
                pass
            pg.wait_for_timeout(700)
            if not pg.evaluate(JS_CLICK_TEXT, label):
                return {"ok": False, "msg": f"[{label}] 버튼을 못 찾음"}
            pg.wait_for_timeout(900)
            try:
                pg.evaluate(bot.JS_CONFIRM_YES)
            except Exception:
                pass
            try:
                pg.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            pg.wait_for_timeout(1500)
            pg.goto(plat["stock"], wait_until="networkidle", timeout=45000)
            try:
                pg.wait_for_function("document.querySelectorAll('input').length > 3", timeout=8000)
            except Exception:
                pass
            pg.wait_for_timeout(1000)
            rows = pg.evaluate(bot.STOCK_JS, bot.EDIT[plat_key]["cols"])
        finally:
            b.close()
    bot.STOCK[machine] = _with_max(bot, machine, rows)
    bot.save_max(bot.STOCK_MAX)
    _bump(bot)
    return {"ok": True, "msg": "완료", "items": bot.STOCK[machine]}


def process(bot, job):
    t, m = job.get("type"), job.get("machine")
    try:
        at = datetime.fromisoformat(job.get("at", ""))
        if (datetime.now() - at).total_seconds() > MAX_AGE_H * 3600:
            return {"ok": False, "msg": f"{MAX_AGE_H}시간 넘게 지난 요청이라 건너뛰었어요 (다시 눌러 주세요)"}
    except Exception:
        pass
    if t == "apply":
        _bump(bot)
        res = bot.write_stock(m, job.get("changes") or [])
        items = _read_machine(bot, m, job.get("changes") or [], res)
        return {"ok": all(r.get("ok") for r in res), "results": res, "items": items,
                "msg": f"{sum(1 for r in res if r.get('ok'))}/{len(res)}건 반영"}
    if t == "vp_save":
        return vp_button(bot, m, "현재정보저장")
    if t == "vp_load":
        return vp_button(bot, m, "불러오기")
    if t == "refresh":
        s = bot.read_all_stock()
        if s is None:
            return {"ok": False, "msg": "Playwright 없음"}
        for mm, items in s.items():
            _with_max(bot, mm, items)
        bot.STOCK.update(s); bot.save_max(bot.STOCK_MAX); bot.LAST_STOCK = time.time(); _bump(bot)
        return {"ok": True, "stock": bot.STOCK, "msg": "재고 새로 읽음"}
    return {"ok": False, "msg": "알 수 없는 작업: " + str(t)}


class JobRunner(threading.Thread):
    def __init__(self, bot, log):
        super().__init__(daemon=True)
        self.bot, self.log = bot, log
        self.etag = None
        self.warned = False

    def once(self):
        cfg = _cfg()
        if not cfg:
            if not self.warned:
                self.log("재고 작업 받기: GitHub 토큰 설정이 없어서 꺼져 있음 (scraper/github_token.json)")
                self.warned = True
            return
        gh, repo = _GH(cfg["token"]), cfg["dataRepo"]
        h = {"If-None-Match": self.etag} if self.etag else {}
        r = gh.get(f"/repos/{repo}/contents/jobs", headers=h)
        if r.status_code in (304, 404):
            return
        r.raise_for_status()
        self.etag = r.headers.get("ETag")
        files = sorted([f for f in r.json() if f.get("name", "").endswith(".json")], key=lambda f: f["name"])
        for f in files:
            jr = gh.get(f"/repos/{repo}/contents/jobs/{f['name']}")
            if jr.status_code != 200:
                continue
            job = json.loads(base64.b64decode(jr.json()["content"]).decode("utf-8"))
            jid = job.get("id") or f["name"][:-5]
            self.log(f"재고 작업 받음: {job.get('type')} · {job.get('machine')}")
            try:
                res = process(self.bot, job)
            except Exception as e:
                res = {"ok": False, "msg": str(e)[:200]}
                self.log("재고 작업 오류:", traceback.format_exc()[-400:])
            res.update({"id": jid, "type": job.get("type"), "machine": job.get("machine"), "done_at": datetime.now().isoformat(timespec="seconds")})
            gh.put(repo, f"results/{jid}.json", res, f"재고 작업 결과 {job.get('type')} {job.get('machine')}")
            gh.delete(repo, f"jobs/{f['name']}", jr.json()["sha"], "재고 작업 처리함")
            self.etag = None
            self.log(("  ✔ " if res.get("ok") else "  ✗ ") + str(res.get("msg", "")))

    def run(self):
        self.log(f"재고 작업 받기 시작 — {POLL}초마다 확인")
        while True:
            try:
                self.once()
            except Exception as e:
                self.log("재고 작업 확인 실패:", str(e)[:160])
            time.sleep(POLL)


_runner = None


def start(bot, log):
    """봇에서 한 번 부르면 됨 (여러 번 불러도 하나만 돔)."""
    global _runner
    if _runner and _runner.is_alive():
        return _runner
    _runner = JobRunner(bot, log)
    _runner.start()
    return _runner
