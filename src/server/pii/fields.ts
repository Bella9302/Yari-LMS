import "server-only";
import {
  aad,
  decryptField,
  decryptOptional,
  encryptField,
  encryptOptional,
} from "@/server/crypto/field-encryption";

// Single source of truth for which columns are encrypted and how their AAD is built.
export const ctx = {
  email: (userId: string) => aad("User", "email", userId),
  fullName: (userId: string) => aad("UserProfile", "fullName", userId),
  preferredName: (userId: string) => aad("UserProfile", "preferredName", userId),
  idNumber: (userId: string) => aad("UserProfile", "idNumber", userId),
  phone: (userId: string) => aad("UserProfile", "phone", userId),
  address: (userId: string) => aad("UserProfile", "address", userId),
  employer: (userId: string) => aad("UserProfile", "employer", userId),
  employeeRef: (membershipId: string) => aad("OrgMembership", "employeeRef", membershipId),
};

export const enc = {
  email: (userId: string, v: string) => encryptField(v, ctx.email(userId)),
  fullName: (userId: string, v: string) => encryptField(v, ctx.fullName(userId)),
  preferredName: (userId: string, v?: string | null) => encryptOptional(v, ctx.preferredName(userId)),
  idNumber: (userId: string, v?: string | null) => encryptOptional(v, ctx.idNumber(userId)),
  phone: (userId: string, v?: string | null) => encryptOptional(v, ctx.phone(userId)),
  address: (userId: string, v?: string | null) => encryptOptional(v, ctx.address(userId)),
  employer: (userId: string, v?: string | null) => encryptOptional(v, ctx.employer(userId)),
  employeeRef: (membershipId: string, v?: string | null) => encryptOptional(v, ctx.employeeRef(membershipId)),
};

export const dec = {
  email: (userId: string, v: string) => decryptField(v, ctx.email(userId)),
  fullName: (userId: string, v: string) => decryptField(v, ctx.fullName(userId)),
  preferredName: (userId: string, v?: string | null) => decryptOptional(v, ctx.preferredName(userId)),
  idNumber: (userId: string, v?: string | null) => decryptOptional(v, ctx.idNumber(userId)),
  phone: (userId: string, v?: string | null) => decryptOptional(v, ctx.phone(userId)),
  address: (userId: string, v?: string | null) => decryptOptional(v, ctx.address(userId)),
  employer: (userId: string, v?: string | null) => decryptOptional(v, ctx.employer(userId)),
  employeeRef: (membershipId: string, v?: string | null) => decryptOptional(v, ctx.employeeRef(membershipId)),
};
