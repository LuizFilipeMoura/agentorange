#!/usr/bin/env python3
import sys, json, cv2, numpy as np
from pathlib import Path

try:
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
except ImportError:
    pytesseract = None

DEBUG_DIR = "debug"

ROIS = {
    "mana": {"x1":1227,"y1":414,"x2":1285,"y2":463,"ocr":True,"ocr_type":"text"},
}

def log(msg): print(f"[ROI_EXTRACT] {msg}", file=sys.stderr)

def ensure_debug():
    Path(DEBUG_DIR).mkdir(exist_ok=True)

def find_playable_cards_v2(img):
    """Return list of (x,y,w,h). Also saves mask and overlay to debug/."""
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower_green = np.array([45,150,150], np.uint8)
    upper_green = np.array([90,255,255], np.uint8)
    mask = cv2.inRange(hsv, lower_green, upper_green)

    kernel = np.ones((5,5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    hand = mask[int(h*0.70):, :]
    yoff = int(h*0.70)

    cnts, _ = cv2.findContours(hand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes=[]
    for c in cnts:
        x,y,wc,hc = cv2.boundingRect(c)
        if wc*hc < 1500 or min(wc,hc) < 40:
            continue
        boxes.append((x, y+yoff, wc, hc))

    # sort left→right for stable labels
    boxes.sort(key=lambda b: b[0])

    # debug overlay with labels
    overlay = img.copy()
    for i,(x,y,wc,hc) in enumerate(boxes, start=1):
        cv2.rectangle(overlay,(x,y),(x+wc,y+hc),(0,255,0),2)
        cv2.putText(overlay, f"Card {i}", (x, y-8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2, cv2.LINE_AA)

    cv2.imwrite(f"{DEBUG_DIR}/mask_playable_cards.png", mask)
    cv2.imwrite(f"{DEBUG_DIR}/debug_playable_cards.png", overlay)
    log(f"Detected {len(boxes)} playable cards")
    return boxes

def extract_single_roi(img, name, cfg):
    x1,y1,x2,y2 = cfg["x1"],cfg["y1"],cfg["x2"],cfg["y2"]
    do_ocr = cfg.get("ocr", False)
    ocr_type = cfg.get("ocr_type","text")

    h,w = img.shape[:2]
    x1,y1 = max(0,x1),max(0,y1)
    x2,y2 = min(w,x2),min(h,y2)
    if x1>=x2 or y1>=y2:
        log(f"[{name}] Invalid coordinates"); return None

    roi = img[y1:y2, x1:x2]
    res = {"name":name,"x1":x1,"y1":y1,"x2":x2,"y2":y2,"width":x2-x1,"height":y2-y1}

    if do_ocr and pytesseract:
        try:
            cv2.imwrite(f"{DEBUG_DIR}/roi_{name}_0_original.png", roi)

            hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
            lower = np.array([0,0,180], np.uint8)
            upper = np.array([180,40,255], np.uint8)
            mask = cv2.inRange(hsv, lower, upper)
            fg = cv2.bitwise_and(roi, roi, mask=mask)

            cv2.imwrite(f"{DEBUG_DIR}/roi_{name}_1_mask.png", mask)
            cv2.imwrite(f"{DEBUG_DIR}/roi_{name}_2_only_white_gray.png", fg)

            g  = cv2.cvtColor(fg, cv2.COLOR_BGR2GRAY)
            _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
            inv = cv2.bitwise_not(bw)
            cv2.imwrite(f"{DEBUG_DIR}/roi_{name}_3_gray.png", g)
            cv2.imwrite(f"{DEBUG_DIR}/roi_{name}_4_binary.png", bw)
            cv2.imwrite(f"{DEBUG_DIR}/roi_{name}_5_inverted.png", inv)

            if ocr_type=="digits":
                cfgs="--oem 3 --psm 8 -c tessedit_char_whitelist=0123456789/"
            else:
                cfgs="--oem 3 --psm 6"
            raw = pytesseract.image_to_string(fg, lang="por", config=cfgs)
            txt = "".join(c for c in raw if (ocr_type!="digits") or c in "0123456789/").strip()
            res["value"] = txt
        except Exception as e:
            import traceback
            log(f"[{name}] OCR error: {e}")
            log(traceback.format_exc())
            res["error"]=str(e)
    elif do_ocr and not pytesseract:
        res["error"]="pytesseract not installed"

    return res

def extract_all_rois(image_path):
    ensure_debug()
    log(f"Loading image: {image_path}")
    img = cv2.imread(image_path)
    if img is None: raise ValueError("failed to load image")

    h,w = img.shape[:2]
    results={}
    overlay = img.copy()
    colors=[(0,255,0),(255,0,0),(0,0,255),(255,255,0),(255,0,255),(0,255,255)]

    for i,(name,cfg) in enumerate(ROIS.items()):
        r = extract_single_roi(img,name,cfg)
        if r:
            results[name]=r
            color = colors[i%len(colors)]
            cv2.rectangle(overlay,(r["x1"],r["y1"]),(r["x2"],r["y2"]),color,2)
            label=f"{name}: {r.get('value','?')}"
            cv2.putText(overlay,label,(r["x1"],r["y1"]-8),cv2.FONT_HERSHEY_SIMPLEX,0.5,color,2)

    # playable cards + labels go to debug/
    playable = find_playable_cards_v2(img)
    for idx,(x,y,wc,hc) in enumerate(playable, start=1):
        cv2.rectangle(overlay,(x,y),(x+wc,y+hc),(0,255,0),2)
        cv2.putText(overlay,f"Card {idx}",(x,y-8),cv2.FONT_HERSHEY_SIMPLEX,0.6,(0,255,0),2,cv2.LINE_AA)

    cv2.imwrite(f"{DEBUG_DIR}/roi_debug.png", overlay)
    log(f"Saved debug overlay: {DEBUG_DIR}/roi_debug.png")

    results["playable_cards"] = [{"x":x,"y":y,"w":wc,"h":hc} for (x,y,wc,hc) in playable]
    results["playable_card_count"] = len(playable)

    return {"image_size":{"width":w,"height":h}, "debug_image": f"{DEBUG_DIR}/roi_debug.png", "rois": results}

def main():
    if len(sys.argv)!=2:
        print("Usage: python extract_roi.py <image_path>", file=sys.stderr)
        print(f"Currently defined ROIs: {', '.join(ROIS.keys())}", file=sys.stderr)
        sys.exit(1)
    p = Path(sys.argv[1])
    if not p.exists():
        print(f"Error: Image not found: {p}", file=sys.stderr); sys.exit(1)
    print(json.dumps(extract_all_rois(str(p)), indent=2))

if __name__=="__main__":
    main()
