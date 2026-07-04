export type ResetPasswordRequest = {
  email: string;
};

export function buildResetPasswordEmail(request: ResetPasswordRequest): string {
  const normalizedEmail = request.email.trim().toLowerCase();

  if (!normalizedEmail.includes("@")) {
    throw new Error("A valid email address is required.");
  }

  return `Send password reset instructions to ${normalizedEmail}`;
}
