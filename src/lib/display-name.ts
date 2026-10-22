/**
 * How learners appear to other learners (discussions): first name and surname initial.
 * Less personal data shared between people from different companies on the same course.
 */
export function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Learner";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}
