-- Operacoes idempotentes de preparacao direta contextual (WEB-054 / ADR-008 / CHG-007).
-- Evolucao estritamente aditiva sobre 0001..0014; nunca persiste codigo em texto plano.

CREATE TABLE web_direct_evaluation_operations (
    project_id UUID NOT NULL REFERENCES web_projects(project_id) ON DELETE RESTRICT,
    actor_issuer TEXT NOT NULL,
    actor_subject TEXT NOT NULL,
    operation_id UUID NOT NULL,
    request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    mode TEXT NOT NULL CHECK (mode IN ('onsite', 'remote')),
    patient_id UUID NOT NULL REFERENCES web_patients(id) ON DELETE RESTRICT,
    evaluator_id UUID NOT NULL REFERENCES web_evaluators(id) ON DELETE RESTRICT,
    invitation_id UUID NOT NULL UNIQUE REFERENCES web_invitations(invitation_id) ON DELETE RESTRICT,
    session_id UUID NOT NULL UNIQUE REFERENCES web_invitations(session_id) ON DELETE RESTRICT,
    summary_json JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, actor_issuer, actor_subject, operation_id),
    FOREIGN KEY (actor_issuer, actor_subject)
        REFERENCES app_users(issuer, subject) ON DELETE RESTRICT
);

CREATE INDEX idx_web_direct_evaluation_operations_created
    ON web_direct_evaluation_operations(created_at DESC);

