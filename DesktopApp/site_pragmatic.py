import time
from typing import Dict, List, Optional, Tuple, Callable
import cv2
import numpy as np
from cv_utils import screenshot, load_image, load_image_with_alpha, match_template, match_template_masked, click_center, find_any, build_nonwhite_mask, match_template_multiscale_masked, bottom_roi

class PragmaticBaccarat:
	def __init__(self, config: Dict, logger: Optional[Callable[[str], None]] = None):
		self.cfg = config
		self.threshold = float(self.cfg['templates'].get('match_threshold', 0.8))
		self.max_search_ms = int(self.cfg['templates'].get('max_search_time_ms', 5000))
		self.logger = logger
		
		# Preload templates with alpha if present
		self.player_tpl_bgr = None
		self.player_alpha = None
		self.banker_tpl_bgr = None
		self.banker_alpha = None
		
		try:
		self.player_tpl_bgr, self.player_alpha = load_image_with_alpha(self.cfg['templates']['player_area'])
		except Exception as e:
			if self.logger:
				self.logger(f"Player area template missing: {self.cfg['templates']['player_area']} - {e}")
		
		try:
		self.banker_tpl_bgr, self.banker_alpha = load_image_with_alpha(self.cfg['templates']['banker_area'])
		except Exception as e:
			if self.logger:
				self.logger(f"Banker area template missing: {self.cfg['templates']['banker_area']} - {e}")
		
		self.chip_map: Dict[int, np.ndarray] = {}
		for val_str, path in self.cfg['templates']['chips'].items():
			try:
				self.chip_map[int(val_str)] = load_image(path)
			except Exception as e:
				if self.logger:
					self.logger(f"Chip template missing or unreadable: {path} - {e}")

	def log(self, msg: str) -> None:
		if self.logger:
			self.logger(msg)

	def find_bet_area(self, side: str) -> Optional[Tuple[int, int, int, int, float]]:
		img = screenshot()
		if side == 'Player':
			tpl = self.player_tpl_bgr
			alpha = self.player_alpha
		else:
			tpl = self.banker_tpl_bgr
			alpha = self.banker_alpha
		
		# Check if template is available
		if tpl is None:
			self.log(f"Bet area '{side}' template not loaded")
			return None
		
		# Build mask: prefer embedded alpha; otherwise ignore near-white
		mask = alpha if alpha is not None else build_nonwhite_mask(tpl)
		res = match_template_masked(img, tpl, mask, self.threshold)
		if res:
			self.log(f"Bet area '{side}' found at ({res[0]},{res[1]}) score={res[4]:.3f}")
		else:
			self.log(f"Bet area '{side}' NOT found (masked, threshold={self.threshold})")
		return res

	def find_best_chip(self, amount: int) -> Optional[Tuple[int, Tuple[int, int, int, int, float]]]:
		# Only try to find the exact chip for the requested amount (no pre-scan)
		tpl = self.chip_map.get(amount)
		if tpl is None:
			self.log(f"Chip template not configured for amount {amount}")
			return None
		img_full = screenshot()
		img_roi, y_offset = bottom_roi(img_full, bottom_ratio=0.5)
		# Use same logic as bet area finding - build mask to ignore near-white
		mask = build_nonwhite_mask(tpl)
		res = match_template_masked(img_roi, tpl, mask, self.threshold)
		if res is None:
			return None
		x, y, w, h, score = res
		y_full = y + y_offset
		self.log(f"Exact chip candidate {amount} at ({x},{y_full}) score={score:.3f}")
		return amount, (x, y_full, w, h, score)

	def compose_amount(self, target: int) -> Optional[List[int]]:
		available = sorted(list(self.chip_map.keys()), reverse=True)
		dp = {0: []}
		for t in range(1, target + 1):
			for chip in available:
				if t - chip in dp:
					dp[t] = dp[t - chip] + [chip]
					break
		return dp.get(target)

	def place_bet(self, amount: int, side: str) -> Tuple[bool, str]:
		self.log(f"Place bet start: amount={amount}, side={side}")
		# Validate inputs
		if side not in ('Player', 'Banker'):
			self.log("Error: invalid_side")
			return False, 'invalid_side'
		if amount <= 0:
			self.log("Error: invalid_amount")
			return False, 'invalid_amount'

		# Check bet area
		area = self.find_bet_area(side)
		if not area:
			# Heuristic: if neither area matches, likely wrong_tab/not_betting
			if not self.find_bet_area('Player') and not self.find_bet_area('Banker'):
				self.log("Error: wrong_tab (no bet areas detected)")
				return False, 'wrong_tab'
			self.log("Error: not_betting_time (bet areas exist but selected side not found)")
			return False, 'not_betting_time'

		# Detect visible chips
		best = self.find_best_chip(amount)
		if best and best[0] == amount:
			_, res = best
			self.log(f"Exact chip found: {amount} at ({res[0]},{res[1]}) score={res[4]:.3f}")
			click_center(res[:4])
			time.sleep(0.2)
			click_center(area[:4])
			self.log("Click sequence completed (exact chip)")
			return True, 'ok'

		# Compose chips using predefined configured chip values
		plan = self.compose_amount(amount)
		if not plan:
			self.log("Error: cannot_compose_amount (no chip plan)")
			return False, 'cannot_compose_amount'
		self.log(f"Chip composition plan: {plan}")

		# For each chip value, locate and click
		for idx, val in enumerate(plan, start=1):
			tpl = self.chip_map.get(val)
			if tpl is None:
				self.log(f"Error: no_chips_found (template missing for {val})")
				return False, 'no_chips_found'
			img_full = screenshot()
			img_roi, y_offset = bottom_roi(img_full, bottom_ratio=0.5)
			# Use same logic as bet area finding - build mask to ignore near-white
			mask = build_nonwhite_mask(tpl)
			res = match_template_masked(img_roi, tpl, mask, self.threshold)
			if res is None:
				self.log(f"Error: no_chips_found (chip {val})")
				return False, 'no_chips_found'
			x, y, w, h, score = res
			y_full = y + y_offset
			self.log(f"Clicking chip {val} at ({x},{y_full}) score={score:.3f} [{idx}/{len(plan)}]")
			click_center((x, y_full, w, h))
			time.sleep(0.2)
			click_center(area[:4])
			time.sleep(0.15)
		self.log("Click sequence completed (composed chips)")
		return True, 'ok'

	def cancel_bet(self) -> Tuple[bool, str]:
		path = self.cfg['templates'].get('cancel_button')
		if not path:
			self.log("Cancel: no template path configured")
			return False, 'cancel_unavailable'
		try:
			tpl = load_image(path)
		except Exception:
			self.log("Cancel: template missing/unreadable")
			return False, 'cancel_unavailable'
		img = screenshot()
		res = match_template(img, tpl, self.threshold)
		if not res:
			self.log("Cancel: button not found")
			return False, 'cancel_not_found'
		clicks = 0
		for i in range(20):
			click_center(res[:4])
			clicks += 1
			time.sleep(0.25)
			img = screenshot()
			res2 = match_template(img, tpl, self.threshold)
			if not res2:
				break
			res = res2
		self.log(f"Cancel: clicked {clicks} time(s)")
		return True, 'ok' 