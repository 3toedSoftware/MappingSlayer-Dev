import json
import math

print("Deduplication Strategy Demo")
print("=" * 60)

# Example: Same room found in multiple scans
example_texts = [
    # Same room from different scans
    {'text': 'BOILER RM', 'x': 2649.5, 'y': 189.3, 'confidence': 96, 'scan': 'grid1_normal'},
    {'text': 'BOILER RM', 'x': 2650.2, 'y': 189.8, 'confidence': 92, 'scan': 'grid2_normal'},
    {'text': 'BOILER RM', 'x': 2649.8, 'y': 189.5, 'confidence': 94, 'scan': 'grid1_sharp'},

    # Partial text from boundaries
    {'text': 'BOILER', 'x': 2649.5, 'y': 189.3, 'confidence': 88, 'scan': 'grid1_edge'},
    {'text': 'RM', 'x': 2680.0, 'y': 189.3, 'confidence': 85, 'scan': 'grid1_edge'},

    # OCR mistakes of same room
    {'text': 'BOILER RN', 'x': 2649.5, 'y': 189.3, 'confidence': 75, 'scan': 'grid3_normal'},
    {'text': 'B0ILER RM', 'x': 2649.5, 'y': 189.3, 'confidence': 70, 'scan': 'grid1_lowlight'},

    # Different room nearby
    {'text': 'MECH RM', 'x': 2354.5, 'y': 189.7, 'confidence': 88, 'scan': 'grid1_normal'},
]

def calculate_distance(t1, t2):
    """Calculate Euclidean distance between two text positions"""
    return math.sqrt((t1['x'] - t2['x'])**2 + (t1['y'] - t2['y'])**2)

def text_similarity(text1, text2):
    """Calculate similarity between two text strings"""
    # Simple character overlap ratio
    if text1 == text2:
        return 1.0

    # Check if one contains the other (for partial matches)
    if text1 in text2 or text2 in text1:
        return 0.8

    # Character-level similarity
    common = 0
    for c in text1:
        if c in text2:
            common += 1

    max_len = max(len(text1), len(text2))
    return common / max_len if max_len > 0 else 0

def deduplicate_texts(texts, position_threshold=15, similarity_threshold=0.7):
    """
    Deduplicate texts based on position and content

    Args:
        texts: List of text dictionaries
        position_threshold: Max distance in pixels to consider same position
        similarity_threshold: Min text similarity to consider duplicate
    """

    print(f"\nDeduplication with position_threshold={position_threshold}, similarity={similarity_threshold}")
    print("-" * 40)

    # Group texts by proximity
    groups = []
    used = set()

    for i, text1 in enumerate(texts):
        if i in used:
            continue

        # Start new group
        group = [text1]
        used.add(i)

        # Find similar texts nearby
        for j, text2 in enumerate(texts):
            if j in used:
                continue

            # Check position proximity
            dist = calculate_distance(text1, text2)
            if dist < position_threshold:
                # Check text similarity
                sim = text_similarity(text1['text'], text2['text'])
                if sim >= similarity_threshold:
                    group.append(text2)
                    used.add(j)

        groups.append(group)

    print(f"Created {len(groups)} groups from {len(texts)} texts")

    # Select best from each group
    deduplicated = []
    for group in groups:
        if len(group) == 1:
            deduplicated.append(group[0])
        else:
            # Sort by confidence and text length (prefer complete text)
            best = max(group, key=lambda t: (t['confidence'], len(t['text'])))
            deduplicated.append(best)

            print(f"\nGroup at ({best['x']:.1f}, {best['y']:.1f}):")
            for t in group:
                marker = " <- SELECTED" if t == best else ""
                print(f"  '{t['text']}' (conf: {t['confidence']}%) from {t['scan']}{marker}")

    return deduplicated

# Method 1: Simple position-based deduplication
print("\nMethod 1: Simple Grid-Based Deduplication")
print("-" * 40)

simple_unique = {}
for text in example_texts:
    # Round position to nearest 10 pixels
    key = (text['text'], round(text['x']/10), round(text['y']/10))

    if key not in simple_unique or simple_unique[key]['confidence'] < text['confidence']:
        simple_unique[key] = text
        print(f"Keeping: '{text['text']}' at ({text['x']:.1f}, {text['y']:.1f}) conf:{text['confidence']}%")

print(f"Result: {len(simple_unique)} unique texts")

# Method 2: Smart deduplication with fuzzy matching
print("\n" + "=" * 60)
print("Method 2: Smart Position + Text Similarity Deduplication")

result = deduplicate_texts(example_texts, position_threshold=15, similarity_threshold=0.7)

print(f"\nFinal result: {len(result)} unique texts")
for text in result:
    print(f"  '{text['text']}' at ({text['x']:.1f}, {text['y']:.1f}) confidence: {text['confidence']}%")

# Method 3: Advanced - Handling split text
print("\n" + "=" * 60)
print("Method 3: Merging Split Text")
print("-" * 40)

def merge_nearby_texts(texts, merge_threshold=35):
    """Merge texts that might be parts of the same room name"""

    merged = []
    used = set()

    for i, text1 in enumerate(texts):
        if i in used:
            continue

        # Look for horizontally adjacent text
        parts = [text1]
        used.add(i)

        for j, text2 in enumerate(texts):
            if j in used:
                continue

            # Check if on same line and close horizontally
            y_diff = abs(text1['y'] - text2['y'])
            x_diff = abs(text1['x'] - text2['x'])

            if y_diff < 5 and x_diff < merge_threshold:
                # Check if it looks like a continuation
                if not any(text2['text'] in p['text'] or p['text'] in text2['text'] for p in parts):
                    parts.append(text2)
                    used.add(j)

        if len(parts) > 1:
            # Sort by x position and merge
            parts.sort(key=lambda t: t['x'])
            merged_text = ' '.join(p['text'] for p in parts)
            avg_conf = sum(p['confidence'] for p in parts) / len(parts)

            print(f"Merged: {' + '.join(p['text'] for p in parts)} -> '{merged_text}'")

            merged.append({
                'text': merged_text,
                'x': parts[0]['x'],  # Use leftmost position
                'y': parts[0]['y'],
                'confidence': avg_conf,
                'scan': 'merged'
            })
        else:
            merged.append(text1)

    return merged

# Test merging
test_split = [
    {'text': 'BOILER', 'x': 2649.5, 'y': 189.3, 'confidence': 88},
    {'text': 'RM', 'x': 2680.0, 'y': 189.3, 'confidence': 85},
    {'text': 'MECH', 'x': 2354.5, 'y': 189.7, 'confidence': 90},
    {'text': 'RM.', 'x': 2385.0, 'y': 189.7, 'confidence': 88},
]

merged = merge_nearby_texts(test_split)
print(f"\nResult: {len(merged)} texts after merging")

print("\n" + "=" * 60)
print("FINAL DEDUPLICATION STRATEGY:")
print("=" * 60)
print("""
1. Position-based grouping (15 pixel threshold)
2. Text similarity checking (70% match threshold)
3. Keep highest confidence from each group
4. Merge horizontally adjacent fragments
5. Final position rounding to eliminate near-duplicates

This ensures we don't count the same room multiple times!
""")