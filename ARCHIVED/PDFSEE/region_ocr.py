import fitz  # PyMuPDF
from PIL import Image
import io
import json

def extract_region_as_image(pdf_path, x, y, width, height, scale=3):
    """
    Extract a specific region from a PDF as an image for OCR

    Args:
        pdf_path: Path to PDF file
        x, y: Top-left corner of region
        width, height: Size of region
        scale: Zoom factor for better quality
    """
    pdf = fitz.open(pdf_path)
    page = pdf[0]

    # Create a clip rectangle for the region
    clip = fitz.Rect(x, y, x + width, y + height)

    # Create a high-resolution pixmap of just this region
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, clip=clip)

    # Convert to PIL Image
    img_data = pix.tobytes("png")
    img = Image.open(io.BytesIO(img_data))

    pdf.close()
    return img

def grid_scan_pdf(pdf_path, grid_size=200, overlap=50):
    """
    Divide PDF into overlapping grid cells for OCR processing

    Args:
        pdf_path: Path to PDF
        grid_size: Size of each grid cell in points
        overlap: Overlap between cells to catch text on boundaries
    """
    pdf = fitz.open(pdf_path)
    page = pdf[0]

    page_width = page.rect.width
    page_height = page.rect.height

    print(f"Page size: {page_width} x {page_height}")
    print(f"Grid size: {grid_size} x {grid_size} with {overlap}px overlap")

    # Calculate grid dimensions
    step = grid_size - overlap
    cols = int((page_width + overlap) / step)
    rows = int((page_height + overlap) / step)

    print(f"Grid: {cols} columns x {rows} rows = {cols * rows} cells")

    regions = []

    for row in range(rows):
        for col in range(cols):
            x = col * step
            y = row * step

            # Ensure we don't exceed page boundaries
            width = min(grid_size, page_width - x)
            height = min(grid_size, page_height - y)

            if width > 20 and height > 20:  # Skip tiny edge regions
                regions.append({
                    'row': row,
                    'col': col,
                    'x': x,
                    'y': y,
                    'width': width,
                    'height': height
                })

    pdf.close()
    return regions

def process_with_tesseract(image):
    """
    Process an image region with Tesseract OCR
    """
    try:
        import pytesseract

        # Try to find Tesseract
        tesseract_paths = [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]

        for path in tesseract_paths:
            import os
            if os.path.exists(path):
                pytesseract.pytesseract.tesseract_cmd = path
                break

        # Get text with confidence scores
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)

        # Filter for confident text
        results = []
        for i in range(len(data['text'])):
            text = data['text'][i].strip()
            conf = int(data['conf'][i]) if data['conf'][i] != -1 else 0

            if text and conf > 30:  # Confidence threshold
                results.append({
                    'text': text,
                    'confidence': conf,
                    'x': data['left'][i],
                    'y': data['top'][i],
                    'width': data['width'][i],
                    'height': data['height'][i]
                })

        return results

    except ImportError:
        return None
    except Exception as e:
        print(f"OCR error: {e}")
        return None

# Demo: Process a small section of the hospital floor plan
print("Region-based OCR approach for large PDFs")
print("=" * 60)

pdf_path = "RIO GRANDE REGIONAL/RG_SP_01.pdf"

# Example 1: Extract a specific region (you can adjust coordinates)
print("\nExample 1: Extract specific region")
print("-" * 40)

# Try a region that might contain text
sample_region = {
    'x': 500,  # Adjust these based on where text might be
    'y': 200,
    'width': 400,
    'height': 300
}

print(f"Extracting region: ({sample_region['x']}, {sample_region['y']}) "
      f"size: {sample_region['width']} x {sample_region['height']}")

img = extract_region_as_image(
    pdf_path,
    sample_region['x'],
    sample_region['y'],
    sample_region['width'],
    sample_region['height']
)

# Save the extracted region for inspection
img.save("sample_region.png")
print("Saved sample region to sample_region.png")

# Example 2: Grid scanning approach
print("\nExample 2: Grid scanning approach")
print("-" * 40)

# Create a grid of regions
regions = grid_scan_pdf(pdf_path, grid_size=300, overlap=50)

print(f"\nGenerated {len(regions)} regions to scan")
print("First 5 regions:")
for r in regions[:5]:
    print(f"  Region ({r['row']}, {r['col']}): "
          f"pos=({r['x']}, {r['y']}) size=({r['width']}, {r['height']})")

# Save grid configuration
with open("grid_regions.json", "w") as f:
    json.dump(regions, f, indent=2)

print("\nSaved grid configuration to grid_regions.json")

print("\n" + "=" * 60)
print("Benefits of this approach:")
print("1. Processes manageable chunks instead of entire massive PDF")
print("2. Can parallelize region processing")
print("3. OCR works better on smaller, focused regions")
print("4. Can apply different preprocessing per region")
print("5. Overlap ensures text on boundaries isn't missed")
print("\nNext steps:")
print("1. Process each region with OCR")
print("2. Stitch results based on coordinates")
print("3. Remove duplicates from overlapping regions")
print("4. Build complete text map of the PDF")