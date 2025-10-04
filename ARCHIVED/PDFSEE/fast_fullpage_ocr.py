import fitz
from PIL import Image
import io
import pytesseract
from datetime import datetime
import json
from multiprocessing import Pool, cpu_count
import os

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def process_page_ocr(args):
    """Process a single page with OCR - designed for multiprocessing"""
    pdf_path, page_num, scale, preprocess_mode = args

    try:
        print(f"  Processing page {page_num + 1} with {preprocess_mode} mode at scale {scale}...")

        # Open PDF and get page
        pdf = fitz.open(pdf_path)
        page = pdf[page_num]

        # Render entire page at high resolution
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat)

        # Convert to PIL Image (using BMP for speed - no compression)
        img_data = pix.tobytes("png")  # PyMuPDF doesn't support BMP directly
        img = Image.open(io.BytesIO(img_data))

        pdf.close()

        # Apply preprocessing if needed
        if preprocess_mode == 'high_contrast':
            from PIL import ImageEnhance
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(2.5)
        elif preprocess_mode == 'sharpen':
            from PIL import ImageFilter
            img = img.filter(ImageFilter.SHARPEN)

        # Configure Tesseract for maximum performance
        # --oem 1 = LSTM neural net mode (best accuracy)
        # tessedit_do_invert=0 = don't invert image
        # OMP_THREAD_LIMIT = use multiple threads
        num_threads = min(8, cpu_count())  # Use up to 8 threads per OCR task
        config = f'--psm 6 --oem 1 -c tessedit_do_invert=0 -c OMP_THREAD_LIMIT={num_threads}'

        # Run OCR
        ocr_data = pytesseract.image_to_data(img, config=config, output_type=pytesseract.Output.DICT)

        # Extract text with positions
        texts = []
        for i in range(len(ocr_data['text'])):
            text = ocr_data['text'][i].strip()
            conf = int(ocr_data['conf'][i]) if ocr_data['conf'][i] != -1 else 0

            if text and conf > 30:  # Slightly higher threshold for full-page
                actual_x = ocr_data['left'][i] / scale
                actual_y = ocr_data['top'][i] / scale

                texts.append({
                    'text': text,
                    'confidence': conf,
                    'x': actual_x,
                    'y': actual_y,
                    'width': ocr_data['width'][i] / scale,
                    'height': ocr_data['height'][i] / scale,
                    'page': page_num,
                    'mode': preprocess_mode
                })

        print(f"  Page {page_num + 1} complete: {len(texts)} texts found")
        return texts

    except Exception as e:
        print(f"  Error processing page {page_num + 1}: {e}")
        return []

def group_multiline_texts_fast(texts, y_tolerance=15, x_tolerance=100):
    """
    Fast text grouping - simpler approach
    """
    all_phrases = []

    # Sort texts by position for consistent processing
    texts = sorted(texts, key=lambda t: (t['y'], t['x']))

    # Group texts into lines based on y_tolerance
    lines = []
    current_line = []

    for i, text in enumerate(texts):
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

        # Group adjacent words into phrases
        phrase_groups = []
        current_phrase = [line[0]]

        for i in range(1, len(line)):
            prev_text = current_phrase[-1][1]
            curr_text = line[i][1]

            # Check if words are adjacent
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
                'word_count': len(group)
            }

            all_phrases.append(phrase_entry)

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
                if not is_room_code(phrase2['text']) or any(word in phrase2['text'].upper() for word in ['RM', 'ROOM', 'OFFICE', 'LAB']):
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

    # Check for room-related keywords
    room_keywords = ['ROOM', 'RM', 'OFFICE', 'LAB', 'STOR', 'PREP', 'RECOVERY',
                     'WAIT', 'EXAM', 'TREAT', 'LOUNGE', 'LOBBY', 'RECEP', 'NURSE',
                     'STAFF', 'BREAK', 'CONF', 'MECH', 'ELEC', 'UTIL', 'CORR',
                     'VEST', 'BATH', 'SHOWER', 'LOCKER', 'JANITOR', 'CLEAN']

    # Bonus points for room keywords
    for keyword in room_keywords:
        if keyword in t.upper():
            return True

    # Otherwise check if it's reasonably clean text
    alnum = sum(1 for c in t if c.isalnum() or c in ' .,#-/()')
    if alnum >= len(t) * 0.6:  # At least 60% alphanumeric
        return True

    return False

