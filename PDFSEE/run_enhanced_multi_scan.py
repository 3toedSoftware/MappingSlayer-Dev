import json
import math
import fitz
from PIL import Image, ImageEnhance, ImageFilter
import io
import pytesseract
from datetime import datetime
import os

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
                    'scan_mode': preprocess_mode,
                    'region_id': f"{region['row']}_{region['col']}"
                })

        return texts
    except Exception as e:
        return []

def group_multiline_texts(texts, y_tolerance_range=(20, 2), x_tolerance=100):
    """Group texts using multi-pass approach with decreasing y_tolerance"""
    all_phrases = []
    used_indices = set()

    # Sort texts by position
    texts = sorted(texts, key=lambda t: (t['y'], t['x']))

    # Multi-pass with decreasing y_tolerance
    for y_tolerance in range(y_tolerance_range[0], y_tolerance_range[1]-1, -1):

        # Group texts into lines based on current y_tolerance
        lines = []
        current_line = []

        for i, text in enumerate(texts):
            if i in used_indices:
                continue

            if not current_line:
                current_line.append((i, text))
            else:
                # Check if this text is on the same line
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

            # Build phrases from unused words
            unused_in_line = [item for item in line if item[0] not in used_indices]

            if not unused_in_line:
                continue

            # Group adjacent words into phrases
            phrase_groups = []
            current_phrase = [unused_in_line[0]]

            for i in range(1, len(unused_in_line)):
                prev_text = current_phrase[-1][1]
                curr_text = unused_in_line[i][1]

                # Check if words are adjacent
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
                    'y_tolerance': y_tolerance
                }

                all_phrases.append(phrase_entry)

                # Mark these indices as used
                for item in group:
                    used_indices.add(item[0])

    return all_phrases

def identify_multiline_room_names(phrases, vertical_threshold=40, horizontal_threshold=120):
    """Identify room names that span multiple lines"""
    multiline_rooms = []
    used_phrases = set()

    # Sort phrases by position
    phrases = sorted(phrases, key=lambda p: (p['x'], p['y']))

    for i, phrase1 in enumerate(phrases):
        if i in used_phrases:
            continue

        # Look for vertically aligned phrases
        room_parts = [phrase1]
        used_phrases.add(i)

        for j, phrase2 in enumerate(phrases):
            if j <= i or j in used_phrases:
                continue

            # Check if phrases are vertically aligned
            x_diff = abs(phrase1['x'] - phrase2['x'])
            y_diff = phrase2['y'] - phrase1['y']

            if x_diff < horizontal_threshold and 0 < y_diff < vertical_threshold:
                # Check if it looks like a continuation
                if not is_room_code(phrase2['text']) or "RM" in phrase2['text'].upper():
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

    # Pure numbers
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

def deduplicate_room_names(room_names, position_threshold=20):
    """Deduplicate room names based on position"""
    unique_rooms = {}

    for room in room_names:
        # Create position key
        pos_key = f"{round(room['x']/position_threshold)}_{round(room['y']/position_threshold)}"

        # Keep highest confidence for each position
        if pos_key not in unique_rooms or unique_rooms[pos_key]['confidence'] < room['confidence']:
            unique_rooms[pos_key] = room

    return list(unique_rooms.values())

# Main execution
print("Enhanced Multi-Scan OCR with Multiline Recognition")
print("=" * 60)

pdf_path = "RIO GRANDE REGIONAL/RG_SP_01.pdf"
start_time = datetime.now()

# Define scan configurations
grid_offsets = [
    (0, 0, "original"),
    (150, 150, "offset_150"),
    (75, 75, "offset_75")
]

preprocess_modes = ['normal', 'high_contrast', 'sharpen']

all_raw_texts = []
scan_count = 0
total_scans = len(grid_offsets) * len(preprocess_modes)

print(f"Running {total_scans} scan combinations with enhanced multiline recognition...")
print("-" * 40)

