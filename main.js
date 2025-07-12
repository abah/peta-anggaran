// main.js
// Pindahkan seluruh JavaScript dari index.html ke sini, kecuali database koordinat 
let allData = [];
let filteredData = [];
let charts = {};
let map;
let markers = [];
let heatmapLayer;

// Fungsi untuk mengekstrak provinsi dari string lokasi
function extractProvince(locationStr) {
    if (!locationStr) return '';
    
    // Coba ambil provinsi dari string lokasi
    const parts = locationStr.split(',').map(part => part.trim());
    if (parts.length > 0) {
        // Jika ada kata "Provinsi", ambil bagian setelahnya
        if (parts[0].toLowerCase().includes('provinsi')) {
            return parts[0].replace(/provinsi/i, '').trim();
        }
        // Jika tidak, ambil bagian pertama
        return parts[0];
    }
    return '';
}

// Fungsi untuk mengekstrak kabupaten/kota dari string lokasi
function extractCity(locationStr) {
    if (!locationStr) return '';
    
    const parts = locationStr.split(',').map(part => part.trim());
    if (parts.length > 1) {
        // Coba ambil kabupaten/kota dari bagian kedua
        const cityPart = parts[1];
        // Hapus prefix "Kabupaten" atau "Kota" jika ada
        return cityPart.replace(/kabupaten|kota/i, '').trim();
    }
    return '';
}

// Fungsi untuk mengekstrak desa/lokasi/kawasan dari string lokasi
function extractLocation(locationStr) {
    if (!locationStr) return '';
    
    const parts = locationStr.split(',').map(part => part.trim());
    if (parts.length > 2) {
        // Gabungkan semua bagian setelah kabupaten/kota
        return parts.slice(2).join(', ').trim();
    }
    return '';
}

// Fungsi untuk mendapatkan koordinat dari kabupaten
function getCoordinates(kabupaten, provinsi) {
    // Normalisasi input
    const normalizedKabupaten = kabupaten.toLowerCase().trim();
    const normalizedProvinsi = provinsi.toLowerCase().trim();
    
    // Cari koordinat berdasarkan format "Province|City"
    for (const key in coordinatesDB) {
        const [dbProvinsi, dbKabupaten] = key.split('|');
        const normalizedDbProvinsi = dbProvinsi.toLowerCase().trim();
        const normalizedDbKabupaten = dbKabupaten.toLowerCase().trim();
        
        // Cek kecocokan provinsi dan kabupaten
        if ((normalizedDbProvinsi.includes(normalizedProvinsi) || normalizedProvinsi.includes(normalizedDbProvinsi)) &&
            (normalizedDbKabupaten.includes(normalizedKabupaten) || normalizedKabupaten.includes(normalizedDbKabupaten))) {
            return {
                lat: coordinatesDB[key][0],
                lng: coordinatesDB[key][1]
            };
        }
    }

    // Jika provinsi tidak cocok, coba cari berdasarkan kabupaten saja
    for (const key in coordinatesDB) {
        const [, dbKabupaten] = key.split('|');
        const normalizedDbKabupaten = dbKabupaten.toLowerCase().trim();
        
        if (normalizedDbKabupaten.includes(normalizedKabupaten) || normalizedKabupaten.includes(normalizedDbKabupaten)) {
            console.warn(`Koordinat ditemukan untuk kabupaten ${dbKabupaten} di key ${key}`);
            return {
                lat: coordinatesDB[key][0],
                lng: coordinatesDB[key][1]
            };
        }
    }

    // Jika tidak ditemukan, gunakan koordinat default Indonesia
    console.warn(`Koordinat tidak ditemukan untuk: ${kabupaten}, ${provinsi}`);
    return { lat: -2.5489, lng: 118.0149 }; // Koordinat default Indonesia
}

