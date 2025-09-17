import time
from typing import Optional, Tuple, List
import cv2
import numpy as np
import mss
import pyautogui
import os

pyautogui.FAILSAFE = False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Monitor selection globals
SELECTED_MONITOR_INDEX = 1
MON_LEFT = 0
MON_TOP = 0
MON_WIDTH = 0
MON_HEIGHT = 0


def list_monitors() -> List[dict]:
	with mss.mss() as sct:
		return list(sct.monitors)


def set_selected_monitor(index: int) -> None:
	global SELECTED_MONITOR_INDEX, MON_LEFT, MON_TOP, MON_WIDTH, MON_HEIGHT
	with mss.mss() as sct:
		monitors = sct.monitors
		if index < 1 or index >= len(monitors):
			index = 1
		SELECTED_MONITOR_INDEX = index
		mon = monitors[index]
		MON_LEFT = mon.get('left', 0)
		MON_TOP = mon.get('top', 0)
		MON_WIDTH = mon.get('width', 0)
		MON_HEIGHT = mon.get('height', 0)

# Initialize defaults
try:
	set_selected_monitor(1)
except Exception:
	pass


def screenshot() -> np.ndarray:
	with mss.mss() as sct:
		mon = sct.monitors[SELECTED_MONITOR_INDEX]
		img = np.array(sct.grab(mon))
		# mss returns BGRA; convert to BGR
		return img[:, :, :3]


def match_template(img: np.ndarray, template: np.ndarray, threshold: float = 0.8) -> Optional[Tuple[int, int, int, int, float]]:
	# Template and img are BGR
	th, tw = template.shape[:2]
	ih, iw = img.shape[:2]
	if th > ih or tw > iw:
		return None
	res = cv2.matchTemplate(img, template, cv2.TM_CCOEFF_NORMED)
	min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
	if max_val >= threshold:
		h, w = template.shape[:2]
		x, y = max_loc
		return (x, y, w, h, max_val)
	return None


def match_template_masked(img: np.ndarray, template: np.ndarray, mask: np.ndarray, threshold: float = 0.8) -> Optional[Tuple[int, int, int, int, float]]:
	# Use TM_CCORR_NORMED which supports mask
	th, tw = template.shape[:2]
	ih, iw = img.shape[:2]
	if th > ih or tw > iw:
		return None
	if mask is not None and (mask.shape[0] != th or mask.shape[1] != tw):
		# size mismatch; cannot match
		return None
	res = cv2.matchTemplate(img, template, cv2.TM_CCORR_NORMED, mask=mask)
	min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(res)
	if max_val >= threshold:
		h, w = template.shape[:2]
		x, y = max_loc
		return (x, y, w, h, max_val)
	return None


def load_image(path: str) -> np.ndarray:
	abs_path = path if os.path.isabs(path) else os.path.join(BASE_DIR, path)
	img = cv2.imread(abs_path, cv2.IMREAD_COLOR)
	if img is None:
		raise FileNotFoundError(f"Template not found: {abs_path}")
	return img


def load_image_with_alpha(path: str) -> Tuple[np.ndarray, Optional[np.ndarray]]:
	abs_path = path if os.path.isabs(path) else os.path.join(BASE_DIR, path)
	img = cv2.imread(abs_path, cv2.IMREAD_UNCHANGED)
	if img is None:
		raise FileNotFoundError(f"Template not found: {abs_path}")
	if img.ndim == 3 and img.shape[2] == 4:
		bgr = img[:, :, :3]
		alpha = img[:, :, 3]
		return bgr, alpha
	return img, None


def build_nonwhite_mask(template_bgr: np.ndarray, alpha: Optional[np.ndarray] = None, white_thresh: int = 240) -> np.ndarray:
	# Mask where pixel is NOT near white and (if alpha provided) alpha > 0
	b, g, r = cv2.split(template_bgr)
	near_white = (r >= white_thresh) & (g >= white_thresh) & (b >= white_thresh)
	mask = (~near_white).astype(np.uint8) * 255
	if alpha is not None:
		mask = cv2.bitwise_and(mask, (alpha > 0).astype(np.uint8) * 255)
	# Optional morphology to clean small specks
	kernel = np.ones((3, 3), np.uint8)
	mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
	return mask


