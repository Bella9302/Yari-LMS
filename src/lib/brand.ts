// Brand strings in one place so the working name can change without a hunt.
// (Phase 6 moves these into PlatformSetting so an admin can edit them.)
export const BRAND = {
  academyName: "YARI Academy",
  companyName: "YARI GROUP",
  domain: "yarigroup.co.za",
  /** Appointed under POPIA s55; named in the privacy notice. */
  informationOfficer: "Sindiso Zhou",
  privacyEmail: "privacy@yarigroup.co.za",
  /** Shown wherever completion documents are mentioned. Never remove while unaccredited. */
  nonAccreditationStatement:
    "This is a record of attendance and completion. It is not an accredited qualification.",
} as const;