function parseExcelData(data) {
    // Remove any trailing empty rows and clean up each cell
    data = data.filter(row => row.some(cell => cell !== ''))
        .map(row => row.map(cell => (cell || '').toString().trim()));
    
    // Default column structure based on the template
    const defaultColumns = {
        no: 0,
        satker: 1,
        provinsi: 2,
        kabupaten: 3,
        desaLokasi: 4,
        menuKegiatan: 5,
        target: {
            volume: 6,
            satuan: 7
        },
        alokasi: 8,
        ukeII: 9,
        programPrioritas: 10
    };

    // Check if the first row looks like a header
    const firstRow = data[0].map(cell => cell.toLowerCase());
    const hasHeader = firstRow.some(cell => 
        cell.includes('satker') || 
        cell.includes('menu kegiatan') || 
        cell.includes('indikasi lokus')
    );

    // If it's a header row, skip it
    const startIndex = hasHeader ? 1 : 0;

    // Process each row
    return data.slice(startIndex).map((row, index) => {
        // Handle location columns (provinsi, kabupaten, desa)
        let locationStr = '';
        if (row[2]) locationStr += row[2];  // Provinsi
        if (row[3]) locationStr += ', ' + row[3];  // Kabupaten
        if (row[4]) locationStr += ', ' + row[4];  // Desa/Lokasi
        locationStr = locationStr.trim();

        // Extract volume and unit from target
        const volStr = (row[6] || '').toString();
        const satuanStr = (row[7] || '').toString();
        const targetStr = `${volStr} ${satuanStr}`.trim();
        const targetMatch = targetStr.match(/^(\d+[\d,.]*)?\s*(.*)$/);
        const volume = targetMatch && targetMatch[1] ? 
            parseFloat(targetMatch[1].replace(/,/g, '')) : 0;
        const unit = targetMatch ? targetMatch[2].trim() : satuanStr;

        // Parse alokasi, remove non-digits and convert to number
        const alokasiStr = (row[8] || '0').toString();
        const alokasi = parseInt(alokasiStr.replace(/[^\d]/g, '')) || 0;

        const item = {
            no: index + 1,
            satker: (row[1] || '').toString(),
            provinsi: extractProvince(locationStr),
            kabupaten: extractCity(locationStr),
            desaLokasi: extractLocation(locationStr),
            menuKegiatan: (row[5] || '').toString(),
            target: volume,
            satuan: unit,
            alokasi: alokasi,
            ukeII: (row[9] || '').toString(),
            programPrioritas: (row[10] || '').toString()
        };

        return item;
    });
}

const sampleData = [
    {
        no: 1,
        satker: "Aceh",
        provinsi: "Aceh", 
        kabupaten: "Simeulue",
        desaLokasi: "Simeulue Timur",
        indikasiLokus: "Insentif Petugas SP (3 bulan)",
        menuKegiatan: "Insentif Guru, Dokter dan Rohaniawan di SP (3 bulan)",
        target: 12,
        alokasi: 3600,
        ukeII: "orang",
        programPrioritas: "PSPSNP"
    }
];

function initMap() {
    // Initialize map
    map = L.map('map', {
        center: [-2.5489, 118.0149],
        zoom: 5,
        fullscreenControl: true,
        minZoom: 5,
        maxZoom: 18
    });

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Handle popup positioning
    map.on('popupopen', function(e) {
        const popup = e.popup;
        
        // Wait for popup to be fully rendered
        setTimeout(() => {
            const px = map.project(popup.getLatLng());
            
            // If popup is near top of screen, move map down
            if (px.y < 300) {
                map.panTo(map.unproject(L.point(px.x, 300)), {
                    animate: true
                });
            }
        }, 100);
    });
}