def deduplicate_rooms(rooms, position_threshold=25):
    """Deduplicate room names based on position"""
    unique_rooms = {}

    for room in rooms:
        # Create position key
        pos_key = f"{round(room['x']/position_threshold)}_{round(room['y']/position_threshold)}"

        # Keep highest confidence for each position
        if pos_key not in unique_rooms or unique_rooms[pos_key]['confidence'] < room['confidence']:
            unique_rooms[pos_key] = room

    return list(unique_rooms.values())

# Main execution
if __name__ == "__main__":
    print("Fast Full-Page OCR with Hardware Optimization")
    print("=" * 60)

    pdf_path = "RIO GRANDE REGIONAL/RG_SP_01.pdf"
    start_time = datetime.now()

    # Check system info
    cores = cpu_count()
    print(f"System: {cores} CPU cores available")
    print(f"Using multiprocessing for maximum speed\n")

    # Open PDF to get page count
    pdf = fitz.open(pdf_path)
    page_count = pdf.page_count
    pdf.close()

    print(f"PDF has {page_count} page(s)")

    # Configuration
    scale = 4.0  # High resolution with your 64GB RAM
    preprocess_modes = ['normal', 'high_contrast']  # Just 2 modes for speed

    print(f"Scale: {scale}x (full page at high resolution)")
    print(f"Modes: {', '.join(preprocess_modes)}")
    print("-" * 40)

    # Prepare tasks for parallel processing
    tasks = []
    for page_num in range(page_count):
        for mode in preprocess_modes:
            tasks.append((pdf_path, page_num, scale, mode))

    print(f"\nProcessing {len(tasks)} tasks in parallel...")

    # Process all pages in parallel
    with Pool(processes=min(cores, 4)) as pool:  # Limit to 4 processes to avoid memory issues
        results = pool.map(process_page_ocr, tasks)

    # Flatten results
    all_texts = []
    for result in results:
        if result:
            all_texts.extend(result)

    print(f"\nTotal texts found: {len(all_texts)}")

    # Apply multi-pass text grouping
    print("\nApplying Automapper-style multi-pass grouping...")
    phrases = group_multiline_texts_fast(all_texts)
    print(f"Created {len(phrases)} phrases")

    # Identify multiline room names
    print("\nIdentifying multiline room names...")
    room_names = identify_multiline_room_names(phrases)
    print(f"Found {len(room_names)} potential room names")

    # Filter for valid room names
    valid_rooms = [r for r in room_names if is_valid_room_name(r['text'])]
    print(f"Valid room names: {len(valid_rooms)}")

    # Deduplicate
    final_rooms = deduplicate_rooms(valid_rooms)
    print(f"Final unique rooms: {len(final_rooms)}")

    # Clean up text
    for room in final_rooms:
        room['text'] = room['text'].strip().replace('  ', ' ')

    # Sort by confidence and multiline status
    final_rooms.sort(key=lambda r: (-r.get('multiline', False), -r['confidence']))

    # Count statistics
    multiline_count = sum(1 for r in final_rooms if r.get('multiline', False))
    single_line_count = len(final_rooms) - multiline_count

    elapsed = (datetime.now() - start_time).total_seconds()

    # Save results
    output_file = f"fast_fullpage_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump({
            'scan_date': datetime.now().isoformat(),
            'processing_time': elapsed,
            'scale': scale,
            'modes': preprocess_modes,
            'raw_texts': len(all_texts),
            'grouped_phrases': len(phrases),
            'final_rooms': len(final_rooms),
            'multiline_rooms': multiline_count,
            'single_line_rooms': single_line_count,
            'rooms': final_rooms
        }, f, indent=2)

    print("\n" + "=" * 60)
    print("FAST FULL-PAGE OCR COMPLETE!")
    print("=" * 60)
    print(f"Processing time: {elapsed:.1f} seconds")
    print(f"Speed: {len(all_texts)/elapsed:.0f} texts/second")
    print(f"\nResults:")
    print(f"  Total unique rooms: {len(final_rooms)}")
    print(f"  Multiline rooms: {multiline_count}")
    print(f"  Single-line rooms: {single_line_count}")

    print(f"\nTop 10 high-confidence multiline room names:")
    multiline_samples = [r for r in final_rooms if r.get('multiline', False)][:10]
    for i, room in enumerate(multiline_samples, 1):
        print(f"  {i:2}. '{room['text'][:50]:50}' ({room['parts']} lines, {room['confidence']:.0f}%)")

    print(f"\nTop 10 high-confidence single-line room names:")
    single_samples = [r for r in final_rooms if not r.get('multiline', False)][:10]
    for i, room in enumerate(single_samples, 1):
        print(f"  {i:2}. '{room['text'][:50]:50}' ({room['confidence']:.0f}%)")

    print(f"\nResults saved to: {output_file}")