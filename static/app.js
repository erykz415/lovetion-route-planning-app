/* map initialization */

const map = L.map("map").setView([0, 0], 2);

/* Day mode layer */
const tileDay = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution:"© OpenStreetMap contributors"
    }
);


/* Night mode layer */
const tileNight = L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
        attribution: "© CartoDB"
    }
);

tileDay.addTo(map);

let isDark = false;


/* Heart markers */
function heartIcon(color) {
    return L.divIcon({
        className: '',
        html: `<div style="
            font-size: 28px;
            line-height: 1;
            color: ${color};
            text-shadow: 0 0 2px #000, 0 0 4px #000;
            filter: drop-shadow(0 2px 3px rgba(0,0,0,0.35));
        ">♥</div>`,
        iconSize:    [40, 40],
        iconAnchor:  [14, 28],
        popupAnchor: [0, -30]
    });
}

const COLORS = {
    start: '#78a3fa',
    stop:  '#fab5ff',
    end:   '#de4545',
};


/* Point management */
let waypoints = [];

map.on('click', function(e){
    addWaypoint(e.latlng);
})

function addWaypoint(latlng, skipUpdate = false) {
    const index = waypoints.length;
    const type = index === 0 ? 'start' : 'stop';
    const color = index === 0 ? COLORS.start : COLORS.stop;

    const marker = L.marker(latlng, {
        icon: heartIcon(color),
        draggable: true,
    }).addTo(map);

    marker.on('dragend', function() {
        waypoints[findMarkerIndex(marker)].latlng = marker.getLatLng();
        updateRoute();
        updatePointsList();
    });

    waypoints.push({latlng, marker, type});

    refreshMarkerIcons();

    if (!skipUpdate) {
        updateRoute(),
        updatePointsList();
    }
}


/* Refreshing colors */
function findMarkerIndex(marker) {
    return waypoints.findIndex(wp => wp.marker === marker);
}

function refreshMarkerIcons() {
    waypoints.forEach((wp, index) => {
        let color;

        if (index === 0) {
            color = COLORS.start;
            wp.type = 'start';
        } else if (index === waypoints.length - 1 && waypoints.length > 1) {
            color = COLORS.end;
            wp.type = 'end';
        } else {
            color = COLORS.stop;
            wp.type = 'stop';
        }

        wp.marker.setIcon(heartIcon(color));
    });
}

function removeWaypoint(index) {
    const wp = waypoints[index];
    map.removeLayer(wp.marker);
    waypoints.splice(index, 1);
    refreshMarkerIcons();
    updateRoute();
    updatePointsList();
}

/* Routing */

let routingControl = null;

function updateRoute() {

    // need at least 2 points to draw a route
    if (waypoints.length < 2) {
        if (routingControl) {
            map.removeControl(routingControl);
            routingControl = null;
        }
        updateStats(null);
        return;
    }

    // collect coordinates from all waypoints
    const latlngs = waypoints.map(wp => wp.latlng);

    // remove previous route
    if (routingControl) {
        map.removeControl(routingControl);
    }

    // create new route
    routingControl = L.Routing.control({
        waypoints: latlngs,
        routeWhileDragging: false,
        show: false,
        addWaypoints: false,
        router: L.Routing.osrmv1({
            serviceUrl: 'https://router.project-osrm.org/route/v1',
            profile: 'foot',
        }),
        lineOptions: {
            styles: [{ color: '#e53e8c', weight: 5, opacity: 0.8 }]
        },
        createMarker: function() { return null; }
    }).addTo(map);

    // when route is calculated -> update stats
    routingControl.on('routesfound', function(e) {
        const route = e.routes[0];
        updateStats(route.summary.totalDistance);
    });
}

function updateStats(distanceMeters) {
    // remember last distance for recalculation when speed changes
    lastDistanceMeters = distanceMeters

    if (distanceMeters === null) {
        document.getElementById('stat-distance').textContent = '—';
        document.getElementById('stat-walk').textContent    = '—';
        document.getElementById('stat-bike').textContent    = '—';
        return;
    }

    // use custom speeds if enabled, otherwise use defaults
    const walkSpeed = customSpeedEnabled
        ? parseFloat(document.getElementById('speed-walk').value)
        : 5;

    const bikeSpeed = customSpeedEnabled
        ? parseFloat(document.getElementById('speed-bike').value)
        : 18;

    const km = (distanceMeters / 1000).toFixed(2)
    const walkMin = Math.round((distanceMeters / 1000 / walkSpeed) * 60);
    const bikeMin = Math.round((distanceMeters / 1000 / bikeSpeed) * 60);

    document.getElementById('stat-distance').textContent = `${km} km`;
    document.getElementById('stat-walk').textContent     = formatTime(walkMin);
    document.getElementById('stat-bike').textContent     = formatTime(bikeMin);
}