function updateMap() {
    // Clear existing markers
    if (markers && markers.length) {
        markers.forEach(marker => {
            if (marker) marker.remove();
        });
    }
    markers = [];
    
    if (heatmapLayer) {
        heatmapLayer.remove();
    }

    if (!filteredData || !filteredData.length) {
        console.log('No data to display on map');
        return;
    }
    
    // Group data by location
    const locationGroups = {};
    filteredData.forEach(item => {
        if (!item.kabupaten || !item.provinsi) return;
        const key = `${item.kabupaten}|${item.provinsi}`;
        if (!locationGroups[key]) {
            locationGroups[key] = [];
        }
        locationGroups[key].push(item);
    });

    // Create markers for each location
    Object.entries(locationGroups).forEach(([key, items]) => {
        const [kabupaten, provinsi] = key.split('|');
        const coords = getCoordinates(kabupaten, provinsi);
        if (!coords) {
            console.log(`No coordinates found for ${kabupaten}, ${provinsi}`);
        return;
    }

        const count = items.length;
        const icon = createCustomMarker(count);

        // Generate popup content
        const popupContent = generatePopupContent(items, kabupaten, provinsi);

        // Create marker with improved popup options
        const marker = L.marker([coords.lat, coords.lng], { 
            icon: icon,
            riseOnHover: true,
            riseOffset: 1000
        });

        // Bind popup with custom options
        const popup = L.popup({
            maxWidth: 450,
            className: 'custom-popup',
            autoPan: true,
            autoPanPadding: [50, 50],
            keepInView: true,
            draggable: true // Enable dragging
        }).setContent(popupContent);

        // Add custom event handlers for popup
        marker.bindPopup(popup);
        
        marker.on('popupopen', function(e) {
            const popup = e.popup;
            
            // Center popup in fullscreen mode
            if (map.isFullscreen()) {
                const px = map.project(marker.getLatLng());
                const mapHeight = map.getContainer().clientHeight;
                const popupHeight = popup._container.clientHeight;
                
                // Calculate center position
                px.y = (mapHeight - popupHeight) / 2;
                map.panTo(map.unproject(px), {animate: true});

                // Make popup draggable
                const container = popup._container;
                if (container) {
                    // Add draggable class
                    L.DomUtil.addClass(container, 'leaflet-popup-draggable');
                    
                    // Initialize drag state
                    let isDragging = false;
                    let startPos = { x: 0, y: 0 };
                    let startTransform = { x: 0, y: 0 };

                    // Add drag handlers
                    container.addEventListener('mousedown', function(e) {
                        if (e.target.closest('.popup-content')) return; // Allow text selection in content
                        isDragging = true;
                        container.style.transition = 'none'; // Disable transitions while dragging
                        
                        // Get current transform values
                        const transform = container.style.transform || 'translate(0px, 0px)';
                        const matches = transform.match(/translate\((-?\d+)px,\s*(-?\d+)px\)/);
                        startTransform = {
                            x: matches ? parseInt(matches[1]) : 0,
                            y: matches ? parseInt(matches[2]) : 0
                        };
                        
                        startPos = {
                            x: e.clientX - startTransform.x,
                            y: e.clientY - startTransform.y
                        };
                        
                        // Prevent text selection while dragging
                        e.preventDefault();
                    });

                    document.addEventListener('mousemove', function(e) {
                        if (!isDragging) return;
                        
                        const dx = e.clientX - startPos.x;
                        const dy = e.clientY - startPos.y;
                        
                        container.style.transform = `translate(${dx}px, ${dy}px)`;
                    });

                    document.addEventListener('mouseup', function() {
                        isDragging = false;
                        container.style.transition = ''; // Restore transitions
                    });
                }
        }
    });

        markers.push(marker);
        marker.addTo(map);
    });

    // Add heatmap layer
    const heatmapPoints = Object.entries(locationGroups)
        .map(([key, items]) => {
            const [kabupaten, provinsi] = key.split('|');
            const coords = getCoordinates(kabupaten, provinsi);
            if (!coords) return null;
            return [coords.lat, coords.lng, items.length * 2];
        })
        .filter(point => point !== null);

    if (heatmapPoints.length > 0) {
        heatmapLayer = L.heatLayer(heatmapPoints, {
            radius: 30,
            blur: 20,
            maxZoom: 10,
            max: Math.max(...Object.values(locationGroups).map(items => items.length)),
            gradient: {
                0.2: '#93C5FD',
                0.4: '#60A5FA',
                0.6: '#3B82F6',
                0.8: '#1D4ED8',
                1.0: '#1E40AF'
            }
        }).addTo(map);
    }
}

