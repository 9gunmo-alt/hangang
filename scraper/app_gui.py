# -*- coding: utf-8 -*-
"""
한강라면 매출 봇 - GUI (pywebview) · 로그 전용
- 수집 로직은 run_local.py 재사용.
- 켜면 자동 시작. X = 완전 종료 (트레이/숨김 없음). 최소화(_) = 작업표시줄.
- pythonw(검은 창 없음)로 실행. 오류가 나면 조용히 죽지 않게 error.log 로 남긴다.

실행:  run_gui.bat  (또는 python scraper\app_gui.py)
"""
import os, sys, json, time, threading, traceback
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
LOGFILE = os.path.join(HERE, "error.log")

def _fatal(msg):
    try:
        with open(LOGFILE, "a", encoding="utf-8") as f:
            f.write(datetime.now().strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except Exception:
        pass

try:
    import webview
    sys.path.insert(0, HERE)
    import run_local as bot
except Exception:
    _fatal("임포트 실패:\n" + traceback.format_exc())
    raise

_window = None
_thread = None


def js(fn, *args):
    if not _window: return
    try:
        _window.evaluate_js(f"{fn}({','.join(json.dumps(a, ensure_ascii=False) for a in args)})")
    except Exception:
        pass


def _gui_log(*a):
    line = datetime.now(bot.KST).strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    js("pushLog", line)
    print(line)
bot.log = _gui_log


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
        _gui_log(f"거래 {len(tx)}건" + (" · 갱신 push" if changed else " · 변화 없음"))
    def run(self):
        _gui_log(f"봇 시작 — {bot.INTERVAL}초마다 수집")
        while not self._stop.is_set():
            try:
                self._cycle()
            except Exception as e:
                _gui_log("오류:", e)
                _fatal("수집 오류:\n" + traceback.format_exc())
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
        if _thread and _thread.is_alive(): _thread.wake()
        else: threading.Thread(target=lambda: BotThread()._cycle(), daemon=True).start()
        return True


def main():
    global _window
    _window = webview.create_window(
        "한강라면 매출 봇", os.path.join(HERE, "gui.html"),
        js_api=Api(), width=560, height=520, min_size=(460, 420),
        background_color="#161616")

    def boot():
        time.sleep(0.6)
        Api().bot_start()   # 켜면 자동 시작
    threading.Thread(target=boot, daemon=True).start()

    webview.start()   # 창이 닫히면(X) 여기서 리턴
    os._exit(0)       # 봇 스레드까지 완전 종료


if __name__ == "__main__":
    try:
        main()
    except Exception:
        _fatal("실행 실패:\n" + traceback.format_exc())
        raise
