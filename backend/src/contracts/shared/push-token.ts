/**
 * Contracts — Push token registration request DTO.
 *
 * Used by POST /auth/push-token.
 * The caller's userId and deviceId are resolved from the JWT, NEVER from the body.
 */

export interface PushTokenRequest {
  /** FCM or APNs registration token. Required. */
  pushToken: string;
  /** Optional platform hint: "android" | "ios" | "web". */
  pushPlatform?: string;
}
