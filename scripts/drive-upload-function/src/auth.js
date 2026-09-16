import { google } from 'googleapis'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'

let secretClient = null
let cachedAuthClient = null

/**
 * Henter en hemmelighet fra Secret Manager eller direkte fra process.env
 * @param {string} envVarName - Navn på miljøvariabel (f.eks. REFRESH_TOKEN)
 * @param {string} secretName - Navn i Secret Manager (f.eks. tortur-drive-refresh-token)
 * @returns {Promise<string>}
 */
async function getSecretOrEnv(envVarName, secretName) {
  if (process.env[envVarName]) {
    return process.env[envVarName].trim()
  }

  if (!secretClient) {
    secretClient = new SecretManagerServiceClient()
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT
  if (!projectId) {
    throw new Error(
      `Verken ${envVarName} eller prosjekt-ID (GOOGLE_CLOUD_PROJECT) er konfigurert.`
    )
  }

  const name = `projects/${projectId}/secrets/${secretName}/versions/latest`
  const [version] = await secretClient.accessSecretVersion({ name })
  const payload = version.payload?.data?.toString()

  if (!payload) {
    throw new Error(`Fant ingen verdi for hemmeligheten ${secretName}`)
  }

  return payload.trim()
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
