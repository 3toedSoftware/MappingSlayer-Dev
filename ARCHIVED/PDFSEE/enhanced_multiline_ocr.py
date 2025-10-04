import json
import math
import fitz
from PIL import Image, ImageEnhance, ImageFilter
import io
import pytesseract
from datetime import datetime

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def scan_with_offset_grid(pdf_path, offset_x=0, offset_y=0, grid_size=300, overlap=50):
    """Create grid with offset for better coverage"""
    pdf = fitz.open(pdf_path)
    page = pdf[0]

    regions = []
    step = grid_size - overlap

    y = offset_y
    row = 0
    while y < page.rect.height:
        x = offset_x
        col = 0
        while x < page.rect.width:
            width = min(grid_size, page.rect.width - x)
            height = min(grid_size, page.rect.height - y)

            if width > 20 and height > 20:
                regions.append({
                    'row': row,
                    'col': col,
                    'x': x,
                    'y': y,
                    'width': width,
                    'height': height
                })
            x += step
            col += 1
        y += step
        row += 1

    pdf.close()
    return regions

def extract_with_preprocessing(pdf_path, region, preprocess_mode='normal', scale=3):
    """Extract region with different preprocessing"""
    pdf = fitz.open(pdf_path)
    page = pdf[0]

    clip = fitz.Rect(region['x'], region['y'],
                     region['x'] + region['width'],
                     region['y'] + region['height'])

    if preprocess_mode == 'high_res':
        scale = 4

    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, clip=clip)
    img_data = pix.tobytes("png")
    img = Image.open(io.BytesIO(img_data))
    pdf.close()

    # Apply preprocessing
    if preprocess_mode == 'high_contrast':
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.0)
    elif preprocess_mode == 'sharpen':
        img = img.filter(ImageFilter.SHARPEN)

    # OCR configuration
    config = '--psm 6'
    if preprocess_mode == 'sparse':
        config = '--psm 11'

    try:
        ocr_data = pytesseract.image_to_data(img, config=config, output_type=pytesseract.Output.DICT)

        texts = []
        for i in range(len(ocr_data['text'])):
            text = ocr_data['text'][i].strip()
            conf = int(ocr_data['conf'][i]) if ocr_data['conf'][i] != -1 else 0

            if text and conf > 25:
                actual_x = region['x'] + (ocr_data['left'][i] / scale)
                actual_y = region['y'] + (ocr_data['top'][i] / scale)

                texts.append({
                    'text': text,
                    'confidence': conf,
                    'x': actual_x,
                    'y': actual_y,
                    'width': ocr_data['width'][i] / scale,
                    'height': ocr_data['height'][i] / scale,
                    'scan_mode': preprocess_mode
                })

        return texts
    except Exception as e:
        return []

def group_multiline_texts(texts, y_tolerance_range=(10, 1), x_tolerance=50):
    """
    Group texts using multi-pass approach with decreasing y_tolerance
    Inspired by Automapper.py's approach
    """
    all_phrases = []
    used_indices = set()

    # Sort texts by position for consistent processing
    texts = sorted(texts, key=lambda t: (t['y'], t['x']))

    # Multi-pass with decreasing y_tolerance (like Automapper.py)
    for y_tolerance in range(y_tolerance_range[0], y_tolerance_range[1]-1, -1):
        pass_phrases = []

        # Group texts into lines based on current y_tolerance
        lines = []
        current_line = []

        for i, text in enumerate(texts):
            if i in used_indices:
                continue

            if not current_line:
                current_line.append((i, text))
            else:
                # Check if this text is on the same line (within y_tolerance)
                last_text = current_line[-1][1]
                if abs(text['y'] - last_text['y']) <= y_tolerance:
                    current_line.append((i, text))
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = [(i, text)]

        if current_line:
            lines.append(current_line)

        # Process each line to create phrases
        for line in lines:
            # Sort by x position within the line
            line.sort(key=lambda item: item[1]['x'])

            # Skip if all words in line are already used
            if all(item[0] in used_indices for item in line):
                continue

            # Build phrases from unused words in this line
            unused_in_line = [item for item in line if item[0] not in used_indices]

            if not unused_in_line:
                continue

            # Group adjacent words into phrases (considering x_tolerance)
            phrase_groups = []
            current_phrase = [unused_in_line[0]]

            for i in range(1, len(unused_in_line)):
                prev_text = current_phrase[-1][1]
                curr_text = unused_in_line[i][1]

                # Check if words are adjacent (within x_tolerance)
                x_gap = curr_text['x'] - (prev_text['x'] + prev_text.get('width', 0))

                if x_gap <= x_tolerance:
                    current_phrase.append(unused_in_line[i])
                else:
                    if current_phrase:
                        phrase_groups.append(current_phrase)
                    current_phrase = [unused_in_line[i]]

            if current_phrase:
                phrase_groups.append(current_phrase)

            # Create phrase entries
            for group in phrase_groups:
                if not group:
                    continue

                # Combine texts
                phrase_text = ' '.join([item[1]['text'] for item in group])

                # Calculate average confidence and position
                avg_conf = sum(item[1]['confidence'] for item in group) / len(group)
                min_x = min(item[1]['x'] for item in group)
                min_y = min(item[1]['y'] for item in group)
                max_x = max(item[1]['x'] + item[1].get('width', 0) for item in group)
                max_y = max(item[1]['y'] + item[1].get('height', 0) for item in group)

                phrase_entry = {
                    'text': phrase_text,
                    'confidence': avg_conf,
                    'x': min_x,
                    'y': min_y,
                    'width': max_x - min_x,
                    'height': max_y - min_y,
                    'word_count': len(group),
                    'y_tolerance': y_tolerance,
                    'indices': [item[0] for item in group]
                }

                pass_phrases.append(phrase_entry)

                # Mark these indices as used
                for item in group:
                    used_indices.add(item[0])

        all_phrases.extend(pass_phrases)

    return all_phrases

