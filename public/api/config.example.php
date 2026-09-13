<?php
/**
 * public/api/config.example.php
 *
 * Kopiér denne filen til config.php og fyll inn dine verdier:
 *   cp public/api/config.example.php public/api/config.php
 *
 * config.php er lagt til i .gitignore og er beskyttet mot direkte
 * nedlasting i public/api/.htaccess.
 */

return [
    // ID-en til Google Regnearket ditt (fra URL: https://docs.google.com/spreadsheets/d/<ID>/edit)
    'spreadsheet_id' => 'FYLL_INN_DIN_SPREADSHEET_ID_HER',

    // Sti til Service Account JSON-filen du lastet ned fra Google Cloud Console.
    // Kan ligge her i mappen som 'service-account.json', eller gjerne én mappe
    // utenfor web-roten for maksimal sikkerhet (f.eks. '/home/bruker/secrets/service-account.json').
    'service_account_file' => __DIR__ . '/service-account.json',

    // Navn på fanene i regnearket ditt (standardverdier fra TorTur):
    'sheet_brukere'  => 'Brukere',
    'sheet_system'   => 'SystemKonfigurasjon',
    'sheet_innsjekk' => 'TurpostInnsjekk',

    // Bildelagring for innsjekkinger:
    //   'auto'  (standard): Prøver Google Drive først. Hvis Service Account mangler kvote
    //                       (vanlig på @gmail.com-kontoer), lagres bildet automatisk lokalt på webserveren.
    //   'local':            Lagrer alltid direkte på webserveren (raskest, krever ingen Drive-kvote).
    //   'drive':            Tvinger Google Drive (krever Google Workspace / Shared Drive med kvote).
    'storage_driver' => 'auto',

    // Valgfri egendefinert base-URL til API-et (hvis den ikke detekteres automatisk):
    // 'base_url' => 'https://trillebar.no/tortur/api',
];
