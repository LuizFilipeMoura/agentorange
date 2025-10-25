#!/usr/bin/env python3
import sys, json, cv2, numpy as np
from pathlib import Path

try:
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
except ImportError:
    pytesseract = None

# will be set per run: debug/<image_stem>
RUN_DEBUG_DIR: Path | None = None

ROIS = {
    "mana": {"x1":1227,"y1":414,"x2":1285,"y2":463,"ocr":True,"ocr_type":"text"},
}

def log(msg): print(f"[ROI_EXTRACT] {msg}", file=sys.stderr)

def dwrite(name: str, img) -> None:
    """Write a debug image into the per-image debug folder."""
    assert RUN_DEBUG_DIR is not None
    RUN_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(RUN_DEBUG_DIR / name), img)

def find_playable_cards_v2(img):
    """
    Detect playable cards from green glow. Splits merged blobs.
    Saves mask and overlay in RUN_DEBUG_DIR.
    Returns [(x,y,w,h), ...] left-to-right.
    """
    H, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    lower = np.array([38,110,120], np.uint8)
    upper = np.array([95,255,255], np.uint8)
    mask = cv2.inRange(hsv, lower, upper)

    k = np.ones((5,5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
    mask = cv2.dilate(mask, np.ones((3,3), np.uint8), iterations=1)

    y0 = int(H * 0.68)
    hand = mask[y0:H, :]

    cnts, _ = cv2.findContours(hand, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []

    def split_merged(bx, by, bw, bh, hand_bin):
        roi = hand_bin[by:by+bh, bx:bx+bw]
        col = (roi.sum(axis=0) // 255).astype(np.int32)
        ks = 9 if bw > 120 else 7
        col_s = np.convolve(col, np.ones(ks, np.float32)/ks, mode="same")
        h = roi.shape[0]
        thr = 0.18 * h
        valley = col_s < thr

        cuts = []
        i = 0
        while i < bw:
            if valley[i]:
                j = i + 1
                while j < bw and valley[j]:
                    j += 1
                if (j - i) >= 10:
                    cuts.append((i + j)//2)
                i = j
            else:
                i += 1

        exp_w = max(60, int(0.65 * bh))
        min_w = int(0.55 * exp_w)
        max_w = int(1.25 * exp_w)

        seg_edges = [0] + [c for c in cuts if 12 < c < bw-12] + [bw]
        segs = []
        for s, e in zip(seg_edges[:-1], seg_edges[1:]):
            wseg = e - s
            if min_w <= wseg <= max_w:
                segs.append((bx + s, by, wseg, bh))
        if not segs:
            segs = [(bx, by, bw, bh)]
        return segs

    def merge_small_adjacent(bxs, bh_ref):
        if not bxs: return bxs
        bxs.sort(key=lambda b: b[0])
        merged = []
        i = 0
        min_w = int(0.55 * 0.65 * bh_ref)
        while i < len(bxs):
            x,y,w,h = bxs[i]
            if w < min_w and i+1 < len(bxs):
                x2,y2,w2,h2 = bxs[i+1]
                nx = x
                nw = (x2 + w2) - x
                merged.append((nx, y, nw, max(h,h2)))
                i += 2
            else:
                merged.append((x,y,w,h))
                i += 1
        return merged

    for c in cnts:
        x,y,w,h = cv2.boundingRect(c)
        if w*h < 2500 or h < 60:
            continue
        parts = split_merged(x, y, w, h, hand)
        parts = merge_small_adjacent(parts, h)
        for px,py,pw,ph in parts:
            boxes.append((int(px), int(py + y0), int(pw), int(ph)))

    boxes.sort(key=lambda b: b[0])

    overlay = img.copy()
    for i, (x, y, w, h) in enumerate(boxes, 1):
        cv2.rectangle(overlay, (x, y), (x+w, y+h), (0,255,0), 2)
        cv2.putText(overlay, f"Card {i}", (x, y-8),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0,255,0), 2, cv2.LINE_AA)

    dwrite("mask_playable_cards.png", mask)
    dwrite("debug_playable_cards.png", overlay)
    log(f"Playable cards: {len(boxes)}")
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
            dwrite(f"roi_{name}_0_original.png", roi)

            hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
            lower = np.array([0,0,180], np.uint8)
            upper = np.array([180,40,255], np.uint8)
            mask = cv2.inRange(hsv, lower, upper)
            fg = cv2.bitwise_and(roi, roi, mask=mask)

            dwrite(f"roi_{name}_1_mask.png", mask)
            dwrite(f"roi_{name}_2_only_white_gray.png", fg)

            g  = cv2.cvtColor(fg, cv2.COLOR_BGR2GRAY)
            _, bw = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
            inv = cv2.bitwise_not(bw)
            dwrite(f"roi_{name}_3_gray.png", g)
            dwrite(f"roi_{name}_4_binary.png", bw)
            dwrite(f"roi_{name}_5_inverted.png", inv)

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

def to_py(o):
    import numpy as np
    if isinstance(o, np.integer):   return int(o)
    if isinstance(o, np.floating):  return float(o)
    if isinstance(o, np.ndarray):   return o.tolist()
    if isinstance(o, dict):         return {k: to_py(v) for k,v in o.items()}
    if isinstance(o, (list, tuple)):return [to_py(v) for v in o]
    return o

def extract_all_rois(image_path: str):
    global RUN_DEBUG_DIR
    stem = Path(image_path).stem
    RUN_DEBUG_DIR = Path("debug") / stem  # per-image folder
    RUN_DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    log(f"Debug folder: {RUN_DEBUG_DIR}")

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

    playable = find_playable_cards_v2(img)
    for idx,(x,y,wc,hc) in enumerate(playable, start=1):
        cv2.rectangle(overlay,(x,y),(x+wc,y+hc),(0,255,0),2)
        cv2.putText(overlay,f"Card {idx}",(x,y-8),cv2.FONT_HERSHEY_SIMPLEX,0.6,(0,255,0),2,cv2.LINE_AA)

    dwrite("roi_debug.png", overlay)
    log(f"Saved debug overlay: {RUN_DEBUG_DIR/'roi_debug.png'}")

    results["playable_cards"] = [{"x":int(x),"y":int(y),"w":int(wc),"h":int(hc)} for (x,y,wc,hc) in playable]
    results["playable_card_count"] = len(playable)

    return {"image_size":{"width":w,"height":h},
            "debug_dir": str(RUN_DEBUG_DIR),
            "debug_image": str(RUN_DEBUG_DIR / "roi_debug.png"),
            "rois": results}

def main():
    if len(sys.argv)!=2:
        print("Usage: python extract_roi.py <image_path>", file=sys.stderr)
        print(f"Currently defined ROIs: {', '.join(ROIS.keys())}", file=sys.stderr)
        sys.exit(1)
    p = Path(sys.argv[1])
    if not p.exists():
        print(f"Error: Image not found: {p}", file=sys.stderr); sys.exit(1)
    res = extract_all_rois(str(p))
    print(json.dumps(to_py(res), indent=2))

if __name__=="__main__":
    main()
