"""Private stdin/stdout worker for optional local Meta SAM 2.1 artwork masks.

No HTTP listener, uploads, credentials, or arbitrary file/URL input. The parent
sends bounded normalized pixels and boxes; output contains original RGB crops
with predicted alpha. Install/checkpoint paths are supplied by the local owner.
"""
import base64
import hashlib
import io
import json
import os
import sys
import time
from pathlib import Path

# Research libraries can print during import. Keep the protocol stdout clean.
protocol = sys.stdout
sys.stdout = sys.stderr
import numpy as np
import torch
from PIL import Image
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

checkpoint = Path(sys.argv[1]).resolve()
if not checkpoint.is_file():
    raise SystemExit("Local SAM checkpoint is unavailable")
device = "mps" if torch.backends.mps.is_available() else "cpu"
torch.set_num_threads(min(4, os.cpu_count() or 2))
model = build_sam2("configs/sam2.1/sam2.1_hiera_t.yaml", str(checkpoint), device=device, apply_postprocessing=False)
predictor = SAM2ImagePredictor(model)
last_hash = None
last_rgb = None

def emit(value):
    protocol.write(json.dumps(value, separators=(",", ":")) + "\n")
    protocol.flush()

emit({"ready": True, "model": "Meta SAM 2.1 tiny", "device": device})
for line in sys.stdin:
    if len(line) > 9000000:
        emit({"error": "Input too large"})
        continue
    request_id = None
    try:
        req = json.loads(line)
        request_id = req.get("id")
        payload = req["image"]
        objects = req["objects"]
        if not isinstance(payload, str) or len(payload) > 8000000 or not isinstance(objects, list) or not 1 <= len(objects) <= 24:
            raise ValueError("Invalid request")
        raw = base64.b64decode(payload, validate=True)
        digest = hashlib.sha256(raw).digest()
        start = time.monotonic()
        if digest != last_hash:
            image = Image.open(io.BytesIO(raw))
            if image.width * image.height > 2000000:
                raise ValueError("Image exceeds local model bounds")
            image = image.convert("RGB")
            last_rgb = np.asarray(image).copy()
            with torch.inference_mode():
                predictor.set_image(last_rgb)
            last_hash = digest
        h, w = last_rgb.shape[:2]
        boxes = []
        for o in objects:
            b = [o["left"], o["top"], o["right"], o["bottom"]]
            if not all(isinstance(v, (int,float)) and np.isfinite(v) for v in b) or not (0 <= b[0] < b[2] <= w and 0 <= b[1] < b[3] <= h):
                raise ValueError("Invalid object bounds")
            prompt = o.get("prompt")
            p = [prompt[k] for k in ["left", "top", "right", "bottom"]] if prompt is not None else b
            if not all(isinstance(v, (int,float)) and np.isfinite(v) for v in p) or not (b[0] <= p[0] < p[2] <= b[2] and b[1] <= p[1] < p[3] <= b[3]):
                raise ValueError("Invalid object prompt")
            boxes.append(p)
        masks, scores, _ = predictor.predict(box=np.asarray(boxes, dtype=np.float32), multimask_output=False)
        records = []
        if masks.ndim == 3:
            masks = masks[:, None, :, :]
        if len(objects) == 1 and masks.shape[0] != 1:
            raise ValueError("Unexpected mask count")
        for index, o in enumerate(objects):
            score = float(np.asarray(scores[index]).reshape(-1)[0])
            mask = np.asarray(masks[index]).reshape(-1,h,w)[0]
            # The prompt identifies the object; the output context must not
            # truncate pixels that SAM recovered beyond that initial prompt.
            left, top, right, bottom = [int(o[k]) for k in ["left", "top", "right", "bottom"]]
            alpha = np.asarray(mask[top:bottom,left:right] > 0, dtype=np.uint8) * 255
            visible = int(np.count_nonzero(alpha))
            if score < .5 or visible < 3 or visible / alpha.size < .005:
                continue
            rgb = last_rgb[top:bottom,left:right]
            rgba = np.dstack([rgb, alpha])
            buffer = io.BytesIO()
            Image.fromarray(rgba, "RGBA").save(buffer, format="PNG")
            records.append({"id":o["id"],"png":base64.b64encode(buffer.getvalue()).decode("ascii"),"score":round(score,4),"visible":visible,"pixels":int(alpha.size)})
        emit({"id":request_id,"records":records,"ms":round((time.monotonic()-start)*1000),"model":"Meta SAM 2.1 tiny","device":device})
    except Exception:
        # No image payloads, filesystem paths, raw library error or secrets.
        emit({"id":request_id,"error":"Local segmentation did not complete"})
