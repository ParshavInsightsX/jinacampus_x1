-- Additive lifecycle values are committed separately because PostgreSQL does
-- not allow a newly added enum value to be used by later statements in the
-- same migration transaction.
ALTER TYPE "StaffAttendanceStatus" ADD VALUE 'OFFICIAL_DUTY';
ALTER TYPE "StaffAttendanceStatus" ADD VALUE 'INCOMPLETE';