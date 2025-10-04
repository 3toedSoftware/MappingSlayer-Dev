import fitz  # PyMuPDF
from PIL import Image
import io
import json
import os
from datetime import datetime
import pytesseract

# Set Tesseract path
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def extract_and_ocr_region(pdf_path, region, scale=3):
    """Extract a region from PDF and run OCR on it"""
    pdf = fitz.open(pdf_path)
    page = pdf[0]

    # Create clip rectangle
    clip = fitz.Rect(region['x'], region['y'],
                     region['x'] + region['width'],
                     region['y'] + region['height'])

    # Extract as high-res image
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, clip=clip)

    # Convert to PIL Image
    img_data = pix.tobytes("png")
    img = Image.open(io.BytesIO(img_data))

    pdf.close()

    # Run OCR with data extraction
    ocr_data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)

    # Extract text with confidence > 30%
    texts = []
    for i in range(len(ocr_data['text'])):
        text = ocr_data['text'][i].strip()
        conf = int(ocr_data['conf'][i]) if ocr_data['conf'][i] != -1 else 0

        if text and conf > 30:
            # Calculate actual position in PDF coordinates
            actual_x = region['x'] + (ocr_data['left'][i] / scale)
            actual_y = region['y'] + (ocr_data['top'][i] / scale)

            texts.append({
                'text': text,
                'confidence': conf,
                'x': actual_x,
                'y': actual_y,
                'width': ocr_data['width'][i] / scale,
                'height': ocr_data['height'][i] / scale,
                'region_row': region['row'],
                'region_col': region['col']
            })

    return texts

print("Full PDF Scan with OCR")
print("=" * 60)

pdf_path = "RIO GRANDE REGIONAL/RG_SP_01.pdf"

# Load grid
print("Loading grid configuration...")
with open("grid_regions.json", 'r') as f:
    regions = json.load(f)

print(f"Grid has {len(regions)} regions to scan")

# Process all regions
all_texts = []
start_time = datetime.now()

print("\nStarting scan...")
for i, region in enumerate(regions):
    print(f"\rProcessing region {i+1}/{len(regions)} "
          f"(row {region['row']}, col {region['col']})...", end='', flush=True)

    texts = extract_and_ocr_region(pdf_path, region)

    if texts:
        all_texts.extend(texts)

    # Show progress every 10 regions
    if (i + 1) % 10 == 0:
        elapsed = (datetime.now() - start_time).seconds
        rate = (i + 1) / elapsed if elapsed > 0 else 0
        remaining = (len(regions) - i - 1) / rate if rate > 0 else 0
        print(f" | Found {len(all_texts)} texts | ETA: {remaining:.0f}s", end='', flush=True)

print(f"\n\nScan complete in {(datetime.now() - start_time).seconds} seconds!")

# Remove duplicates from overlapping regions
print("\nRemoving duplicates...")
unique_texts = []
seen = set()

for text_item in all_texts:
    # Create key based on text and approximate position
    key = (text_item['text'],
           round(text_item['x'] / 10),
           round(text_item['y'] / 10))

    if key not in seen:
        seen.add(key)
        unique_texts.append(text_item)

print(f"Found {len(unique_texts)} unique text items (removed {len(all_texts) - len(unique_texts)} duplicates)")

# Save results
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
output_file = f"full_scan_results_{timestamp}.json"

with open(output_file, 'w') as f:
    json.dump({
        'pdf_file': pdf_path,
        'scan_date': timestamp,
        'total_regions': len(regions),
        'total_texts': len(unique_texts),
        'texts': unique_texts
    }, f, indent=2)

print(f"\nResults saved to {output_file}")

# Show statistics
print("\n" + "=" * 60)
print("SCAN STATISTICS:")
print(f"  Total regions scanned: {len(regions)}")
print(f"  Total text items found: {len(all_texts)}")
print(f"  Unique text items: {len(unique_texts)}")
print(f"  Average texts per region: {len(all_texts) / len(regions):.1f}")

# Show sample of what was found
print("\nSample text found (first 20 unique items):")
for text in unique_texts[:20]:
    print(f"  '{text['text']:20}' at ({text['x']:6.1f}, {text['y']:6.1f}) conf:{text['confidence']:3d}%")

# Identify room codes
room_codes = [t for t in unique_texts if t['text'].startswith('T') and len(t['text']) > 2]
print(f"\nFound {len(room_codes)} potential room codes (T-codes)")

# Save simplified version for easy viewing
simple_output = "scan_summary.txt"
with open(simple_output, 'w') as f:
    f.write("PDF SCAN SUMMARY\n")
    f.write("=" * 60 + "\n")
    f.write(f"Scanned: {pdf_path}\n")
    f.write(f"Date: {timestamp}\n")
    f.write(f"Total unique texts: {len(unique_texts)}\n")
    f.write("\n" + "=" * 60 + "\n")
    f.write("ROOM CODES FOUND:\n")
    f.write("-" * 40 + "\n")

    for code in sorted(room_codes, key=lambda x: x['text']):
        f.write(f"{code['text']} at ({code['x']:.0f}, {code['y']:.0f})\n")

print(f"\nSummary saved to {simple_output}")
print("\nScan complete! Next: Create room database and visualization.")