function showNotification(message, isError = false) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${isError ? 'error' : ''}`;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 4000);
}

function togglePasteArea() {
    const pasteArea = document.getElementById('pasteArea');
    const pasteButtons = document.getElementById('pasteButtons');
    const isVisible = pasteArea.style.display !== 'none';
    pasteArea.style.display = isVisible ? 'none' : 'block';
    pasteButtons.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        pasteArea.focus();
    }
}

function clearPasteArea() {
    document.getElementById('pasteArea').value = '';
}

function cleanPastedData(content) {
    return content
        .split('\n')
        .map(row => row
            .split('\t')
            .map(cell => cell.trim())
            .map(cell => cell.replace(/[\r\n]+/g, ' ')) // Remove line breaks within cells
            .map(cell => cell.replace(/\s+/g, ' '))     // Normalize spaces
        )
        .filter(row => row.some(cell => cell !== ''));  // Remove empty rows
}

// Fungsi untuk memperbarui opsi filter
function updateFilterOptions() {
    const provinsiFilter = document.getElementById('provinsiFilter');
    const kabupatenFilter = document.getElementById('kabupatenFilter');
    const programFilter = document.getElementById('programFilter');
    const ukeFilter = document.getElementById('ukeFilter');

    // Kumpulkan semua provinsi unik
    const provinsiSet = new Set();
    const programSet = new Set();
    const ukeSet = new Set();
    allData.forEach(item => {
        if (item.provinsi) {
            provinsiSet.add(item.provinsi);
        }
        if (item.programPrioritas) {
            programSet.add(item.programPrioritas);
        }
        if (item.ukeII) {
            ukeSet.add(item.ukeII);
        }
    });

    // Kosongkan dan isi ulang opsi provinsi
    provinsiFilter.innerHTML = '<option value="">Semua Provinsi</option>';
    Array.from(provinsiSet).sort().forEach(provinsi => {
        provinsiFilter.innerHTML += `<option value="${provinsi}">${provinsi}</option>`;
    });

    // Kosongkan dan isi ulang opsi program prioritas
    programFilter.innerHTML = '<option value="">Semua Program</option>';
    Array.from(programSet).sort().forEach(program => {
        programFilter.innerHTML += `<option value="${program}">${program}</option>`;
    });

    // Kosongkan dan isi ulang opsi UKE II
    ukeFilter.innerHTML = '<option value="">Semua UKE II</option>';
    Array.from(ukeSet).sort().forEach(uke => {
        ukeFilter.innerHTML += `<option value="${uke}">${uke}</option>`;
    });

    // Update opsi kabupaten
    updateKabupatenOptions();
}

// Fungsi untuk memperbarui opsi kabupaten berdasarkan provinsi yang dipilih
function updateKabupatenOptions() {
    const provinsiFilter = document.getElementById('provinsiFilter');
    const kabupatenFilter = document.getElementById('kabupatenFilter');
    const selectedProvinsi = provinsiFilter.value;

    // Kumpulkan kabupaten yang sesuai dengan provinsi terpilih
    const kabupatenSet = new Set();
    allData.forEach(item => {
        if (item.kabupaten && (!selectedProvinsi || item.provinsi === selectedProvinsi)) {
            kabupatenSet.add(item.kabupaten);
        }
    });

    // Kosongkan dan isi ulang opsi kabupaten
    kabupatenFilter.innerHTML = '<option value="">Semua Kabupaten</option>';
    Array.from(kabupatenSet).sort().forEach(kabupaten => {
        kabupatenFilter.innerHTML += `<option value="${kabupaten}">${kabupaten}</option>`;
    });
}

// Modifikasi fungsi validateAndProcessData untuk menambahkan update filter options
function validateAndProcessData(rawData) {
    try {
        // Parse the data
        const processedData = parseExcelData(rawData);
        console.log('Processed data:', processedData);

        // Update global data
        allData = processedData;
        filteredData = [...allData];

        // Update filter options
        updateFilterOptions();

        // Update UI
        updateDashboard();
        
        // Show success message
        showNotification('Data berhasil dimuat', false);
        
        return true;
    } catch (error) {
        console.error('Error processing data:', error);
        showNotification('Error: ' + error.message, true);
        return false;
    }
}

// Modify processPastedData to use the new validation function
function processPastedData() {
    const pasteArea = document.getElementById('pasteArea');
    const content = pasteArea.value;
    
    if (!content.trim()) {
        showNotification('Silakan tempel data terlebih dahulu', true);
        return;
    }

    try {
        const rows = cleanPastedData(content);
        if (validateAndProcessData(rows)) {
            clearPasteArea();
            showNotification('Data berhasil diproses', false);
        }
    } catch (error) {
        console.error('Error processing pasted data:', error);
        showNotification('Format data tidak valid: ' + error.message, true);
    }
}

// Modify handleFileUpload to use the new validation function
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            const rows = content.split('\n')
                .map(row => row.split('\t'))
                .filter(row => row.some(cell => cell.trim() !== ''));

            if (validateAndProcessData(rows)) {
                event.target.value = ''; // Clear the file input
            }
        } catch (error) {
            console.error('Error reading file:', error);
            showNotification('Error membaca file', true);
        }
    };
    reader.onerror = function() {
        showNotification('Error membaca file', true);
    };
    reader.readAsText(file);
}

// Tambahkan fungsi debug untuk membantu troubleshooting
function debugLocation(provinsi, kabupaten) {
    console.log('Checking location:', { provinsi, kabupaten });
    const coordinates = getCoordinates(provinsi, kabupaten);
    console.log('Found coordinates:', coordinates);
    return coordinates;
}

// Modify loadSampleData to use the new validation function
function loadSampleData() {
    // Convert sample data to raw format
    const rawData = [
        ['No', 'Satker', 'Lokasi', 'Menu Kegiatan', 'Target', 'Alokasi', 'UKE II', 'Program Prioritas'],
        ['1', 'Aceh', 'Provinsi Aceh, Kabupaten Simeulue, Simeulue Timur', 'Insentif Guru, Dokter dan Rohaniawan di SP (3 bulan)', '12 orang', '3600', 'Direktorat SP', 'PSPSNP']
    ];

    validateAndProcessData(rawData);
}

function exportData() {
    if (filteredData.length === 0) {
        showNotification('Tidak ada data untuk diekspor', true);
        return;
    }
    const ws = XLSX.utils.json_to_sheet(filteredData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard Export");
    XLSX.writeFile(wb, "dashboard_peta_anggaran.xlsx");
    showNotification('Data berhasil diekspor');
}

function updateDashboard() {
    filteredData = [...allData];
    updateStats();
    updateCharts();
    updateTable();
    updateMap();
}

// Modifikasi fungsi applyFilters untuk menambahkan filter lokasi
function applyFilters() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const selectedProvinsi = document.getElementById('provinsiFilter').value;
    const selectedKabupaten = document.getElementById('kabupatenFilter').value;
    const selectedProgram = document.getElementById('programFilter').value;
    const selectedUke = document.getElementById('ukeFilter').value;

    filteredData = allData.filter(item => {
        // Filter berdasarkan pencarian
        const matchSearch = !search || Object.values(item).some(val => 
            val.toString().toLowerCase().includes(search)
        );

        // Filter berdasarkan provinsi
        const matchProvinsi = !selectedProvinsi || item.provinsi === selectedProvinsi;

        // Filter berdasarkan kabupaten
        const matchKabupaten = !selectedKabupaten || item.kabupaten === selectedKabupaten;

        // Filter berdasarkan program prioritas
        const matchProgram = !selectedProgram || item.programPrioritas === selectedProgram;

        // Filter berdasarkan UKE II
        const matchUke = !selectedUke || item.ukeII === selectedUke;

        return matchSearch && matchProvinsi && matchKabupaten && matchProgram && matchUke;
    });

    updateStats();
    updateCharts();
    updateTable();
    updateMap();
}

function updateStats() {
    const totalAlokasi = filteredData.reduce((sum, item) => sum + (item.alokasi || 0), 0);
    const totalKegiatan = filteredData.length;
    const totalProvinsi = new Set(filteredData.map(item => item.provinsi).filter(Boolean)).size;
    
    // Format alokasi dalam Miliar (M), perlu dikali 1000 dulu karena data dalam ribuan
    const alokasiInM = ((totalAlokasi * 1000) / 1000000000).toFixed(1);
    document.getElementById('totalAlokasi').textContent = `Rp ${alokasiInM}M`;
    document.getElementById('totalKegiatan').textContent = totalKegiatan;
    document.getElementById('totalProvinsi').textContent = totalProvinsi;
}

function updateCharts() {
    updateProgramChart();
    updateKabupatenChart();
}

function updateProgramChart() {
    const ctx = document.getElementById('programChart').getContext('2d');
    if (charts.program) {
        charts.program.destroy();
    }
    const programData = {};
    filteredData.forEach(item => {
        if (item.programPrioritas) {
            programData[item.programPrioritas] = (programData[item.programPrioritas] || 0) + (item.alokasi || 0);
        }
    });
    const labels = Object.keys(programData);
    const data = Object.values(programData);
    charts.program = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#1D4ED8',  // primary
                    '#059669',  // success
                    '#D97706',  // warning
                    '#4B5563'   // text secondary
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 16,
                        font: {
                            family: 'Poppins',
                            size: 12
                        },
                        color: '#4B5563'
                    }
                }
            },
            cutout: '70%'
        }
    });
}

function updateKabupatenChart() {
    const ctx = document.getElementById('kabupatenChart').getContext('2d');
    if (charts.kabupaten) {
        charts.kabupaten.destroy();
    }
    const kabupatenData = {};
    filteredData.forEach(item => {
        if (item.kabupaten) {
            kabupatenData[item.kabupaten] = (kabupatenData[item.kabupaten] || 0) + 1;
        }
    });
    const labels = Object.keys(kabupatenData);
    const data = Object.values(kabupatenData);
    charts.kabupaten = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jumlah Kegiatan',
                data: data,
                backgroundColor: '#1D4ED8',
                borderRadius: 6,
                borderSkipped: false,
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#F3F4F6'
                    },
                    ticks: {
                        font: {
                            family: 'Poppins',
                            size: 12
                        },
                        color: '#4B5563'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            family: 'Poppins',
                            size: 12
                        },
                        color: '#4B5563'
                    }
                }
            }
        }
    });
}

function updateTable() {
    const tableBody = document.getElementById('dataTableBody');
    const tableContainer = document.getElementById('tableContainer');

    if (filteredData.length === 0) {
        tableContainer.classList.add('empty');
        return;
    }

    tableContainer.classList.remove('empty');
    tableBody.innerHTML = filteredData.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>
            <div class="cell-content">
                <div class="satker-name">${item.satker}</div>
            </div>
            </td>
            <td>${item.provinsi || '-'}</td>
            <td>${item.kabupaten || '-'}</td>
            <td>${item.desaLokasi || '-'}</td>
            <td>${item.menuKegiatan}</td>
            <td>
            <div class="cell-content">
                    <span class="target-value">${item.target}</span>
                <span class="target-unit">${item.satuan}</span>
            </div>
            </td>
            <td>
            <div class="cell-content">
                <span class="alokasi-value">${(item.alokasi * 1000).toLocaleString('id-ID')}</span>
            </div>
            </td>
            <td>${item.ukeII}</td>
            <td>
                <div class="status-tag ${getProgramType(item.programPrioritas)}">
                    ${item.programPrioritas}
            </div>
            </td>
        </tr>
    `).join('');
}

