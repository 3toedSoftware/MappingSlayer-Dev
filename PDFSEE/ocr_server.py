from flask import Flask, request, jsonify, send_file, render_template_string
from flask_cors import CORS
import fitz
from PIL import Image, ImageEnhance, ImageFilter
import io
import pytesseract
import json
import base64
from datetime import datetime
import os

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

app = Flask(__name__)
CORS(app)

# Store the latest results globally
latest_results = None
pdf_image_data = None

@app.route('/')
def index():
    """Serve the interactive OCR tool"""
    with open('interactive_ocr_tool.html', 'r') as f:
        return f.read()

@app.route('/api/ocr', methods=['POST'])
def run_ocr():
    """Run OCR with specified parameters"""
    global latest_results, pdf_image_data

    try:
        # Handle both FormData and JSON requests
        if request.content_type and 'multipart/form-data' in request.content_type:
            # FormData with file upload
            params = request.form
            pdf_file = request.files.get('pdf')
        else:
            # JSON request (backward compatibility)
            params = request.json
            pdf_file = None

        # Extract parameters
        scale = float(params.get('scale', 2.5))
        psm = params.get('psm', '6')
        confidence_threshold = int(params.get('confidence', 30))
        preprocess = params.get('preprocess', 'normal')
        y_tolerance = int(params.get('yTolerance', 15))
        x_tolerance = int(params.get('xTolerance', 100))
        multiline_threshold = int(params.get('multilineThreshold', 40))

        print(f"Running OCR with scale={scale}, psm={psm}, conf={confidence_threshold}")

        # Handle PDF source
        if pdf_file:
            # Save uploaded file temporarily
            import tempfile
            temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
            pdf_file.save(temp_pdf.name)
            pdf_path = temp_pdf.name
            print(f"Using uploaded PDF: {pdf_file.filename}")
        else:
            # No PDF provided
            return jsonify({
                'success': False,
                'error': 'No PDF file provided. Please select a PDF file to analyze.'
            }), 400
        pdf = fitz.open(pdf_path)
        page = pdf[0]

        # Render page
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat)

        # Convert to PIL Image
        img_data = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_data))

        # Apply preprocessing
        if preprocess == 'high_contrast':
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(2.5)
        elif preprocess == 'sharpen':
            img = img.filter(ImageFilter.SHARPEN)
        elif preprocess == 'both':
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(2.0)
            img = img.filter(ImageFilter.SHARPEN)

        # Save image for display - use the same scale as OCR for accurate visualization
        # Only limit if it would be absurdly large
        display_scale = min(scale, 3.0) if scale > 3.0 else scale
        display_mat = fitz.Matrix(display_scale, display_scale)
        display_pix = page.get_pixmap(matrix=display_mat)
        display_img_data = display_pix.tobytes("png")
        pdf_image_data = base64.b64encode(display_img_data).decode('utf-8')

        # Run OCR
        config = f'--psm {psm} --oem 1'
        start_time = datetime.now()

        ocr_data = pytesseract.image_to_data(img, config=config, output_type=pytesseract.Output.DICT)

        # Extract texts
        texts = []
        for i in range(len(ocr_data['text'])):
            text = ocr_data['text'][i].strip()
            conf = int(ocr_data['conf'][i]) if ocr_data['conf'][i] != -1 else 0

            if text and conf >= confidence_threshold:
                texts.append({
                    'text': text,
                    'confidence': conf,
                    'x': ocr_data['left'][i] / scale,
                    'y': ocr_data['top'][i] / scale,
                    'width': ocr_data['width'][i] / scale,
                    'height': ocr_data['height'][i] / scale,
                    # For display, use display_scale
                    'display_x': ocr_data['left'][i] * display_scale / scale,
                    'display_y': ocr_data['top'][i] * display_scale / scale,
                    'display_width': ocr_data['width'][i] * display_scale / scale,
                    'display_height': ocr_data['height'][i] * display_scale / scale
                })

        # Group into phrases
        phrases = group_texts_into_phrases(texts, y_tolerance, x_tolerance)

        # Identify room names
        room_phrases = identify_room_names(phrases)

        # Find multiline
        multiline_count = sum(1 for p in room_phrases if p.get('multiline', False))

        elapsed = (datetime.now() - start_time).total_seconds()

        # Prepare results
        results = {
            'success': True,
            'rawTexts': len(texts),
            'phrases': len(phrases),
            'roomNames': len(room_phrases),
            'multiline': multiline_count,
            'processTime': round(elapsed, 1),
            'texts': texts[:500],  # Limit for browser performance
            'roomPhrases': room_phrases[:100],
            'pdfImage': pdf_image_data,
            'imageWidth': display_pix.width,
            'imageHeight': display_pix.height
        }

        latest_results = results
        pdf.close()

        # Clean up temporary file if one was created
        if pdf_file:
            import os
            try:
                os.unlink(pdf_path)
            except:
                pass

        return jsonify(results)

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def group_texts_into_phrases(texts, y_tolerance, x_tolerance):
    """Group texts into phrases"""
    if not texts:
        return []

    # Sort by position
    texts = sorted(texts, key=lambda t: (t['y'], t['x']))

    # Group into lines
    lines = []
    current_line = []

    for text in texts:
        if not current_line:
            current_line.append(text)
        else:
            if abs(text['y'] - current_line[-1]['y']) <= y_tolerance:
                current_line.append(text)
            else:
                if current_line:
                    lines.append(current_line)
                current_line = [text]

    if current_line:
        lines.append(current_line)

    # Create phrases from lines
    phrases = []
    for line in lines:
        line.sort(key=lambda t: t['x'])

        phrase_groups = []
        current_phrase = [line[0]]

        for i in range(1, len(line)):
            x_gap = line[i]['x'] - (current_phrase[-1]['x'] + current_phrase[-1].get('width', 0))

            if x_gap <= x_tolerance:
                current_phrase.append(line[i])
            else:
                phrase_groups.append(current_phrase)
                current_phrase = [line[i]]

        if current_phrase:
            phrase_groups.append(current_phrase)

        for group in phrase_groups:
            phrase_text = ' '.join(t['text'] for t in group)
            avg_conf = sum(t['confidence'] for t in group) / len(group)

            phrases.append({
                'text': phrase_text,
                'confidence': avg_conf,
                'x': group[0]['x'],
                'y': group[0]['y'],
                'display_x': group[0].get('display_x', group[0]['x']),
                'display_y': group[0].get('display_y', group[0]['y']),
                'word_count': len(group)
            })

    return phrases

