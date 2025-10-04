import fitz
from PIL import Image, ImageEnhance, ImageFilter
import io
import json
import pytesseract
from datetime import datetime
import math
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

    # Higher resolution for certain modes
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
    config = '--psm 6'  # Default
    if preprocess_mode == 'sparse':
        config = '--psm 11'  # Sparse text

    try:
        ocr_data = pytesseract.image_to_data(img, config=config, output_type=pytesseract.Output.DICT)

        texts = []
        for i in range(len(ocr_data['text'])):
            text = ocr_data['text'][i].strip()
            conf = int(ocr_data['conf'][i]) if ocr_data['conf'][i] != -1 else 0

            if text and conf > 25:  # Lower threshold for multi-scan
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

def text_similarity(text1, text2):
    """Calculate similarity between two text strings"""
    if text1 == text2:
        return 1.0
    if text1 in text2 or text2 in text1:
        return 0.8

    # Character overlap
    common = sum(1 for c in text1 if c in text2)
    max_len = max(len(text1), len(text2))
    return common / max_len if max_len > 0 else 0

def deduplicate_texts(texts, position_threshold=15, similarity_threshold=0.7):
    """Smart deduplication based on position and text similarity"""

    groups = []
    used = set()

    for i, text1 in enumerate(texts):
        if i in used:
            continue

        group = [text1]
        used.add(i)

        for j, text2 in enumerate(texts):
            if j in used:
                continue

            # Check position proximity
            dist = math.sqrt((text1['x'] - text2['x'])**2 + (text1['y'] - text2['y'])**2)
            if dist < position_threshold:
                # Check text similarity
                sim = text_similarity(text1['text'], text2['text'])
                if sim >= similarity_threshold:
                    group.append(text2)
                    used.add(j)

        groups.append(group)

    # Select best from each group
    deduplicated = []
    for group in groups:
        # Prefer: highest confidence, then longest text
        best = max(group, key=lambda t: (t['confidence'], len(t['text'])))
        deduplicated.append(best)

    return deduplicated

def merge_adjacent_texts(texts, merge_threshold=35):
    """Merge texts that might be parts of the same room name"""
    merged = []
    used = set()

    for i, text1 in enumerate(texts):
        if i in used:
            continue

        parts = [text1]
        used.add(i)

        for j, text2 in enumerate(texts):
            if j in used:
                continue

            # Same line, close horizontally
            y_diff = abs(text1['y'] - text2['y'])
            x_diff = abs(text1['x'] - text2['x'])

            if y_diff < 5 and x_diff < merge_threshold:
                # Not already contained
                if not any(text2['text'] in p['text'] or p['text'] in text2['text'] for p in parts):
                    parts.append(text2)
                    used.add(j)

        if len(parts) > 1:
            parts.sort(key=lambda t: t['x'])
            merged_text = ' '.join(p['text'] for p in parts)
            avg_conf = sum(p['confidence'] for p in parts) / len(parts)

            merged.append({
                'text': merged_text,
                'x': parts[0]['x'],
                'y': parts[0]['y'],
                'confidence': avg_conf,
                'scan_mode': 'merged'
            })
        else:
            merged.append(text1)

    return merged

def is_valid_room_name(text):
    """Check if text is likely a room name"""
    t = text.strip()

    # Skip T-codes
    if t.startswith('T') and t[1:].isdigit():
        return False

    # Skip pure numbers
    if t.replace('.', '').replace(',', '').isdigit():
        return False

    # Skip single chars
    if len(t) < 2:
        return False

    # Must have some letters
    if not any(c.isalpha() for c in t):
        return False

    return True

# Main execution
print("Full Multi-Scan OCR with Deduplication")
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

print(f"Running {total_scans} scan combinations...")
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

        # Save intermediate results
        intermediate_file = f"scan_{grid_name}_{mode}.json"
        with open(intermediate_file, 'w') as f:
            json.dump(scan_texts, f)

print(f"\n\nTotal raw texts found: {len(all_raw_texts)}")

# Deduplication
print("\nDeduplicating texts...")
print("-" * 40)

# Step 1: Initial deduplication
deduplicated = deduplicate_texts(all_raw_texts)
print(f"After position/similarity dedup: {len(deduplicated)} texts")

# Step 2: Merge adjacent fragments
merged = merge_adjacent_texts(deduplicated)
print(f"After merging fragments: {len(merged)} texts")

# Step 3: Filter for valid room names
room_names = [t for t in merged if is_valid_room_name(t['text'])]
print(f"Valid room names: {len(room_names)} texts")

# Step 4: Final cleanup - remove low confidence duplicates
final_rooms = {}
for room in room_names:
    # Clean text
    text = room['text'].strip()
    text = text.replace('  ', ' ')

    # Position key for final dedup
    pos_key = f"{round(room['x']/20)}_{round(room['y']/20)}"

    if pos_key not in final_rooms or final_rooms[pos_key]['confidence'] < room['confidence']:
        final_rooms[pos_key] = {
            'name': text,
            'x': room['x'],
            'y': room['y'],
            'confidence': room['confidence']
        }

final_room_list = list(final_rooms.values())
print(f"Final unique rooms: {len(final_room_list)}")

# Save results
output_file = f"multi_scan_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
with open(output_file, 'w') as f:
    json.dump({
        'scan_date': datetime.now().isoformat(),
        'total_scans': total_scans,
        'raw_texts': len(all_raw_texts),
        'final_rooms': len(final_room_list),
        'rooms': final_room_list
    }, f, indent=2)

# Calculate improvement
if os.path.exists('real_room_names.json'):
    with open('real_room_names.json', 'r') as f:
        old_data = json.load(f)
        old_count = len(old_data.get('rooms', []))
        improvement = ((len(final_room_list) - old_count) / old_count * 100) if old_count > 0 else 0
        print(f"\nImprovement over single scan: {improvement:.1f}% ({old_count} -> {len(final_room_list)} rooms)")

elapsed = (datetime.now() - start_time).total_seconds()
print(f"\nTotal processing time: {elapsed:.1f} seconds ({elapsed/60:.1f} minutes)")

print("\n" + "=" * 60)
print("Multi-Scan Complete!")
print(f"Results saved to: {output_file}")
print("\nSample rooms found:")
for room in final_room_list[:20]:
    print(f"  '{room['name']:30}' at ({room['x']:6.1f}, {room['y']:6.1f}) conf:{room['confidence']:3.0f}%")