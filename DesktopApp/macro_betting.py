import time
from typing import Dict, List, Optional, Tuple, Callable
from macro_interface import MacroInterface, Position
from cv_utils import click_center

class MacroBaccarat:
    def __init__(self, macro_interface: MacroInterface, logger: Optional[Callable[[str], None]] = None):
        self.macro = macro_interface
        self.logger = logger
        self.last_bet_composition = []  # Track the last bet composition for cancel logic
    
    def log(self, msg: str) -> None:
        if self.logger:
            self.logger(msg)
    
    def is_configured(self) -> bool:
        """Check if all required positions are configured"""
        return self.macro.is_configured()
    
    def get_bet_area_position(self, side: str) -> Optional[Position]:
        """Get the position for a bet area"""
        if side == 'Player':
            return self.macro.get_position('player_area')
        elif side == 'Banker':
            return self.macro.get_position('banker_area')
        return None
    
    def get_chip_position(self, amount: int) -> Optional[Position]:
        """Get the position for a specific chip amount"""
        return self.macro.get_chip_position(amount)
    
    def get_cancel_button_position(self) -> Optional[Position]:
        """Get the position for the cancel button"""
        return self.macro.get_position('cancel_button')
    
    def compose_amount(self, target: int) -> Optional[List[int]]:
        """Find the best combination of chips to reach the target amount"""
        available_chips = [chip.amount for chip in self.macro.get_all_chips()]
        available_chips.sort(reverse=True)
        
        # Dynamic programming to find the best combination
        dp = {0: []}
        for t in range(1, target + 1):
            for chip in available_chips:
                if t - chip in dp:
                    dp[t] = dp[t - chip] + [chip]
                    break
        return dp.get(target)
    
    def place_bet(self, amount: int, side: str) -> Tuple[bool, str]:
        """Place a bet using macro positions"""
        self.log(f"Place bet start: amount={amount}, side={side}")
        
        # Validate inputs
        if side not in ('Player', 'Banker'):
            self.log("Error: invalid_side")
            return False, 'invalid_side'
        
        if amount <= 0:
            self.log("Error: invalid_amount")
            return False, 'invalid_amount'
        
        # Check if configured
        if not self.is_configured():
            self.log("Error: not_configured")
            return False, 'not_configured'
        
        # Get bet area position
        area_pos = self.get_bet_area_position(side)
        if not area_pos:
            self.log(f"Error: bet_area_not_found ({side})")
            return False, 'bet_area_not_found'
        
        # Check if any chips are configured
        available_chips = self.macro.get_all_chips()
        if not available_chips:
            self.log("Error: no_chips_configured")
            return False, 'no_chips_configured'
        
        # Try to find exact chip first
        chip_pos = self.get_chip_position(amount)
        if chip_pos:
            self.log(f"Exact chip found: {amount} at ({chip_pos.x},{chip_pos.y})")
            # Track bet composition for cancel logic
            self.last_bet_composition = [amount]
            # Click chip first
            self.log(f"Clicking chip at coordinates: ({chip_pos.x},{chip_pos.y})")
            click_center((chip_pos.x, chip_pos.y, chip_pos.width, chip_pos.height))
            time.sleep(0.05)
            # Then click bet area
            self.log(f"Clicking bet area at coordinates: ({area_pos.x},{area_pos.y})")
            click_center((area_pos.x, area_pos.y, area_pos.width, area_pos.height))
            self.log("Click sequence completed (exact chip)")
            return True, 'ok'
        
        # Compose amount using available chips
        plan = self.compose_amount(amount)
        if not plan:
            self.log("Error: cannot_compose_amount")
            return False, 'cannot_compose_amount'
        
        # Track bet composition for cancel logic
        self.last_bet_composition = plan.copy()
        
        self.log(f"Chip composition plan: {plan}")
        
        # Group chips by amount and click them in sequence
        chip_groups = {}
        for chip_amount in plan:
            if chip_amount not in chip_groups:
                chip_groups[chip_amount] = 0
            chip_groups[chip_amount] += 1
        
        self.log(f"Chip groups: {chip_groups}")
        
        # For each unique chip amount, click the chip once, then click bet area multiple times
        for chip_amount, count in chip_groups.items():
            chip_pos = self.get_chip_position(chip_amount)
            if not chip_pos:
                self.log(f"Error: chip_not_found ({chip_amount})")
                return False, 'chip_not_found'
            
            # Click the chip once
            self.log(f"Clicking chip {chip_amount} at ({chip_pos.x},{chip_pos.y})")
            click_center((chip_pos.x, chip_pos.y, chip_pos.width, chip_pos.height))
            time.sleep(0.05)
            
            # Click bet area 'count' times for this chip
            for i in range(count):
                self.log(f"Clicking bet area for chip {chip_amount} ({i+1}/{count})")
                click_center((area_pos.x, area_pos.y, area_pos.width, area_pos.height))
                time.sleep(0.05)
        
        self.log("Click sequence completed (composed chips)")
        return True, 'ok'
    
    def cancel_bet(self) -> Tuple[bool, str]:
        """Cancel bet using macro position"""
        cancel_pos = self.get_cancel_button_position()
        if not cancel_pos:
            self.log("Error: cancel_button_not_configured")
            return False, 'cancel_button_not_configured'
        
        self.log(f"Clicking cancel button at ({cancel_pos.x},{cancel_pos.y})")
        
        # Calculate how many times to click cancel based on the last bet composition
        if self.last_bet_composition:
            # Each chip in the bet requires one cancel click
            clicks_needed = len(self.last_bet_composition)
            self.log(f"Last bet composition: {self.last_bet_composition}, need {clicks_needed} cancel clicks")
        else:
            # Default fallback if no bet history
            clicks_needed = 3
            self.log(f"No bet history, using default {clicks_needed} cancel clicks")
        
        # Click cancel button the calculated number of times
        for i in range(clicks_needed):
            click_center((cancel_pos.x, cancel_pos.y, cancel_pos.width, cancel_pos.height))
            time.sleep(0.05)
        
        self.log(f"Cancel: clicked {clicks_needed} time(s)")
        return True, 'ok'
    
    def test_chip_click(self, amount: int) -> bool:
        """Test clicking a specific chip amount"""
        chip_pos = self.get_chip_position(amount)
        if not chip_pos:
            self.log(f"Test: chip {amount} not found")
            return False
        
        self.log(f"Test: clicking chip {amount} at ({chip_pos.x},{chip_pos.y})")
        self.log(f"Test: About to click at coordinates: ({chip_pos.x},{chip_pos.y}) with size ({chip_pos.width},{chip_pos.height})")
        click_center((chip_pos.x, chip_pos.y, chip_pos.width, chip_pos.height))
        self.log(f"Test: Click completed for chip {amount}")
        return True 