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

    # Run OCR if requested
    if do_ocr and pytesseract:
        try:
            log(f"[{name}] Starting OCR processing...")
            log(f"[{name}] Original ROI size: {roi_w}x{roi_h}")

            # STEP 0: Save original ROI before any processing
            debug_original_path = f"roi_{name}_0_original.png"
            cv2.imwrite(debug_original_path, roi)
            log(f"[{name}] Saved original ROI to: {debug_original_path}")

            # STEP 1: Upscale the ROI for better OCR (make it 4x larger)
            scale_factor = 4
            upscaled = cv2.resize(roi, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_CUBIC)
            log(f"[{name}] Upscaled to: {upscaled.shape[1]}x{upscaled.shape[0]} ({scale_factor}x)")

            # Save upscaled image (still in color/BGR)
            debug_upscaled_path = f"roi_{name}_0b_upscaled.png"
            cv2.imwrite(debug_upscaled_path, upscaled)
            log(f"[{name}] Saved upscaled (color) ROI to: {debug_upscaled_path}")

            # STEP 2: Convert to grayscale
            gray = cv2.cvtColor(upscaled, cv2.COLOR_BGR2GRAY)
            log(f"[{name}] Converted to grayscale")

            # Save grayscale for debugging
            cv2.imwrite(f"roi_{name}_1_gray.png", gray)

            # STEP 3: Apply denoising
            denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
            log(f"[{name}] Applied denoising")
            cv2.imwrite(f"roi_{name}_2_denoised.png", denoised)

            # STEP 4: Increase contrast with CLAHE
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            contrast = clahe.apply(denoised)
            log(f"[{name}] Enhanced contrast")
            cv2.imwrite(f"roi_{name}_3_contrast.png", contrast)

            # STEP 5: Apply threshold
            _, thresh = cv2.threshold(contrast, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            log(f"[{name}] Applied threshold")

            # STEP 6: Morphological operations to clean up
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            log(f"[{name}] Applied morphological operations")

            # Save final preprocessed image for debugging
            debug_ocr_path = f"roi_{name}_4_final_ocr_input.png"
            cv2.imwrite(debug_ocr_path, thresh)
            log(f"[{name}] Saved final OCR input image to: {debug_ocr_path}")

            if ocr_type == "digits":
                # Digit-only OCR
                log(f"[{name}] Running digit-only OCR...")
                text = pytesseract.image_to_string(thresh, lang="por",
                                                   config="--psm 7 -c tessedit_char_whitelist=0123456789/")
                text_clean = text.strip()
                log(f"[{name}] OCR digits result: '{text_clean}' (length: {len(text_clean)})")
                result["value"] = text_clean
            else:
                # Full text OCR
                log(f"[{name}] Running full text OCR...")
                text = pytesseract.image_to_string(thresh, lang="por", config="--psm 6")
                text_clean = text.strip()
                log(f"[{name}] OCR text result: '{text_clean}' (length: {len(text_clean)})")
                result["value"] = text_clean

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
