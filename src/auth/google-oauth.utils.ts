export type GoogleTokenResponse = {
  access_token?: string
  id_token?: string
  error?: string
  error_description?: string
}

export type GoogleIdTokenInfo = {
  sub?: string
  email?: string
  email_verified?: string | boolean
  given_name?: string
  family_name?: string
  name?: string
  aud?: string
  error?: string
  error_description?: string
}

export type GoogleOAuthProfile = {
  sub: string
  email: string
  firstName: string | null
  lastName: string | null
}
