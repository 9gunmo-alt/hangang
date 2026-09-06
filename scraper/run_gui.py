#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한강라면 매출 봇 - GUI 버전
- 시작/정지 버튼, 상태 표시, 로그 창
- 최소화(작업표시줄), X(종료). 시스템 트레이 아이콘 지원(pystray 있으면).
- 수집 로직은 run_local.py 를 그대로 재사용한다.
"""
import threading, queue, sys, os, time
import tkinter as tk
from tkinter import scrolledtext

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_local as bot

LOG_Q = queue.Queue()

# run_local.log() 를 GUI 로그창으로 가로채기
def _gui_log(*a):
    from datetime import datetime
    msg = datetime.now(bot.KST).strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    LOG_Q.put(msg)
bot.log = _gui_log


class BotThread(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self._stop = threading.Event()
        self.last = "-"
    def stop(self): self._stop.set()
    def run(self):
        _gui_log(f"봇 시작 — {bot.INTERVAL}초마다 수집")
        while not self._stop.is_set():
            t0 = time.time()
            try:
                tx = bot.build()
                changed = bot.push_if_changed(tx)
                self.last = f"거래 {len(tx)}건" + (" · 갱신 push" if changed else " · 변화 없음")
                _gui_log(self.last)
            except Exception as e:
                _gui_log("오류:", e)
            while time.time() - t0 < bot.INTERVAL:
                if self._stop.is_set(): break
                time.sleep(0.5)
        _gui_log("봇 정지됨")


class App:
    def __init__(self, root):
        self.root = root
        self.worker = None
        root.title("한강라면 매출 봇")
        root.geometry("560x420")
        root.configure(bg="#16181D")

        top = tk.Frame(root, bg="#16181D"); top.pack(fill="x", padx=16, pady=(14,6))
        tk.Label(top, text="한강라면 매출 봇", fg="#fff", bg="#16181D",
                 font=("맑은 고딕", 15, "bold")).pack(side="left")
        self.dot = tk.Label(top, text="⚫ 정지", fg="#B9BEC9", bg="#16181D",
                            font=("맑은 고딕", 11, "bold")); self.dot.pack(side="right")

        btns = tk.Frame(root, bg="#16181D"); btns.pack(fill="x", padx=16, pady=6)
        self.start_btn = tk.Button(btns, text="▶ 시작", command=self.start,
                                   bg="#E8452C", fg="#fff", font=("맑은 고딕", 12, "bold"),
                                   relief="flat", padx=18, pady=8, cursor="hand2")
        self.start_btn.pack(side="left")
        self.stop_btn = tk.Button(btns, text="■ 정지", command=self.stop, state="disabled",
                                  bg="#3A3F4A", fg="#fff", font=("맑은 고딕", 12, "bold"),
                                  relief="flat", padx=18, pady=8, cursor="hand2")
        self.stop_btn.pack(side="left", padx=8)
        tk.Button(btns, text="_ 최소화", command=lambda: root.iconify(),
                  bg="#2A2E37", fg="#C7CCD5", font=("맑은 고딕", 11),
                  relief="flat", padx=12, pady=8, cursor="hand2").pack(side="right")

        self.log = scrolledtext.ScrolledText(root, bg="#0F1114", fg="#D6DAE2",
                    font=("Consolas", 10), relief="flat", height=16)
        self.log.pack(fill="both", expand=True, padx=16, pady=(6,14))
        self.log.configure(state="disabled")

        root.protocol("WM_DELETE_WINDOW", self.on_close)  # X 버튼
        self.setup_tray()
        self.poll_log()
        self.start()  # 열면 자동 시작

    # ----- 트레이 (pystray 있을 때만) -----
    def setup_tray(self):
        self.tray = None
        try:
            import pystray
            from PIL import Image, ImageDraw
            img = Image.new("RGB", (64, 64), "#16181D")
            d = ImageDraw.Draw(img); d.ellipse((16,16,48,48), fill="#E8452C")
            menu = pystray.Menu(
                pystray.MenuItem("열기", self.tray_show, default=True),
                pystray.MenuItem("종료", self.tray_quit))
            self.tray = pystray.Icon("hanriver", img, "한강라면 매출 봇", menu)
            threading.Thread(target=self.tray.run, daemon=True).start()
        except Exception:
            self.tray = None  # 없으면 X=종료 로만 동작

    def tray_show(self, *a):
        self.root.after(0, lambda: (self.root.deiconify(), self.root.lift()))
    def tray_quit(self, *a):
        self.root.after(0, self.quit_app)

    def on_close(self):
        # 트레이 있으면 숨기기, 없으면 종료
        if self.tray:
            self.root.withdraw()
            _gui_log("트레이로 숨김 (트레이 아이콘 우클릭 → 종료)")
        else:
            self.quit_app()

    def quit_app(self):
        self.stop()
        if self.tray:
            try: self.tray.stop()
            except Exception: pass
        self.root.destroy()

    # ----- 봇 제어 -----
    def start(self):
        if self.worker and self.worker.is_alive(): return
        self.worker = BotThread(); self.worker.start()
        self.dot.config(text="🟢 실행 중", fg="#5FE0A3")
        self.start_btn.config(state="disabled"); self.stop_btn.config(state="normal")
    def stop(self):
        if self.worker: self.worker.stop()
        self.dot.config(text="⚫ 정지", fg="#B9BEC9")
        self.start_btn.config(state="normal"); self.stop_btn.config(state="disabled")

    def poll_log(self):
        try:
            while True:
                msg = LOG_Q.get_nowait()
                self.log.configure(state="normal")
                self.log.insert("end", msg + "\n"); self.log.see("end")
                self.log.configure(state="disabled")
        except queue.Empty:
            pass
        self.root.after(400, self.poll_log)


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
