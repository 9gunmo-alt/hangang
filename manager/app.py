# -*- coding: utf-8 -*-
"""
한강라면 관리 (PC 프로그램) — 아무 PC에서나 실행 (exe 하나)

- 매출·재고:  노트북 봇이 올린 hangang 저장소의 docs/data.json 을 GitHub에서 바로 읽음
- 장부(지출·쿠팡 주문·체크·설정): 비공개 저장소 hangang-data 의 ledger.json 에 저장
  → 어느 PC에서 열어도 똑같이 보임. 바꿀 때마다 GitHub에 기록이 남음(되돌리기 가능)
- 재고 수정 / 현재정보저장 / 불러오기 / 재고 새로 읽기:
  hangang-data/jobs/<id>.json 으로 '요청'만 올리면 노트북 봇(scraper/jobs.py)이 처리하고
  hangang-data/results/<id>.json 으로 결과를 돌려줌
- 쿠팡: 프로그램 안 쿠팡 창에서 직접 로그인 → coupang.js 가 주문을 읽어 보냄
- 이 PC에는 설정(토큰)과 빠른 시작용 캐시만 저장: %APPDATA%\\HangangManager

개발 실행: python app.py   /   exe 만들기: build_exe.bat
"""
import os, sys, json, time, base64, socket, threading, traceback, uuid
from datetime import datetime

import requests

if getattr(sys, "frozen", False):
    RES = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
else:
    RES = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(RES, "web")
HOME = os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~"), "HangangManager")
CACHE = os.path.join(HOME, "cache")
CONFIG_PATH = os.path.join(HOME, "config.json")
LOGFILE = os.path.join(HOME, "error.log")
COUPANG_URL = "https://mc.coupang.com/ssr/desktop/order/list"
DEFAULTS = {"salesRepo": "9gunmo-alt/hangang", "salesPath": "docs/data.json", "dataRepo": "9gunmo-alt/hangang-data", "token": ""}
os.makedirs(CACHE, exist_ok=True)


