<?php
// bw-token.php - Server-side proxy for BarentsWatch OAuth2 Token endpoint
header('Content-Type: application/json; charset=utf-8');

// Tillat kun POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Kun POST er tillatt']);
    exit;
}

// Les innloggingsdata fra POST eller rå JSON-body
$clientId = $_POST['client_id'] ?? null;
$clientSecret = $_POST['client_secret'] ?? null;
$scope = $_POST['scope'] ?? 'ais';
$grantType = $_POST['grant_type'] ?? 'client_credentials';

if (!$clientId || !$clientSecret) {
    $rawInput = file_get_contents('php://input');
    if ($rawInput) {
        $json = json_decode($rawInput, true);
        if (is_array($json)) {
            $clientId = $json['client_id'] ?? $clientId;
            $clientSecret = $json['client_secret'] ?? $clientSecret;
            $scope = $json['scope'] ?? $scope;
            $grantType = $json['grant_type'] ?? $grantType;
        }
    }
}

if (!$clientId || !$clientSecret) {
    http_response_code(400);
    echo json_encode(['error' => 'Mangler client_id eller client_secret']);
    exit;
}

$postFields = http_build_query([
    'grant_type' => $grantType,
    'client_id' => trim($clientId),
    'client_secret' => trim($clientSecret),
    'scope' => trim($scope)
]);

$ch = curl_init('https://id.barentswatch.no/connect/token');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $postFields,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/x-www-form-urlencoded',
        'Accept: application/json'
    ],
    CURLOPT_TIMEOUT => 15,
    CURLOPT_SSL_VERIFYPEER => true
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode(['error' => 'cURL-feil mot BarentsWatch token: ' . $curlError]);
    exit;
}

http_response_code($httpCode ?: 200);
echo $response;