def identify_multiline_room_names(phrases, vertical_threshold=30, horizontal_threshold=100):
    """
    Identify room names that span multiple lines
    """
    multiline_rooms = []
    used_phrases = set()

    # Sort phrases by position
    phrases = sorted(phrases, key=lambda p: (p['x'], p['y']))

    for i, phrase1 in enumerate(phrases):
        if i in used_phrases:
            continue

        # Look for vertically aligned phrases that might be part of the same room name
        room_parts = [phrase1]
        used_phrases.add(i)

        for j, phrase2 in enumerate(phrases):
            if j <= i or j in used_phrases:
                continue

            # Check if phrases are vertically aligned (similar x position)
            x_diff = abs(phrase1['x'] - phrase2['x'])
            y_diff = abs(phrase2['y'] - (phrase1['y'] + phrase1.get('height', 0)))

            if x_diff < horizontal_threshold and y_diff < vertical_threshold:
                # Check if it looks like a continuation (not a new room)
                if not is_room_code(phrase2['text']):
                    room_parts.append(phrase2)
                    used_phrases.add(j)

        # Combine multi-line room name
        if len(room_parts) > 1:
            # Sort by y position
            room_parts.sort(key=lambda p: p['y'])
            combined_text = ' '.join(p['text'] for p in room_parts)
            avg_conf = sum(p['confidence'] for p in room_parts) / len(room_parts)

            multiline_rooms.append({
                'text': combined_text,
                'confidence': avg_conf,
                'x': room_parts[0]['x'],
                'y': room_parts[0]['y'],
                'parts': len(room_parts),
                'multiline': True
            })
        else:
            # Single line room
            multiline_rooms.append({
                'text': phrase1['text'],
                'confidence': phrase1['confidence'],
                'x': phrase1['x'],
                'y': phrase1['y'],
                'parts': 1,
                'multiline': False
            })

    return multiline_rooms

def is_room_code(text):
    """Check if text is a T-code or number"""
    t = text.strip()

    # T-codes
    if t.startswith('T') and len(t) > 1 and t[1:].replace('.', '').isdigit():
        return True

    # Pure numbers (square footage, etc.)
    if t.replace('.', '').replace(',', '').replace(' ', '').isdigit():
        return True

    return False

def is_valid_room_name(text):
    """Check if text is likely a room name"""
    t = text.strip()

    # Skip codes and numbers
    if is_room_code(t):
        return False

    # Skip single chars
    if len(t) < 2:
        return False

    # Must have some letters
    if not any(c.isalpha() for c in t):
        return False

    # Skip if mostly special characters
    alnum = sum(1 for c in t if c.isalnum() or c in ' .,#-/')
    if alnum < len(t) * 0.5:
        return False

    return True

# Main execution
if __name__ == "__main__":
    print("Enhanced Multi-line OCR with Automapper-inspired approach")
    print("=" * 60)

    pdf_path = "RIO GRANDE REGIONAL/RG_SP_01.pdf"
    start_time = datetime.now()

    # Quick test with one region
    print("Testing enhanced multiline recognition...")

    # Get a sample region
    regions = scan_with_offset_grid(pdf_path, 0, 0)
    test_region = regions[20]  # Test with region 20

    # Extract texts
    texts = extract_with_preprocessing(pdf_path, test_region, 'normal')
    print(f"Found {len(texts)} individual text items")

    # Group using multi-pass approach
    phrases = group_multiline_texts(texts)
    print(f"Created {len(phrases)} phrases after multi-pass grouping")

    # Identify multiline room names
    room_names = identify_multiline_room_names(phrases)
    print(f"Identified {len(room_names)} room names")

    # Show results
    print("\nSample room names found:")
    for room in room_names:
        if is_valid_room_name(room['text']):
            multiline_indicator = " [MULTILINE]" if room['multiline'] else ""
            print(f"  '{room['text']:40}' conf:{room['confidence']:3.0f}%{multiline_indicator}")

    elapsed = (datetime.now() - start_time).total_seconds()
    print(f"\nProcessing time: {elapsed:.2f} seconds")

    print("\n" + "=" * 60)
    print("Key improvements from Automapper.py approach:")
    print("1. Multi-pass with decreasing y_tolerance (10 to 1)")
    print("2. Tracks used words to prevent double-processing")
    print("3. Builds phrases of varying lengths")
    print("4. Handles vertical alignment for multiline room names")