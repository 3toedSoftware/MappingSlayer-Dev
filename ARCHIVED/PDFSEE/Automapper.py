import os
import csv
import fitz  # PyMuPDF
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor
import requests
import json
import time

# LLM API Configuration
class LLMConfig:
    """Configuration for the LLM API."""
    def __init__(self, api_url, api_key, model_name="gpt-4", max_retries=3, retry_delay=2):
        self.api_url = api_url
        self.api_key = api_key
        self.model_name = model_name
        self.max_retries = max_retries
        self.retry_delay = retry_delay

def query_llm(config, text, debug_log):
    """
    Query the LLM to determine the sign type for a given text.
    Returns a dictionary with SignType and FullMessage.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.api_key}"
    }
    
    # Construct prompt for the LLM
    prompt = f"""Analyze the following text from a map or blueprint and determine the most appropriate sign type.
    
Text: "{text}"

Respond in JSON format with two fields:
1. SignType: The category of sign this text represents (e.g. EXIT, NOTICE, WARNING, DIRECTION)
2. FullMessage: A standardized version of this message that would be appropriate for a sign

Example response format:
{{
    "SignType": "EXIT",
    "FullMessage": "Exit Here"
}}
"""
    
    payload = {
        "model": config.model_name,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"}
    }
    
    for attempt in range(config.max_retries):
        try:
            response = requests.post(config.api_url, headers=headers, json=payload)
            response.raise_for_status()
            
            # Parse the response
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "{}")
            
            # Parse the JSON content
            try:
                data = json.loads(content)
                return {
                    "SignType": data.get("SignType", "UNKNOWN"),
                    "FullMessage": data.get("FullMessage", text)
                }
            except json.JSONDecodeError:
                debug_log.append(f"Failed to parse JSON from LLM response for text: {text}")
                debug_log.append(f"Raw response: {content}")
                # Return a default in case of parsing failure
                return {
                    "SignType": "UNKNOWN",
                    "FullMessage": text
                }
                
        except requests.exceptions.RequestException as e:
            debug_log.append(f"API request failed (attempt {attempt+1}/{config.max_retries}): {str(e)}")
            if attempt < config.max_retries - 1:
                time.sleep(config.retry_delay)
    
    # If all retries failed, return a default
    debug_log.append(f"All API requests failed for text: {text}")
    return {
        "SignType": "UNKNOWN",
        "FullMessage": text
    }

# Helper Functions

def read_st_csv(filename):
    """Read the MASTER_ST.csv file into a dictionary mapping SignType to DotColor."""
    data = {}
    with open(filename, mode='r', encoding='utf-8') as file:
        csv_reader = csv.DictReader(file)
        for row in csv_reader:
            sign_type = row['SignType'].strip()
            dot_color = f"#{row['DotColor'].strip()}"
            data[sign_type] = dot_color
    return data

def hex_to_rgb(hex_color):
    """Convert a hex color code to an RGB tuple for PyMuPDF."""
    hex_color = hex_color.lstrip('#')
    lv = len(hex_color)
    return tuple(int(hex_color[i:i + lv // 3], 16) / 255.0 for i in range(0, lv, lv // 3))

def create_legend_pdf(legend_data, filename):
    """Create a legend PDF showing dot colors and sign types."""
    c = canvas.Canvas(filename, pagesize=letter)
    width, height = letter
    y_position = height - 40
    
    # Draw title
    c.setFont("Helvetica-Bold", 16)
    c.drawString(30, height - 30, "LEGEND")
    
    # Draw legend items
    c.setFont("Helvetica", 12)
    for color_hex, details in legend_data.items():
        color = HexColor(color_hex)
        num_dots, sign_type = details
        c.setFillColor(color)
        c.circle(30, y_position, 10, stroke=0, fill=1)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(50, y_position - 5, f"({num_dots}) - {sign_type}")
        y_position -= 20
    
    # Add red box example for UNKNOWN types if present
    unknown_present = any(details[1] == "UNKNOWN" for details in legend_data.values())
    if unknown_present:
        y_position -= 10  # Add some extra space
        
        # Draw a sample red box
        c.setStrokeColorRGB(1, 0, 0)  # Red
        c.setFillColorRGB(1, 1, 1, 0.1)  # Transparent fill
        c.setLineWidth(2)
        box_width = 60
        box_height = 20
        c.rect(30, y_position - 15, box_width, box_height)
        
        # Add text explanation
        c.setFillColorRGB(0, 0, 0)
        c.drawString(100, y_position - 5, "- Text with UNKNOWN sign type")
    
    c.save()

def draw_circle(page, center_x, center_y, radius, color_rgb, number):
    """Draw a filled circle with a number on the PDF page."""
    circle_rect = fitz.Rect(center_x - radius, center_y - radius, center_x + radius, center_y + radius)
    page.draw_oval(circle_rect, color=color_rgb, fill=color_rgb, width=0)
    number_str = f"{number:04d}"
    font_size = radius * 1.0
    text_color = (1, 1, 1)  # White text
    fontname = "helvetica"
    font = fitz.Font(fontname=fontname)
    text_width = font.text_length(number_str, fontsize=font_size)
    max_width = 2 * radius * 0.8
    if text_width > max_width and text_width > 0:
        font_size = font_size * max_width / text_width
    text_height = font_size * 0.7
    baseline_y = center_y + (text_height / 4)
    text_rect = fitz.Rect(center_x - text_width / 2, baseline_y - text_height,
                         center_x + text_width / 2, baseline_y + text_height)
    page.insert_textbox(text_rect, number_str, fontsize=font_size, fontname=fontname,
                       color=text_color, align=fitz.TEXT_ALIGN_CENTER)

def draw_page_legend(page, legend_data):
    """Draw a legend directly on a PDF page showing dot colors and sign types for that page."""
    # Position the legend in the top-right corner
    page_rect = page.rect
    margin = 20
    x_start = page_rect.x1 - 150 - margin  # Right side of page with margin
    y_start = page_rect.y0 + margin  # Top of page with margin
    
    y_position = y_start
    
    # Sort legend items by count (descending)
    sorted_items = sorted(legend_data.items(), key=lambda x: x[1][0], reverse=True)
    
    # Draw background rectangle for the legend
    # Add extra height if UNKNOWN type is present to show the red box example
    unknown_present = any(details[1] == "UNKNOWN" for _, details in legend_data.items())
    extra_height = 30 if unknown_present else 0
    legend_height = len(sorted_items) * 20 + 30 + extra_height  # Added extra height for title and maybe UNKNOWN note
    legend_width = 150
    legend_rect = fitz.Rect(x_start - 10, y_start - 10, 
                           x_start + legend_width, y_start + legend_height)
    page.draw_rect(legend_rect, color=(0, 0, 0), fill=(1, 1, 1))  # White fill with black border
    
    # Add "LEGEND" header - use insert_textbox instead of insert_text with align
    font_size = 12
    title_rect = fitz.Rect(x_start, y_position - 5, x_start + legend_width, y_position + 15)
    page.insert_textbox(title_rect, "LEGEND", fontsize=font_size, fontname="helvetica-bold", 
                      color=(0, 0, 0), align=1)  # 1 = centered text
    y_position += 20
    
    # Draw legend items
    for color_hex, details in sorted_items:
        num_dots, sign_type = details
        
        # Draw dot
        color_rgb = hex_to_rgb(color_hex)
        circle_radius = 5
        circle_center_x = x_start + 10
        circle_center_y = y_position + 5
        circle_rect = fitz.Rect(circle_center_x - circle_radius, circle_center_y - circle_radius,
                               circle_center_x + circle_radius, circle_center_y + circle_radius)
        page.draw_oval(circle_rect, color=color_rgb, fill=color_rgb, width=0)
        
        # Draw text - no align parameter
        text_x = x_start + 25
        text_y = y_position + 8
        page.insert_text((text_x, text_y), f"({num_dots}) - {sign_type}", fontsize=8, 
                        fontname="helvetica", color=(0, 0, 0))
        
        y_position += 20
    
    # Add red box example if UNKNOWN type is present
    if unknown_present:
        y_position += 5  # Add a little space
        
        # Draw a sample red box
        box_width = 40
        box_height = 15
        box_x = x_start + 10
        box_y = y_position
        red_box = fitz.Rect(box_x, box_y, box_x + box_width, box_y + box_height)
        page.draw_rect(red_box, color=(1, 0, 0), width=1.5)
        
        # Add text explanation
        text_x = x_start + box_width + 15
        text_y = y_position + box_height/2 + 3
        page.insert_text((text_x, text_y), "UNKNOWN types", fontsize=8, 
                        fontname="helvetica", color=(0, 0, 0))
        
        y_position += 20

def process_all_pdfs(map_folder, llm_config, st_data, default_color_hex, output_folder, debug_log):
    """Process all PDFs by running all 10 passes on each page before moving to the next page."""
    found_phrases = set()
    annotated_locations = set()
    remaining_text = []
    legend_data = {}  # Global legend data
    dot_number = 1
    message_schedule = []
    first_dot_radius = None  # Store the radius of the first dot for consistent sizing
    
    # Create marked_pdfs folder
    marked_pdfs_folder = os.path.join(output_folder, "marked_pdfs")
    if not os.path.exists(marked_pdfs_folder):
        os.makedirs(marked_pdfs_folder)
        debug_log.append(f"Created marked_pdfs folder at {marked_pdfs_folder}")
    
    # Create a cache to store LLM responses to avoid redundant API calls
    llm_cache = {}
    
    for pdf_file in os.listdir(map_folder):
        if pdf_file.endswith(".pdf"):
            try:
                debug_log.append(f"Processing file: {pdf_file}")
                pdf_path = os.path.join(map_folder, pdf_file)
                pdf_document = fitz.open(pdf_path)
                
                # Dictionary to store per-page legend data for this PDF
                page_legend_data = {}
                
                # Process each page completely before moving to the next
                for page_num in range(pdf_document.page_count):
                    page = pdf_document.load_page(page_num)
                    words = page.get_text("words")
                    
                    # Initialize legend data for this page
                    page_legend_data[page_num] = {}
                    
                    # Track all words that have been annotated across all passes for this page
                    page_used_word_indices = set()
                    
                    # Process with multiple passes of decreasing y_tolerance
                    for y_tolerance in range(10, 0, -1):
                        print(f"Processing page {page_num + 1} of {pdf_file} with y_tolerance = {y_tolerance}")
                        debug_log.append(f"Processing page {page_num + 1} of {pdf_file} with y_tolerance = {y_tolerance}")
                        
                        # Group words into lines based on current y_tolerance
                        lines = []
                        current_line = []
                        for word in words:
                            if not current_line or abs(word[1] - current_line[-1][1]) <= y_tolerance:
                                current_line.append(word)
                            else:
                                lines.append(current_line)
                                current_line = [word]
                        if current_line:
                            lines.append(current_line)
                        
                        # Find all potential phrases for this y_tolerance
                        potential_phrases = []
                        
                        # For each line, identify potential phrases
                        for line_idx, line in enumerate(lines):
                            line.sort(key=lambda w: w[0])  # Sort words left to right
                            
                            # Consider sequences of words as potential phrases
                            line_words = [word[4] for word in line]
                            
                            # Look for phrases of varying lengths (1 to 5 words)
                            max_phrase_length = min(5, len(line_words))
                            for phrase_length in range(1, max_phrase_length + 1):
                                for i in range(len(line_words) - phrase_length + 1):
                                    # Create the phrase
                                    phrase_words = line_words[i:i+phrase_length]
                                    phrase = " ".join(phrase_words)
                                    
                                    # Calculate bounding box
                                    bbox = fitz.Rect(line[i][0:4])
                                    for j in range(i+1, i+phrase_length):
                                        bbox |= fitz.Rect(line[j][0:4])
                                    
                                    # Store the word indices
                                    word_indices = []
                                    for j in range(i, i+phrase_length):
                                        try:
                                            word_indices.append(words.index(line[j]))
                                        except ValueError:
                                            debug_log.append(f"Warning: Could not find word index for '{line[j][4]}'")
                                            continue
                                    
                                    potential_phrases.append({
                                        'phrase': phrase,
                                        'bbox': bbox,
                                        'word_indices': word_indices,
                                        'length': phrase_length,
                                        'line_index': line_idx,
                                        'position_in_line': i
                                    })
                        
                        # Sort potential phrases by length (longest first)
                        potential_phrases.sort(key=lambda m: (-m['length'], m['line_index'], m['position_in_line']))
                        debug_log.append(f"Page {page_num+1}, y_tolerance={y_tolerance}: Found {len(potential_phrases)} potential phrases")
                        
                        # Apply annotations based on prioritized phrases
                        pass_used_word_indices = set()
                        
                        for phrase_info in potential_phrases:
                            # Skip if any word in this phrase is already used in previous passes
                            if any(idx in page_used_word_indices for idx in phrase_info['word_indices']):
                                continue
                            
                            # Skip if any word in this phrase is already used in this pass
                            if any(idx in pass_used_word_indices for idx in phrase_info['word_indices']):
                                continue
                            
                            # This is a valid phrase - get sign type from LLM or cache
                            phrase = phrase_info['phrase']
                            bbox = phrase_info['bbox']
                            
                            # Check if we've already queried this phrase
                            if phrase in llm_cache:
                                debug_log.append(f"Using cached LLM result for '{phrase}'")
                                sign_data = llm_cache[phrase]
                            else:
                                # Query the LLM for this phrase
                                debug_log.append(f"Querying LLM for phrase: '{phrase}'")
                                sign_data = query_llm(llm_config, phrase, debug_log)
                                llm_cache[phrase] = sign_data  # Cache the result
                            
                            # Get sign type and full message
                            sign_type = sign_data['SignType']
                            full_message = sign_data['FullMessage']
                            
                            # If sign type is UNKNOWN, draw a red box around the text
                            if sign_type == "UNKNOWN":
                                # Add some padding around the text
                                padding = 3
                                red_box = fitz.Rect(
                                    bbox.x0 - padding,
                                    bbox.y0 - padding,
                                    bbox.x1 + padding,
                                    bbox.y1 + padding
                                )
                                # Draw a red box with a 1.5 line width
                                red_color = (1, 0, 0)  # RGB for red
                                page.draw_rect(red_box, color=red_color, width=1.5)
                                debug_log.append(f"Drew red box around unknown phrase: '{phrase}'")
                            
                            # Calculate dot position and size
                            average_height = (bbox.y1 - bbox.y0)
                            
                            # Use standard dot size if we have one, otherwise calculate and store it
                            if first_dot_radius is None:
                                first_dot_radius = average_height * 1  # dot_multiplier
                                debug_log.append(f"Set standard dot radius to {first_dot_radius:.2f} pixels")
                            
                            # Use the standard dot size for all dots
                            radius = first_dot_radius
                            
                            center_x = (bbox.x0 + bbox.x1) / 2
                            center_y = bbox.y0 - 1.05 * radius
                            
                            # Create a unique location key
                            location_key = f"{pdf_file}-{page_num}-{center_x:.2f}-{center_y:.2f}"
                            if location_key in annotated_locations:
                                debug_log.append(f"Skipping duplicate annotation for '{phrase}' at {location_key}")
                                continue
                            
                            # Get color for this sign type
                            color_hex = st_data.get(sign_type, default_color_hex)
                            color_rgb = hex_to_rgb(color_hex)
                            
                            # Draw the dot
                            draw_circle(page, center_x, center_y, radius, color_rgb, dot_number)
                            
                            # Update tracking information
                            message_schedule.append({
                                'SignType': sign_type,
                                'Message': full_message,
                                'Number': f"{dot_number:04d}",
                                'PDFPage': page_num + 1,
                                'PDFFile': pdf_file
                            })
                            
                            dot_number += 1
                            found_phrases.add(phrase)
                            annotated_locations.add(location_key)
                            debug_log.append(f"Annotated: {phrase} with dot {dot_number-1}")
                            
                            # Update global legend data
                            if color_hex in legend_data:
                                legend_data[color_hex][0] += 1
                            else:
                                legend_data[color_hex] = [1, sign_type]
                                
                            # Update page-specific legend data
                            if color_hex in page_legend_data[page_num]:
                                page_legend_data[page_num][color_hex][0] += 1
                            else:
                                page_legend_data[page_num][color_hex] = [1, sign_type]
                            
                            # Mark all words in this phrase as used
                            for idx in phrase_info['word_indices']:
                                pass_used_word_indices.add(idx)
                                page_used_word_indices.add(idx)
                    
                    # After all passes for this page, collect remaining text
                    all_words_set = set(range(len(words)))
                    unmatched_indices = all_words_set - page_used_word_indices
                    for idx in sorted(unmatched_indices):
                        if words[idx][4].strip():  # Only add non-empty words
                            remaining_text.append(words[idx][4])
                    
                    # Draw the per-page legend after all annotations are done
                    if page_legend_data[page_num]:  # Only draw legend if there are annotations on this page
                        draw_page_legend(page, page_legend_data[page_num])
                        debug_log.append(f"Added legend to page {page_num + 1} with {sum(item[0] for item in page_legend_data[page_num].values())} dots")
                
                # Save the marked PDF after all pages are processed
                new_pdf_path = os.path.join(marked_pdfs_folder, f"marked_{pdf_file}")
                pdf_document.save(new_pdf_path)
                debug_log.append(f"Saved marked PDF: {new_pdf_path}")
                pdf_document.close()  # Close after saving
                
            except Exception as e:
                debug_log.append(f"Error processing {pdf_file}: {e}")
                print(f"Error processing {pdf_file}: {e}")
    
    return dot_number, found_phrases, annotated_locations, remaining_text, legend_data, message_schedule

def extract_sign_type_pages(legend_data, source_pdf_path, output_pdf_path, debug_log):
    """Extract relevant sign type pages from MASTER_TYPICALS_INTERIOR.pdf."""
    sign_types = {details[1] for details in legend_data.values()}
    if not os.path.isfile(source_pdf_path):
        debug_log.append(f"Source PDF not found: {source_pdf_path}")
        print(f"Error: Source PDF not found at {source_pdf_path}")
        return
    src_pdf = fitz.open(source_pdf_path)
    bookmarks = src_pdf.get_toc(simple=True)
    bookmark_dict = {title.strip(): page_num - 1 for level, title, page_num in bookmarks}
    pages_to_include = [bookmark_dict[sign_type] for sign_type in sign_types if sign_type in bookmark_dict]
    if not pages_to_include:
        debug_log.append("No sign types found in source PDF bookmarks")
        print("No sign types found in source PDF bookmarks")
        return
    output_pdf = fitz.open()
    for page_num in sorted(set(pages_to_include)):
        output_pdf.insert_pdf(src_pdf, from_page=page_num, to_page=page_num)
        debug_log.append(f"Added page {page_num + 1} to output PDF")
    output_pdf.save(output_pdf_path)
    debug_log.append(f"Created AM_SignTypes PDF at {output_pdf_path}")

def main():
    """Main function to process PDFs and generate outputs with page-by-page multipass approach."""
    try:
        script_dir = os.getcwd()
        output_folder = os.path.join(script_dir, "OUTPUT")
        if not os.path.exists(output_folder):
            os.makedirs(output_folder)
        debug_log = [f"Script directory: {script_dir}"]

        # Determine MAPS folder
        maps_folder_env = os.environ.get('MAPS_FOLDER')
        map_folder = maps_folder_env if maps_folder_env and os.path.isdir(maps_folder_env) else os.path.join(script_dir, "MAPS")
        debug_log.append(f"Using MAPS folder: {map_folder}")

        # Define file paths
        master_st_file = os.path.join(script_dir, "MASTER_ST.csv")
        master_typicals_file = os.path.join(script_dir, "MASTER_TYPICALS_INTERIOR.pdf")
        am_signtypes_output = os.path.join(output_folder, "AM_SignTypes.pdf")

        # Check for required files
        required_files = [master_st_file, master_typicals_file]
        for file_path in required_files:
            if not os.path.isfile(file_path):
                debug_log.append(f"Required file not found: {file_path}")
                print(f"Error: Required file not found at {file_path}")
                return

        # Configure LLM API
        api_url = os.environ.get('LLM_API_URL', 'https://api.openai.com/v1/chat/completions')
        api_key = os.environ.get('LLM_API_KEY', '')
        model_name = os.environ.get('LLM_MODEL_NAME', 'gpt-4')
        
        if not api_key:
            debug_log.append("LLM_API_KEY environment variable not set")
            print("Error: LLM_API_KEY environment variable not set")
            return
            
        llm_config = LLMConfig(api_url, api_key, model_name)
        debug_log.append(f"Using LLM API URL: {api_url}")
        debug_log.append(f"Using LLM model: {model_name}")

        # Load ST data
        st_data = read_st_csv(master_st_file)
        default_color_hex = "#000000"  # Black as default color

        # Check MAPS folder
        if not os.path.isdir(map_folder):
            debug_log.append(f"MAPS folder not found: {map_folder}")
            print(f"Error: MAPS folder not found at {map_folder}")
            return

        # Process all PDFs with the new page-by-page multipass approach
        print("Starting PDF processing with page-by-page multipass approach")
        debug_log.append("Starting PDF processing with page-by-page multipass approach")
        dot_number, found_phrases, annotated_locations, remaining_text, legend_data, message_schedule = process_all_pdfs(
            map_folder, llm_config, st_data, default_color_hex, output_folder, debug_log
        )
        print(f"PDF processing complete. Found {len(found_phrases)} unique phrases.")
        debug_log.append(f"PDF processing complete. Found {len(found_phrases)} unique phrases.")

        # Write remaining text
        remaining_text_file = os.path.join(output_folder, "remaining_text.txt")
        with open(remaining_text_file, 'w', encoding='utf-8') as file:
            for text in remaining_text:
                file.write(f"{text}\n")
        debug_log.append(f"Wrote remaining text to: {remaining_text_file}")

        # Write message schedule
        message_schedule_file = os.path.join(output_folder, "AM-Message Schedule.csv")
        with open(message_schedule_file, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = ['SignType', 'Message', 'Number', 'PDFPage', 'PDFFile']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for entry in message_schedule:
                writer.writerow(entry)
        debug_log.append(f"Wrote message schedule to: {message_schedule_file}")

        # Create legend PDF
        legend_pdf_file = os.path.join(output_folder, "legend.pdf")
        create_legend_pdf(legend_data, legend_pdf_file)
        debug_log.append(f"Created legend PDF at {legend_pdf_file}")

        # Extract sign type pages
        extract_sign_type_pages(legend_data, master_typicals_file, am_signtypes_output, debug_log)

    except Exception as e:
        debug_log.append(f"Unexpected error in main: {e}")
        print(f"Unexpected error: {e}")
    finally:
        # Write debug log
        debug_log_file = os.path.join(output_folder, "debug_log.txt")
        with open(debug_log_file, 'w', encoding='utf-8') as file:
            for line in debug_log:
                file.write(f"{line}\n")
        print(f"Debug log written to: {debug_log_file}")

if __name__ == "__main__":
    main()