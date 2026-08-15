import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";
import { INSTITUTION_LOGO_MIME_TYPES } from "@/lib/files/institution-logo-file";

const ALLOWED_STUDENT_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

let storageClient: SupabaseClient | null = null;
let bucketReady: Promise<void> | null = null;
let staffLeaveBucketReady: Promise<void> | null = null;
let institutionLogosBucketReady: Promise<void> | null = null;
let gradebookBucketReady: Promise<void> | null = null;
let schoolCastBucketReady: Promise<void> | null = null;

function getStorageClient() {
  storageClient ??= createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
  return storageClient;
}

export function getStudentStorageConfig() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError("STUDENT_DOCUMENT_STORAGE_UNAVAILABLE", "STUDENT_DOCUMENT_STORAGE_UNAVAILABLE", 503);
  }

  return {
    bucket: env.STUDENT_DOCUMENTS_BUCKET,
    maxBytes: env.STUDENT_DOCUMENT_MAX_BYTES,
    allowedMimeTypes: ALLOWED_STUDENT_DOCUMENT_MIME_TYPES
  };
}

export function getStudentStorageClient() {
  const config = getStudentStorageConfig();
  return { client: getStorageClient(), ...config };
}

export async function ensureStudentDocumentsBucket() {
  if (bucketReady) return bucketReady;

  bucketReady = (async () => {
    const { client, bucket, maxBytes, allowedMimeTypes } = getStudentStorageClient();
    const { data, error } = await client.storage.getBucket(bucket);
    if (!error && data) {
      if (data.public) {
        throw new AppError("STUDENT_DOCUMENT_BUCKET_MUST_BE_PRIVATE", "STUDENT_DOCUMENT_BUCKET_MUST_BE_PRIVATE", 503);
      }
      return;
    }

    const { error: createError } = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: maxBytes,
      allowedMimeTypes: [...allowedMimeTypes]
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new AppError("STUDENT_DOCUMENT_STORAGE_UNAVAILABLE", "STUDENT_DOCUMENT_STORAGE_UNAVAILABLE", 503);
    }
  })().catch((error) => {
    bucketReady = null;
    throw error;
  });

  return bucketReady;
}

export function getStaffLeaveStorageClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError("STAFF_LEAVE_DOCUMENT_STORAGE_UNAVAILABLE", "STAFF_LEAVE_DOCUMENT_STORAGE_UNAVAILABLE", 503);
  }

  return {
    client: getStorageClient(),
    bucket: env.STAFF_LEAVE_DOCUMENTS_BUCKET,
    maxBytes: env.STAFF_LEAVE_DOCUMENT_MAX_BYTES,
    allowedMimeTypes: ALLOWED_STUDENT_DOCUMENT_MIME_TYPES
  };
}

export async function ensureStaffLeaveDocumentsBucket() {
  if (staffLeaveBucketReady) return staffLeaveBucketReady;

  staffLeaveBucketReady = (async () => {
    const { client, bucket, maxBytes, allowedMimeTypes } = getStaffLeaveStorageClient();
    const { data, error } = await client.storage.getBucket(bucket);
    if (!error && data) {
      if (data.public) {
        throw new AppError("STAFF_LEAVE_DOCUMENT_BUCKET_MUST_BE_PRIVATE", "STAFF_LEAVE_DOCUMENT_BUCKET_MUST_BE_PRIVATE", 503);
      }
      return;
    }

    const { error: createError } = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: maxBytes,
      allowedMimeTypes: [...allowedMimeTypes]
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new AppError("STAFF_LEAVE_DOCUMENT_STORAGE_UNAVAILABLE", "STAFF_LEAVE_DOCUMENT_STORAGE_UNAVAILABLE", 503);
    }
  })().catch((error) => {
    staffLeaveBucketReady = null;
    throw error;
  });

  return staffLeaveBucketReady;
}

export function getInstitutionLogoStorageClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError("INSTITUTION_LOGO_STORAGE_UNAVAILABLE", "INSTITUTION_LOGO_STORAGE_UNAVAILABLE", 503);
  }

  return {
    client: getStorageClient(),
    bucket: env.INSTITUTION_LOGOS_BUCKET,
    maxBytes: env.INSTITUTION_LOGO_MAX_BYTES,
    allowedMimeTypes: INSTITUTION_LOGO_MIME_TYPES
  };
}

