#!/usr/bin/env python3
"""
mouse_control.py - Simple mouse control script for the LLaVA agent
"""
import sys
import json
import pyautogui

# Safety settings
pyautogui.PAUSE = 0.1  # Small delay between commands

def execute_action(action_data):
    """Execute a mouse action"""
    try:
        action_type = action_data["action"]
        x = int(action_data["x"])
        y = int(action_data["y"])

        # Move to origin first as baseline

        if action_type == "move":
            pyautogui.moveTo(x, y, duration=0.2)

        elif action_type == "click":
            pyautogui.click(x, y)

        elif action_type == "drag_start":
            pyautogui.mouseDown(x, y)

        elif action_type == "drag_end":
            pyautogui.mouseUp(x, y)

        else:
            return {"success": False, "error": f"Unknown action: {action_type}"}

        return {"success": True, "action": action_type, "x": x, "y": y}

    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No action data provided"}))
        sys.exit(1)

    try:
        action_json = sys.argv[1]
        action_data = json.loads(action_json)
        result = execute_action(action_data)
        print(json.dumps(result))

    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON: {str(e)}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
