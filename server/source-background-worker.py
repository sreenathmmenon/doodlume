"""Bounded local LaMa inference; caller owns SAM masks and final provenance.

Checkpoint: https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt
IOPaint published MD5: e3aa4aaa15225a33ec84f9f4bc47e500.
This adapter needs only the existing torch/OpenCV/numpy runtime. It never downloads.
"""
import sys, json, base64
import cv2
import numpy as np
import torch

request = json.load(sys.stdin)
source = cv2.imdecode(np.frombuffer(base64.b64decode(request['source']), np.uint8), cv2.IMREAD_UNCHANGED)
mask = cv2.imdecode(np.frombuffer(base64.b64decode(request['mask']), np.uint8), cv2.IMREAD_GRAYSCALE)
if source is None or mask is None or source.shape[:2] != mask.shape or source.ndim != 3 or source.shape[2] not in (3, 4):
    raise ValueError('Invalid background image or mask')
h, w = mask.shape
radius = int(request.get("dilationPixels", 0))
if radius < 0 or radius > 20:
    raise ValueError("Unsupported repair margin")
if radius:
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1)))
if h * w > 4_000_000 or min(h, w) < 8:
    raise ValueError('Background image exceeds supported dimensions')
if not np.any(mask):
    output = source
else:
    torch.set_num_threads(4)
    model = torch.jit.load(sys.argv[1], map_location='cpu').eval()
    output = source.copy()
    # Predict locally around each separated removal region. Global resizing can
    # turn a small illustrated prop into too few pixels and import sky colors
    # into its ground footprint. Context is geometric, never scene-specific.
    grouped = cv2.dilate((mask > 0).astype(np.uint8), np.ones((17, 17), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(grouped)
    regions = [tuple(int(v) for v in row[:4]) for row in stats[1:]]
    if len(regions) > 16:
        regions = [(0, 0, w, h)]
    for x, y, rw, rh in regions:
        margin = max(96, round(max(rw, rh) * .75))
        left, top = max(0, x - margin), max(0, y - margin)
        right, bottom = min(w, x + rw + margin), min(h, y + rh + margin)
        crop = source[top:bottom, left:right, :3]
        crop_mask = mask[top:bottom, left:right]
        ch, cw = crop_mask.shape
        # Bound background-only inference cost; original foreground artwork is
        # never resized here. Composite the repaired region at source resolution.
        scale = min(1.0, 512 / max(ch, cw))
        size = (max(8, round(cw * scale)), max(8, round(ch * scale)))
        image = cv2.resize(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB), size, interpolation=cv2.INTER_AREA)
        small_mask = cv2.resize(crop_mask, size, interpolation=cv2.INTER_NEAREST)
        small_mask = cv2.dilate(small_mask, np.ones((3, 3), np.uint8))
        ph, pw = (-size[1]) % 8, (-size[0]) % 8
        image = np.pad(image, ((0, ph), (0, pw), (0, 0)), mode='reflect')
        small_mask = np.pad(small_mask, ((0, ph), (0, pw)), mode='constant')
        image_tensor = torch.from_numpy(np.ascontiguousarray(image.transpose(2, 0, 1))).float().unsqueeze(0) / 255
        mask_tensor = torch.from_numpy((small_mask > 0).astype(np.float32)).unsqueeze(0).unsqueeze(0)
        with torch.inference_mode():
            prediction = model(image_tensor, mask_tensor)[0].permute(1, 2, 0).cpu().numpy()
        prediction = np.clip(prediction[:size[1], :size[0]] * 255, 0, 255).astype(np.uint8)
        prediction = cv2.cvtColor(cv2.resize(prediction, (cw, ch), interpolation=cv2.INTER_CUBIC), cv2.COLOR_RGB2BGR)
        # Write only this removal region, not all masks appearing in its context.
        patch_mask = mask[y:y + rh, x:x + rw] > 0
        output[y:y + rh, x:x + rw, :3][patch_mask] = prediction[y-top:y-top+rh, x-left:x-left+rw][patch_mask]
ok, png = cv2.imencode('.png', output)
if not ok:
    raise ValueError('Background result could not be encoded')
sys.stdout.buffer.write(png.tobytes())