def fatal(msg):
    try:
        with open(LOGFILE, "a", encoding="utf-8") as f:
            f.write(datetime.now().strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except Exception:
        pass


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


CFG = dict(DEFAULTS)
CFG.update(read_json(CONFIG_PATH, {}))


# ───────────────────────── GitHub ─────────────────────────
class GHError(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status


class GitHub:
    API = "https://api.github.com"

    def __init__(self, token):
        self.s = requests.Session()
        self.s.headers.update({"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
                               "User-Agent": "hangang-manager"})
        if token:
            self.s.headers["Authorization"] = "Bearer " + token.strip()

    @staticmethod
    def _err(r):
        try:
            m = r.json().get("message", "")
        except Exception:
            m = r.text[:200]
        hint = {401: "토큰이 틀렸거나 만료됐어요", 403: "토큰 권한이 부족하거나 요청이 너무 많아요",
                404: "저장소나 파일을 못 찾았어요 (이름·토큰 권한 확인)"}.get(r.status_code, "")
        return GHError(r.status_code, f"GitHub {r.status_code}: {hint or m}")

    def get_file(self, repo, path, etag=None):
        """→ (status, text, sha, etag). 304 = 바뀐 것 없음, 404 = 없음."""
        h = {"If-None-Match": etag} if etag else {}
        r = self.s.get(f"{self.API}/repos/{repo}/contents/{path}", headers=h, timeout=20)
        if r.status_code == 304:
            return 304, None, None, etag
        if r.status_code == 404:
            return 404, None, None, None
        if r.status_code != 200:
            raise self._err(r)
        j = r.json()
        if j.get("encoding") == "base64" and j.get("content"):
            text = base64.b64decode(j["content"]).decode("utf-8")
        else:  # 1MB 넘는 파일은 blob 으로
            b = self.s.get(f"{self.API}/repos/{repo}/git/blobs/{j['sha']}",
                           headers={"Accept": "application/vnd.github.raw+json"}, timeout=60)
            if b.status_code != 200:
                raise self._err(b)
            text = b.content.decode("utf-8")
        return 200, text, j["sha"], r.headers.get("ETag")

    def put_file(self, repo, path, text, sha, message):
        body = {"message": message, "content": base64.b64encode(text.encode("utf-8")).decode("ascii")}
        if sha:
            body["sha"] = sha
        r = self.s.put(f"{self.API}/repos/{repo}/contents/{path}", json=body, timeout=30)
        if r.status_code in (200, 201):
            return r.json()["content"]["sha"]
        raise self._err(r)

    def delete_file(self, repo, path, sha, message):
        r = self.s.delete(f"{self.API}/repos/{repo}/contents/{path}", json={"message": message, "sha": sha}, timeout=30)
        if r.status_code in (200, 404):
            return True
        raise self._err(r)

    def repo_info(self, repo):
        r = self.s.get(f"{self.API}/repos/{repo}", timeout=20)
        if r.status_code != 200:
            raise self._err(r)
        return r.json()


GH = GitHub(CFG.get("token"))


# ───────────────────────── 창 · 화면 알림 ─────────────────────────
main_win = None
cp_win = None


def js(code):
    if main_win:
        try:
            main_win.evaluate_js(code)
        except Exception:
            pass


def notify(event, data=None):
    js("window.__onPy && window.__onPy(%s, %s)" % (json.dumps(event), json.dumps(data, ensure_ascii=False)))


# ───────────────────────── 장부 (hangang-data/ledger.json) ─────────────────────────
SECTIONS = ("coupang_orders", "checked", "expenses", "settings", "snaps")
LEDGER_PATH = "ledger.json"
LCACHE = os.path.join(CACHE, "ledger.json")
L = {"data": {}, "sha": None, "etag": None, "dirty": set(), "last_edit": 0.0, "state": "loading", "err": "", "synced_at": ""}
L_lock = threading.RLock()
_c = read_json(LCACHE, {})
L["data"], L["sha"], L["etag"], L["dirty"] = _c.get("data", {}), _c.get("sha"), _c.get("etag"), set(_c.get("dirty", []))


def ledger_cache_save():
    with L_lock:
        write_json(LCACHE, {"data": L["data"], "sha": L["sha"], "etag": L["etag"], "dirty": sorted(L["dirty"])})


def sync_state(state, err=""):
    L["state"], L["err"] = state, err
    if state == "saved":
        L["synced_at"] = datetime.now().strftime("%H:%M")
    notify("sync", {"state": state, "err": err, "at": L["synced_at"], "dirty": len(L["dirty"])})


def old_calculator_data():
    """예전 쿠팡 발주 계산기(Tauri)의 가져온 주문·체크·키워드 설정 (장부를 처음 만들 때 한 번 옮김)."""
    src = os.path.join(os.environ.get("APPDATA", ""), "com.coupangcalc.desktop")
    out = {}
    for name in ("coupang_orders", "checked"):
        v = read_json(os.path.join(src, name + ".json"), None)
        if v:
            out[name] = v
    st = read_json(os.path.join(src, "settings.json"), None)
    if st:
        out["settings"] = {k: st[k] for k in ("autoOn", "autoKw") if k in st}
    return out


def ledger_pull():
    """원격 장부 받기. 이 PC에서 아직 못 올린 부분(dirty)은 내 것을 유지."""
    st, text, sha, etag = GH.get_file(CFG["dataRepo"], LEDGER_PATH, L["etag"])
    if st == 304:
        return
    with L_lock:
        if st == 404:   # 원격에 장부가 아직 없음 → 이 PC 캐시 + 예전 계산기 데이터로 처음 만들기
            base = dict(L["data"])
            for k, v in old_calculator_data().items():
                base.setdefault(k, v)
            L["data"], L["sha"], L["etag"] = base, None, None
            L["dirty"] = set(k for k in SECTIONS if k in base) or {"settings"}
            L["data"].setdefault("settings", {})
            ledger_cache_save()
            changed = True
        else:
            remote = json.loads(text or "{}")
            changed = False
            for k in SECTIONS:
                if k in L["dirty"]:
                    continue
                if k in remote and remote[k] != L["data"].get(k):
                    L["data"][k] = remote[k]; changed = True
            L["sha"], L["etag"] = sha, etag
            ledger_cache_save()
    if changed:
        notify("ledger")


def ledger_push():
    if not L["dirty"]:
        return
    sync_state("saving")
    for _attempt in range(4):
        with L_lock:
            body = dict(L["data"]); body["_saved_at"] = now_iso(); body["_by"] = socket.gethostname()
            text = json.dumps(body, ensure_ascii=False, indent=0)
            sha, sending, edit_mark = L["sha"], set(L["dirty"]), L["last_edit"]
        try:
            new_sha = GH.put_file(CFG["dataRepo"], LEDGER_PATH, text, sha, "장부 저장 (" + ", ".join(sorted(sending)) + ")")
            with L_lock:
                L["sha"], L["etag"] = new_sha, None
                if L["last_edit"] == edit_mark:      # 올리는 동안 또 고친 게 없으면 깨끗
                    L["dirty"] -= sending
                ledger_cache_save()
            sync_state("saved" if not L["dirty"] else "saving")
            return
        except GHError as e:
            if e.status in (409, 422):   # 다른 PC가 먼저 저장 → 받아서 합친 뒤 다시
                L["etag"] = None
                try:
                    ledger_pull()
                except Exception:
                    pass
                continue
            sync_state("error", str(e)); return
        except Exception as e:
            sync_state("offline", "인터넷 연결 확인 (" + type(e).__name__ + ")"); return
    sync_state("error", "다른 PC와 동시에 저장돼서 실패 — 잠시 후 다시 시도해요")


# ───────────────────────── 매출·재고 (hangang/docs/data.json) ─────────────────────────
DCACHE = os.path.join(CACHE, "data.json")
_d = read_json(DCACHE, {})
D = {"data": _d.get("data", {}), "etag": _d.get("etag"), "fetched": "", "err": ""}


def sales_pull(force=False):
    st, text, _sha, etag = GH.get_file(CFG["salesRepo"], CFG["salesPath"], None if force else D["etag"])
    D["fetched"] = datetime.now().strftime("%H:%M")
    if st == 304:
        return False
    if st == 404:
        raise GHError(404, "매출 파일(docs/data.json)을 못 찾았어요")
    D["data"], D["etag"] = json.loads(text), etag
    write_json(DCACHE, {"data": D["data"], "etag": etag})
    return True


# ───────────────────────── 재고 작업 요청 (노트북 봇이 처리) ─────────────────────────
JPATH = os.path.join(CACHE, "jobs.json")
JOBS = read_json(JPATH, {})          # {id: {type, machine, at, label}}


def job_create(jtype, machine, changes=None, label=""):
    jid = datetime.now().strftime("%Y%m%d%H%M%S") + "-" + uuid.uuid4().hex[:6]
    job = {"id": jid, "type": jtype, "machine": machine, "changes": changes or [], "at": now_iso(), "by": socket.gethostname()}
    GH.put_file(CFG["dataRepo"], f"jobs/{jid}.json", json.dumps(job, ensure_ascii=False), None, f"재고 작업 요청 {jtype} {machine}")
    JOBS[jid] = {"type": jtype, "machine": machine, "at": job["at"], "label": label, "changes": changes or []}
    write_json(JPATH, JOBS)
    return jid


def jobs_check():
    got = False
    for jid in list(JOBS.keys()):
        st, text, sha, _ = GH.get_file(CFG["dataRepo"], f"results/{jid}.json")
        if st != 200:
            continue
        res = json.loads(text)
        info = JOBS.pop(jid, {})
        write_json(JPATH, JOBS)
        notify("job", {"id": jid, "info": info, "result": res})
        got = True
        try:
            GH.delete_file(CFG["dataRepo"], f"results/{jid}.json", sha, "결과 확인함")
        except Exception:
            pass
    return got


# ───────────────────────── 백그라운드 동기화 ─────────────────────────
WAKE = threading.Event()
FORCE = {"sales": False}


def meta():
    d = D["data"] or {}
    return {"generated_at": d.get("generated_at", ""), "fetched": D["fetched"], "err": D["err"],
            "configured": bool(CFG.get("token")), "jobs": JOBS,
            "sync": {"state": L["state"], "err": L["err"], "at": L["synced_at"], "dirty": len(L["dirty"])}}


def sync_loop():
    last_sales = last_ledger = last_jobs = 0.0
    while True:
        t = time.time()
        if CFG.get("token"):
            try:
                if t - last_ledger >= 60:
                    last_ledger = t
                    ledger_pull()
                if L["dirty"] and t - L["last_edit"] >= 1.2:
                    ledger_push()
                elif L["state"] == "loading":
                    sync_state("saved")
                if FORCE["sales"] or t - last_sales >= 60:
                    last_sales = t
                    if sales_pull(force=FORCE["sales"]):
                        notify("data")
                    FORCE["sales"] = False
                    D["err"] = ""
                    notify("meta", meta())
                if JOBS and t - last_jobs >= 5:
                    last_jobs = t
                    if jobs_check():
                        FORCE["sales"] = True; last_sales = 0
            except GHError as e:
                D["err"] = str(e); sync_state("error", str(e)); notify("meta", meta())
            except Exception as e:
                D["err"] = "인터넷 연결 확인"; sync_state("offline", "인터넷 연결 확인 (" + type(e).__name__ + ")"); notify("meta", meta())
                fatal("동기화 오류:\n" + traceback.format_exc())
        WAKE.wait(1.0 if (L["dirty"] or JOBS) else 5.0); WAKE.clear()


# ───────────────────────── 쿠팡 창 ─────────────────────────
with open(os.path.join(RES, "coupang.js"), encoding="utf-8") as _f:
    COUPANG_JS = _f.read()
CRAWL = {"req": None}


class CoupangApi:
    """쿠팡 페이지에는 이 두 가지만 열어 둠."""

    def coupang_push(self, payload):
        if not isinstance(payload, str) or len(payload) > 8_000_000:
            return False
        js("window.__onCoupang && window.__onCoupang(%s)" % json.dumps(payload))
        return True

    def coupang_poll(self, take=False):
        r = CRAWL["req"]
        if take:
            CRAWL["req"] = None
        return r


def inject_coupang(*_a):
    # 'loaded'(페이지 다 뜬 뒤)에서만, 별도 스레드로 넣는다.
    # 화면 스레드에서 evaluate_js 를 부르면(before_load 등) 페이지 준비를 기다리다 서로 막혀 창이 멈추고 꺼짐.
    w = cp_win
    if not w:
        return

    def run():
        for _ in range(3):
            try:
                w.evaluate_js(COUPANG_JS)
                return
            except Exception:
                time.sleep(1.0)
    threading.Thread(target=run, daemon=True).start()


def open_coupang():
    global cp_win
    import webview
    if cp_win:
        try:
            cp_win.restore(); cp_win.show()
            return True
        except Exception:
            cp_win = None
    cp_win = webview.create_window("쿠팡 — 로그인하면 이어서 가져와요 (한 페이지만: [이 페이지 가져오기])", COUPANG_URL,
                                   js_api=CoupangApi(), width=1200, height=880, min_size=(900, 600))
    cp_win.events.loaded += inject_coupang

    def closed(*_a):
        global cp_win
        cp_win = None
        CRAWL["req"] = None
        notify("coupang", "closed")
    cp_win.events.closed += closed
    notify("coupang", "opened")
    return True


# ───────────────────────── 화면에서 부르는 기능 ─────────────────────────
class Api:
    # 장부
    def load_json(self, name):
        with L_lock:
            v = L["data"].get(str(name))
        return "" if v is None else json.dumps(v, ensure_ascii=False)

    def save_json(self, name, data):
        name = str(name)
        if name not in SECTIONS:
            return False
        with L_lock:
            L["data"][name] = json.loads(data) if isinstance(data, str) else data
            L["dirty"].add(name); L["last_edit"] = time.time()
            ledger_cache_save()
        WAKE.set()
        return True

    # 매출·재고
    def get_data(self):
        d = D["data"] or {}
        return {"daily": d.get("daily", {}), "stock": d.get("stock", {}), "machines": d.get("machines", []), "meta": meta()}

    def refresh_now(self):
        FORCE["sales"] = True
        L["etag"] = None
        WAKE.set()
        return True

    # 재고 작업 → 노트북
    def job_create(self, jtype, machine, changes=None, label=""):
        if jtype not in ("apply", "vp_save", "vp_load", "refresh"):
            return {"ok": False, "msg": "알 수 없는 작업"}
        if not CFG.get("token"):
            return {"ok": False, "msg": "먼저 설정에서 GitHub 연결을 해 주세요"}
        try:
            jid = job_create(jtype, machine, changes, label)
            WAKE.set()
            return {"ok": True, "id": jid}
        except Exception as e:
            return {"ok": False, "msg": str(e)[:200]}

    def job_cancel(self, jid):
        JOBS.pop(jid, None); write_json(JPATH, JOBS)
        try:
            st, _t, sha, _e = GH.get_file(CFG["dataRepo"], f"jobs/{jid}.json")
            if st == 200:
                GH.delete_file(CFG["dataRepo"], f"jobs/{jid}.json", sha, "작업 요청 취소")
                return {"ok": True}
            return {"ok": True, "late": True}
        except Exception as e:
            return {"ok": False, "msg": str(e)[:200]}

    # 연결 설정
    def config_get(self):
        c = {k: CFG.get(k, "") for k in ("dataRepo", "salesRepo")}
        c["tokenSet"] = bool(CFG.get("token"))
        c["tokenTail"] = CFG["token"][-4:] if CFG.get("token") else ""
        c["home"] = HOME
        return c

    def config_set(self, token, data_repo, sales_repo):
        global GH
        token = (token or "").strip() or CFG.get("token", "")
        data_repo = (data_repo or "").strip() or DEFAULTS["dataRepo"]
        sales_repo = (sales_repo or "").strip() or DEFAULTS["salesRepo"]
        if not token:
            return {"ok": False, "msg": "토큰을 넣어 주세요"}
        gh = GitHub(token)
        try:
            info = gh.repo_info(data_repo)
            if not info.get("private"):
                return {"ok": False, "msg": f"{data_repo} 저장소가 공개(Public)예요. 장부가 들어가니 비공개(Private)로 만들어 주세요."}
            if not (info.get("permissions") or {}).get("push"):
                return {"ok": False, "msg": "토큰에 hangang-data 쓰기 권한(Contents: Read and write)이 없어요"}
            gh.repo_info(sales_repo)
        except GHError as e:
            return {"ok": False, "msg": str(e)}
        except Exception as e:
            return {"ok": False, "msg": "인터넷 연결 확인 (" + type(e).__name__ + ")"}
        CFG.update({"token": token, "dataRepo": data_repo, "salesRepo": sales_repo})
        write_json(CONFIG_PATH, {k: CFG[k] for k in ("token", "dataRepo", "salesRepo", "salesPath")})
        GH = gh
        L["etag"] = None; D["etag"] = None; FORCE["sales"] = True
        WAKE.set()
        return {"ok": True}

    # 쿠팡
    def coupang_open(self):
        return open_coupang()

    def coupang_crawl(self, frm, to):
        ok = lambda s: isinstance(s, str) and len(s) == 7 and s[4] == "-" and s.replace("-", "").isdigit()
        if not ok(frm) or not ok(to):
            return {"ok": False, "msg": "기간 형식이 잘못됐습니다"}
        CRAWL["req"] = json.dumps({"from": frm, "to": to})
        if cp_win:
            try:
                cp_win.restore(); cp_win.show()
                cp_win.evaluate_js("window.__ccRun && window.__ccRun('poll')")
            except Exception:
                pass
        else:
            open_coupang()
        return {"ok": True}

    def coupang_extract(self, mode):
        if not cp_win:
            return {"ok": False, "msg": "쿠팡 창이 열려 있지 않습니다"}
        m = mode if mode in ("items", "dump", "stop") else "items"
        cp_win.evaluate_js("window.__ccRun ? window.__ccRun('%s') : alert('페이지가 아직 준비되지 않았습니다. 잠시 후 다시 눌러 주세요.')" % m)
        return {"ok": True}

    # 파일
    def save_file(self, filename, b64):
        import webview
        try:
            ext = filename.rsplit(".", 1)[-1].lower()
            types = {"xlsx": "엑셀 파일 (*.xlsx)", "pdf": "PDF 파일 (*.pdf)", "html": "HTML 파일 (*.html)"}
            last = read_json(os.path.join(HOME, "lastdir.json"), {}).get("dir")
            res = main_win.create_file_dialog(webview.SAVE_DIALOG, directory=last or os.path.join(os.path.expanduser("~"), "Desktop"),
                                              save_filename=filename, file_types=(types.get(ext, "모든 파일 (*.*)"),))
            if not res:
                return None
            path = res if isinstance(res, str) else res[0]
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64))
            write_json(os.path.join(HOME, "lastdir.json"), {"dir": os.path.dirname(path)})
            return path
        except PermissionError:
            return {"error": "파일이 다른 프로그램(엑셀 등)에서 열려 있어 저장할 수 없습니다"}
        except Exception as e:
            fatal("파일 저장 오류:\n" + traceback.format_exc())
            return {"error": str(e)[:200]}

    def open_path(self, path):
        try:
            os.startfile(path)
            return True
        except Exception:
            return False

    def open_data_folder(self):
        return self.open_path(HOME)

    def open_url(self, url):
        import webbrowser
        if isinstance(url, str) and url.startswith("https://github.com/"):
            webbrowser.open(url)
        return True


def main():
    global main_win
    import webview
    main_win = webview.create_window("한강라면 관리", os.path.join(WEB, "index.html"), js_api=Api(),
                                     width=1360, height=880, min_size=(1120, 720), background_color="#FFFFFF")
    threading.Thread(target=sync_loop, daemon=True).start()
    webview.start(debug=("--debug" in sys.argv))
    try:   # 창을 닫을 때 못 올린 장부가 있으면 한 번 더
        if L["dirty"] and CFG.get("token"):
            ledger_push()
    except Exception:
        pass
    os._exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        fatal("실행 실패:\n" + traceback.format_exc())
        raise
