export const demoPresets = [
  {
    label: "Password reset emails never arrive",
    note: "Start here. The task describes a symptom without naming a file or code symbol, so FixMap has to find the strongest repository signals."
  },
  {
    label: "sendMail throws and password reset emails never arrive",
    note: "The same problem now names sendMail. Watch the email transport move to the top because that file defines the symbol."
  },
  {
    label: "TOKEN_TTL_MINUTES is ignored, reset links expire immediately",
    note: "A named constant gives FixMap a strong anchor. The file that defines it moves to the top."
  },
  {
    label: "Invoices are created twice for the same customer",
    note: "A different subsystem, no overlap with the auth files, no drift into them."
  },
  {
    label: "make it better",
    note: "This task is too vague to ground. FixMap returns no suggestions instead of presenting a plausible guess as evidence."
  }
] as const;