def get_monitor_for_coordinates(x: int, y: int) -> dict:
	"""Get the monitor that contains the given coordinates"""
	with mss.mss() as sct:
		monitors = sct.monitors
		for i, monitor in enumerate(monitors):
			if i == 0:  # Skip the "all monitors" entry
				continue
			left = monitor['left']
			top = monitor['top']
			width = monitor['width']
			height = monitor['height']
			
			if (left <= x < left + width and top <= y < top + height):
				return monitor
		# Default to primary monitor if not found
		return monitors[1] if len(monitors) > 1 else monitors[0]

def click_center(box: Tuple[int, int, int, int], move_delay_ms: int = 100, post_click_ms: int = 150) -> None:
	x, y, w, h = box
	
	# Get the monitor that contains these coordinates
	target_monitor = get_monitor_for_coordinates(x, y)
	
	# Click at the exact position (x, y) without adding width/height offsets
	# since the stored coordinates are the exact click positions
	cx, cy = x, y
	
	print(f"Clicking at exact position ({cx}, {cy}) on monitor: {target_monitor['left']},{target_monitor['top']} {target_monitor['width']}x{target_monitor['height']}")
	
	pyautogui.moveTo(cx, cy, duration=move_delay_ms / 1000.0)
	pyautogui.click()
	time.sleep(post_click_ms / 1000.0)


def find_any(img: np.ndarray, templates: List[np.ndarray], threshold: float) -> Optional[Tuple[int, int, int, int, float, int]]:
	best = None
	best_idx = -1
	for idx, tpl in enumerate(templates):
		res = match_template(img, tpl, threshold)
		if res is None:
			continue
		if best is None or res[4] > best[4]:
			best = res
			best_idx = idx
	if best is None:
		return None
	return (best[0], best[1], best[2], best[3], best[4], best_idx)


def wait_and_find(path: str, timeout_ms: int, threshold: float) -> Optional[Tuple[int, int, int, int, float]]:
	end = time.time() + timeout_ms / 1000.0
	tpl = load_image(path)
	while time.time() < end:
		img = screenshot()
		res = match_template(img, tpl, threshold)
		if res is not None:
			return res
		time.sleep(0.15)
	return None 


def resize_image(img: np.ndarray, scale: float) -> np.ndarray:
	new_w = max(1, int(img.shape[1] * scale))
	new_h = max(1, int(img.shape[0] * scale))
	return cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)


def resize_mask(mask: np.ndarray, scale: float) -> np.ndarray:
	new_w = max(1, int(mask.shape[1] * scale))
	new_h = max(1, int(mask.shape[0] * scale))
	return cv2.resize(mask, (new_w, new_h), interpolation=cv2.INTER_NEAREST)


def match_template_multiscale_masked(img: np.ndarray, tpl_bgr: np.ndarray, mask: Optional[np.ndarray], scales: List[float], threshold: float) -> Optional[Tuple[int, int, int, int, float, float]]:
	best = None
	ih, iw = img.shape[:2]
	for s in scales:
		tpl_scaled = resize_image(tpl_bgr, s)
		th, tw = tpl_scaled.shape[:2]
		if th > ih or tw > iw:
			continue
		mask_scaled = resize_mask(mask, s) if mask is not None else None
		if mask_scaled is not None and (mask_scaled.shape[0] != th or mask_scaled.shape[1] != tw):
			mask_scaled = None
		if mask_scaled is not None:
			res = match_template_masked(img, tpl_scaled, mask_scaled, threshold)
		else:
			res = match_template(img, tpl_scaled, threshold)
		if res is None:
			continue
		x, y, w, h, score = res
		if best is None or score > best[4]:
			best = (x, y, w, h, score, s)
	return best


def bottom_roi(img: np.ndarray, bottom_ratio: float = 0.4) -> Tuple[np.ndarray, int]:
	bottom_ratio = min(max(bottom_ratio, 0.05), 1.0)
	h = img.shape[0]
	y0 = int(h * (1.0 - bottom_ratio))
	return img[y0:, :], y0 