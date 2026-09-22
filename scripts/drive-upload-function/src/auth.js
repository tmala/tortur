import { google } from 'googleapis'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

let secretClient = null
let cachedAuthClient = null
let cachedSheetsAuthClient = null

/**
 * Henter en hemmelighet fra Secret Manager eller direkte fra process.env
 * @param {string} envVarName - Navn på miljøvariabel (f.eks. REFRESH_TOKEN)
 * @param {string} secretName - Navn i Secret Manager (f.eks. tortur-drive-refresh-token)
 * @param {boolean} [optional=false] - Hvis sann, returneres null i stedet for feilmelding hvis hemmeligheten ikke finnes
 * @returns {Promise<string|null>}
 */
async function getSecretOrEnv(envVarName, secretName, optional = false) {
  if (process.env[envVarName]) {
    return process.env[envVarName].trim()
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT
  if (!projectId) {
    if (optional) return null
    throw new Error(
      `Verken ${envVarName} eller prosjekt-ID (GOOGLE_CLOUD_PROJECT) er konfigurert.`
    )
  }

  if (!secretClient) {
    secretClient = new SecretManagerServiceClient()
  }

  try {
    const name = `projects/${projectId}/secrets/${secretName}/versions/latest`
    const [version] = await secretClient.accessSecretVersion({ name })
    const payload = version.payload?.data?.toString()

    if (!payload) {
      if (optional) return null
      throw new Error(`Fant ingen verdi for hemmeligheten ${secretName}`)
    }

    return payload.trim()
  } catch (err) {
    if (optional) return null
    throw err
  }
}

/**
 * Oppretter eller gjenbruker en autentisert OAuth2Client for Google Drive API
 * @returns {Promise<InstanceType<typeof google.auth.OAuth2>>}
 */
export async function getDriveAuthClient() {
  if (cachedAuthClient) {
    return cachedAuthClient
  }

  const [clientId, clientSecret, refreshToken] = await Promise.all([
    getSecretOrEnv('CLIENT_ID', 'tortur-oauth-client-id'),
    getSecretOrEnv('CLIENT_SECRET', 'tortur-oauth-client-secret'),
    getSecretOrEnv('REFRESH_TOKEN', 'tortur-drive-refresh-token')
  ])

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret)

  oauth2Client.setCredentials({
    refresh_token: refreshToken
  })

  cachedAuthClient = oauth2Client
  return cachedAuthClient
}

/**
 * Oppretter eller gjenbruker en autentisert klient for Google Sheets API v4.
 * Støtter:
 * 1. Eksplisitt Service Account JSON (via env-variabel SERVICE_ACCOUNT_JSON eller Secret Manager 'tortur-service-account-json')
 * 2. Standard Google Cloud Application Default Credentials (ADC) – fungerer automatisk i Cloud Functions / Cloud Run
 * @returns {Promise<import('google-auth-library').OAuth2Client | InstanceType<typeof google.auth.JWT> | InstanceType<typeof google.auth.GoogleAuth>>}
 */
export async function getSheetsAuthClient() {
  if (cachedSheetsAuthClient) {
    return cachedSheetsAuthClient
  }

  // 1. Sjekk om det finnes en eksplisitt Service Account JSON-streng
  const saJson = await getSecretOrEnv('SERVICE_ACCOUNT_JSON', 'tortur-service-account-json', true)
  if (saJson) {
    try {
      const parsed = JSON.parse(saJson)
      if (parsed.client_email && parsed.private_key) {
        const auth = new google.auth.JWT({
          email: parsed.client_email,
          key: parsed.private_key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        })
        cachedSheetsAuthClient = auth
        return cachedSheetsAuthClient
      }
    } catch (parseErr) {
      console.warn('[auth] Kunne ikke parse SERVICE_ACCOUNT_JSON, faller tilbake til ADC:', parseErr.message)
    }
  }

  // 2. Fallback til Google Application Default Credentials (ADC)
  // I Cloud Functions benytter dette tjenestekontoen til funksjonen (Metadata Server)
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })

  cachedSheetsAuthClient = auth
  return cachedSheetsAuthClient
}
