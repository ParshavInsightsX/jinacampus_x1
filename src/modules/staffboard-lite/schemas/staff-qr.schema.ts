import { z } from "zod";
import { idSchema, staffQrPurposeSchema, trimmedString } from "./shared";

export const generateStaffQrSchema = z.object({
  branchId: idSchema.optional(),
  purpose: staffQrPurposeSchema
}).strict();

export const deactivateStaffQrSchema = z.object({
  qrTokenId: idSchema
}).strict();

export const scanStaffQrSchema = z.object({
  token: trimmedString(12, 512)
}).strict();

export const scanStaffQrPayloadSchema = z.object({
  qrPayload: trimmedString(1, 2048)
}).strict();

export type GenerateStaffQrInput = z.infer<typeof generateStaffQrSchema>;
export type DeactivateStaffQrInput = z.infer<typeof deactivateStaffQrSchema>;
export type ScanStaffQrInput = z.infer<typeof scanStaffQrSchema>;
export type ScanStaffQrPayloadInput = z.infer<typeof scanStaffQrPayloadSchema>;