// Helper function to get program type text
function getProgramType(programPrioritas) {
    const programTypes = {
        'PSPSNP': 'Tusi dasar',
        'PKTRANS': 'Trans Gotong Royong',
        'LAYANAN': 'Layanan',
        'DEFAULT': ''
    };
    return programTypes[programPrioritas] || programTypes['DEFAULT'];
}

// Fungsi untuk mendapatkan warna marker berdasarkan jumlah program
function getMarkerColor(count) {
    if (count >= 10) return '#1E40AF'; // Dark Blue untuk >= 10 program
    if (count >= 7) return '#1D4ED8';  // Medium Blue untuk >= 7 program
    if (count >= 4) return '#3B82F6';  // Blue untuk >= 4 program
    if (count >= 2) return '#60A5FA';  // Light Blue untuk >= 2 program
    return '#93C5FD';                  // Lighter Blue untuk 1 program
}

// Fungsi untuk mendapatkan ukuran marker berdasarkan jumlah program
function getMarkerRadius(count) {
    return Math.min(24 + (count * 1.5), 42); // Minimum 24px, maksimum 42px
}

// Fungsi untuk membuat custom marker
function createCustomMarker(count) {
    const color = getMarkerColor(count);
    const radius = getMarkerRadius(count);

    const markerHtml = `
        <div class="custom-marker" style="
            background-color: ${color};
            width: ${radius}px;
            height: ${radius}px;
        ">
            <div class="marker-inner-ring"></div>
            <span class="marker-value">${count}</span>
            <div class="marker-pulse" style="border-color: ${color}"></div>
        </div>
    `;

    return L.divIcon({
        className: 'custom-marker-container',
        html: markerHtml,
        iconSize: [radius, radius],
        iconAnchor: [radius/2, radius/2],
        popupAnchor: [0, -radius/2]
    });
}

