const fs = require('fs');
const path = require('path');

// Directory containing chip svgs
const CHIPS_DIR = path.join(__dirname, '../public/assets/chips');

// Base template file (use 1000.svg as base)
const TEMPLATE_PATH = path.join(CHIPS_DIR, '1000.svg');

// All chip amounts we need
const AMOUNTS = [
  10, 20, 100, 200, 1000, 2000, 3000, 5000, 10000, 20000, 25000, 50000, 125000,
  250000, 500000, 1000000, 1250000, 2500000, 5000000, 10000000, 50000000,
];

// Helper to format amount like 2000 -> '2K'
function formatLabel(amount) {
  if (amount >= 1000000) {
    const m = amount / 1000000;
    return Number.isInteger(m)
      ? `${m}M`
      : `${m.toFixed(2)}M`.replace(/0+$/, '');
  }
  if (amount >= 1000) {
    return `${amount / 1000}K`;
  }
  return amount.toString();
}

// Decide font-size based on label length
function fontSize(label) {
  const len = label.length;
  if (len <= 2) return 400;
  if (len === 3) return 360;
  if (len === 4) return 320;
  return 260;
}

function generateSvgContent(baseSvg, label) {
  return baseSvg
    .replace(/>\s*[0-9A-Za-z.]+\s*<\/text>/, `>${label}</text>`)
    .replace(/font-size:\s*\d+px;/, `font-size: ${fontSize(label)}px;`);
}

function main() {
  const baseSvg = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  AMOUNTS.forEach((amt) => {
    const fileName = path.join(CHIPS_DIR, `${amt}.svg`);
    const label = formatLabel(amt);
    const svgContent = generateSvgContent(baseSvg, label);
    fs.writeFileSync(fileName, svgContent, 'utf8');
    console.log(`Generated ${fileName}`);
  });
}

if (require.main === module) {
  main();
}
