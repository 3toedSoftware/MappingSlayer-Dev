import json
import fitz
from PIL import Image

print("Creating Simple Room Map with Actual Room Names")
print("=" * 60)

# Load the quality room names from multi-scan
with open('quality_room_names.json', 'r') as f:
    data = json.load(f)

all_rooms = data['rooms']

# Filter for high-quality room names
rooms = []
skip_words = ['g4 go', 'lal in', 'sll sis', 'ei] Lil)', 'Lj', 'JL', 'JIS', 'tal',
              'Ala TAYE', 'll', 'VES VEST. ass', 'isi', 'br', 'ay', 'vi', 'Gy', 'Ca']

for room in all_rooms:
    name = room['name'].strip()

    # Quality checks
    if room['confidence'] < 60:
        continue
    if len(name) < 3:
        continue
    if name in skip_words:
        continue
    if name.startswith('Ti0'):  # T-codes
        continue
    if name.isdigit():  # Pure numbers
        continue

    # Clean up the name
    name = name.replace('  ', ' ')
    name = name.replace(' ,', ',')
    name = name.replace(' .', '.')

    # Remove trailing codes and fragments
    if ' Ti0' in name:
        name = name.split(' Ti0')[0]
    if ' T10' in name:
        name = name.split(' T10')[0]

    rooms.append({
        'name': name,
        'x': room['x'],
        'y': room['y'],
        'confidence': room['confidence']
    })

print(f"Using {len(rooms)} high-quality room names")

# Create the floor plan image
pdf_path = "RIO GRANDE REGIONAL/RG_SP_01.pdf"
pdf = fitz.open(pdf_path)
page = pdf[0]

# Render at 40% for web display
mat = fitz.Matrix(0.4, 0.4)
pix = page.get_pixmap(matrix=mat)
img_data = pix.tobytes("png")

with open("floor_plan_simple.png", "wb") as f:
    f.write(img_data)

print(f"Floor plan image: {pix.width} x {pix.height} pixels")
pdf.close()

