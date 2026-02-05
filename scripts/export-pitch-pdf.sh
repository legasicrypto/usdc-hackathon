#!/bin/bash
# Export pitch deck to PDF using Chrome headless
# Usage: ./scripts/export-pitch-pdf.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INPUT="$PROJECT_DIR/docs/pitch.html"
OUTPUT="$PROJECT_DIR/docs/PITCH.pdf"

echo "📄 Exporting pitch deck to PDF..."

# Try different Chrome/Chromium paths
CHROME=""
for cmd in "google-chrome" "chromium" "chromium-browser" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$cmd" &> /dev/null || [ -x "$cmd" ]; then
        CHROME="$cmd"
        break
    fi
done

if [ -z "$CHROME" ]; then
    echo "❌ Chrome/Chromium not found."
    echo ""
    echo "Alternative: Open docs/pitch.html in a browser and print to PDF"
    echo "  1. Open: file://$INPUT"
    echo "  2. Press Ctrl+P (Cmd+P on Mac)"
    echo "  3. Save as PDF to: docs/PITCH.pdf"
    exit 1
fi

"$CHROME" --headless --disable-gpu --print-to-pdf="$OUTPUT" --no-margins "file://$INPUT" 2>/dev/null

if [ -f "$OUTPUT" ]; then
    echo "✅ PDF exported to: $OUTPUT"
    echo "   Size: $(du -h "$OUTPUT" | cut -f1)"
else
    echo "❌ PDF export failed"
    exit 1
fi
