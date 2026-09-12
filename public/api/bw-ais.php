<?php
// bw-ais.php - Server-side proxy for BarentsWatch Live AIS combined endpoint
header('Content-Type: application/json; charset=utf-8');

// Tillat kun POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Kun POST er tillatt']);
    exit;
}

// Hent Authorization header robust (Apache/LiteSpeed kan strippe Authorization)
$authHeader = '';
if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
    $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
} elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
    $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
} elseif (function_exists('apache_request_headers')) {
    $headers = apache_request_headers();
    if (!empty($headers['Authorization'])) {
        $authHeader = $headers['Authorization'];
    } elseif (!empty($headers['authorization'])) {
        $authHeader = $headers['authorization'];
    }
}

// Fallback: sjekk om token ble sendt via query parameter ?token=...
if (!$authHeader && !empty($_GET['token'])) {
    $authHeader = 'Bearer ' . trim($_GET['token']);
}

if (!$authHeader) {
    http_response_code(401);
    echo json_encode(['error' => 'Mangler Authorization header']);
    exit;
}

// Hent GeoJSON-polygon eller bounds fra body
$rawBody = file_get_contents('php://input');
if (!$rawBody) {
    http_response_code(400);
    echo json_encode(['error' => 'Mangler forespørselsdata i body']);
    exit;
}

// Parse innkommende bounding box
$minLat = null;
$maxLat = null;
$minLng = null;
$maxLng = null;
$hasBounds = false;

$inputData = json_decode($rawBody, true);
if (is_array($inputData)) {
    if (!empty($inputData['bounds']) && is_array($inputData['bounds'])) {
        $b = $inputData['bounds'];
        if (isset($b['minLat'], $b['maxLat'], $b['minLng'], $b['maxLng'])) {
            $minLat = (float)$b['minLat'];
            $maxLat = (float)$b['maxLat'];
            $minLng = (float)$b['minLng'];
            $maxLng = (float)$b['maxLng'];
            $hasBounds = true;
        }
    } elseif (!empty($inputData['coordinates']) && is_array($inputData['coordinates'][0])) {
        $coords = $inputData['coordinates'][0];
        $lngs = array_column($coords, 0);
        $lats = array_column($coords, 1);
        if (!empty($lngs) && !empty($lats)) {
            $minLng = min($lngs);
            $maxLng = max($lngs);
            $minLat = min($lats);
            $maxLat = max($lats);
            $hasBounds = true;
        }
    }
}

// Server-side cache for å unngå gjentatte store nedlastinger fra BarentsWatch
$cacheDir = sys_get_temp_dir();
$cacheFile = rtrim($cacheDir, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'tortur_bw_ais_cache.json';
$cacheTtl = 25; // sekunder

$rawAisResponse = null;
$fromCache = false;

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtl) {
    $cachedContent = @file_get_contents($cacheFile);
    if ($cachedContent) {
        $rawAisResponse = $cachedContent;
        $fromCache = true;
    }
}

if (!$rawAisResponse) {
    // Hent ferske data fra BarentsWatch
    $ch = curl_init('https://live.ais.barentswatch.no/v1/latest/combined');
    curl_setopt_array($ch, [
        CURLOPT_HTTPGET => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: ' . $authHeader,
            'Accept: application/json'
        ],
        CURLOPT_TIMEOUT => 20,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        http_response_code(502);
        echo json_encode(['error' => 'cURL-feil mot BarentsWatch AIS: ' . $curlError]);
        exit;
    }

    if ($httpCode >= 200 && $httpCode < 300 && $response) {
        $rawAisResponse = $response;
        @file_put_contents($cacheFile, $response);
    } else {
        http_response_code($httpCode ?: 500);
        echo $response;
        exit;
    }
}

// Filtrer fartøy basert på bounding box
$decoded = json_decode($rawAisResponse, true);
if (!is_array($decoded)) {
    http_response_code(200);
    echo $rawAisResponse;
    exit;
}

if ($hasBounds) {
    $filtered = [];
    foreach ($decoded as $vessel) {
        if (!isset($vessel['latitude']) || !isset($vessel['longitude'])) {
            continue;
        }
        $lat = (float)$vessel['latitude'];
        $lng = (float)$vessel['longitude'];

        if ($lat >= $minLat && $lat <= $maxLat && $lng >= $minLng && $lng <= $maxLng) {
            $filtered[] = $vessel;
        }
    }
    $decoded = $filtered;
}

header('X-AIS-Cache: ' . ($fromCache ? 'HIT' : 'MISS'));
header('X-AIS-Count: ' . count($decoded));
echo json_encode($decoded);