def identify_room_names(phrases):
    """Identify which phrases are likely room names"""
    room_keywords = ['ROOM', 'RM', 'OFFICE', 'LAB', 'STOR', 'PREP', 'RECOVERY',
                     'WAIT', 'EXAM', 'TREAT', 'LOUNGE', 'LOBBY', 'RECEP', 'NURSE',
                     'STAFF', 'BREAK', 'CONF', 'MECH', 'ELEC', 'UTIL', 'CORR',
                     'VEST', 'BATH', 'SHOWER', 'LOCKER', 'CLEAN', 'BOILER']

    room_phrases = []
    for phrase in phrases:
        text_upper = phrase['text'].upper()

        # Check for room keywords
        is_room = any(keyword in text_upper for keyword in room_keywords)

        # Also check for patterns like "#1", "#2", etc.
        if not is_room and '#' in text_upper and any(c.isdigit() for c in text_upper):
            is_room = True

        if is_room:
            phrase['isRoom'] = True
            room_phrases.append(phrase)

    return room_phrases

@app.route('/api/export', methods=['GET'])
def export_results():
    """Export latest results as JSON"""
    if latest_results:
        return jsonify(latest_results)
    else:
        return jsonify({'error': 'No results available'}), 404

if __name__ == '__main__':
    print("=" * 60)
    print("OCR Server for Interactive Tool")
    print("=" * 60)
    print("\nStarting server...")
    print("Open your browser to: http://localhost:5000")
    print("\nPress Ctrl+C to stop the server")
    print("-" * 60)

    # Check if PDF exists
    if not os.path.exists("RIO GRANDE REGIONAL/RG_SP_01.pdf"):
        print("ERROR: PDF not found at RIO GRANDE REGIONAL/RG_SP_01.pdf")
        print("Please ensure the PDF is in the correct location.")
    else:
        print("PDF found. Ready for OCR processing.")

    app.run(debug=True, port=5000)