-- Migration: add_jornada_policy
-- PR-A: JornadaPolicy (append-only effective-dated work-day baseline)
--
-- APPEND-ONLY semantics: no UPDATE or DELETE triggers or cascade mutations.
-- Lower the journey = INSERT a new row with a future vigenteDesde.

CREATE TABLE "JornadaPolicy" (
    "id"           TEXT         NOT NULL,
    "horasDiarias" DECIMAL(4,2) NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JornadaPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JornadaPolicy_vigenteDesde_idx" ON "JornadaPolicy"("vigenteDesde");