function formatTime(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

/* Points list */

function updatePointsList() {
    const list = document.getElementById('points-list');
    list.innerHTML = '';

    waypoints.forEach((wp, index) => {

        // Choose emoji and label based on position
        const isFirst = index === 0;
        const isLast  = index === waypoints.length - 1 && waypoints.length > 1;

        const emoji = isFirst ? '💙' : (isLast ? '❤️' : '🩷');
        const label = isFirst ? 'Start' : (isLast ? 'End' : `Stop ${index}`);

        // Build list item
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="point-label">${emoji} ${label}</span>
            <button onclick="removeWaypoint(${index})" title="Remove point">
                ✕
            </button>
        `;
        list.appendChild(li);
    });
}

/* Address search */

let searchTimeout = null;

function searchAddress(query, type) {
    // cancels the previous timer if the user is still typing
    clearTimeout(searchTimeout);

    // dont search if there are only 3 letters
    if (query.length < 3) {
        document.getElementById(`suggestions-${type}`).innerHTML = '';
        return;
    }

    // waiting for 400ms after last press on keyboard key
    searchTimeout = setTimeout(async () => {
        const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
        const results =  await response.json();
        showSuggestions(results, type);
    }, 400);
}

/* Showing suggestions */
function showSuggestions(results, type) {
    const container = document.getElementById(`suggestions-${type}`);
    // clears previous suggestions before adding new
    container.innerHTML = '';

    results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = result.display_name;
        div.onclick = () => selectAddress(result, type);
        container.appendChild(div);
    });
}


/* Selecting an address */

function selectAddress(result, type) {
    const latlng = L.latLng(result.lat, result.lon);

    // clear suggestions and fill input
    document.getElementById(`suggestions-${type}`).innerHTML = '';
    document.getElementById(`search-${type}`).value = result.display_name;

    if (type === 'start') {
        // if start point already exists — replace it
        if (waypoints.length > 0 && waypoints[0].type === 'start') {
            map.removeLayer(waypoints[0].marker);
            waypoints.splice(0, 1);
        }
        // insert new start point at the beginning of the array
        waypoints.unshift({ latlng, marker: null, type: 'start' });

        const marker = L.marker(latlng, {
            icon: heartIcon(COLORS.start),
            draggable: true,
        }).addTo(map);

        marker.on('dragend', function() {
            waypoints[0].latlng = marker.getLatLng();
            updateRoute();
            updatePointsList();
        });

        waypoints[0].marker = marker;

    } else {
        // end point — add to the end of the array
        addWaypoint(latlng, true);
    }

    refreshMarkerIcons();
    map.setView(latlng, 14);
    updateRoute();
    updatePointsList();
}

/* Night mode */

function toggleTheme() {
    isDark = !isDark;
    document.body.classList.toggle('dark', isDark);

    if (isDark) {
        map.removeLayer(tileDay);
        tileNight.addTo(map);
        document.getElementById('theme-toggle').textContent = '☀️ Day mode';
    } else {
        map.removeLayer(tileNight);
        tileDay.addTo(map);
        document.getElementById('theme-toggle').textContent = '🌙 Night mode';
    }
}

/* Clear route */

function clearRoute() {
    waypoints.forEach(wp => map.removeLayer(wp.marker));
    waypoints = [];

    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }

    updateStats(null);
    updatePointsList();

    document.getElementById('search-start').value = '';
    document.getElementById('search-end').value = '';
}

/* GPS Location */

function useMyLocation() {
    if (!navigator.geolocation) {
        alert("Your browser does not support geolocation.");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const latlng = L.latLng(
                position.coords.latitude,
                position.coords.longitude
            );
            addWaypoint(latlng);
            map.setView(latlng, 14);
        },
        function() {
            alert("Could not get your location. Check browser settings.");
        }
    );
}

/* Jump to place (no marker) */

let jumpTimeout = null;

function searchJump(query) {
    clearTimeout(jumpTimeout);

    if (query.length < 3) {
        document.getElementById('suggestions-jump').innerHTML = '';
        return;
    }

    jumpTimeout = setTimeout(async () => {
        const response = await fetch(`/search?q=${encodeURIComponent(query)}`);
        const results  = await response.json();
        showJumpSuggestions(results);
    }, 400);
}


function showJumpSuggestions(results) {
    const container = document.getElementById('suggestions-jump');
    container.innerHTML = '';

    results.forEach(result => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = result.display_name;
        div.onclick = () => jumpToPlace(result);
        container.appendChild(div);
    });
}


function jumpToPlace(result) {
    // move map to the selected place — no marker added
    map.setView([result.lat, result.lon], 14);

    // clear suggestions and input
    document.getElementById('suggestions-jump').innerHTML = '';
    document.getElementById('search-jump').value = result.display_name;
}


/* Custom speed */
let customSpeedEnabled = false;

function setSpeedMode(enabled) {
    customSpeedEnabled = enabled;

    // toggle active button style
    document.getElementById('btn-speed-off').classList.toggle('active', !enabled);
    document.getElementById('btn-speed-on').classList.toggle('active', enabled);

    // show/hide sliders
    document.getElementById('speed-controls').classList.toggle('hidden', !enabled);

    // recalculate stats with new mode
    recalcStats();
}

function onSpeedChange() {
    const walkSpeed = parseFloat(document.getElementById('speed-walk').value);
    const bikeSpeed = parseFloat(document.getElementById('speed-bike').value);

    document.getElementById('speed-walk-val').textContent = `${walkSpeed} km/h`;
    document.getElementById('speed-bike-val').textContent = `${bikeSpeed} km/h`;

    recalcStats();
}

// stores last knows distance so we can recalculate when speed changes
let lastDistanceMeters = null;

function recalcStats() {
    updateStats(lastDistanceMeters);
}