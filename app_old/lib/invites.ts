// app/lib/invites.ts
// Invite creation is real (a BusinessInvite row gets written, matched
// against sign-up/sign-in by email). Actually SENDING an email is NOT
// implemented yet — per explicit instruction: "don't build anything yet,
// just make a structure that works." This function is the seam where a
// real email service (Resend, etc.) plugs in later — call sites don't
// need to change when that happens, only this function's body.

type InviteEmailPayload = {
  toEmail: string;
  businessName: string;
  inviterName: string | null;
  role: string;
};

export async function sendInviteEmail(payload: InviteEmailPayload): Promise<{ sent: boolean; reason: string }> {
  // Intentional no-op. Logs to server console so the flow is visible and
  // debuggable during development, without claiming an email was sent.
  console.log(
    `[invite-email:NOT SENT] Would invite ${payload.toEmail} to "${payload.businessName}" ` +
    `as ${payload.role}, invited by ${payload.inviterName ?? "someone"}. ` +
    `Email sending is not implemented yet — see app/lib/invites.ts.`
  );
  return { sent: false, reason: "Email sending not implemented yet — invite row created, no email sent." };
}