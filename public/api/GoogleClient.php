<?php
/**
 * public/api/GoogleClient.php
 *
 * Frittstående, lettvekt Google API-klient i ren PHP (uten Composer-avhengigheter).
 * Bruker OpenSSL og cURL for:
 *   1. Google OAuth2 Service Account JWT-autentisering (Sheets og Drive).
 *   2. Google Sheets API v4 (lesing, oppdatering, appending, radsletting).
 *   3. Google Drive API v3 (opplasting av turbilder, mapper, sletting).
 *   4. Google Identity Services ID-token-validering mot tokeninfo.
 */

if (!function_exists('str_contains')) {
    function str_contains(string $haystack, string $needle): bool {
        return $needle === '' || strpos($haystack, $needle) !== false;
    }
}
if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool {
        return strncmp($haystack, $needle, strlen($needle)) === 0;
    }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with(string $haystack, string $needle): bool {
        return $needle === '' || substr($haystack, -strlen($needle)) === $needle;
    }
}

class GoogleClient {
    private array $serviceAccount;
    private string $cachePath;

    public function __construct(string $serviceAccountPath) {
        if (!file_exists($serviceAccountPath)) {
            throw new Exception("Fant ikke Google Service Account-fil: $serviceAccountPath");
        }
        $content = file_get_contents($serviceAccountPath);
        $data = json_decode($content, true);
        if (!is_array($data) || empty($data['client_email']) || empty($data['private_key'])) {
            throw new Exception("Ugyldig format på Service Account JSON-fil.");
        }
        $this->serviceAccount = $data;
        $this->cachePath = sys_get_temp_dir() . '/tortur_sa_token_' . md5($data['client_email']) . '.json';
    }

    /**
     * Validerer et Google ID-token (fra Google Identity Services) mot Googles tokeninfo-endepunkt.
     * Returnerer payload array ved suksess, eller null ved ugyldig token.
     */
    public static function validateIdToken(string $idToken): ?array {
        $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            return null;
        }

        $payload = json_decode($response, true);
        if (!is_array($payload) || empty($payload['email'])) {
            return null;
        }

        // Krev at e-posten er verifisert av Google
        $emailVerified = $payload['email_verified'] ?? false;
        if ($emailVerified !== true && $emailVerified !== 'true' && $emailVerified !== 1) {
            return null;
        }

