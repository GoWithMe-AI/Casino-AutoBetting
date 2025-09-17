import asyncio
import json
import threading
import time
import sys
from dataclasses import dataclass
from typing import Optional

import requests
import websockets
import tkinter as tk
from tkinter import messagebox
import os
from datetime import datetime, timezone

from macro_interface import MacroInterface, SelectionMode
from macro_betting import MacroBaccarat


@dataclass
class Config:
	controller_http: str
	controller_ws: str
	raw: dict


class BetAutomationApp:
	def __init__(self, cfg: Config):
		self.cfg = cfg
		self.token: Optional[str] = None
		self.current_user: Optional[str] = None
		self.pc_name: Optional[str] = None
		self.ws: Optional[websockets.WebSocketClientProtocol] = None
		self.pragmatic = None # Removed: self.pragmatic = PragmaticBaccarat(cfg.raw, logger=self._append_log)
		self.loop = asyncio.new_event_loop()
		self.ws_thread = threading.Thread(target=self._run_loop, daemon=True)
		self.keep_running: bool = False
		
		# Macro interface - will be initialized after root is created
		self.macro_interface = None
		self.macro_betting = None
		
		# UI refs
		self.root = None
		self.username_entry = None
		self.password_entry = None
		self.user_label = None
		self.pass_label = None
		self.login_btn = None
		self.logout_btn = None
		self.status_label = None
		self.log_frame = None
		self.log_text = None
		self.test_btn = None
		self.configure_btn = None

	def _run_loop(self):
		asyncio.set_event_loop(self.loop)
		self.loop.run_forever()

	def start(self):
		self.ws_thread.start()
		self._build_login_ui()

	def _build_login_ui(self):
		self.root = tk.Tk()
		self.root.title('Bet Automation - Macro Interface')
		# Remove fixed geometry to let window size adjust to content

		# Initialize macro interface after root is created
		self.macro_interface = MacroInterface(self.root)
		self.macro_betting = MacroBaccarat(self.macro_interface, logger=self._append_log)

		# Main container with padding
		main_frame = tk.Frame(self.root, padx=20, pady=20)
		main_frame.pack(fill='both', expand=True)

		# Title
		title_label = tk.Label(main_frame, text='Bet Automation', font=("Arial", 16, "bold"))
		title_label.pack(pady=10)

		self.user_label = tk.Label(main_frame, text='Username')
		self.user_label.pack(pady=4)
		self.username_entry = tk.Entry(main_frame, width=30)
		self.username_entry.pack()

		self.pass_label = tk.Label(main_frame, text='Password')
		self.pass_label.pack(pady=4)
		self.password_entry = tk.Entry(main_frame, show='*', width=30)
		self.password_entry.pack()

		self.login_btn = tk.Button(main_frame, text='Login', command=self.login, 
								  bg="#4CAF50", fg="white", width=20)
		self.login_btn.pack(pady=6)

		# Logout button (hidden until login)
		self.logout_btn = tk.Button(main_frame, text='Logout', command=self.logout)
		# Do not pack yet; shown after login

		self.status_label = tk.Label(main_frame, text='')
		self.status_label.pack(pady=6)

		# Configuration button (hidden until login)
		self.configure_btn = tk.Button(main_frame, text='Configure Positions', 
									  command=self._open_configuration, 
									  bg="#2196F3", fg="white")
		# Do not pack yet; shown after login

		# Log area (hidden until login)
		self.log_frame = tk.Frame(main_frame)
		self.log_text = tk.Text(self.log_frame, height=8, state='disabled')
		scroll = tk.Scrollbar(self.log_frame, command=self.log_text.yview)
		self.log_text.configure(yscrollcommand=scroll.set)
		self.log_text.pack(side='left', fill='both', expand=True)
		scroll.pack(side='right', fill='y')

		# Logout button (hidden until login) - will be shown below log area
		self.logout_btn = tk.Button(main_frame, text='Logout', command=self.logout)
		# Do not pack yet; shown after login

		# Center the window after content is packed
		self.root.update_idletasks()
		width = self.root.winfo_reqwidth()
		height = self.root.winfo_reqheight()
		x = (self.root.winfo_screenwidth() // 2) - (width // 2)
		y = (self.root.winfo_screenheight() // 2) - (height // 2)
		self.root.geometry(f"{width}x{height}+{x}+{y}")

		self.root.mainloop()

	def _set_status(self, text: str):
		if self.root and self.status_label:
			self.root.after(0, lambda: self.status_label.config(text=text))

	def _append_log(self, text: str):
		# Handle logging before UI is built
		if not hasattr(self, 'root') or not self.root or not self.log_text:
			print(f"[LOG] {text}")  # Fallback to console output
			return
		def _do():
			self.log_text.config(state='normal')
			self.log_text.insert('end', text + '\n')
			self.log_text.see('end')
			self.log_text.config(state='disabled')
		self.root.after(0, _do)

	def _clear_log(self):
		if not self.root or not self.log_text:
			return
		def _do():
			self.log_text.config(state='normal')
			self.log_text.delete('1.0', 'end')
			self.log_text.config(state='disabled')
		self.root.after(0, _do)

	def _show_login_fields(self, show: bool):
		def _pack(widget):
			if widget and not widget.winfo_ismapped():
				widget.pack()
		def _forget(widget):
			if widget and widget.winfo_ismapped():
				widget.pack_forget()
		if show:
			_pack(self.user_label)
			_pack(self.username_entry)
			_pack(self.pass_label)
			_pack(self.password_entry)
			_pack(self.login_btn)
		else:
			_forget(self.user_label)
			_forget(self.username_entry)
			_forget(self.pass_label)
			_forget(self.password_entry)
			_forget(self.login_btn)

	def _show_logout_button(self, show: bool):
		if not self.logout_btn:
			return
		if show and not self.logout_btn.winfo_ismapped():
			self.logout_btn.pack(pady=4)
		elif not show and self.logout_btn.winfo_ismapped():
			self.logout_btn.pack_forget()

	def _show_log(self, show: bool):
		if not self.log_frame:
			return
		if show and not self.log_frame.winfo_ismapped():
			self.log_frame.pack(fill='both', expand=True, padx=8, pady=6)
			# Show logout button below log area
			if self.logout_btn and not self.logout_btn.winfo_ismapped():
				self.logout_btn.pack(pady=4)
		elif not show and self.log_frame.winfo_ismapped():
			self.log_frame.pack_forget()
			# Hide logout button when log is hidden
			if self.logout_btn and self.logout_btn.winfo_ismapped():
				self.logout_btn.pack_forget()

	def _show_configure_button(self, show: bool):
		if not self.configure_btn:
			return
		if show and not self.configure_btn.winfo_ismapped():
			self.configure_btn.pack(pady=4)
		elif not show and self.configure_btn.winfo_ismapped():
			self.configure_btn.pack_forget()

	def _open_configuration(self):
		"""Open the position configuration interface"""
		print("Opening configuration...")  # Debug
		self._append_log("Opening position configuration...")
		try:
			self.macro_interface.start_position_selection()
			print("Configuration window should be open now")
		except Exception as e:
			print(f"Error opening configuration: {e}")
			self._append_log(f"Error opening configuration: {e}")
			messagebox.showerror("Error", f"Failed to open configuration: {e}")

	def _check_configuration_status(self):
		"""Check and display current configuration status"""
		if self.macro_betting.is_configured():
			positions = self.macro_interface.positions
			chips = self.macro_interface.chips
			status_text = f"Ready - {len(positions)} areas, {len(chips)} chips configured"
			self._set_status(status_text)
			self._append_log(f"Configuration loaded: {len(positions)} areas, {len(chips)} chips")
			
			# Show detailed configuration
			self._append_log("Configured positions:")
			for name, pos in positions.items():
				self._append_log(f"  - {name}: ({pos.x}, {pos.y})")
			
			if chips:
				self._append_log("Configured chips:")
				for chip in chips:
					self._append_log(f"  - {chip.amount}: ({chip.position.x}, {chip.position.y})")
		else:
			self._set_status("Configuration needed - click 'Configure Positions'")
			self._append_log("No configuration found - please configure positions")

	def login(self):
		user = self.username_entry.get().strip()
		pwd = self.password_entry.get()
		if not user or not pwd:
			messagebox.showerror('Error', 'Enter username and password')
			return
		try:
			resp = requests.post(f"{self.cfg.controller_http}/api/login", json={'username': user, 'password': pwd}, timeout=10)
			data = resp.json()
			if not data.get('success'):
				messagebox.showerror('Login failed', data.get('message', 'Login failed'))
				return
			token = data['token']
			self.token = token
			self.current_user = user
			self._set_status(f'Logged in as {user}. Connecting...')
			self._show_login_fields(False)
			self._show_configure_button(True)
			self._show_log(True)
			
			# Check configuration status after login
			self.root.after(100, self._check_configuration_status)
			
			# Resize window to fit logged-in content
			self.root.after(150, self._resize_window_for_logged_in)
			self.root.after(250, lambda: self._connect_ws(user))
		except Exception as e:
			messagebox.showerror('Error', f'Login error: {e}')

	def _resize_window_for_logged_in(self):
		"""Resize window to accommodate logged-in content"""
		self.root.update_idletasks()
		# Set a smaller size for logged-in state with reduced log height
		width = 500
		height = 450
		x = (self.root.winfo_screenwidth() // 2) - (width // 2)
		y = (self.root.winfo_screenheight() // 2) - (height // 2)
		self.root.geometry(f"{width}x{height}+{x}+{y}")

	def logout(self):
		# Stop WS loop and close connection
		self.keep_running = False
		try:
			if self.ws:
				asyncio.run_coroutine_threadsafe(self.ws.close(), self.loop)
		except Exception:
			pass
		# Clear auth and UI state
		self.token = None
		self.current_user = None
		self.pc_name = None
		self._set_status('')
		self._show_log(False)
		self._show_configure_button(False)
		self._clear_log()
		self._show_login_fields(True)
		
		# Resize window back to login size
		self.root.after(100, self._resize_window_for_login)

	def _resize_window_for_login(self):
		"""Resize window to fit login content"""
		self.root.update_idletasks()
		# Let window size adjust to content for login
		width = self.root.winfo_reqwidth()
		height = self.root.winfo_reqheight()
		x = (self.root.winfo_screenwidth() // 2) - (width // 2)
		y = (self.root.winfo_screenheight() // 2) - (height // 2)
		self.root.geometry(f"{width}x{height}+{x}+{y}")

	def _connect_ws(self, user: str):
		async def run():
			self.keep_running = True
			while self.keep_running:
				try:
					async with websockets.connect(self.cfg.controller_ws) as ws:
						self.ws = ws
						await ws.send(json.dumps({'type': 'hello', 'token': self.token}))
						# Request assignment
						await ws.send(json.dumps({'type': 'requestAssignment'}))
						self._set_status('Connected. Awaiting assignment...')
						while self.keep_running:
							msg = await ws.recv()
							data = json.loads(msg)
							self._append_log(f"Recv: {data}")
							# Respond to server heartbeat
							if data.get('type') == 'ping':
								await ws.send(json.dumps({'type': 'pong'}))
								continue
							if data.get('type') == 'assignment':
								self.pc_name = data['pc']
								await ws.send(json.dumps({'type': 'register', 'pc': self.pc_name}))
								user_txt = self.current_user or ''
								self._set_status(f'Logged in as {user_txt} - Assigned as {self.pc_name}. Ready.')
							elif data.get('type') == 'error':
								# Invalid token / license issues
								self._append_log(f"Error: {data.get('message','')}")
								self.root.after(0, lambda: messagebox.showerror('Connection error', data.get('message', 'Unknown error')))
								break
							elif data.get('type') == 'placeBet':
								self._append_log(f"Cmd: placeBet {data.get('amount')} {data.get('side')}")
								await self._handle_place_bet(data)
							elif data.get('type') == 'cancelBet':
								self._append_log('Cmd: cancelBet')
								await self._handle_cancel_bet()
				except Exception as e:
					if self.keep_running:
						self._set_status(f'WS error: {e}. Reconnecting...')
						self._append_log(f'WS error: {e}. Reconnecting...')
						await asyncio.sleep(3)
						continue
					else:
						break

		# Schedule coroutine on the background event loop thread-safely
		asyncio.run_coroutine_threadsafe(run(), self.loop)

	async def _handle_place_bet(self, data: dict):
		platform = data.get('platform', 'Pragmatic')
		amount = int(data.get('amount', 0))
		side = data.get('side', 'Player')
		
		# Use macro-based betting only
		if not self.macro_betting.is_configured():
			self._append_log("Error: Macro positions not configured")
			await self._send_ws({'type': 'betError', 'message': 'Macro positions not configured', 'platform': platform, 'amount': amount, 'side': side, 'errorType': 'not_configured'})
			return
		
		ok, reason = self.macro_betting.place_bet(amount, side)
		
		if ok:
			self._append_log(f"Bet success: amount={amount} side={side}")
			await self._send_ws({'type': 'betSuccess', 'platform': platform, 'amount': amount, 'side': side})
		else:
			self._append_log(f"Bet error: {reason}")
			await self._send_ws({'type': 'betError', 'message': self._error_message(reason), 'platform': platform, 'amount': amount, 'side': side, 'errorType': reason})

	async def _handle_cancel_bet(self):
		# Use macro-based cancel only
		ok, reason = self.macro_betting.cancel_bet()
		
		if not ok:
			self._append_log(f"Cancel error: {reason}")
			await self._send_ws({'type': 'betError', 'message': self._error_message(reason), 'errorType': reason})
		else:
			self._append_log("Cancel success")

	async def _send_ws(self, obj: dict):
		try:
			# Always include pc name if assigned
			if self.pc_name and 'pc' not in obj:
				obj['pc'] = self.pc_name
			# Add timestamp for server/UI logs
			if 'timestamp' not in obj:
				obj['timestamp'] = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
			if self.ws:
				await self.ws.send(json.dumps(obj))
				self._append_log(f"Sent: {obj}")
		except Exception as e:
			self._append_log(f"Send error: {e}")

	def _error_message(self, code: str) -> str:
		return {
			'invalid_side': 'Invalid bet side',
			'invalid_amount': 'Invalid bet amount',
			'wrong_tab': 'Cannot place bet: You are not on the betting tab. Please navigate to the casino game.',
			'not_betting_time': 'Cannot place bet: You are on the right tab but it is not betting time. Please wait for the betting phase.',
			'cannot_compose_amount': 'Cannot compose amount with available chips',
			'no_chips_found': 'No chip templates found on screen',
			'cancel_unavailable': 'Cancel button not configured',
			'cancel_not_found': 'Cancel button not found',
			'not_configured': 'Macro positions not configured. Please configure positions first.',
			'bet_area_not_found': 'Bet area position not found in configuration',
			'chip_not_found': 'Chip position not found in configuration',
			'cancel_button_not_configured': 'Cancel button position not configured',
			'no_chips_configured': 'No chips are configured. Please configure at least one chip position.',
		}.get(code, code)


def load_config() -> Config:
    server_config = {
        'controller': {
            'http_url': 'http://localhost:3000',
            'ws_url': 'http://localhost:8080'
        }
    }
    return Config(
        controller_http=server_config['controller']['http_url'],
        controller_ws=server_config['controller']['ws_url'],
        raw=server_config
    )


if __name__ == '__main__':
	cfg = load_config()
	app = BetAutomationApp(cfg)
	app.start() 