export async function ensureInstitutionLogosBucket() {
  if (institutionLogosBucketReady) return institutionLogosBucketReady;

  institutionLogosBucketReady = (async () => {
    const { client, bucket, maxBytes, allowedMimeTypes } = getInstitutionLogoStorageClient();
    const { data, error } = await client.storage.getBucket(bucket);
    if (!error && data) {
      if (!data.public) {
        throw new AppError("INSTITUTION_LOGO_BUCKET_MUST_BE_PUBLIC", "INSTITUTION_LOGO_BUCKET_MUST_BE_PUBLIC", 503);
      }
      return;
    }

    const { error: createError } = await client.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: maxBytes,
      allowedMimeTypes: [...allowedMimeTypes]
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new AppError("INSTITUTION_LOGO_STORAGE_UNAVAILABLE", "INSTITUTION_LOGO_STORAGE_UNAVAILABLE", 503);
    }
  })().catch((error) => {
    institutionLogosBucketReady = null;
    throw error;
  });

  return institutionLogosBucketReady;
}

const GRADEBOOK_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv"
] as const;

export function getGradebookStorageClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError("GRADEBOOK_STORAGE_UNAVAILABLE", "GRADEBOOK_STORAGE_UNAVAILABLE", 503);
  }

  return {
    client: getStorageClient(),
    bucket: env.GRADEBOOK_STORAGE_BUCKET,
    importMaxBytes: env.GRADEBOOK_IMPORT_MAX_BYTES,
    reportCardMaxBytes: env.GRADEBOOK_REPORT_CARD_MAX_BYTES,
    allowedMimeTypes: GRADEBOOK_MIME_TYPES
  };
}

export async function ensureGradebookStorageBucket() {
  if (gradebookBucketReady) return gradebookBucketReady;

  gradebookBucketReady = (async () => {
    const { client, bucket, importMaxBytes, allowedMimeTypes } = getGradebookStorageClient();
    const { data, error } = await client.storage.getBucket(bucket);
    if (!error && data) {
      if (data.public) {
        throw new AppError("GRADEBOOK_STORAGE_BUCKET_MUST_BE_PRIVATE", "GRADEBOOK_STORAGE_BUCKET_MUST_BE_PRIVATE", 503);
      }
      return;
    }

    const { error: createError } = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: importMaxBytes,
      allowedMimeTypes: [...allowedMimeTypes]
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new AppError("GRADEBOOK_STORAGE_UNAVAILABLE", "GRADEBOOK_STORAGE_UNAVAILABLE", 503);
    }
  })().catch((error) => {
    gradebookBucketReady = null;
    throw error;
  });

  return gradebookBucketReady;
}
const SCHOOLCAST_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
] as const;

export function getSchoolCastStorageClient() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError("SCHOOLCAST_STORAGE_UNAVAILABLE", "SCHOOLCAST_STORAGE_UNAVAILABLE", 503);
  }

  return {
    client: getStorageClient(),
    bucket: env.SCHOOLCAST_STORAGE_BUCKET,
    maxBytes: env.SCHOOLCAST_ATTACHMENT_MAX_BYTES,
    signedUrlTtlSeconds: env.SCHOOLCAST_SIGNED_URL_TTL_SECONDS,
    allowedMimeTypes: SCHOOLCAST_MIME_TYPES
  };
}

export async function ensureSchoolCastStorageBucket() {
  if (schoolCastBucketReady) return schoolCastBucketReady;

  schoolCastBucketReady = (async () => {
    const { client, bucket, maxBytes, allowedMimeTypes } = getSchoolCastStorageClient();
    const { data, error } = await client.storage.getBucket(bucket);
    if (!error && data) {
      if (data.public) {
        throw new AppError("SCHOOLCAST_STORAGE_BUCKET_MUST_BE_PRIVATE", "SCHOOLCAST_STORAGE_BUCKET_MUST_BE_PRIVATE", 503);
      }
      return;
    }

    const { error: createError } = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: maxBytes,
      allowedMimeTypes: [...allowedMimeTypes]
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new AppError("SCHOOLCAST_STORAGE_UNAVAILABLE", "SCHOOLCAST_STORAGE_UNAVAILABLE", 503);
    }
  })().catch((error) => {
    schoolCastBucketReady = null;
    throw error;
  });

  return schoolCastBucketReady;
}