        return $payload;
    }

    /**
     * Henter gyldig OAuth2 Bearer Access Token for Service Account (bruker lokal fil-cache).
     */
    public function getAccessToken(): string {
        // 1. Sjekk cache
        if (file_exists($this->cachePath)) {
            $cached = json_decode(file_get_contents($this->cachePath), true);
            if (is_array($cached) && !empty($cached['token']) && !empty($cached['expires_at'])) {
                if ($cached['expires_at'] > time() + 60) {
                    return $cached['token'];
                }
            }
        }

        // 2. Generer JWT
        $now = time();
        $header = ['alg' => 'RS256', 'typ' => 'JWT'];
        $claims = [
            'iss' => $this->serviceAccount['client_email'],
            'scope' => 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600
        ];

        $base64Header = $this->base64UrlEncode(json_encode($header));
        $base64Claims = $this->base64UrlEncode(json_encode($claims));
        $signatureInput = $base64Header . '.' . $base64Claims;

        $signature = '';
        $privateKey = openssl_pkey_get_private($this->serviceAccount['private_key']);
        if (!$privateKey) {
            throw new Exception("Ugyldig privat nøkkel i Service Account.");
        }
        $success = openssl_sign($signatureInput, $signature, $privateKey, OPENSSL_ALGO_SHA256);
        if (!$success) {
            throw new Exception("Kunne ikke signere JWT med OpenSSL: " . openssl_error_string());
        }

        $jwt = $signatureInput . '.' . $this->base64UrlEncode($signature);

        // 3. Veksle JWT i et Google OAuth2 Access Token
        $ch = curl_init('https://oauth2.googleapis.com/token');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion'  => $jwt
            ]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode($response, true);
        if ($httpCode !== 200 || empty($json['access_token'])) {
            $err = $json['error_description'] ?? $json['error'] ?? 'Ukjent token-feil';
            throw new Exception("Feil ved henting av Google Access Token ($httpCode): $err");
        }

        $token = $json['access_token'];
        $expiresIn = (int)($json['expires_in'] ?? 3600);

        // Cache tokenet
        @file_put_contents($this->cachePath, json_encode([
            'token' => $token,
            'expires_at' => $now + $expiresIn
        ]));

        return $token;
    }

    // =========================================================================
    // Google Sheets API v4
    // =========================================================================

    /**
     * Leser celle-verdier fra en fane/range i Google Sheets.
     */
    public function getSheetValues(string $spreadsheetId, string $range): array {
        $encodedRange = urlencode($range);
        $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$encodedRange}";
        $res = $this->apiCall('GET', $url);
        return $res['values'] ?? [];
    }

    /**
     * Oppdaterer celle-verdier for en spesifikk range.
     */
    public function updateSheetValues(string $spreadsheetId, string $range, array $values): bool {
        $encodedRange = urlencode($range);
        $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$encodedRange}?valueInputOption=USER_ENTERED";
        $body = ['values' => $values];
        $res = $this->apiCall('PUT', $url, $body);
        return isset($res['updatedRows']);
    }

    /**
     * Legger til en ny rad på slutten av en fane.
     */
    public function appendSheetRow(string $spreadsheetId, string $sheetName, array $rowValues): bool {
        $encodedRange = urlencode($sheetName . '!A1');
        $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}/values/{$encodedRange}:append?valueInputOption=USER_ENTERED";
        $body = ['values' => [$rowValues]];
        $res = $this->apiCall('POST', $url, $body);
        return isset($res['updates']);
    }

    /**
     * Henter numerisk sheetId for en gitt fane basert på tittel.
     */
    public function getSheetIdByName(string $spreadsheetId, string $sheetName): ?int {
        $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}?fields=sheets(properties(sheetId,title))";
        $res = $this->apiCall('GET', $url);
        if (!empty($res['sheets'])) {
            foreach ($res['sheets'] as $sheet) {
                if (isset($sheet['properties']['title']) && $sheet['properties']['title'] === $sheetName) {
                    return (int)$sheet['properties']['sheetId'];
                }
            }
        }
        return null;
    }

    /**
     * Sletter en spesifikk rad (0-indeksert) fra en fane.
     */
    public function deleteSheetRow(string $spreadsheetId, int $sheetId, int $zeroBasedRowIndex): bool {
        $url = "https://sheets.googleapis.com/v4/spreadsheets/{$spreadsheetId}:batchUpdate";
        $body = [
            'requests' => [
                [
                    'deleteDimension' => [
                        'range' => [
                            'sheetId' => $sheetId,
                            'dimension' => 'ROWS',
                            'startIndex' => $zeroBasedRowIndex,
                            'endIndex' => $zeroBasedRowIndex + 1
                        ]
                    ]
                ]
            ]
        ];
        $res = $this->apiCall('POST', $url, $body);
        return isset($res['replies']);
    }

    // =========================================================================
    // Google Drive API v3
    // =========================================================================

    /**
     * Finner eller oppretter en undermappe for turposten under baseFolderId.
     */
    public function ensureDriveFolder(string $folderName, ?string $baseFolderId = null): string {
        $query = "name = '" . addslashes($folderName) . "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
        if ($baseFolderId) {
            $query .= " and '" . addslashes($baseFolderId) . "' in parents";
        }
        $url = "https://www.googleapis.com/drive/v3/files?q=" . urlencode($query) . "&fields=files(id,name)";
        $res = $this->apiCall('GET', $url);

        if (!empty($res['files'][0]['id'])) {
            return $res['files'][0]['id'];
        }

        // Mappen fantes ikke – opprett den
        $createUrl = "https://www.googleapis.com/drive/v3/files";
        $metadata = [
            'name' => $folderName,
            'mimeType' => 'application/vnd.google-apps.folder'
        ];
        if ($baseFolderId) {
            $metadata['parents'] = [$baseFolderId];
        }
        $created = $this->apiCall('POST', $createUrl, $metadata);
        $folderId = $created['id'] ?? '';

        if ($folderId) {
            // Gi lesetilgang til alle med lenke
            $this->setDrivePublicPermission($folderId);
        }

        return $folderId;
    }

    /**
     * Laster opp et bilde til Google Drive via multipart upload og returnerer lh3-bilde-URL.
     */
    public function uploadImage(string $turpostId, array $imageObj, ?string $baseFolderId = null): string {
        $base64 = $imageObj['base64'] ?? '';
        if (str_contains($base64, ',')) {
            $base64 = explode(',', $base64, 2)[1];
        }
        $binary = base64_decode($base64);
        if (!$binary) {
            return '';
        }

        $mimeType = $imageObj['mimeType'] ?? 'image/jpeg';
        $ext = str_contains($mimeType, 'png') ? '.png' : (str_contains($mimeType, 'webp') ? '.webp' : '.jpg');
        $fileName = $imageObj['fileName'] ?? ('innsjekk_' . round(microtime(true) * 1000) . $ext);

        $targetFolderId = $this->ensureDriveFolder(strval($turpostId), $baseFolderId);

        $metadata = [
            'name' => $fileName,
            'parents' => [$targetFolderId]
        ];

        $boundary = '-------314159265358979323846';
        $delimiter = "\r\n--" . $boundary . "\r\n";
        $closeDelimiter = "\r\n--" . $boundary . "--";

        $multipartBody = $delimiter
            . "Content-Type: application/json; charset=UTF-8\r\n\r\n"
            . json_encode($metadata)
            . $delimiter
            . "Content-Type: " . $mimeType . "\r\n"
            . "Content-Transfer-Encoding: binary\r\n\r\n"
            . $binary
            . $closeDelimiter;

        $token = $this->getAccessToken();
        $uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

        $ch = curl_init($uploadUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $multipartBody,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $token,
                'Content-Type: multipart/related; boundary=' . $boundary,
                'Content-Length: ' . strlen($multipartBody)
            ],
            CURLOPT_TIMEOUT => 30,
            CURLOPT_SSL_VERIFYPEER => true
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode($response, true);
        if ($httpCode !== 200 || empty($json['id'])) {
            $err = $json['error']['message'] ?? "HTTP $httpCode: $response";
            error_log("[GoogleDrive] Opplasting feilet: $err");
            return '';
        }

        $fileId = $json['id'];
        $this->setDrivePublicPermission($fileId);

        return "https://lh3.googleusercontent.com/d/{$fileId}";
    }

    /**
     * Sletter en fil fra Google Drive (trasher den).
     */
    public function deleteDriveFile(string $fileId): bool {
        if (!$fileId) return false;
        $url = "https://www.googleapis.com/drive/v3/files/{$fileId}";
        try {
            $this->apiCall('DELETE', $url);
            return true;
        } catch (Exception $e) {
            return false;
        }
    }

    /**
     * Gir lesetilgang for alle med lenken (slik at lh3-bilde-URL fungerer).
     */
    public function setDrivePublicPermission(string $fileOrFolderId): void {
        $url = "https://www.googleapis.com/drive/v3/files/{$fileOrFolderId}/permissions";
        $body = [
            'role' => 'reader',
            'type' => 'anyone'
        ];
        try {
            $this->apiCall('POST', $url, $body);
        } catch (Exception $e) {
            // Ignorer feil dersom tillatelse allerede finnes
        }
    }

    // =========================================================================
    // Hjelpefunksjoner
    // =========================================================================

    private function apiCall(string $method, string $url, ?array $body = null): array {
        $token = $this->getAccessToken();
        $ch = curl_init($url);
        $headers = [
            'Authorization: Bearer ' . $token,
            'Accept: application/json'
        ];

        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_SSL_VERIFYPEER => true
        ];

        if ($method === 'POST') {
            $opts[CURLOPT_POST] = true;
            if ($body !== null) {
                $opts[CURLOPT_POSTFIELDS] = json_encode($body);
                $headers[] = 'Content-Type: application/json; charset=utf-8';
            }
        } elseif ($method === 'PUT') {
            $opts[CURLOPT_CUSTOMREQUEST] = 'PUT';
            if ($body !== null) {
                $opts[CURLOPT_POSTFIELDS] = json_encode($body);
                $headers[] = 'Content-Type: application/json; charset=utf-8';
            }
        } elseif ($method === 'DELETE') {
            $opts[CURLOPT_CUSTOMREQUEST] = 'DELETE';
        }

        $opts[CURLOPT_HTTPHEADER] = $headers;
        curl_setopt_array($ch, $opts);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            throw new Exception("Nettverksfeil mot Google API: $err");
        }

        if ($httpCode >= 400) {
            $json = json_decode($response, true);
            $msg = $json['error']['message'] ?? "HTTP $httpCode: $response";
            throw new Exception("Google API feil: $msg");
        }

        return json_decode($response, true) ?? [];
    }

    private function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
