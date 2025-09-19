import json
import re
from collections import defaultdict

print("Extracting Real Room Names from OCR Data")
print("=" * 60)

# Load the scan results
import glob
scan_files = glob.glob("full_scan_results_*.json")
latest_scan = sorted(scan_files)[-1]
print(f"Loading: {latest_scan}")

with open(latest_scan, 'r') as f:
    scan_data = json.load(f)

texts = scan_data['texts']
print(f"Processing {len(texts)} text items...")

# Group texts by proximity to build multi-line room names
def group_nearby_texts(texts, distance_threshold=30):
    """Group texts that are close together (for multi-line room names)"""
    groups = []
    used = set()

    for i, text1 in enumerate(texts):
        if i in used:
            continue

        # Start a new group
        group = [text1]
        used.add(i)

        # Find nearby texts
        for j, text2 in enumerate(texts):
            if j in used:
                continue

            # Check if vertically aligned and close
            x_diff = abs(text1['x'] - text2['x'])
            y_diff = abs(text1['y'] - text2['y'])

            # Texts on same vertical line, close together
            if x_diff < 50 and y_diff < distance_threshold:
                group.append(text2)
                used.add(j)

        groups.append(group)

    return groups

# Identify room names (not T-codes, not numbers)
def is_room_name(text):
    """Check if text is likely a room name"""
    t = text.strip()

    # Skip T-codes
    if re.match(r'^T\d{3,4}', t):
        return False

    # Skip pure numbers
    if re.match(r'^[\d\.\,]+$', t):
        return False

    # Skip single characters or very short
    if len(t) < 2:
        return False

    # Skip measurement numbers like "645", "153.16"
    if re.match(r'^\d+\.?\d*$', t):
        return False

    # Room names usually contain letters
    if not any(c.isalpha() for c in t):
        return False

    return True

# Process groups to extract room names
room_locations = []

print("\nGrouping nearby texts...")
text_groups = group_nearby_texts(texts)
print(f"Created {len(text_groups)} text groups")

print("\nExtracting room names...")
for group in text_groups:
    # Sort group by Y position (top to bottom)
    group.sort(key=lambda t: t['y'])

    # Build room name from group
    room_name_parts = []
    avg_x = 0
    avg_y = 0
    avg_conf = 0
    count = 0

    for text in group:
        if is_room_name(text['text']):
            room_name_parts.append(text['text'].strip())
            avg_x += text['x']
            avg_y += text['y']
            avg_conf += text['confidence']
            count += 1

    if room_name_parts and count > 0:
        # Combine multi-line room names
        full_name = ' '.join(room_name_parts)

        # Clean up common patterns
        full_name = full_name.replace('  ', ' ')
        full_name = full_name.replace(' .', '.')
        full_name = full_name.replace(' ,', ',')

        # Calculate average position
        room_locations.append({
            'name': full_name,
            'x': avg_x / count,
            'y': avg_y / count,
            'confidence': avg_conf / count,
            'parts': room_name_parts
        })

# Filter and clean room names
print(f"\nFound {len(room_locations)} potential room names")

# Remove duplicates and very low confidence items
seen_names = {}
final_rooms = []

for room in room_locations:
    # Skip low confidence
    if room['confidence'] < 40:
        continue

    # Skip generic text
    if room['name'].upper() in ['THE', 'AND', 'OR', 'OF', 'TO', 'IN', 'FOR']:
        continue

    # Create unique key based on position
    pos_key = f"{round(room['x']/20)}_{round(room['y']/20)}"

    # Keep best confidence for each position
    if pos_key not in seen_names or seen_names[pos_key]['confidence'] < room['confidence']:
        seen_names[pos_key] = room

# Convert to list
final_rooms = list(seen_names.values())

# Sort by position for easier review
final_rooms.sort(key=lambda r: (r['y'], r['x']))

print(f"Final count: {len(final_rooms)} unique room names")

# Show sample
print("\nSample room names found:")
for room in final_rooms[:30]:
    print(f"  '{room['name']:30}' at ({room['x']:6.1f}, {room['y']:6.1f}) conf:{room['confidence']:3.0f}%")

# Save results
output_file = "real_room_names.json"
with open(output_file, 'w') as f:
    json.dump({
        'total': len(final_rooms),
        'rooms': final_rooms
    }, f, indent=2)

print(f"\nSaved to {output_file}")

# Also save a text summary
with open("room_names_list.txt", 'w') as f:
    f.write("EXTRACTED ROOM NAMES FROM FLOOR PLAN\n")
    f.write("=" * 60 + "\n")
    f.write(f"Total rooms found: {len(final_rooms)}\n")
    f.write("=" * 60 + "\n\n")

    for i, room in enumerate(final_rooms, 1):
        f.write(f"{i:3}. {room['name']:40} Pos:({room['x']:4.0f},{room['y']:4.0f})\n")

print("Saved text list to room_names_list.txt")