/*
 Navicat Premium Dump SQL

 Source Server         : localhost_5432
 Source Server Type    : PostgreSQL
 Source Server Version : 180003 (180003)
 Source Host           : localhost:5432
 Source Catalog        : talent_match
 Source Schema         : public

 Target Server Type    : PostgreSQL
 Target Server Version : 180003 (180003)
 File Encoding         : 65001

 Date: 28/08/2026 20:57:43
*/


-- ----------------------------
-- Sequence structure for migrations_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."migrations_id_seq";
CREATE SEQUENCE "public"."migrations_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 9223372036854775807
START 11
CACHE 1;

-- ----------------------------
-- Table structure for admin_audit_logs
-- ----------------------------
DROP TABLE IF EXISTS "public"."admin_audit_logs";
CREATE TABLE "public"."admin_audit_logs" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "admin_id" uuid NOT NULL,
  "action" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "target_type" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "target_id" varchar COLLATE "pg_catalog"."default" NOT NULL,
  "details" jsonb,
  "created_at" timestamp(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for applications
-- ----------------------------
DROP TABLE IF EXISTS "public"."applications";
CREATE TABLE "public"."applications" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "job_id" uuid NOT NULL,
  "applicant_id" uuid NOT NULL,
  "resume_doc_id" uuid NOT NULL,
  "match_result_id" uuid,
  "cover_letter" text COLLATE "pg_catalog"."default",
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'submitted'::character varying,
  "enterprise_note" text COLLATE "pg_catalog"."default",
  "status_history" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for conversations
-- ----------------------------
DROP TABLE IF EXISTS "public"."conversations";
CREATE TABLE "public"."conversations" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "user_a_id" uuid NOT NULL,
  "user_b_id" uuid NOT NULL,
  "job_id" uuid,
  "application_id" uuid,
  "last_message_at" timestamptz(6),
  "unread_a" int4 NOT NULL DEFAULT 0,
  "unread_b" int4 NOT NULL DEFAULT 0,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for document_skills
-- ----------------------------
DROP TABLE IF EXISTS "public"."document_skills";
CREATE TABLE "public"."document_skills" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "document_id" uuid NOT NULL,
  "skill_id" int4 NOT NULL,
  "proficiency" varchar(20) COLLATE "pg_catalog"."default",
  "confidence" numeric(3,2),
  "source_text" text COLLATE "pg_catalog"."default",
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "skill_name" varchar(128) COLLATE "pg_catalog"."default",
  "extraction_method" varchar(16) COLLATE "pg_catalog"."default",
  "category" varchar(64) COLLATE "pg_catalog"."default"
)
;

-- ----------------------------
-- Table structure for documents
-- ----------------------------
DROP TABLE IF EXISTS "public"."documents";
CREATE TABLE "public"."documents" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" uuid NOT NULL,
  "doc_type" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "original_filename" varchar(256) COLLATE "pg_catalog"."default" NOT NULL,
  "file_path" varchar(512) COLLATE "pg_catalog"."default" NOT NULL,
  "file_format" varchar(10) COLLATE "pg_catalog"."default" NOT NULL,
  "parsed_text" text COLLATE "pg_catalog"."default",
  "parsed_json" jsonb,
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'uploaded'::character varying,
  "error_message" text COLLATE "pg_catalog"."default",
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "content_hash" varchar(64) COLLATE "pg_catalog"."default"
)
;

-- ----------------------------
-- Table structure for jobs
-- ----------------------------
DROP TABLE IF EXISTS "public"."jobs";
CREATE TABLE "public"."jobs" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "enterprise_id" uuid NOT NULL,
  "document_id" uuid,
  "title" varchar(128) COLLATE "pg_catalog"."default" NOT NULL,
  "company_name" varchar(128) COLLATE "pg_catalog"."default",
  "department" varchar(64) COLLATE "pg_catalog"."default",
  "description" text COLLATE "pg_catalog"."default" NOT NULL,
  "requirements" jsonb,
  "location" varchar(64) COLLATE "pg_catalog"."default",
  "salary_min" int4,
  "salary_max" int4,
  "salary_unit" varchar(16) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'month'::character varying,
  "experience_required" varchar(32) COLLATE "pg_catalog"."default",
  "education_required" varchar(32) COLLATE "pg_catalog"."default",
  "employment_type" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'full_time'::character varying,
  "headcount" int4 NOT NULL DEFAULT 1,
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'draft'::character varying,
  "expires_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for llm_logs
