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

// Hent GeoJSON-polygon fra body
$rawBody = file_get_contents('php://input');
if (!$rawBody) {
    http_response_code(400);
    echo json_encode(['error' => 'Mangler GeoJSON polygon i body']);
    exit;
}

$ch = curl_init('https://live.ais.barentswatch.no/v1/latest/combined');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $rawBody,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: ' . $authHeader,
        'Content-Type: application/json',
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

http_response_code($httpCode ?: 200);
echo $response;
