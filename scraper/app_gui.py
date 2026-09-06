# -*- coding: utf-8 -*-
"""
한강라면 매출 봇 - GUI (pywebview)
- 라이센스 봇과 같은 방식(파이썬 + HTML 창).
- 수집 로직은 run_local.py 를 그대로 재사용.
- 시작/정지/지금수집 버튼, 상태 표(기계별 오늘 매출), 로그.
- 최소화: 작업표시줄 / X: 트레이로 숨김(계속 실행), 트레이 우클릭 종료.

설치:  pip install pywebview playwright beautifulsoup4 requests  +  python -m playwright install chromium
실행:  run_gui.bat  (또는 python app_gui.py)
"""
import os, sys, json, time, threading
from datetime import datetime

import webview

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_local as bot

_window = None
_thread = None


def js(fn, *args):
    if not _window:
        return
    try:
        _window.evaluate_js(f"{fn}({','.join(json.dumps(a, ensure_ascii=False) for a in args)})")
    except Exception:
        pass


def _gui_log(*a):
    line = datetime.now(bot.KST).strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    js("pushLog", line)
    print(line)
bot.log = _gui_log


def today_stats(tx):
    today = datetime.now(bot.KST).strftime("%Y-%m-%d")
    names = [m[0] for m in bot.MACHINES]
    agg = {n: {"amount": 0, "count": 0} for n in names}
    total = count = 0
    for t in tx:
        if str(t.get("datetime", "")).startswith(today):
            n = t.get("machine")
            if n in agg:
                agg[n]["amount"] += t.get("amount", 0); agg[n]["count"] += 1
            total += t.get("amount", 0); count += 1
    return {
        "updated": datetime.now(bot.KST).strftime("%m/%d %H:%M"),
        "todayTotal": total, "todayCount": count,
        "machines": [{"name": n, "amount": agg[n]["amount"], "count": agg[n]["count"]} for n in names],
    }


class BotThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self._stop = threading.Event()
        self._wake = threading.Event()
    def stop(self): self._stop.set(); self._wake.set()
    def wake(self): self._wake.set()
    def _cycle(self):
        tx = bot.build()
        changed = bot.push_if_changed(tx)
        js("setStatus", today_stats(tx))
        _gui_log(f"거래 {len(tx)}건" + (" · 갱신 push" if changed else " · 변화 없음"))
    def run(self):
        _gui_log(f"봇 시작 — {bot.INTERVAL}초마다 수집")
        while not self._stop.is_set():
            try: self._cycle()
            except Exception as e: _gui_log("오류:", e)
            self._wake.wait(bot.INTERVAL); self._wake.clear()
        _gui_log("봇 정지됨")


class Api:
    def bot_start(self):
        global _thread
        if _thread and _thread.is_alive(): return True
        _thread = BotThread(); _thread.start()
        js("setBotState", True); return True
    def bot_stop(self):
        global _thread
        if _thread: _thread.stop(); _thread = None
        js("setBotState", False); return True
    def run_now(self):
        global _thread
        if _thread and _thread.is_alive():
            _thread.wake()
        else:
            threading.Thread(target=lambda: BotThread()._cycle(), daemon=True).start()
        return True


# ---------- 트레이 (pystray 있으면) ----------
def setup_tray():
    try:
        import pystray
        from PIL import Image, ImageDraw
    except Exception:
        return None
    img = Image.new("RGB", (64, 64), "#161616")
    ImageDraw.Draw(img).ellipse((16, 16, 48, 48), fill="#E8452C")

    def show(icon, item):
        try: _window.show()
        except Exception: pass
    def quit_(icon, item):
        try: icon.stop()
        except Exception: pass
        try: _window.destroy()
        except Exception: pass
        os._exit(0)

    icon = pystray.Icon("hanriver", img, "한강라면 매출 봇",
                        menu=pystray.Menu(
                            pystray.MenuItem("열기", show, default=True),
                            pystray.MenuItem("종료", quit_)))
    threading.Thread(target=icon.run, daemon=True).start()
    return icon


def main():
    global _window
    here = os.path.dirname(os.path.abspath(__file__))
    _window = webview.create_window(
        "한강라면 매출 봇", os.path.join(here, "gui.html"),
        js_api=Api(), width=560, height=560, min_size=(480, 480),
        background_color="#161616")

    tray = setup_tray()

    def on_closing():
        # 트레이가 있으면 창만 숨기고 계속 실행
        if tray:
            _window.hide()
            return False
        return True
    _window.events.closing += on_closing

    def boot():
        time.sleep(0.6)
        Api().bot_start()   # 열면 자동 시작
    threading.Thread(target=boot, daemon=True).start()

    webview.start()


if __name__ == "__main__":
    main()
