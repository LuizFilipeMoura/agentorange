#!/usr/bin/env python3
"""
Simple ROI (Region of Interest) Extractor
Extracts text/image from a rectangular region of a screenshot
"""

import sys
import json
import cv2
import numpy as np
from pathlib import Path

try:
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
except ImportError:
    pytesseract = None

# ============================================
# ROI DEFINITIONS - Add your ROIs here
# ============================================
ROIS = {
    "mana": {
        "x1": 1227,
        "y1": 414,
        "x2": 1285,
        "y2": 463,
        "ocr": True,
        "ocr_type": "text"  # or "text"
    },
    # Add more ROIs here as needed
    # "health": {
    #     "x1": 100,
    #     "y1": 200,
    #     "x2": 150,
    #     "y2": 250,
    #     "ocr": True,
    #     "ocr_type": "digits"
    # },
}

def log(message):
    """Print to stderr so it doesn't interfere with JSON output"""
    print(f"[ROI_EXTRACT] {message}", file=sys.stderr)

def extract_single_roi(img, name, roi_config):
    """
    Extract a single ROI from image

    Args:
        img: Loaded image (numpy array)
        name: Name of the ROI
        roi_config: Dictionary with x1, y1, x2, y2, ocr, ocr_type

    Returns:
        Dictionary with extracted data
    """
    x1 = roi_config["x1"]
    y1 = roi_config["y1"]
    x2 = roi_config["x2"]
    y2 = roi_config["y2"]
    do_ocr = roi_config.get("ocr", False)
    ocr_type = roi_config.get("ocr_type", "text")

    h, w = img.shape[:2]

    # Ensure coordinates are within bounds
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)

    # Ensure x1 < x2 and y1 < y2
    if x1 >= x2 or y1 >= y2:
        log(f"[{name}] Invalid coordinates: ({x1},{y1}) to ({x2},{y2})")
        return None

    roi_w, roi_h = x2 - x1, y2 - y1
    log(f"[{name}] Extracting: ({x1},{y1}) to ({x2},{y2}) - size: {roi_w}x{roi_h}")

    # Extract ROI
    roi = img[y1:y2, x1:x2]

    result = {
        "name": name,
        "x1": x1,
        "y1": y1,
        "x2": x2,
        "y2": y2,
        "width": roi_w,
        "height": roi_h
    }


    if do_ocr and pytesseract:
        try:
            log(f"[{name}] Starting OCR processing...")
            log(f"[{name}] Original ROI size: {roi_w}x{roi_h}")

            # Save original ROI (color)
            debug_original_path = f"roi_{name}_0_original.png"
            cv2.imwrite(debug_original_path, roi)
            log(f"[{name}] Saved original ROI to: {debug_original_path}")

            # --- Keep only white/gray pixels (low saturation, high value) ---
            hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
            lower = np.array([0, 0, 180], dtype=np.uint8)
            upper = np.array([180, 40, 255], dtype=np.uint8)
            mask = cv2.inRange(hsv, lower, upper)
            fg = cv2.bitwise_and(roi, roi, mask=mask)

            cv2.imwrite(f"roi_{name}_1_mask.png", mask)
            cv2.imwrite(f"roi_{name}_2_only_white_gray.png", fg)

            # --- Prep for OCR: grayscale → binarize → invert (dark text on white) ---
            g  = cv2.cvtColor(fg, cv2.COLOR_BGR2GRAY)
            _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            inv = cv2.bitwise_not(bw)

            cv2.imwrite(f"roi_{name}_3_gray.png", g)
            cv2.imwrite(f"roi_{name}_4_binary.png", bw)
            cv2.imwrite(f"roi_{name}_5_inverted.png", inv)

            # --- OCR ---
            if ocr_type == "digits":
                # Strict numeric read; stick to 'por' per your environment
                cfg = "--oem 3"
                raw = pytesseract.image_to_string(fg,  lang="por", config=cfg)
                txt = raw.strip()
                log(f"[{name}] OCR digits raw: {raw!r}")
                log(f"[{name}] OCR digits cleaned: '{txt}'")
                result["value"] = txt
            else:
                # General text
                cfg = "--oem 3 --psm 6"
                raw = pytesseract.image_to_string(fg, lang="por", config=cfg)
                txt = raw.strip()
                log(f"[{name}] OCR text raw: {raw!r}")
                log(f"[{name}] OCR text cleaned: '{txt}'")
                result["value"] = txt

        except Exception as e:
            log(f"[{name}] OCR failed: {e}")
            import traceback
            log(f"[{name}] OCR traceback: {traceback.format_exc()}")
            result["error"] = str(e)

    elif do_ocr and not pytesseract:
        log(f"[{name}] OCR requested but pytesseract not available")
        result["error"] = "pytesseract not installed"
    return result



def extract_all_rois(image_path):
    """
    Extract all defined ROIs from image

    Args:
        image_path: Path to the screenshot

    Returns:
        Dictionary with all ROI results
    """
    log(f"Loading image: {image_path}")
    img = cv2.imread(image_path)

    if img is None:
        raise ValueError(f"Failed to load image: {image_path}")

    h, w = img.shape[:2]
    log(f"Image size: {w}x{h}")
    log(f"Extracting {len(ROIS)} ROIs...")

    # Create debug visualization
    debug_img = img.copy()
    colors = [
        (0, 255, 0),    # Green
        (255, 0, 0),    # Blue
        (0, 0, 255),    # Red
        (255, 255, 0),  # Cyan
        (255, 0, 255),  # Magenta
        (0, 255, 255),  # Yellow
    ]

    results = {}

    for idx, (name, roi_config) in enumerate(ROIS.items()):
        roi_result = extract_single_roi(img, name, roi_config)

        if roi_result:
            results[name] = roi_result

            # Draw rectangle on debug image
            color = colors[idx % len(colors)]
            x1, y1, x2, y2 = roi_result["x1"], roi_result["y1"], roi_result["x2"], roi_result["y2"]
            cv2.rectangle(debug_img, (x1, y1), (x2, y2), color, 2)

            # Add label
            label = f"{name}: {roi_result.get('value', '?')}"
            cv2.putText(debug_img, label, (x1, y1 - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    # Save debug image
    debug_path = "roi_debug.png"
    cv2.imwrite(debug_path, debug_img)
    log(f"Saved debug visualization to: {debug_path}")

    return {
        "image_size": {"width": w, "height": h},
        "debug_image": debug_path,
        "rois": results
    }

def main():
    """Main entry point"""
    if len(sys.argv) != 2:
        print("Usage: python extract_roi.py <image_path>", file=sys.stderr)
        print("", file=sys.stderr)
        print("ROIs are defined in the ROIS dictionary at the top of this script.", file=sys.stderr)
        print(f"Currently defined ROIs: {', '.join(ROIS.keys())}", file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]

    if not Path(image_path).exists():
        print(f"Error: Image not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    try:
        result = extract_all_rois(image_path)

        # Output JSON to stdout
        print(json.dumps(result, indent=2))

    except Exception as e:
        log(f"Error: {str(e)}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
