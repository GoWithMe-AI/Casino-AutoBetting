import json
import os
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
from typing import Dict, List, Optional, Tuple, Callable
import threading
import time
from dataclasses import dataclass, asdict
from enum import Enum

@dataclass
class Position:
    x: int
    y: int
    width: int
    height: int
    name: str

@dataclass
class ChipConfig:
    amount: int
    position: Position

class SelectionMode(Enum):
    NONE = "none"
    PLAYER_AREA = "player_area"
    BANKER_AREA = "banker_area"
    CANCEL_BUTTON = "cancel_button"
    CHIP = "chip"

class MacroInterface:
    def __init__(self, config_path: str = "macro_config.json"):
        self.config_path = config_path
        self.positions: Dict[str, Position] = {}
        self.chips: List[ChipConfig] = []
        self.selection_mode = SelectionMode.NONE
        self.on_position_selected: Optional[Callable] = None
        self.selection_window: Optional[tk.Toplevel] = None
        self.overlay_window: Optional[tk.Toplevel] = None
        self.load_config()
        
    def load_config(self):
        """Load saved positions and chip configurations"""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r') as f:
                    data = json.load(f)
                    
                # Load positions
                for name, pos_data in data.get('positions', {}).items():
                    self.positions[name] = Position(**pos_data)
                    
                # Load chips
                self.chips = []
                for chip_data in data.get('chips', []):
                    position = Position(**chip_data['position'])
                    self.chips.append(ChipConfig(
                        amount=chip_data['amount'],
                        position=position
                    ))
            except Exception as e:
                print(f"Error loading config: {e}")
    
    def save_config(self):
        """Save current positions and chip configurations"""
        data = {
            'positions': {name: asdict(pos) for name, pos in self.positions.items()},
            'chips': [{'amount': chip.amount, 'position': asdict(chip.position)} for chip in self.chips]
        }
        
        try:
            with open(self.config_path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving config: {e}")
    
    def start_position_selection(self, mode: SelectionMode = SelectionMode.NONE, callback: Optional[Callable] = None):
        """Start position selection mode"""
        self.selection_mode = mode
        self.on_position_selected = callback
        self._create_selection_window()
        self._create_overlay_window()
    
    def _create_selection_window(self):
        """Create the main selection interface window"""
        print("Creating selection window...")  # Debug
        
        # Create the window
        self.selection_window = tk.Toplevel()
        self.selection_window.title("Position Selection")
        self.selection_window.geometry("400x600")
        self.selection_window.resizable(False, False)
        
        # Center the window
        self.selection_window.update_idletasks()
        x = (self.selection_window.winfo_screenwidth() // 2) - (400 // 2)
        y = (self.selection_window.winfo_screenheight() // 2) - (600 // 2)
        self.selection_window.geometry(f"400x600+{x}+{y}")
        
        # Make window stay on top and visible
        self.selection_window.attributes('-topmost', True)
        self.selection_window.deiconify()
        self.selection_window.lift()
        self.selection_window.focus_force()
        
        # Add a simple test label first
        test_label = tk.Label(self.selection_window, text="Configuration Window - If you see this, it's working!", 
                             font=("Arial", 14, "bold"), fg="green")
        test_label.pack(pady=20)
        
        print("Building selection UI...")  # Debug
        self._build_selection_ui()
        print("Selection window created successfully")  # Debug
    
    def _build_selection_ui(self):
        """Build the selection interface UI"""
        # Title
        title_label = tk.Label(self.selection_window, text="Position Selection", 
                              font=("Arial", 16, "bold"))
        title_label.pack(pady=10)
        
        # Instructions
        instructions = tk.Label(self.selection_window, 
                               text="Click 'Select Position' for each area,\nthen click on the screen where you want to place it.",
                               font=("Arial", 10), justify="center")
        instructions.pack(pady=10)
        
        # Main areas frame
        areas_frame = ttk.LabelFrame(self.selection_window, text="Betting Areas", padding=10)
        areas_frame.pack(fill="x", padx=10, pady=5)
        
        # Player Area
        player_frame = tk.Frame(areas_frame)
        player_frame.pack(fill="x", pady=5)
        tk.Label(player_frame, text="Player Bet Area:").pack(side="left")
        self.player_status = tk.Label(player_frame, text="Not set", fg="red")
        self.player_status.pack(side="right")
        tk.Button(player_frame, text="Select Position", 
                 command=lambda: self._start_area_selection(SelectionMode.PLAYER_AREA)).pack(side="right", padx=5)
        
        # Banker Area
        banker_frame = tk.Frame(areas_frame)
        banker_frame.pack(fill="x", pady=5)
        tk.Label(banker_frame, text="Banker Bet Area:").pack(side="left")
        self.banker_status = tk.Label(banker_frame, text="Not set", fg="red")
        self.banker_status.pack(side="right")
        tk.Button(banker_frame, text="Select Position", 
                 command=lambda: self._start_area_selection(SelectionMode.BANKER_AREA)).pack(side="right", padx=5)
        
        # Cancel Button
        cancel_frame = tk.Frame(areas_frame)
        cancel_frame.pack(fill="x", pady=5)
        tk.Label(cancel_frame, text="Cancel Button:").pack(side="left")
        self.cancel_status = tk.Label(cancel_frame, text="Not set", fg="red")
        self.cancel_status.pack(side="right")
        tk.Button(cancel_frame, text="Select Position", 
                 command=lambda: self._start_area_selection(SelectionMode.CANCEL_BUTTON)).pack(side="right", padx=5)
        
        # Chips frame
        chips_frame = ttk.LabelFrame(self.selection_window, text="Chips", padding=10)
        chips_frame.pack(fill="both", expand=True, padx=10, pady=5)
        
        # Add chip button
        add_chip_btn = tk.Button(chips_frame, text="+ Add Custom Chip", 
                                command=self._add_custom_chip, bg="#4CAF50", fg="white")
        add_chip_btn.pack(pady=5)
        
        # Chips list
        self.chips_canvas = tk.Canvas(chips_frame, height=200)
        chips_scrollbar = ttk.Scrollbar(chips_frame, orient="vertical", command=self.chips_canvas.yview)
        self.chips_frame = tk.Frame(self.chips_canvas)
        
        self.chips_canvas.configure(yscrollcommand=chips_scrollbar.set)
        
        self.chips_canvas.pack(side="left", fill="both", expand=True)
        chips_scrollbar.pack(side="right", fill="y")
        
        self.chips_canvas.create_window((0, 0), window=self.chips_frame, anchor="nw")
        self.chips_frame.bind("<Configure>", lambda e: self.chips_canvas.configure(scrollregion=self.chips_canvas.bbox("all")))
        
        # Action buttons
        actions_frame = tk.Frame(self.selection_window)
        actions_frame.pack(fill="x", padx=10, pady=10)
        
        save_btn = tk.Button(actions_frame, text="Save Configuration", 
                            command=self._save_and_close, bg="#2196F3", fg="white")
        save_btn.pack(side="right", padx=5)
        
        cancel_btn = tk.Button(actions_frame, text="Cancel", 
                              command=self._cancel_selection)
        cancel_btn.pack(side="right", padx=5)
        
        # Update status displays
        self._update_status_displays()
        self._refresh_chips_list()
    
    def _start_area_selection(self, mode: SelectionMode):
        """Start selection for a specific area"""
        self.selection_mode = mode
        self._show_overlay_instructions()
    
    def _show_overlay_instructions(self):
        """Show instructions on the overlay window"""
        if self.overlay_window:
            self.overlay_window.deiconify()
            self.overlay_window.lift()
            
            # Update instruction text
            mode_text = {
                SelectionMode.PLAYER_AREA: "Player Bet Area",
                SelectionMode.BANKER_AREA: "Banker Bet Area", 
                SelectionMode.CANCEL_BUTTON: "Cancel Button",
                SelectionMode.CHIP: "Chip Position"
            }.get(self.selection_mode, "Unknown")
            
            self.overlay_window.title(f"Click to select {mode_text}")
    
    def _create_overlay_window(self):
        """Create transparent overlay window for position selection"""
        self.overlay_window = tk.Toplevel()
        self.overlay_window.attributes('-alpha', 0.3)
        self.overlay_window.attributes('-topmost', True)
        self.overlay_window.overrideredirect(True)
        
        # Make it cover the entire screen
        self.overlay_window.geometry(f"{self.overlay_window.winfo_screenwidth()}x{self.overlay_window.winfo_screenheight()}+0+0")
        
        # Bind click events
        self.overlay_window.bind("<Button-1>", self._on_overlay_click)
        self.overlay_window.bind("<Escape>", lambda e: self._cancel_overlay())
        
        # Add instruction label
        self.instruction_label = tk.Label(self.overlay_window, 
                                         text="Click to select position\nPress ESC to cancel",
                                         font=("Arial", 16, "bold"),
                                         bg="yellow", fg="black",
                                         relief="raised", bd=2)
        self.instruction_label.place(relx=0.5, rely=0.1, anchor="center")
        
        # Initially hide the overlay
        self.overlay_window.withdraw()
    
    def _on_overlay_click(self, event):
        """Handle click on overlay window"""
        if self.selection_mode == SelectionMode.NONE:
            return
        
        # Get click position relative to screen
        x, y = event.x_root, event.y_root
        
        # Create position with default size (can be adjusted later)
        position = Position(x=x, y=y, width=50, height=50, name="")
        
        # Store position based on mode
        if self.selection_mode == SelectionMode.PLAYER_AREA:
            self.positions['player_area'] = position
        elif self.selection_mode == SelectionMode.BANKER_AREA:
            self.positions['banker_area'] = position
        elif self.selection_mode == SelectionMode.CANCEL_BUTTON:
            self.positions['cancel_button'] = position
        elif self.selection_mode == SelectionMode.CHIP:
            # For chips, use the pending amount or get it from user
            if hasattr(self, '_pending_chip_amount'):
                amount = self._pending_chip_amount
                delattr(self, '_pending_chip_amount')  # Clear the pending amount
            else:
                # Fallback: get amount from user
                self._get_chip_amount_and_save(x, y)
                return
            
            # Save the chip position
            position = Position(x=x, y=y, width=50, height=50, name=f"chip_{amount}")
            
            # Check if chip already exists
            existing_chip = next((chip for chip in self.chips if chip.amount == amount), None)
            if existing_chip:
                existing_chip.position = position
            else:
                self.chips.append(ChipConfig(amount=amount, position=position))
            
            # Hide overlay and update UI
            self.overlay_window.withdraw()
            self.selection_mode = SelectionMode.NONE
            self._refresh_chips_list()
            
            # Show confirmation
            msg = messagebox.showinfo("Chip Added", f"Chip {amount} set at ({x}, {y})")
            # Bring the message box to front
            if self.selection_window:
                self.selection_window.lift()
                self.selection_window.focus_force()
            return
        
        # Hide overlay and update UI
        self.overlay_window.withdraw()
        self.selection_mode = SelectionMode.NONE
        self._update_status_displays()
        
        # Show confirmation
        msg = messagebox.showinfo("Position Set", f"Position set at ({x}, {y})")
        # Bring the message box to front
        if self.selection_window:
            self.selection_window.lift()
            self.selection_window.focus_force()
    
    def _get_chip_amount_and_save(self, x: int, y: int):
        """Get chip amount from user and save position (fallback method)"""
        amount = simpledialog.askinteger("Chip Amount", 
                                        "Enter the chip amount:",
                                        minvalue=1, maxvalue=999999999)
        if amount is not None:
            position = Position(x=x, y=y, width=50, height=50, name=f"chip_{amount}")
            
            # Check if chip already exists
            existing_chip = next((chip for chip in self.chips if chip.amount == amount), None)
            if existing_chip:
                existing_chip.position = position
            else:
                self.chips.append(ChipConfig(amount=amount, position=position))
            
            self.overlay_window.withdraw()
            self.selection_mode = SelectionMode.NONE
            self._refresh_chips_list()
            msg = messagebox.showinfo("Chip Added", f"Chip {amount} set at ({x}, {y})")
            # Bring the message box to front
            if self.selection_window:
                self.selection_window.lift()
                self.selection_window.focus_force()
    
    def _cancel_overlay(self):
        """Cancel overlay selection"""
        self.overlay_window.withdraw()
        self.selection_mode = SelectionMode.NONE
    
    def _add_custom_chip(self):
        """Add a custom chip with manual amount input"""
        amount = simpledialog.askinteger("Custom Chip", 
                                        "Enter the chip amount:",
                                        minvalue=1, maxvalue=999999999)
        if amount is not None:
            # Check if chip already exists
            if any(chip.amount == amount for chip in self.chips):
                msg = messagebox.showwarning("Duplicate Chip", f"Chip {amount} already exists!")
                # Bring the message box to front
                if self.selection_window:
                    self.selection_window.lift()
                    self.selection_window.focus_force()
                return
            
            # Store the amount for later position selection
            self._pending_chip_amount = amount
            # Start position selection for this chip
            self.selection_mode = SelectionMode.CHIP
            self._show_overlay_instructions()
    
    def _update_status_displays(self):
        """Update the status labels for each area"""
        if hasattr(self, 'player_status'):
            if 'player_area' in self.positions:
                pos = self.positions['player_area']
                self.player_status.config(text=f"({pos.x}, {pos.y})", fg="green")
            else:
                self.player_status.config(text="Not set", fg="red")
        
        if hasattr(self, 'banker_status'):
            if 'banker_area' in self.positions:
                pos = self.positions['banker_area']
                self.banker_status.config(text=f"({pos.x}, {pos.y})", fg="green")
            else:
                self.banker_status.config(text="Not set", fg="red")
        
        if hasattr(self, 'cancel_status'):
            if 'cancel_button' in self.positions:
                pos = self.positions['cancel_button']
                self.cancel_status.config(text=f"({pos.x}, {pos.y})", fg="green")
            else:
                self.cancel_status.config(text="Not set", fg="red")
    
    def _refresh_chips_list(self):
        """Refresh the chips list display"""
        # Clear existing widgets
        for widget in self.chips_frame.winfo_children():
            widget.destroy()
        
        # Sort chips by amount
        sorted_chips = sorted(self.chips, key=lambda x: x.amount)
        
        for chip in sorted_chips:
            chip_frame = tk.Frame(self.chips_frame)
            chip_frame.pack(fill="x", pady=2)
            
            # Chip amount
            tk.Label(chip_frame, text=f"{chip.amount:,}", width=12).pack(side="left")
            
            # Position
            pos_text = f"({chip.position.x}, {chip.position.y})"
            tk.Label(chip_frame, text=pos_text, width=15).pack(side="left")
            
            # Buttons
            tk.Button(chip_frame, text="Reselect", 
                     command=lambda c=chip: self._reselect_chip(c)).pack(side="right", padx=2)
            tk.Button(chip_frame, text="Remove", 
                     command=lambda c=chip: self._remove_chip(c)).pack(side="right", padx=2)
    
    def _reselect_chip(self, chip: ChipConfig):
        """Reselect position for a chip"""
        self.selection_mode = SelectionMode.CHIP
        self._show_overlay_instructions()
        # Store reference to chip being reselected
        self._reselecting_chip = chip
    
    def _remove_chip(self, chip: ChipConfig):
        """Remove a chip from the list"""
        if messagebox.askyesno("Remove Chip", f"Remove chip {chip.amount}?"):
            self.chips.remove(chip)
            self._refresh_chips_list()
            # Bring the message box to front
            if self.selection_window:
                self.selection_window.lift()
                self.selection_window.focus_force()
    
    def _save_and_close(self):
        """Save configuration and close selection window"""
        # Check if all required positions are set
        required_positions = ['player_area', 'banker_area', 'cancel_button']
        missing = [pos for pos in required_positions if pos not in self.positions]
        
        if missing:
            msg = messagebox.showwarning("Missing Positions", 
                                        f"Please set the following positions:\n{', '.join(missing)}")
            # Bring the message box to front
            if self.selection_window:
                self.selection_window.lift()
                self.selection_window.focus_force()
            return
        
        if not self.chips:
            msg = messagebox.showwarning("No Chips", "Please add at least one chip!")
            # Bring the message box to front
            if self.selection_window:
                self.selection_window.lift()
                self.selection_window.focus_force()
            return
        
        # Save configuration
        self.save_config()
        
        # Close windows
        if self.selection_window:
            self.selection_window.destroy()
        if self.overlay_window:
            self.overlay_window.destroy()
        
        # Call callback if provided
        if self.on_position_selected:
            self.on_position_selected()
        
        msg = messagebox.showinfo("Success", "Configuration saved successfully!")
        # Bring the message box to front
        if self.selection_window:
            self.selection_window.lift()
            self.selection_window.focus_force()
    
    def _cancel_selection(self):
        """Cancel the selection process"""
        if messagebox.askyesno("Cancel", "Are you sure you want to cancel? All changes will be lost."):
            if self.selection_window:
                self.selection_window.destroy()
            if self.overlay_window:
                self.overlay_window.destroy()
    
    def get_position(self, name: str) -> Optional[Position]:
        """Get a saved position by name"""
        return self.positions.get(name)
    
    def get_chip_position(self, amount: int) -> Optional[Position]:
        """Get position for a specific chip amount"""
        for chip in self.chips:
            if chip.amount == amount:
                return chip.position
        return None
    
    def get_all_chips(self) -> List[ChipConfig]:
        """Get all configured chips"""
        return self.chips.copy()
    
    def is_configured(self) -> bool:
        """Check if all required positions are configured"""
        required_positions = ['player_area', 'banker_area', 'cancel_button']
        return all(pos in self.positions for pos in required_positions) and len(self.chips) > 0 