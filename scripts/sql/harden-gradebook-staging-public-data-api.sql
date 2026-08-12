-- Approved GradeBook staging hardening. This is deliberately outside deployable
-- Prisma and Supabase migration directories and must not be run against production
-- without a separate review and approval.
-- JinaCampus uses server-side Prisma for application data. The Supabase Data
-- API must not expose internal tenant, identity, attendance, or audit tables.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "communication_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institutions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_delivery_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notification_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "passkey_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "passkey_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_qr_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_guardian_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_branch_accesses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_role_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_integration_settings" ENABLE ROW LEVEL SECURITY;
