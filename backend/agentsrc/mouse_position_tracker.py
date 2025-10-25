#!/usr/bin/env python3
"""
mouse_position_tracker.py - Print mouse position every 100ms
Usage: python mouse_position_tracker.py
Press Ctrl+C to stop
"""
import time
import pyautogui

print("Mouse Position Tracker")
print("=" * 50)
print("Move your mouse around to see coordinates")
print("Press Ctrl+C to stop")
print("=" * 50)
print()

try:
    while True:
        x, y = pyautogui.position()
        print(f"\rX: {x:4d}  Y: {y:4d}", end="", flush=True)
        time.sleep(0.1)  # 100ms
except KeyboardInterrupt:
    print("\n\nStopped.")
