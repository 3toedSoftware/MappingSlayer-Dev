import json
import fitz
from PIL import Image, ImageEnhance, ImageFilter
import io
import pytesseract
from datetime import datetime

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def scan_with_offset_grid(pdf_path, offset_x=0, offset_y=0, grid_size=300, overlap=50):
    """Scan with offset grid to catch boundary text"""
    pdf = fitz.open(pdf_path)
    page = pdf[0]

    regions = []
    step = grid_size - overlap

    # Start from offset position
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

def extract_with_preprocessing(pdf_path, region, preprocess_mode='normal'):
    """Extract region with different preprocessing"""
    pdf = fitz.open(pdf_path)
    page = pdf[0]

    # Create clip rectangle
    clip = fitz.Rect(region['x'], region['y'],
                     region['x'] + region['width'],
                     region['y'] + region['height'])

    # Higher resolution for better OCR
    scale = 4 if preprocess_mode == 'high_res' else 3
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, clip=clip)

    # Convert to PIL Image
    img_data = pix.tobytes("png")
    img = Image.open(io.BytesIO(img_data))

    pdf.close()

    # Apply preprocessing based on mode
    if preprocess_mode == 'high_contrast':
        # Increase contrast
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(2.0)
    elif preprocess_mode == 'sharpen':
        # Sharpen image
        img = img.filter(ImageFilter.SHARPEN)
    elif preprocess_mode == 'edge_enhance':
        # Edge enhancement for better character definition
        img = img.filter(ImageFilter.EDGE_ENHANCE)

    # Run OCR with different PSM modes
    psm_mode = 6  # Default: Uniform block of text
    if preprocess_mode == 'sparse':
        psm_mode = 11  # Sparse text mode
    elif preprocess_mode == 'single_line':
        psm_mode = 7  # Single text line mode

    config = f'--psm {psm_mode}'

    try:
        ocr_data = pytesseract.image_to_data(img, config=config, output_type=pytesseract.Output.DICT)

        texts = []
        for i in range(len(ocr_data['text'])):
            text = ocr_data['text'][i].strip()
            conf = int(ocr_data['conf'][i]) if ocr_data['conf'][i] != -1 else 0

            # Lower threshold for second pass
            min_conf = 25 if preprocess_mode != 'normal' else 30

            if text and conf > min_conf:
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
        print(f"OCR error in {preprocess_mode} mode: {e}")
        return []

print("Multi-Scan Strategy for Better Coverage")
print("=" * 60)

pdf_path = "RIO GRANDE REGIONAL/RG_SP_01.pdf"

# Strategy 1: Scan with offset grids to catch boundaries
print("\nStrategy 1: Offset Grid Scans")
print("-" * 40)

# Original grid
grid1 = scan_with_offset_grid(pdf_path, 0, 0)
print(f"Grid 1 (original): {len(grid1)} regions")

# Offset by half a grid cell
grid2 = scan_with_offset_grid(pdf_path, 150, 150)
print(f"Grid 2 (offset 150,150): {len(grid2)} regions")

# Different offset
grid3 = scan_with_offset_grid(pdf_path, 75, 75)
print(f"Grid 3 (offset 75,75): {len(grid3)} regions")

# Strategy 2: Different preprocessing modes
print("\nStrategy 2: Multiple Preprocessing Modes")
print("-" * 40)
modes = ['normal', 'high_contrast', 'sharpen', 'edge_enhance', 'sparse', 'high_res']
for mode in modes:
    print(f"  - {mode:15} : Targets different text characteristics")

# Demo scan with multiple strategies
print("\nDemo: Multi-strategy scan of sample regions")
print("-" * 40)

all_texts = []
sample_regions = grid1[:5]  # Just demo with 5 regions

for i, region in enumerate(sample_regions):
    print(f"\nRegion {i+1}:")

    # Try each preprocessing mode
    for mode in ['normal', 'high_contrast', 'sharpen']:
        texts = extract_with_preprocessing(pdf_path, region, mode)
        if texts:
            print(f"  {mode:15} : Found {len(texts)} texts")
            all_texts.extend(texts)

# Remove duplicates
print(f"\nTotal texts found: {len(all_texts)}")

# Deduplicate based on position and text
unique = {}
for text in all_texts:
    key = (text['text'], round(text['x']/10), round(text['y']/10))
    if key not in unique or unique[key]['confidence'] < text['confidence']:
        unique[key] = text

print(f"Unique texts after deduplication: {len(unique)}")

print("\n" + "=" * 60)
print("RECOMMENDATIONS:")
print("=" * 60)
print("""
1. Run 3 scans with different grid offsets:
   - Original position (0,0)
   - Offset by (150,150) - catches different boundaries
   - Offset by (75,75) - another boundary set

2. Use 3 preprocessing modes per region:
   - Normal: Standard OCR
   - High Contrast: For faded text
   - Sharpened: For blurry text

3. Combine results:
   - Merge all texts from all scans
   - Keep highest confidence for duplicates
   - Should increase coverage from 70% to 85-90%

4. Estimated time:
   - 3 grid layouts × 3 preprocessing = 9 passes
   - ~6-7 minutes total (vs 41 seconds for single pass)

Would you like me to run the full multi-scan?
""")