-- ----------------------------
DROP TABLE IF EXISTS "public"."llm_logs";
CREATE TABLE "public"."llm_logs" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "call_type" varchar(32) COLLATE "pg_catalog"."default" NOT NULL,
  "model" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "system_prompt" text COLLATE "pg_catalog"."default" NOT NULL,
  "user_message" text COLLATE "pg_catalog"."default" NOT NULL,
  "raw_response" text COLLATE "pg_catalog"."default",
  "parsed_result" jsonb,
  "success" bool NOT NULL DEFAULT false,
  "fallback_used" bool NOT NULL DEFAULT false,
  "error_message" text COLLATE "pg_catalog"."default",
  "tokens_used" int4,
  "latency_ms" int4,
  "document_id" varchar(64) COLLATE "pg_catalog"."default",
  "created_at" timestamp(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for match_results
-- ----------------------------
DROP TABLE IF EXISTS "public"."match_results";
CREATE TABLE "public"."match_results" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "resume_doc_id" uuid NOT NULL,
  "job_doc_id" uuid NOT NULL,
  "overall_score" numeric(5,2) NOT NULL,
  "skill_match_score" numeric(5,2) NOT NULL,
  "city_match_bonus" numeric(5,2) NOT NULL DEFAULT 0,
  "match_details" jsonb,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "score_breakdown" jsonb,
  "stale_at" timestamptz(6),
  "algorithm_trace" jsonb,
  "llm_assessment" jsonb,
  "embedding_trace" jsonb
)
;

-- ----------------------------
-- Table structure for messages
-- ----------------------------
DROP TABLE IF EXISTS "public"."messages";
CREATE TABLE "public"."messages" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "conversation_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "content" text COLLATE "pg_catalog"."default" NOT NULL,
  "read_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for migrations
-- ----------------------------
DROP TABLE IF EXISTS "public"."migrations";
CREATE TABLE "public"."migrations" (
  "id" int4 NOT NULL DEFAULT nextval('migrations_id_seq'::regclass),
  "timestamp" int8 NOT NULL,
  "name" varchar COLLATE "pg_catalog"."default" NOT NULL
)
;

-- ----------------------------
-- Table structure for notifications
-- ----------------------------
DROP TABLE IF EXISTS "public"."notifications";
CREATE TABLE "public"."notifications" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "user_id" uuid NOT NULL,
  "type" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'system'::character varying,
  "title" varchar(128) COLLATE "pg_catalog"."default" NOT NULL,
  "content" text COLLATE "pg_catalog"."default" NOT NULL,
  "related_id" varchar(64) COLLATE "pg_catalog"."default",
  "related_type" varchar(32) COLLATE "pg_catalog"."default",
  "read_at" timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now()
)
;

-- ----------------------------
-- Table structure for skills
-- ----------------------------
DROP TABLE IF EXISTS "public"."skills";
CREATE TABLE "public"."skills" (
  "id" int4 NOT NULL,
  "name" varchar(128) COLLATE "pg_catalog"."default",
  "category" varchar(64) COLLATE "pg_catalog"."default",
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "core_name" varchar(128) COLLATE "pg_catalog"."default"
)
;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "username" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "password_hash" varchar(256) COLLATE "pg_catalog"."default" NOT NULL,
  "role" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "email" varchar(128) COLLATE "pg_catalog"."default",
  "phone" varchar(32) COLLATE "pg_catalog"."default",
  "city" varchar(64) COLLATE "pg_catalog"."default",
  "intended_cities" jsonb,
  "company_name" varchar(128) COLLATE "pg_catalog"."default",
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  "status" varchar(16) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'active'::character varying
)
;

-- ----------------------------
-- Function structure for uuid_generate_v1
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_generate_v1"();
CREATE OR REPLACE FUNCTION "public"."uuid_generate_v1"()
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_generate_v1'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for uuid_generate_v1mc
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_generate_v1mc"();
CREATE OR REPLACE FUNCTION "public"."uuid_generate_v1mc"()
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_generate_v1mc'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for uuid_generate_v3
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_generate_v3"("namespace" uuid, "name" text);
CREATE OR REPLACE FUNCTION "public"."uuid_generate_v3"("namespace" uuid, "name" text)
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_generate_v3'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for uuid_generate_v4
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_generate_v4"();
CREATE OR REPLACE FUNCTION "public"."uuid_generate_v4"()
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_generate_v4'
  LANGUAGE c VOLATILE STRICT
  COST 1;

