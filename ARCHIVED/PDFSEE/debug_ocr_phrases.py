import fitz
from PIL import Image, ImageDraw, ImageFont
import io
import pytesseract
from datetime import datetime
import json

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

print("Debugging OCR Phrase Grouping")
print("=" * 60)

pdf_path = "RIO GRANDE REGIONAL/RG_SP_01.pdf"

# Open PDF and render at moderate scale
pdf = fitz.open(pdf_path)
page = pdf[0]

scale = 2.0  # Lower scale for faster testing
mat = fitz.Matrix(scale, scale)
pix = page.get_pixmap(matrix=mat)

print(f"Page size at scale {scale}: {pix.width} x {pix.height} pixels")

# Convert to PIL Image
img_data = pix.tobytes("png")
img = Image.open(io.BytesIO(img_data))

# Run OCR
print("\nRunning OCR...")
config = '--psm 6 --oem 1'
ocr_data = pytesseract.image_to_data(img, config=config, output_type=pytesseract.Output.DICT)

# Extract texts with positions
texts = []
for i in range(len(ocr_data['text'])):
    text = ocr_data['text'][i].strip()
    conf = int(ocr_data['conf'][i]) if ocr_data['conf'][i] != -1 else 0

    if text and conf > 30:
        texts.append({
            'text': text,
            'confidence': conf,
            'x': ocr_data['left'][i] / scale,
            'y': ocr_data['top'][i] / scale,
            'width': ocr_data['width'][i] / scale,
            'height': ocr_data['height'][i] / scale
        })

print(f"Found {len(texts)} raw texts with confidence > 30%")

# Debug: Show sample of raw texts
print("\nFirst 20 raw OCR texts:")
for i, t in enumerate(texts[:20]):
    print(f"  {i+1:3}. '{t['text']:30}' at ({t['x']:6.1f}, {t['y']:6.1f}) conf:{t['confidence']}%")

# Group texts into lines
def group_texts_debug(texts, y_tolerance=15, x_tolerance=100):
    """Group texts with detailed debugging"""

    # Sort texts by position
    texts = sorted(texts, key=lambda t: (t['y'], t['x']))

    # Group into lines
    lines = []
    current_line = []

    for i, text in enumerate(texts):
        if not current_line:
            current_line.append((i, text))
        else:
            last_text = current_line[-1][1]
            y_diff = abs(text['y'] - last_text['y'])

            if y_diff <= y_tolerance:
                current_line.append((i, text))
            else:
                if current_line:
                    lines.append(current_line)
                current_line = [(i, text)]

    if current_line:
        lines.append(current_line)

    print(f"\nGrouped into {len(lines)} lines with y_tolerance={y_tolerance}")

    # Show sample lines
    print("\nFirst 10 lines:")
    for i, line in enumerate(lines[:10]):
        line_texts = [item[1]['text'] for item in line]
        print(f"  Line {i+1}: {len(line)} words: {' '.join(line_texts[:5])}...")

    # Group words in each line into phrases
    all_phrases = []

    for line_num, line in enumerate(lines):
        # Sort by x position
        line.sort(key=lambda item: item[1]['x'])

        # Group adjacent words
        phrase_groups = []
        if line:
            current_phrase = [line[0]]

            for i in range(1, len(line)):
                prev_text = current_phrase[-1][1]
                curr_text = line[i][1]

                # Calculate gap
                x_gap = curr_text['x'] - (prev_text['x'] + prev_text.get('width', 0))

                if x_gap <= x_tolerance:
                    current_phrase.append(line[i])
                else:
                    if current_phrase:
                        phrase_groups.append(current_phrase)
                    current_phrase = [line[i]]

            if current_phrase:
                phrase_groups.append(current_phrase)

        # Create phrase entries
        for group in phrase_groups:
            if group:
                phrase_text = ' '.join([item[1]['text'] for item in group])
                avg_conf = sum(item[1]['confidence'] for item in group) / len(group)

                all_phrases.append({
                    'text': phrase_text,
                    'confidence': avg_conf,
                    'x': group[0][1]['x'],
                    'y': group[0][1]['y'],
                    'word_count': len(group),
                    'line_num': line_num
                })

    return all_phrases, lines

# Test grouping
phrases, lines = group_texts_debug(texts)

print(f"\nCreated {len(phrases)} phrases from {len(texts)} texts")
print(f"Average words per phrase: {sum(p['word_count'] for p in phrases)/len(phrases):.1f}" if phrases else "N/A")

# Show sample phrases
print("\nFirst 20 phrases:")
for i, p in enumerate(phrases[:20]):
    print(f"  {i+1:3}. '{p['text'][:50]:50}' ({p['word_count']} words, conf:{p['confidence']:.0f}%)")

# Identify potential room names
room_keywords = ['ROOM', 'RM', 'OFFICE', 'LAB', 'STOR', 'PREP', 'RECOVERY',
                 'WAIT', 'EXAM', 'TREAT', 'LOUNGE', 'LOBBY', 'RECEP', 'NURSE',
                 'STAFF', 'BREAK', 'CONF', 'MECH', 'ELEC', 'UTIL', 'CORR']

room_phrases = []
for phrase in phrases:
    text_upper = phrase['text'].upper()
    if any(keyword in text_upper for keyword in room_keywords):
        room_phrases.append(phrase)

print(f"\nFound {len(room_phrases)} phrases containing room keywords")
print("\nSample room phrases:")
for i, p in enumerate(room_phrases[:15]):
    print(f"  {i+1:3}. '{p['text'][:60]:60}'")

# Create visualization
print("\nCreating visualization...")
vis_img = img.copy()
draw = ImageDraw.Draw(vis_img)

# Draw all text boxes
for text in texts:
    x = text['x'] * scale
    y = text['y'] * scale
    w = text.get('width', 50) * scale
    h = text.get('height', 20) * scale

    # Draw box
    draw.rectangle([x, y, x+w, y+h], outline=(0, 100, 255), width=1)

# Draw phrase groupings (thicker boxes)
for phrase in phrases:
    x = phrase['x'] * scale
    y = phrase['y'] * scale

    # Estimate width based on text length
    w = len(phrase['text']) * 8 * scale
    h = 20 * scale

    # Check if it's a room phrase
    is_room = any(kw in phrase['text'].upper() for kw in room_keywords)
    color = (0, 255, 0) if is_room else (255, 165, 0)

    draw.rectangle([x, y, x+w, y+h], outline=color, width=2)

# Save visualization
output_file = "ocr_debug_visualization.png"
vis_img.save(output_file, quality=95)
print(f"\nSaved visualization to {output_file}")

# Save detailed results
results = {
    'timestamp': datetime.now().isoformat(),
    'scale': scale,
    'raw_texts': len(texts),
    'lines': len(lines),
    'phrases': len(phrases),
    'room_phrases': len(room_phrases),
    'sample_texts': texts[:50],
    'sample_phrases': phrases[:50],
    'sample_room_phrases': room_phrases[:30]
}

with open('ocr_debug_results.json', 'w') as f:
    json.dump(results, f, indent=2)

print("\nSaved detailed results to ocr_debug_results.json")
print("\n" + "=" * 60)
print("Debug Summary:")
print(f"  Raw texts: {len(texts)}")
print(f"  Lines: {len(lines)}")
print(f"  Phrases: {len(phrases)}")
print(f"  Room phrases: {len(room_phrases)}")
print("\nCheck ocr_debug_visualization.png to see the OCR results!")

pdf.close()