# Run all scan combinations
for offset_x, offset_y, grid_name in grid_offsets:
    print(f"\nGrid: {grid_name} (offset {offset_x},{offset_y})")

    regions = scan_with_offset_grid(pdf_path, offset_x, offset_y)
    print(f"  Regions: {len(regions)}")

    for mode in preprocess_modes:
        scan_count += 1
        print(f"  Mode: {mode} (Scan {scan_count}/{total_scans})")

        scan_texts = []
        for i, region in enumerate(regions):
            if i % 20 == 0:
                print(f"    Processing region {i}/{len(regions)}...", end='\r')

            texts = extract_with_preprocessing(pdf_path, region, mode)
            if texts:
                scan_texts.extend(texts)

        print(f"    Found {len(scan_texts)} texts in this scan")
        all_raw_texts.extend(scan_texts)

print(f"\n\nTotal raw texts found: {len(all_raw_texts)}")

# Apply enhanced multiline grouping PER REGION
print("\nApplying enhanced multiline recognition...")
print("-" * 40)

# Group texts by region first
texts_by_region = {}
for text in all_raw_texts:
    region_id = text.get('region_id', 'unknown')
    if region_id not in texts_by_region:
        texts_by_region[region_id] = []
    texts_by_region[region_id].append(text)

print(f"Texts distributed across {len(texts_by_region)} regions")

# Process each region separately
all_phrases = []
for region_id, region_texts in texts_by_region.items():
    if region_texts:
        # Group texts within this region
        region_phrases = group_multiline_texts(region_texts)
        all_phrases.extend(region_phrases)

print(f"Created {len(all_phrases)} phrases after multi-pass grouping")

# Identify multiline room names
room_names = identify_multiline_room_names(all_phrases)
print(f"Identified {len(room_names)} potential room names")

# Filter for valid room names
valid_rooms = [r for r in room_names if is_valid_room_name(r['text'])]
print(f"Valid room names: {len(valid_rooms)}")

# Deduplicate
final_rooms = deduplicate_room_names(valid_rooms)
print(f"Final unique rooms: {len(final_rooms)}")

# Clean up room names
for room in final_rooms:
    room['text'] = room['text'].strip().replace('  ', ' ')

# Sort by confidence and multiline status
final_rooms.sort(key=lambda r: (-r.get('multiline', False), -r['confidence']))

# Save results
output_file = f"enhanced_multi_scan_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
with open(output_file, 'w') as f:
    json.dump({
        'scan_date': datetime.now().isoformat(),
        'total_scans': total_scans,
        'raw_texts': len(all_raw_texts),
        'grouped_phrases': len(all_phrases),
        'final_rooms': len(final_rooms),
        'rooms': final_rooms
    }, f, indent=2)

# Count multiline vs single line
multiline_count = sum(1 for r in final_rooms if r.get('multiline', False))
single_line_count = len(final_rooms) - multiline_count

elapsed = (datetime.now() - start_time).total_seconds()

print("\n" + "=" * 60)
print("ENHANCED MULTI-SCAN COMPLETE!")
print("=" * 60)
print(f"Results saved to: {output_file}")
print(f"Processing time: {elapsed:.1f} seconds ({elapsed/60:.1f} minutes)")
print(f"\nStatistics:")
print(f"  Total unique rooms: {len(final_rooms)}")
print(f"  Multiline rooms: {multiline_count}")
print(f"  Single-line rooms: {single_line_count}")
print(f"\nSample multiline room names found:")

# Show sample multiline rooms
multiline_samples = [r for r in final_rooms if r.get('multiline', False)][:10]
for i, room in enumerate(multiline_samples, 1):
    print(f"  {i:2}. '{room['text']:40}' ({room['parts']} lines, conf:{room['confidence']:.0f}%)")

print(f"\nSample single-line room names found:")
single_line_samples = [r for r in final_rooms if not r.get('multiline', False)][:10]
for i, room in enumerate(single_line_samples, 1):
    print(f"  {i:2}. '{room['text']:40}' (conf:{room['confidence']:.0f}%)")