# Create simple HTML map
html = '''<!DOCTYPE html>
<html>
<head>
    <title>Rio Grande Regional Hospital - Room Map</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #1a1a1a;
            color: white;
            overflow: hidden;
        }

        .header {
            background: #2d2d2d;
            padding: 15px 20px;
            border-bottom: 1px solid #444;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        h1 {
            font-size: 24px;
            font-weight: 300;
        }

        .controls {
            display: flex;
            gap: 15px;
            align-items: center;
        }

        input[type="text"] {
            padding: 8px 15px;
            border: 1px solid #444;
            background: #1a1a1a;
            color: white;
            border-radius: 4px;
            width: 250px;
        }

        button {
            padding: 8px 15px;
            border: 1px solid #444;
            background: #2d2d2d;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.2s;
        }

        button:hover {
            background: #3d3d3d;
        }

        .map-container {
            position: relative;
            width: 100vw;
            height: calc(100vh - 60px);
            overflow: auto;
            background: #0d0d0d;
        }

        .map-wrapper {
            position: relative;
            display: inline-block;
            transform-origin: top left;
            transition: transform 0.3s;
        }

        #floorPlan {
            display: block;
            max-width: none;
        }

        .room-marker {
            position: absolute;
            width: 8px;
            height: 8px;
            background: #dc3545;
            border: 2px solid white;
            border-radius: 50%;
            cursor: pointer;
            transition: all 0.2s;
            transform: translate(-50%, -50%);
            box-shadow: 0 2px 4px rgba(0,0,0,0.5);
            z-index: 100;
        }

        .room-marker:hover {
            width: 12px;
            height: 12px;
            background: #ff4757;
            z-index: 200;
            box-shadow: 0 4px 8px rgba(0,0,0,0.8);
        }

        .room-marker.hidden {
            display: none;
        }

        .room-marker.highlighted {
            width: 14px;
            height: 14px;
            background: #00ff00;
            border: 2px solid #00aa00;
            z-index: 300;
        }

        .room-label {
            position: absolute;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 4px 8px;
            font-size: 12px;
            font-weight: 500;
            border-radius: 4px;
            white-space: nowrap;
            pointer-events: none;
            display: none;
            transform: translateX(-50%);
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            z-index: 500;
        }

        .room-marker:hover + .room-label,
        .room-marker.highlighted + .room-label {
            display: block;
        }

        .stats {
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(45, 45, 45, 0.95);
            padding: 10px 15px;
            border-radius: 4px;
            font-size: 14px;
        }

        .zoom-controls {
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            gap: 5px;
            background: rgba(45, 45, 45, 0.95);
            padding: 5px;
            border-radius: 4px;
        }

        .zoom-controls button {
            width: 40px;
            height: 40px;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Rio Grande Regional Hospital - Floor 1 Room Map</h1>
        <div class="controls">
            <input type="text" id="search" placeholder="Search room names...">
            <button onclick="clearSearch()">Clear</button>
            <span id="count">''' + str(len(rooms)) + ''' rooms</span>
        </div>
    </div>

    <div class="map-container" id="mapContainer">
        <div class="map-wrapper" id="mapWrapper">
            <img id="floorPlan" src="floor_plan_simple.png" alt="Floor Plan">
            <div id="markers"></div>
        </div>
    </div>

    <div class="stats">
        <div id="visibleCount">Showing: ''' + str(len(rooms)) + ''' rooms</div>
    </div>

    <div class="zoom-controls">
        <button onclick="zoomOut()">-</button>
        <button onclick="zoomReset()">⟲</button>
        <button onclick="zoomIn()">+</button>
    </div>

    <script>
        const rooms = ''' + json.dumps(rooms) + ''';
        const PDF_WIDTH = 3456;
        const PDF_HEIGHT = 2592;
        const IMG_SCALE = 0.4;  // Image is rendered at 40%

        let currentZoom = 1;
        let searchTerm = '';

        function initMap() {
            const markersDiv = document.getElementById('markers');
            markersDiv.innerHTML = '';

            rooms.forEach((room, index) => {
                // Create marker (red circle)
                const marker = document.createElement('div');
                marker.className = 'room-marker';
                marker.dataset.index = index;

                // Create label (room name)
                const label = document.createElement('div');
                label.className = 'room-label';
                label.textContent = room.name;

                // Position based on PDF coordinates
                const x = (room.x / PDF_WIDTH) * 100;
                const y = (room.y / PDF_HEIGHT) * 100;

                marker.style.left = x + '%';
                marker.style.top = y + '%';

                label.style.left = x + '%';
                label.style.top = (y - 0.5) + '%';  // Position label above marker

                marker.onclick = () => {
                    // Remove previous highlights
                    document.querySelectorAll('.room-marker').forEach(m => {
                        m.classList.remove('highlighted');
                    });
                    marker.classList.add('highlighted');

                    // Scroll into view
                    marker.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'center'});
                };

                markersDiv.appendChild(marker);
                markersDiv.appendChild(label);
            });
        }

        function filterRooms() {
            const markers = document.querySelectorAll('.room-marker');
            const labels = document.querySelectorAll('.room-label');
            let visibleCount = 0;

            markers.forEach((marker, index) => {
                const room = rooms[index];
                const name = room.name.toLowerCase();
                const match = !searchTerm || name.includes(searchTerm.toLowerCase());

                if (match) {
                    marker.classList.remove('hidden');
                    if (labels[index]) labels[index].classList.remove('hidden');
                    visibleCount++;
                } else {
                    marker.classList.add('hidden');
                    if (labels[index]) labels[index].classList.add('hidden');
                }
            });

            document.getElementById('visibleCount').textContent = `Showing: ${visibleCount} rooms`;
        }

        function clearSearch() {
            document.getElementById('search').value = '';
            searchTerm = '';
            filterRooms();
        }

        function zoomIn() {
            currentZoom = Math.min(currentZoom * 1.3, 3);
            applyZoom();
        }

        function zoomOut() {
            currentZoom = Math.max(currentZoom / 1.3, 0.5);
            applyZoom();
        }

        function zoomReset() {
            currentZoom = 1;
            applyZoom();
            document.getElementById('mapContainer').scrollTo(0, 0);
        }

        function applyZoom() {
            document.getElementById('mapWrapper').style.transform = `scale(${currentZoom})`;
        }

        // Search functionality
        document.getElementById('search').addEventListener('input', (e) => {
            searchTerm = e.target.value;
            filterRooms();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    zoomIn();
                } else if (e.key === '-') {
                    e.preventDefault();
                    zoomOut();
                } else if (e.key === '0') {
                    e.preventDefault();
                    zoomReset();
                }
            }
        });

        // Initialize
        initMap();
    </script>
</body>
</html>'''

# Save the HTML
with open('simple_room_map.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nCreated simple_room_map.html")
print(f"  - {len(rooms)} room name markers")
print("  - Clean, simple interface")
print("  - Search functionality")
print("  - Zoom controls")
print("\nOpen simple_room_map.html in your browser!")