// Fungsi untuk memformat angka ke format rupiah
function formatRupiah(number) {
    // Pastikan number adalah angka dan bukan string, lalu kalikan 1000
    number = typeof number === 'string' ? 
        Number(number.replace(/[^0-9.-]+/g, '')) * 1000 : 
        Number(number) * 1000;
    
    // Jika bukan angka valid, return 0
    if (isNaN(number)) return '0';

    // Format berdasarkan besaran nilai (dalam rupiah)
    if (number >= 1000000000) { // 1 Miliar
        const miliar = number / 1000000000;
        return miliar.toFixed(1).replace(/\.0$/, '') + ' Miliar';
    } else if (number >= 1000000) { // 1 Juta
        const juta = number / 1000000;
        return juta.toFixed(1).replace(/\.0$/, '') + ' Juta';
    } else if (number >= 1000) { // 1 Ribu
        const ribu = number / 1000;
        return ribu.toFixed(1).replace(/\.0$/, '') + ' Ribu';
    }
    
    return number.toLocaleString('id-ID');
}

// Fungsi untuk generate konten popup
function generatePopupContent(items, kabupaten, provinsi) {
    // Hitung total alokasi dengan lebih hati-hati
    const totalAlokasi = items.reduce((sum, item) => {
        // Pastikan alokasi adalah angka
        const alokasi = Number(item.alokasi);
        return sum + (isNaN(alokasi) ? 0 : alokasi);
    }, 0);
    
    // Kelompokkan program berdasarkan UKE II
    const programsByUke = items.reduce((acc, item) => {
        if (!acc[item.ukeII]) {
            acc[item.ukeII] = {
                programs: [],
                totalAlokasi: 0
            };
        }
        // Pastikan alokasi adalah angka
        const alokasi = Number(item.alokasi);
        acc[item.ukeII].programs.push(item);
        acc[item.ukeII].totalAlokasi += isNaN(alokasi) ? 0 : alokasi;
        return acc;
    }, {});

    // Generate HTML untuk popup
    return `
        <div class="map-popup">
            <div class="popup-header" style="background: ${getMarkerColor(items.length)}">
                <div class="header-content">
                    <div class="location-info">
                        <h3>${kabupaten}</h3>
                        <p>${provinsi}</p>
                    </div>
                    <div class="stats-info">
                        <div class="stat">
                            <span class="stat-value">${items.length}</span>
                            <span class="stat-label">Program</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">Rp ${formatRupiah(totalAlokasi)}</span>
                            <span class="stat-label">Total Alokasi</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="popup-content">
                <div class="program-list">
                    ${Object.entries(programsByUke).map(([uke, { programs, totalAlokasi }]) => `
                        <div class="uke-section">
                            <div class="uke-header">
                                <div class="uke-title">
                                    <h4>${uke}</h4>
                                    <span class="program-count">${programs.length} Program</span>
                                </div>
                                <div class="uke-alokasi">
                                    Rp ${formatRupiah(totalAlokasi)}
                                </div>
                            </div>
                            <div class="program-items">
                                ${programs.map(program => {
                                    const alokasi = Number(program.alokasi);
                                    return `
                                    <div class="program-item">
                                        <div class="program-header">
                                            <span class="program-tag">${program.programPrioritas || ''}</span>
                                            <span class="program-alokasi">Rp ${formatRupiah(isNaN(alokasi) ? 0 : alokasi)}</span>
                                        </div>
                                        <div class="program-name">${program.menuKegiatan || ''}</div>
                                        <div class="program-target">
                                            <span class="material-icons-round">flag</span>
                                            ${program.target || 0} ${program.satuan || ''}
                                        </div>
                                    </div>
                                `}).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', function() {
    initMap();
    loadSampleData();
}); 