-- ----------------------------
-- Function structure for uuid_generate_v5
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_generate_v5"("namespace" uuid, "name" text);
CREATE OR REPLACE FUNCTION "public"."uuid_generate_v5"("namespace" uuid, "name" text)
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_generate_v5'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for uuid_nil
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_nil"();
CREATE OR REPLACE FUNCTION "public"."uuid_nil"()
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_nil'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for uuid_ns_dns
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_ns_dns"();
CREATE OR REPLACE FUNCTION "public"."uuid_ns_dns"()
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_ns_dns'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for uuid_ns_oid
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_ns_oid"();
CREATE OR REPLACE FUNCTION "public"."uuid_ns_oid"()
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_ns_oid'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for uuid_ns_url
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_ns_url"();
CREATE OR REPLACE FUNCTION "public"."uuid_ns_url"()
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_ns_url'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for uuid_ns_x500
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."uuid_ns_x500"();
CREATE OR REPLACE FUNCTION "public"."uuid_ns_x500"()
  RETURNS "pg_catalog"."uuid" AS '$libdir/uuid-ossp', 'uuid_ns_x500'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
SELECT setval('"public"."migrations_id_seq"', 11, true);

-- ----------------------------
-- Indexes structure for table admin_audit_logs
-- ----------------------------
CREATE UNIQUE INDEX "PK_de7a8fc2fbb525484c71a86bb96" ON "public"."admin_audit_logs" USING btree (
  "id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_admin_audit_logs_admin_created" ON "public"."admin_audit_logs" USING btree (
  "admin_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "created_at" "pg_catalog"."timestamp_ops" DESC NULLS FIRST
);
CREATE INDEX "idx_admin_audit_logs_created_at" ON "public"."admin_audit_logs" USING btree (
  "created_at" "pg_catalog"."timestamp_ops" DESC NULLS FIRST
);

-- ----------------------------
-- Primary Key structure for table admin_audit_logs
-- ----------------------------
ALTER TABLE "public"."admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table applications
-- ----------------------------
CREATE INDEX "idx_applications_applicant_id" ON "public"."applications" USING btree (
  "applicant_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_applications_job_id" ON "public"."applications" USING btree (
  "job_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_applications_status" ON "public"."applications" USING btree (
  "status" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE UNIQUE INDEX "uq_application_job_applicant" ON "public"."applications" USING btree (
  "job_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "applicant_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);

-- ----------------------------
-- Uniques structure for table applications
-- ----------------------------
ALTER TABLE "public"."applications" ADD CONSTRAINT "applications_job_id_applicant_id_key" UNIQUE ("job_id", "applicant_id");

-- ----------------------------
-- Primary Key structure for table applications
-- ----------------------------
ALTER TABLE "public"."applications" ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table conversations
-- ----------------------------
CREATE INDEX "idx_conversations_user_a" ON "public"."conversations" USING btree (
  "user_a_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_conversations_user_b" ON "public"."conversations" USING btree (
  "user_b_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE UNIQUE INDEX "uq_conversations_pair" ON "public"."conversations" USING btree (
  "user_a_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "user_b_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "job_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table conversations
-- ----------------------------
ALTER TABLE "public"."conversations" ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table document_skills
-- ----------------------------
CREATE UNIQUE INDEX "PK_5ad41b346ee074c5cfa4bc7ce97" ON "public"."document_skills" USING btree (
  "id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_document_skills_doc_skill" ON "public"."document_skills" USING btree (
  "document_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "skill_id" "pg_catalog"."int4_ops" ASC NULLS LAST
);
CREATE INDEX "idx_document_skills_document_id" ON "public"."document_skills" USING btree (
  "document_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_document_skills_skill_id" ON "public"."document_skills" USING btree (
  "skill_id" "pg_catalog"."int4_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table document_skills
-- ----------------------------
ALTER TABLE "public"."document_skills" ADD CONSTRAINT "document_skills_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table documents
-- ----------------------------
CREATE UNIQUE INDEX "PK_ac51aa5181ee2036f5ca482857c" ON "public"."documents" USING btree (
  "id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_documents_content_hash" ON "public"."documents" USING btree (
  "content_hash" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "idx_documents_status" ON "public"."documents" USING btree (
  "status" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "idx_documents_type_status" ON "public"."documents" USING btree (
  "doc_type" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "status" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "idx_documents_user_created" ON "public"."documents" USING btree (
  "user_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "created_at" "pg_catalog"."timestamp_ops" DESC NULLS FIRST
);

-- ----------------------------
-- Primary Key structure for table documents
-- ----------------------------
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table jobs
-- ----------------------------
CREATE INDEX "idx_jobs_enterprise_id" ON "public"."jobs" USING btree (
  "enterprise_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_jobs_status" ON "public"."jobs" USING btree (
  "status" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table jobs
-- ----------------------------
ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table llm_logs
-- ----------------------------
CREATE UNIQUE INDEX "PK_8a4f44f23bdf6d366531a0e85b4" ON "public"."llm_logs" USING btree (
  "id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_llm_logs_call_type_created" ON "public"."llm_logs" USING btree (
  "call_type" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST,
  "created_at" "pg_catalog"."timestamp_ops" DESC NULLS FIRST
);
CREATE INDEX "idx_llm_logs_created_at" ON "public"."llm_logs" USING btree (
  "created_at" "pg_catalog"."timestamp_ops" DESC NULLS FIRST
);

-- ----------------------------
-- Primary Key structure for table llm_logs
-- ----------------------------
ALTER TABLE "public"."llm_logs" ADD CONSTRAINT "llm_logs_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table match_results
-- ----------------------------
CREATE UNIQUE INDEX "PK_788799fb3b8324d976620b485f2" ON "public"."match_results" USING btree (
  "id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_match_results_job_stale" ON "public"."match_results" USING btree (
  "job_doc_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "stale_at" "pg_catalog"."timestamptz_ops" ASC NULLS LAST
);
CREATE INDEX "idx_match_results_resume_job_stale" ON "public"."match_results" USING btree (
  "resume_doc_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "job_doc_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "stale_at" "pg_catalog"."timestamptz_ops" ASC NULLS LAST
);
CREATE INDEX "idx_match_results_resume_stale" ON "public"."match_results" USING btree (
  "resume_doc_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "stale_at" "pg_catalog"."timestamptz_ops" ASC NULLS LAST
);
CREATE UNIQUE INDEX "uq_match_results_pair" ON "public"."match_results" USING btree (
  "resume_doc_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "job_doc_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table match_results
-- ----------------------------
ALTER TABLE "public"."match_results" ADD CONSTRAINT "match_results_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table messages
-- ----------------------------
CREATE INDEX "idx_messages_conversation_id" ON "public"."messages" USING btree (
  "conversation_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_messages_sender_id" ON "public"."messages" USING btree (
  "sender_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table messages
-- ----------------------------
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table migrations
-- ----------------------------
CREATE UNIQUE INDEX "PK_8c82d7f526340ab734260ea46be" ON "public"."migrations" USING btree (
  "id" "pg_catalog"."int4_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table migrations
-- ----------------------------
ALTER TABLE "public"."migrations" ADD CONSTRAINT "migrations_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table notifications
-- ----------------------------
CREATE INDEX "idx_notifications_user_id" ON "public"."notifications" USING btree (
  "user_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE INDEX "idx_notifications_user_read" ON "public"."notifications" USING btree (
  "user_id" "pg_catalog"."uuid_ops" ASC NULLS LAST,
  "read_at" "pg_catalog"."timestamptz_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table notifications
-- ----------------------------
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table skills
-- ----------------------------
CREATE UNIQUE INDEX "PK_0d3212120f4ecedf90864d7e298" ON "public"."skills" USING btree (
  "id" "pg_catalog"."int4_ops" ASC NULLS LAST
);
CREATE INDEX "idx_skills_category" ON "public"."skills" USING btree (
  "category" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);
CREATE INDEX "idx_skills_name" ON "public"."skills" USING btree (
  "name" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table skills
-- ----------------------------
ALTER TABLE "public"."skills" ADD CONSTRAINT "skills_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table users
-- ----------------------------
CREATE UNIQUE INDEX "PK_a3ffb1c0c8416b9fc6f907b7433" ON "public"."users" USING btree (
  "id" "pg_catalog"."uuid_ops" ASC NULLS LAST
);
CREATE UNIQUE INDEX "UQ_fe0bb3f6520ee0469504521e710" ON "public"."users" USING btree (
  "username" COLLATE "pg_catalog"."default" "pg_catalog"."text_ops" ASC NULLS LAST
);

-- ----------------------------
-- Uniques structure for table users
-- ----------------------------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_username_key" UNIQUE ("username");

-- ----------------------------
-- Primary Key structure for table users
-- ----------------------------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table admin_audit_logs
-- ----------------------------
ALTER TABLE "public"."admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table document_skills
-- ----------------------------
ALTER TABLE "public"."document_skills" ADD CONSTRAINT "document_skills_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."document_skills" ADD CONSTRAINT "document_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."skills" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table documents
-- ----------------------------
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table match_results
-- ----------------------------
ALTER TABLE "public"."match_results" ADD CONSTRAINT "match_results_job_doc_id_fkey" FOREIGN KEY ("job_doc_id") REFERENCES "public"."documents" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."match_results" ADD CONSTRAINT "match_results_resume_doc_id_fkey" FOREIGN KEY ("resume_doc_id") REFERENCES "public"."documents" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