-- Correcao auditada de vinculos de avaliacoes e convites sem conceder DML direto
-- de UPDATE em assessments, web_assessments ou web_invitations ao papel runtime.
CREATE FUNCTION public.web_relink_identity(
    p_target_kind text,
    p_project_id uuid,
    p_assessment_id text,
    p_invitation_id uuid,
    p_patient_id uuid,
    p_evaluator_id uuid,
    p_reason_code text,
    p_actor_issuer text,
    p_actor_subject text
)
RETURNS TABLE(status text, out_patient_id uuid, out_evaluator_uuid uuid, out_session_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_cur_patient uuid;
    v_cur_evaluator uuid;
    v_session_id uuid;
    v_pat_code text;
    v_pat_active boolean;
    v_eva_code text;
    v_eva_active boolean;
    v_visit text;
    v_part_uuid uuid;
    v_visit_uuid uuid;
BEGIN
    IF p_target_kind NOT IN ('assessment', 'invitation') THEN
        RETURN QUERY SELECT 'invalid_target'::text, NULL::uuid, NULL::uuid, NULL::uuid;
        RETURN;
    END IF;
    IF p_patient_id IS NULL AND p_evaluator_id IS NULL THEN
        RETURN QUERY SELECT 'missing_change'::text, NULL::uuid, NULL::uuid, NULL::uuid;
        RETURN;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.web_projects p
        JOIN public.web_project_members m ON m.project_id = p.project_id
        JOIN public.app_users u ON (u.issuer, u.subject) = (m.issuer, m.subject)
        WHERE p.project_id = p_project_id AND p.active AND m.active AND u.active
          AND m.issuer = p_actor_issuer AND m.subject = p_actor_subject
          AND u.role IN ('importacao', 'administracao')
    ) THEN
        RETURN QUERY SELECT 'forbidden'::text, NULL::uuid, NULL::uuid, NULL::uuid;
        RETURN;
    END IF;

    IF p_target_kind = 'assessment' THEN
        SELECT wa.patient_id, wa.evaluator_uuid, wa.session_id
          INTO v_cur_patient, v_cur_evaluator, v_session_id
          FROM public.web_assessments wa
          JOIN public.assessments a USING (assessment_id)
         WHERE wa.assessment_id = p_assessment_id AND wa.project_id = p_project_id
           FOR UPDATE OF wa, a;
        IF NOT FOUND THEN
            RETURN QUERY SELECT 'missing'::text, NULL::uuid, NULL::uuid, NULL::uuid;
            RETURN;
        END IF;
    ELSE
        SELECT i.patient_id, i.evaluator_uuid, i.session_id, i.visit
          INTO v_cur_patient, v_cur_evaluator, v_session_id, v_visit
          FROM public.web_invitations i
         WHERE i.invitation_id = p_invitation_id AND i.project_id = p_project_id
           FOR UPDATE OF i;
        IF NOT FOUND THEN
            RETURN QUERY SELECT 'missing'::text, NULL::uuid, NULL::uuid, NULL::uuid;
            RETURN;
        END IF;
    END IF;

    IF p_patient_id IS NOT NULL THEN
        SELECT wp.participant_code, wp.active INTO v_pat_code, v_pat_active
          FROM public.web_patients wp WHERE wp.id = p_patient_id;
        IF NOT FOUND THEN
            RETURN QUERY SELECT 'missing'::text, NULL::uuid, NULL::uuid, NULL::uuid;
            RETURN;
        END IF;
        IF NOT v_pat_active THEN
            RETURN QUERY SELECT 'inactive_patient'::text, NULL::uuid, NULL::uuid, NULL::uuid;
            RETURN;
        END IF;
        INSERT INTO public.web_project_participants(participant_uuid, project_id, pseudonym, patient_id)
        VALUES (gen_random_uuid(), p_project_id, v_pat_code, p_patient_id)
        ON CONFLICT (project_id, pseudonym) DO UPDATE
        SET patient_id = COALESCE(public.web_project_participants.patient_id, EXCLUDED.patient_id);

        SELECT pp.participant_uuid INTO v_part_uuid
          FROM public.web_project_participants pp
         WHERE pp.project_id = p_project_id AND pp.pseudonym = v_pat_code;

        IF p_target_kind = 'assessment' THEN
            UPDATE public.web_assessments SET patient_id = p_patient_id WHERE assessment_id = p_assessment_id;
            UPDATE public.assessments SET participant_id = v_pat_code WHERE assessment_id = p_assessment_id;
            SELECT i.visit INTO v_visit FROM public.web_invitations i WHERE i.session_id = v_session_id;
        END IF;

        IF v_visit IS NOT NULL THEN
            INSERT INTO public.web_participant_visits(visit_uuid, project_id, participant_uuid, label)
            VALUES (gen_random_uuid(), p_project_id, v_part_uuid, v_visit)
            ON CONFLICT (project_id, participant_uuid, label) DO NOTHING;

            SELECT pv.visit_uuid INTO v_visit_uuid
              FROM public.web_participant_visits pv
             WHERE pv.project_id = p_project_id AND pv.participant_uuid = v_part_uuid AND pv.label = v_visit;

            IF p_target_kind = 'assessment' THEN
                UPDATE public.web_invitations
                   SET patient_id = p_patient_id, participant_id = v_pat_code,
                       participant_uuid = v_part_uuid, visit_uuid = v_visit_uuid
                 WHERE session_id = v_session_id;
            ELSE
                UPDATE public.web_invitations
                   SET patient_id = p_patient_id, participant_id = v_pat_code,
                       participant_uuid = v_part_uuid, visit_uuid = v_visit_uuid
                 WHERE invitation_id = p_invitation_id;
            END IF;
        END IF;

        INSERT INTO public.web_registry_audit_events (
            entity_type, entity_id, action, actor_issuer, actor_subject, reason_code
        ) VALUES ('participant_link', p_patient_id, 'relink', p_actor_issuer, p_actor_subject, p_reason_code);

        IF v_cur_patient IS NOT NULL AND v_cur_patient <> p_patient_id THEN
            INSERT INTO public.web_registry_audit_events (
                entity_type, entity_id, action, actor_issuer, actor_subject, reason_code
            ) VALUES ('participant_link', v_cur_patient, 'relink', p_actor_issuer, p_actor_subject, p_reason_code);
        END IF;
        v_cur_patient := p_patient_id;
    END IF;

    IF p_evaluator_id IS NOT NULL THEN
        SELECT we.evaluator_code, we.active INTO v_eva_code, v_eva_active
          FROM public.web_evaluators we WHERE we.id = p_evaluator_id;
        IF NOT FOUND THEN
            RETURN QUERY SELECT 'missing'::text, NULL::uuid, NULL::uuid, NULL::uuid;
            RETURN;
        END IF;
        IF NOT v_eva_active THEN
            RETURN QUERY SELECT 'inactive_evaluator'::text, NULL::uuid, NULL::uuid, NULL::uuid;
            RETURN;
        END IF;

        IF p_target_kind = 'assessment' THEN
            UPDATE public.web_assessments SET evaluator_uuid = p_evaluator_id WHERE assessment_id = p_assessment_id;
            UPDATE public.assessments SET evaluator = v_eva_code WHERE assessment_id = p_assessment_id;
            UPDATE public.web_invitations SET evaluator_uuid = p_evaluator_id, evaluator_id = v_eva_code WHERE session_id = v_session_id;
        ELSE
            UPDATE public.web_invitations SET evaluator_uuid = p_evaluator_id, evaluator_id = v_eva_code WHERE invitation_id = p_invitation_id;
        END IF;

        INSERT INTO public.web_registry_audit_events (
            entity_type, entity_id, action, actor_issuer, actor_subject, reason_code
        ) VALUES ('invitation_link', p_evaluator_id, 'relink', p_actor_issuer, p_actor_subject, p_reason_code);

        IF v_cur_evaluator IS NOT NULL AND v_cur_evaluator <> p_evaluator_id THEN
            INSERT INTO public.web_registry_audit_events (
                entity_type, entity_id, action, actor_issuer, actor_subject, reason_code
            ) VALUES ('invitation_link', v_cur_evaluator, 'relink', p_actor_issuer, p_actor_subject, p_reason_code);
        END IF;
        v_cur_evaluator := p_evaluator_id;
    END IF;

    INSERT INTO public.auth_audit_events (issuer, subject, action, outcome, request_id)
    VALUES (p_actor_issuer, p_actor_subject, 'manage_patients', 'success', gen_random_uuid());

    RETURN QUERY SELECT 'ok'::text, v_cur_patient, v_cur_evaluator, v_session_id;
END
$function$;
REVOKE ALL ON FUNCTION public.web_relink_identity(text,uuid,text,uuid,uuid,uuid,text,text,text) FROM PUBLIC;
