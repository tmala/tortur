<?php
/**
 * public/api/index.php
 *
 * TorTur PHP Backend API – Erstatter Google Apps Script med lynrask respons (<100ms).
 * Kommuniserer direkte med Google Sheets API v4 og Google Drive API v3 via GoogleClient.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// Håndter CORS for frontend
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/GoogleClient.php';

// GET-kall fungerer som helsekontroll og diagnostikk
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $configFile = __DIR__ . '/config.php';
    $configExists = file_exists($configFile);
    $diag = [
        'status'      => 'ok',
        'app'         => 'TorTur PHP Backend API',
        'php_version' => PHP_VERSION,
        'timestamp'   => gmdate('Y-m-d\TH:i:s\Z'),
        'config'      => [
            'config_file' => $configExists ? 'found' : 'missing'
        ]
    ];

    if ($configExists) {
        $cfg = require $configFile;
        $ssId = $cfg['spreadsheet_id'] ?? '';
        $saFile = $cfg['service_account_file'] ?? (__DIR__ . '/service-account.json');

        $diag['config']['spreadsheet_id'] = (!empty($ssId) && $ssId !== 'FYLL_INN_DIN_SPREADSHEET_ID_HER') ? 'configured' : 'missing_or_default';
        $diag['config']['service_account_file'] = file_exists($saFile) ? 'found' : 'not_found';
        $diag['config']['appscript_url'] = !empty($cfg['appscript_url']) ? 'configured' : 'not_set';

        if (file_exists($saFile)) {
            try {
                $testClient = new GoogleClient($saFile);
                $token = $testClient->getAccessToken();
                $diag['google_auth'] = !empty($token) ? 'connected' : 'no_token';
            } catch (Throwable $t) {
                $diag['google_auth'] = 'error: ' . $t->getMessage();
            }
        } else {
            $diag['google_auth'] = 'skipped (service_account_file not found)';
        }
    } else {
        $diag['google_auth'] = 'skipped (config.php missing)';
    }

    echo json_encode($diag, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

// Last konfigurasjon
$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Konfigurasjonsfil mangler. Vennligst opprett public/api/config.php basert på config.example.php.'
    ]);
    exit;
}

$config = require $configFile;
$spreadsheetId   = $config['spreadsheet_id'] ?? '';
$serviceAccount  = $config['service_account_file'] ?? (__DIR__ . '/service-account.json');
$sheetBrukere    = $config['sheet_brukere'] ?? 'Brukere';
$sheetSystem     = $config['sheet_system'] ?? 'SystemKonfigurasjon';
$sheetInnsjekk   = $config['sheet_innsjekk'] ?? 'TurpostInnsjekk';
$appsScriptUrl   = $config['appscript_url'] ?? ($config['appscript_drive_proxy_url'] ?? null);

if (empty($spreadsheetId) || $spreadsheetId === 'FYLL_INN_DIN_SPREADSHEET_ID_HER') {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'spreadsheet_id er ikke konfigurert i public/api/config.php.'
    ]);
    exit;
}

// Les inn JSON body
$rawInput = file_get_contents('php://input');
$body = [];
if (!empty($rawInput)) {
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $body = $decoded;
    }
}
if (empty($body) && !empty($_POST)) {
    $body = $_POST;
}

$action = strtolower(trim((string)($body['action'] ?? 'login')));

try {
    $client = new GoogleClient($serviceAccount);

    switch ($action) {
        case 'login':
            handleLogin($client, $body, $spreadsheetId, $sheetBrukere, $sheetSystem);
            break;

        case 'checkin':
            handleCheckin($client, $body, $spreadsheetId, $sheetBrukere, $sheetSystem, $sheetInnsjekk, $appsScriptUrl);
            break;

        case 'delete_checkin':
            handleDeleteCheckin($client, $body, $spreadsheetId, $sheetInnsjekk, $appsScriptUrl);
            break;

        case 'update_checkin':
        case 'update_checkin_image':
            handleUpdateCheckin($client, $body, $spreadsheetId, $sheetInnsjekk, $sheetSystem, $appsScriptUrl);
            break;

        case 'getconfig':
        case 'config':
            handleGetConfig($client, $body, $spreadsheetId, $sheetSystem);
            break;

        default:
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error'   => "Ukjent action: {$action}"
            ]);
            break;
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Serverfeil: ' . $e->getMessage()
    ]);
}

// =============================================================================
// Handlere
// =============================================================================

function handleLogin(GoogleClient $client, array $body, string $ssId, string $sheetBrukere, string $sheetSystem): void {
    $idToken = $body['idToken'] ?? '';
    if (empty($idToken)) {
        echo json_encode(['success' => false, 'error' => 'Mangler idToken i forespørselen.']);
        return;
    }

    $googleUser = GoogleClient::validateIdToken($idToken);
    if (!$googleUser) {
        echo json_encode(['success' => false, 'error' => 'Ugyldig Google-token. Prøv å logge inn på nytt.']);
        return;
    }

    $email = strtolower(trim($googleUser['email'] ?? ''));

    // Les "Brukere"-fanen
    $rows = $client->getSheetValues($ssId, "{$sheetBrukere}!A:F");
    $userRowIndex = -1; // 1-indeksert radnummer i regneark
    $isAdmin = false;

    // Rad 0 er overskrift
    for ($i = 1; $i < count($rows); $i++) {
        $rowEmail = strtolower(trim((string)($rows[$i][2] ?? ''))); // Kolonne C (indeks 2)
        if ($rowEmail === $email) {
            $userRowIndex = $i + 1;
            $isAdmin = strtoupper(trim((string)($rows[$i][5] ?? ''))) === 'Y'; // Kolonne F (indeks 5)
            break;
        }
    }

    if ($userRowIndex === -1) {
        echo json_encode([
            'success' => false,
            'error'   => "Brukeren <{$googleUser['email']}> er ikke whitelistet for TorTur-appen. Ta kontakt med administrator for å få tilgang."
        ]);
        return;
    }

    // Oppdater brukerraden (UserID, UserName, AvatarUrl, LastLogin)
    $now = gmdate('Y-m-d\TH:i:s\Z');
    $sub = (string)($googleUser['sub'] ?? '');
    $name = (string)($googleUser['name'] ?? '');
    $picture = (string)($googleUser['picture'] ?? '');

    $updateRange = "{$sheetBrukere}!A{$userRowIndex}:E{$userRowIndex}";
    $client->updateSheetValues($ssId, $updateRange, [
        [$sub, $name, $googleUser['email'], $picture, $now]
    ]);

    // Hent systemkonfigurasjon
    $systemConfig = fetchSystemConfig($client, $ssId, $sheetSystem);

    echo json_encode([
        'success' => true,
        'user' => [
            'userId'    => $sub,
            'userName'  => $name,
            'email'     => $googleUser['email'],
            'avatarUrl' => $picture,
            'lastLogin' => $now,
            'isAdmin'   => $isAdmin
        ],
        'systemConfig' => $systemConfig
    ]);
}

function handleCheckin(GoogleClient $client, array $body, string $ssId, string $sheetBrukere, string $sheetSystem, string $sheetInnsjekk, ?string $appsScriptUrl = null): void {
    $turpostId = trim((string)($body['turpostId'] ?? ''));
    if (empty($turpostId)) {
        echo json_encode(['success' => false, 'error' => 'Mangler turpostId for innsjekk.']);
        return;
    }

    $userId = (string)($body['userId'] ?? '');
    $email = strtolower(trim((string)($body['email'] ?? '')));

    if (!empty($body['idToken'])) {
        $googleUser = GoogleClient::validateIdToken($body['idToken']);
        if ($googleUser) {
            $userId = (string)($googleUser['sub'] ?? $userId);
            $email = strtolower(trim((string)($googleUser['email'] ?? $email)));
        }
    }

    if (empty($userId) && empty($email)) {
        echo json_encode(['success' => false, 'error' => 'Ugyldig eller manglende brukerinfo for innsjekking.']);
        return;
    }

    // Sjekk at brukeren er registrert i "Brukere"
    $rows = $client->getSheetValues($ssId, "{$sheetBrukere}!A:E");
    $isWhitelisted = false;
    $userName = '';
    $userAvatar = '';

    for ($i = 1; $i < count($rows); $i++) {
        $rowUserId = trim((string)($rows[$i][0] ?? ''));
        $rowEmail  = strtolower(trim((string)($rows[$i][2] ?? '')));
        if (($userId && $rowUserId === $userId) || ($email && $rowEmail === $email)) {
            $isWhitelisted = true;
            if (empty($userId)) $userId = $rowUserId ?: $email;
            $userName   = trim((string)($rows[$i][1] ?? ''));
            $userAvatar = trim((string)($rows[$i][3] ?? ''));
            break;
        }
    }

    if (!$isWhitelisted) {
        echo json_encode(['success' => false, 'error' => 'Brukeren er ikke registrert i brukeroversikten for TorTur.']);
        return;
    }

    $systemConfig = fetchSystemConfig($client, $ssId, $sheetSystem);
    $effectiveAppsScriptUrl = $appsScriptUrl ?: (!empty($systemConfig['APPSCRIPT_URL']) ? trim($systemConfig['APPSCRIPT_URL']) : null);

    // Håndter bildeopplasting til Google Drive via Apps Script
    $imageUrl = '';
    if (!empty($body['image']['base64'])) {
        $imageUrl = handleImageUpload($turpostId, $body['image'], $client, $effectiveAppsScriptUrl);
    }

    $checkinId   = 'c_' . round(microtime(true) * 1000);
    $timestamp   = gmdate('Y-m-d\TH:i:s\Z');
    $description = trim((string)($body['description'] ?? ''));

    // Legg til innsjekkingsrad i TurpostInnsjekk:
    // A: UserID | B: TurpostID | C: TimeStamp | D: Beskrivelse | E: BildeURL | F: CheckinID
    $client->appendSheetRow($ssId, $sheetInnsjekk, [
        $userId,
        $turpostId,
        $timestamp,
        $description,
        $imageUrl,
        $checkinId
    ]);

    echo json_encode([
        'success' => true,
        'checkin' => [
            'id'          => $checkinId,
            'userId'      => $userId,
            'userName'    => $userName,
            'userAvatar'  => $userAvatar,
            'turpostId'   => $turpostId,
            'timestamp'   => $timestamp,
            'description' => $description,
            'imageUrl'    => $imageUrl
        ],
        'systemConfig' => $systemConfig
    ]);
}

function handleDeleteCheckin(GoogleClient $client, array $body, string $ssId, string $sheetInnsjekk, ?string $appsScriptUrl = null): void {
    $turpostId = (string)($body['turpostId'] ?? '');
    $checkinId = (string)($body['checkinId'] ?? '');
    $timestamp = (string)($body['timestamp'] ?? '');
    $userId    = (string)($body['userId'] ?? '');

    if (!empty($body['idToken'])) {
        $googleUser = GoogleClient::validateIdToken($body['idToken']);
        if ($googleUser) {
            $userId = (string)($googleUser['sub'] ?? $userId);
        }
    }

    if (empty($userId)) {
        echo json_encode(['success' => false, 'error' => 'Ugyldig eller manglende brukeridentifikator for sletting.']);
        return;
    }

    $rows = $client->getSheetValues($ssId, "{$sheetInnsjekk}!A:F");
    $sheetId = $client->getSheetIdByName($ssId, $sheetInnsjekk);

    $deletedFromSheet = false;
    $deletedImages = 0;

    if ($sheetId !== null && count($rows) > 1) {
        // Søk fra bunnen
        for ($i = count($rows) - 1; $i >= 1; $i--) {
            $rowUserId    = trim((string)($rows[$i][0] ?? ''));
            $rowTurpostId = trim((string)($rows[$i][1] ?? ''));
            $rowTimestamp = trim((string)($rows[$i][2] ?? ''));
            $rowImageUrl  = trim((string)($rows[$i][4] ?? ''));
            $rowCheckinId = trim((string)($rows[$i][5] ?? ''));

            if ($rowUserId !== $userId) {
                continue;
            }

            $isMatch = false;
            if ($checkinId && $rowCheckinId === $checkinId) {
                $isMatch = true;
            } elseif ($turpostId && $rowTurpostId === $turpostId) {
                if ($checkinId && $rowCheckinId === $checkinId) {
                    $isMatch = true;
                } elseif ($timestamp && $rowTimestamp === $timestamp) {
                    $isMatch = true;
                }
            }

            if ($isMatch) {
                if ($rowImageUrl) {
                    deleteCheckinImage($rowImageUrl, $client, $appsScriptUrl);
                    $deletedImages++;
                }

                $client->deleteSheetRow($ssId, $sheetId, $i);
                $deletedFromSheet = true;
                break;
            }
        }
    }

    echo json_encode([
        'success'          => true,
        'checkinId'        => $checkinId,
        'deletedFromSheet' => $deletedFromSheet,
        'deletedImages'    => $deletedImages
    ]);
}

function handleUpdateCheckin(GoogleClient $client, array $body, string $ssId, string $sheetInnsjekk, string $sheetSystem, ?string $appsScriptUrl = null): void {
    $turpostId = (string)($body['turpostId'] ?? '');
    $checkinId = (string)($body['checkinId'] ?? '');
    $timestamp = (string)($body['timestamp'] ?? '');
    $userId    = (string)($body['userId'] ?? '');

    if (!empty($body['idToken'])) {
        $googleUser = GoogleClient::validateIdToken($body['idToken']);
        if ($googleUser) {
            $userId = (string)($googleUser['sub'] ?? $userId);
        }
    }

    if (empty($userId)) {
        echo json_encode(['success' => false, 'error' => 'Ugyldig eller manglende brukeridentifikator for oppdatering.']);
        return;
    }

    $rows = $client->getSheetValues($ssId, "{$sheetInnsjekk}!A:F");
    $foundRowIndex = -1; // 1-indeksert
    $oldImageUrl = '';

    for ($i = 1; $i < count($rows); $i++) {
        $rowUserId    = trim((string)($rows[$i][0] ?? ''));
        $rowTurpostId = trim((string)($rows[$i][1] ?? ''));
        $rowTimestamp = trim((string)($rows[$i][2] ?? ''));
        $rowImageUrl  = trim((string)($rows[$i][4] ?? ''));
        $rowCheckinId = trim((string)($rows[$i][5] ?? ''));

        if ($rowUserId !== $userId) {
            continue;
        }

        $isMatch = false;
        if ($checkinId && $rowCheckinId === $checkinId) {
            $isMatch = true;
        } elseif ($turpostId && $rowTurpostId === $turpostId) {
            if ($checkinId && $rowCheckinId === $checkinId) {
                $isMatch = true;
            } elseif ($timestamp && $rowTimestamp === $timestamp) {
                $isMatch = true;
            }
        }

        if ($isMatch) {
            $foundRowIndex = $i + 1;
            $oldImageUrl = $rowImageUrl;
            break;
        }
    }

    if ($foundRowIndex === -1) {
        echo json_encode(['success' => false, 'error' => 'Fant ikke innsjekkingen som skulle oppdateres.']);
        return;
    }

    $updatedDescription = isset($body['description']) ? trim((string)$body['description']) : null;
    $updatedImageUrl = null;

    if ($updatedDescription !== null) {
        $client->updateSheetValues($ssId, "{$sheetInnsjekk}!D{$foundRowIndex}", [[$updatedDescription]]);
    }

    $systemConfig = fetchSystemConfig($client, $ssId, $sheetSystem);
    $effectiveAppsScriptUrl = $appsScriptUrl ?: (!empty($systemConfig['APPSCRIPT_URL']) ? trim($systemConfig['APPSCRIPT_URL']) : null);

    if (!empty($body['image']['base64'])) {
        if ($oldImageUrl) {
            deleteCheckinImage($oldImageUrl, $client, $effectiveAppsScriptUrl);
        }

        $updatedImageUrl = handleImageUpload($turpostId, $body['image'], $client, $effectiveAppsScriptUrl);

        $client->updateSheetValues($ssId, "{$sheetInnsjekk}!E{$foundRowIndex}", [[$updatedImageUrl]]);
    } elseif (!empty($body['removeImage'])) {
        if ($oldImageUrl) {
            deleteCheckinImage($oldImageUrl, $client, $effectiveAppsScriptUrl);
        }
        $updatedImageUrl = '';
        $client->updateSheetValues($ssId, "{$sheetInnsjekk}!E{$foundRowIndex}", [['']]);
    }

    echo json_encode([
        'success'     => true,
        'checkinId'   => $checkinId,
        'description' => $updatedDescription,
        'imageUrl'    => $updatedImageUrl !== null ? $updatedImageUrl : $oldImageUrl
    ]);
}

function handleGetConfig(GoogleClient $client, array $body, string $ssId, string $sheetSystem): void {
    $userId = (string)($body['userId'] ?? '');
    if (empty($userId) && !empty($body['idToken'])) {
        $u = GoogleClient::validateIdToken($body['idToken']);
        if ($u) $userId = (string)($u['sub'] ?? '');
    }

    if (empty($userId)) {
        echo json_encode(['success' => false, 'error' => 'Krever innlogging for å hente systemkonfigurasjon.']);
        return;
    }

    $systemConfig = fetchSystemConfig($client, $ssId, $sheetSystem);
    echo json_encode(['success' => true, 'systemConfig' => $systemConfig]);
}

function fetchSystemConfig(GoogleClient $client, string $ssId, string $sheetSystem): array {
    $rows = $client->getSheetValues($ssId, "{$sheetSystem}!A:B");
    $config = [];
    for ($i = 1; $i < count($rows); $i++) {
        $key = trim((string)($rows[$i][0] ?? ''));
        $val = trim((string)($rows[$i][1] ?? ''));
        if ($key !== '') {
            $config[$key] = $val;
        }
    }
    return $config;
}

/**
 * Sletter bilde fra Google Drive via Apps Script Drive-proxy.
 */
function deleteCheckinImage(?string $url, GoogleClient $client, ?string $appsScriptUrl = null): void {
    if (!$url || empty($appsScriptUrl)) return;
    $client->deleteImageViaAppsScript($appsScriptUrl, $url);
}

/**
 * Laster opp bilde til Google Drive via Google Apps Script (Drive-proxy).
 * Returnerer bilde-URL (https://lh3.googleusercontent.com/d/...) eller tom streng.
 */
function handleImageUpload(string $turpostId, array $imageObj, GoogleClient $client, ?string $appsScriptUrl = null): string {
    if (empty($imageObj['base64'])) {
        return '';
    }

    if (empty($appsScriptUrl)) {
        error_log("[Upload] Bildeopplasting feilet: appscript_url er ikke konfigurert.");
        return '';
    }

    $img = $client->uploadImageViaAppsScript($appsScriptUrl, $turpostId, $imageObj);
    if (!empty($img)) {
        return $img;
    }

    error_log("[Upload] Bildeopplasting via Google Apps Script feilet.");
    return '';
}
