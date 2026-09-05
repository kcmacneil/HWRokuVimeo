/**
 * Error codes are stable strings the Roku client switches on to pick a
 * user-facing message. Never put Vimeo response bodies in `message`.
 */
export type ApiErrorCode =
  | "NOT_CONFIGURED"
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "VIDEO_UNAVAILABLE"
  | "VIDEO_RESTRICTED"
  | "NO_STREAM"
  | "VIMEO_AUTH_FAILED"
  | "VIMEO_RATE_LIMITED"
  | "VIMEO_UNAVAILABLE"
  | "INTERNAL";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, retryable: this.retryable } };
  }
}

export function mapVimeoStatus(status: number, context: "video" | "list"): ApiError {
  switch (status) {
    case 401:
      return new ApiError(502, "VIMEO_AUTH_FAILED", "The server could not authenticate with Vimeo.");
    case 403:
      return context === "video"
        ? new ApiError(403, "VIDEO_RESTRICTED", "This video is private or restricted.")
        : new ApiError(502, "VIMEO_AUTH_FAILED", "Vimeo denied access to the library.");
    case 404:
      return context === "video"
        ? new ApiError(404, "VIDEO_UNAVAILABLE", "This video is no longer available.")
        : new ApiError(404, "NOT_FOUND", "Not found.");
    case 429:
      return new ApiError(503, "VIMEO_RATE_LIMITED", "Vimeo is busy. Please try again shortly.", true);
    default:
      return new ApiError(502, "VIMEO_UNAVAILABLE", "Vimeo is temporarily unavailable.", true);
  }
}
