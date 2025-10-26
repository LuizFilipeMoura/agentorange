# Game HUD Capture & Extraction

## Usage Options

### Option 0: AI Agent (Vision model-powered game player) 🤖
**`vision_agent.js`** - Autonomous agent that plays the game using vision AI

```bash
node backend/agentsrc/vision_agent.js
```

**What it does:**
- Captures game window screenshots
- Sends screenshots to vLLM vision model API
- Vision model analyzes the game state and decides actions
- Executes mouse actions using Python/pyautogui (move, click, drag)
- Extracts ROI data for debugging
- Hard limit of 10 events then stops
- Saves all captures to `./agent_captures/`

**Requirements:**
- Python with pyautogui: `pip install pyautogui`
- vLLM server running at `http://localhost:8000/v1/chat/completions`
- Game window must be visible and active

**Configuration:**
- `temperature: 0.7` - Controls randomness (0.0 = deterministic, 1.0 = creative)
- `top_p: 0.9` - Nucleus sampling threshold
- `repetition_penalty: 1.1` - Prevents repetitive actions

**Use when:** You want the AI to play the game autonomously

---

### Option 1: All-in-One (Like old grab_window_simple.js)
**`capture_and_extract.js`** - Captures + Extracts in one continuous loop

```bash
node backend/agentsrc/capture_and_extract.js
```

**What it does:**
- Monitors for Warpforge window
- Captures screenshot every 5 seconds
- Crops to game window
- Saves to `./screenshots/`
- Immediately extracts ROI data
- Shows results in console
- Debug images saved to `debug/<image_name>/`

**Use when:** You want everything automated in one command (most common)

---

### Option 2: Separate Capture & Extract

#### 2a. Continuous Capture Only
**`capture_game.js`** - Just captures screenshots

```bash
node backend/agentsrc/capture_game.js
```

**What it does:**
- Only captures and saves screenshots
- No ROI extraction
- Runs every 5 seconds

#### 2b. Extract from Screenshot
**`extract_from_image.js`** - Process a specific screenshot

```bash
node backend/agentsrc/extract_from_image.js ./screenshots/capture_1_123456.png
```

**What it does:**
- Takes image path as argument
- Extracts ROI data from that image
- Shows results and debug info

**Use when:** You want to test ROI extraction on existing screenshots without capturing new ones

---

## Files

### Main Scripts
- **`vision_agent.js`** - AI agent that plays the game autonomously using vLLM 🤖
- **`capture_and_extract.js`** - All-in-one (capture + extract loop) ⭐ **Most used**
- **`capture_game.js`** - Capture only
- **`extract_from_image.js`** - Extract from specific image
- **`helpers.js`** - Shared utility functions used by all scripts

### Python Scripts
- **`extract_roi.py`** - Core ROI extraction logic (called by JS scripts)
  - Define ROIs in `ROIS` dictionary
  - Processes image with OpenCV
  - Detects playable cards
  - Runs OCR
- **`mouse_control.py`** - Mouse control script for vision agent
  - Executes mouse actions (move, click, drag_start, drag_end)
  - Uses pyautogui for cross-platform mouse control
- **`mouse_position_tracker.py`** - Utility to track mouse position in real-time

### Utilities
- **`read_text.py`** - Simple OCR test on any image
- **`test_ocr.py`** - Full preprocessing pipeline test
- **`test_python_setup.py`** - Verify Python dependencies

## Configuration

Edit ROI coordinates in **`extract_roi.py`**:
```python
ROIS = {
    "mana": {
        "x1": 1227,
        "y1": 414,
        "x2": 1285,
        "y2": 463,
        "ocr": True,
        "ocr_type": "text"  # or "digits"
    },
    # Add more ROIs here...
}
```

## Output

### Screenshots
Saved to: `./screenshots/capture_N_timestamp.png`

### Debug Images
Saved to: `./debug/<image_name>/`
- `roi_debug.png` - Overview with all ROIs marked
- `roi_mana_0_original.png` - Original extracted ROI
- `roi_mana_1_mask.png` - Color mask
- `roi_mana_2_only_white_gray.png` - Filtered pixels
- `roi_mana_3_gray.png` - Grayscale
- `roi_mana_4_binary.png` - Black & white
- `mask_playable_cards.png` - Card detection mask
- `debug_playable_cards.png` - Card bounding boxes

## Workflow

1. **Run capture** (keeps running):
   ```bash
   node backend/agentsrc/capture_game.js
   ```

2. **Extract ROI from latest screenshot**:
   ```bash
   node backend/agentsrc/extract_from_image.js ./screenshots/capture_1_123456.png
   ```

3. **Check debug images** in `debug/capture_1_123456/` to verify ROI coordinates

4. **Adjust ROIs** in `extract_roi.py` if needed

5. **Re-run extraction** to verify
