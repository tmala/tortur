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

    // Google Apps Script Web App URL for bildelagring på Google Drive:
    // All bildelagring og -sletting håndteres trygt via Google Apps Script (DriveApp)
    // som kjører i din personlige Google-kontos kontekst (med din 15 GB lagringskvote).
    // Publiser scripts/appscript/appscript.js som Web App og lim inn URL-en her.
    // (Kan alternativt legges inn i fanen 'SystemKonfigurasjon' som APPSCRIPT_URL).
    'appscript_url' => 'https://script.google.com/macros/s/<deployment-id>/exec',
];
