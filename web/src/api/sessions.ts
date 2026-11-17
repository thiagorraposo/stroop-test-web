/** Emissao e revogacao profissional; codigos permanecem somente na memoria do consumidor. */
import { ApiError, record, request } from './client';

export type LegacyInvitationInput = { participant_id: string; visit: string };
export type CadastralInvitationInput = {
  patient_id: string;
  evaluator_id: string;
  visit: string;
  test_code?: string;
  initials?: string | null;
};
export type InvitationInput = LegacyInvitationInput | CadastralInvitationInput;

export type InvitationSummary = {
  project_id: string;
  project_code: string;
  project_name: string;
  patient_id: string;
  participant_code: string;
  participant_name: string;
  initials: string | null;
  evaluator_id: string;
  evaluator_code: string;
  evaluator_name: string;
  test_code: string;
  test_version: string;
  protocol_id: string;
  visit: string;
};

export type CreatedInvitation = {
  invitation_id: string;
  session_id: string;
  code: string;
  expires_at: string;
  state: 'issued';
  summary?: InvitationSummary;
};

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const label = /^[A-Za-z0-9_.-]{1,64}$/;
const initialsPattern = /^[A-Z0-9.-]{1,16}$/;

function input(valid: boolean): void {
  if (!valid) throw new ApiError('invalid_request', 422);
}
function validId(value: unknown): value is string { return typeof value === 'string' && uuid.test(value); }
function validDate(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
}
function headers(csrfToken: string): Record<string, string> {
  input(typeof csrfToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(csrfToken));
  return { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken };
}

function decodeSummary(raw: unknown, status: number): InvitationSummary {
  if (
    !record(raw) ||
    !validId(raw.project_id) ||
    typeof raw.project_code !== 'string' ||
    typeof raw.project_name !== 'string' ||
    !validId(raw.patient_id) ||
    typeof raw.participant_code !== 'string' ||
    typeof raw.participant_name !== 'string' ||
    (raw.initials !== null && typeof raw.initials !== 'string') ||
    !validId(raw.evaluator_id) ||
    typeof raw.evaluator_code !== 'string' ||
    typeof raw.evaluator_name !== 'string' ||
    typeof raw.test_code !== 'string' ||
    typeof raw.test_version !== 'string' ||
    typeof raw.protocol_id !== 'string' ||
    typeof raw.visit !== 'string'
  ) {
    throw new ApiError('invalid_response', status);
  }
  return {
    project_id: raw.project_id,
    project_code: raw.project_code,
    project_name: raw.project_name,
    patient_id: raw.patient_id,
    participant_code: raw.participant_code,
    participant_name: raw.participant_name,
    initials: raw.initials,
    evaluator_id: raw.evaluator_id,
    evaluator_code: raw.evaluator_code,
    evaluator_name: raw.evaluator_name,
    test_code: raw.test_code,
    test_version: raw.test_version,
    protocol_id: raw.protocol_id,
    visit: raw.visit,
  };
}

export function createInvitation(projectId: string, values: InvitationInput,
  csrfToken: string, signal?: AbortSignal): Promise<CreatedInvitation> {
  input(validId(projectId));
  input(record(values));
  let payload: Record<string, unknown>;
  const keys = Object.keys(values);
  if ('participant_id' in values) {
    input(keys.length === 2 && typeof values.participant_id === 'string' && typeof values.visit === 'string');
    const participant_id = values.participant_id.trim();
    const visit = values.visit.trim();
    input(label.test(participant_id) && label.test(visit));
    payload = { participant_id, visit };
  } else {
    const allowed = new Set(['patient_id', 'evaluator_id', 'visit', 'test_code', 'initials']);
    input(
      keys.every(k => allowed.has(k)) &&
      validId(values.patient_id) &&
      validId(values.evaluator_id) &&
      typeof values.visit === 'string',
    );
    const visit = values.visit.trim();
    input(label.test(visit));
    const test_code = values.test_code !== undefined ? values.test_code.trim() : 'stroop_go_nogo_ptbr';
    input(test_code === 'stroop_go_nogo_ptbr');
    let initials: string | null = null;
    if (values.initials !== undefined && values.initials !== null && values.initials.trim() !== '') {
      initials = values.initials.trim().toUpperCase();
      input(initialsPattern.test(initials));
    }
    payload = {
      patient_id: values.patient_id,
      evaluator_id: values.evaluator_id,
      visit,
      test_code,
      initials,
    };
  }
  return request(`/api/v1/projects/${projectId}/invitations`, {
    method: 'POST', headers: headers(csrfToken), body: JSON.stringify(payload),
  }, async response => {
    if (response.status !== 201) throw new ApiError('invalid_response', response.status);
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new ApiError('invalid_response', response.status); }
    if (!record(body)) throw new ApiError('invalid_response', response.status);
    const bodyKeys = Object.keys(body);
    const hasSummary = 'summary' in body && body.summary !== undefined;
    if ((hasSummary ? bodyKeys.length !== 6 : bodyKeys.length !== 5)
      || !validId(body.invitation_id) || !validId(body.session_id)
      || typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{22,128}$/.test(body.code)
      || !validDate(body.expires_at) || body.state !== 'issued') {
      throw new ApiError('invalid_response', response.status);
    }
    const result: CreatedInvitation = {
      invitation_id: body.invitation_id,
      session_id: body.session_id,
      code: body.code,
      expires_at: body.expires_at,
      state: 'issued',
    };
    if (hasSummary) {
      result.summary = decodeSummary(body.summary, response.status);
    }
    return result;
  }, signal);
}

export function revokeInvitation(projectId: string, invitationId: string,
  csrfToken: string, signal?: AbortSignal): Promise<void> {
  input(validId(projectId) && validId(invitationId));
  return request(`/api/v1/projects/${projectId}/invitations/${invitationId}/revoke`, {
    method: 'POST', headers: headers(csrfToken), body: '{}',
  }, async response => {
    if (response.status !== 204 || await response.text() !== '') {
      throw new ApiError('invalid_response', response.status);
    }
  }, signal);
}

export type DirectEvaluationMode = 'onsite' | 'remote';
export type DirectEvaluationPatientInput =
  | { patient_id: string }
  | { new: { full_name: string; initials?: string | null; disambiguation_note?: string | null; confirm_homonym?: boolean } };

export type DirectEvaluationInput = {
  operation_id: string;
  patient: DirectEvaluationPatientInput;
  evaluator_id: string;
  test_code?: string;
  visit: string;
  initials?: string | null;
  mode: DirectEvaluationMode;
};

export type DirectEvaluationResponse = {
  operation_id: string;
  invitation_id: string;
  session_id: string;
  state: 'issued' | 'redeemed' | 'revoked' | 'expired';
  mode: DirectEvaluationMode;
  expires_at: string;
  summary: InvitationSummary;
  public_entry_url: string;
  credential_available: boolean;
  code?: string;
};

export type DirectHandoffResponse = {
  session_id: string;
  state: 'preparing';
  activated_at: string;
  expires_at: string;
  csrf_token: string;
};

function decodeDirectEvaluation(body: unknown, status: number): DirectEvaluationResponse {
  if (!record(body)) throw new ApiError('invalid_response', status);
  if (
    !validId(body.operation_id) ||
    !validId(body.invitation_id) ||
    !validId(body.session_id) ||
    !['issued', 'redeemed', 'revoked', 'expired'].includes(String(body.state)) ||
    !['onsite', 'remote'].includes(String(body.mode)) ||
    !validDate(body.expires_at) ||
    body.public_entry_url !== '/pratica' ||
    typeof body.credential_available !== 'boolean'
  ) {
    throw new ApiError('invalid_response', status);
  }
  const summary = decodeSummary(body.summary, status);
  const result: DirectEvaluationResponse = {
    operation_id: body.operation_id,
    invitation_id: body.invitation_id,
    session_id: body.session_id,
    state: body.state as DirectEvaluationResponse['state'],
    mode: body.mode as DirectEvaluationMode,
    expires_at: body.expires_at,
    summary,
    public_entry_url: body.public_entry_url,
    credential_available: body.credential_available,
  };
  if (body.credential_available) {
    if (typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{22,128}$/.test(body.code)) {
      throw new ApiError('invalid_response', status);
    }
    result.code = body.code;
  }
  return result;
}

export function createDirectEvaluation(
  projectId: string,
  values: DirectEvaluationInput,
  csrfToken: string,
  signal?: AbortSignal,
): Promise<DirectEvaluationResponse> {
  input(validId(projectId) && validId(values.operation_id) && validId(values.evaluator_id));
  input(values.mode === 'onsite' || values.mode === 'remote');
  const visit = values.visit.trim();
  input(label.test(visit));
  const test_code = (values.test_code ?? 'stroop_go_nogo_ptbr').trim();
  input(test_code === 'stroop_go_nogo_ptbr');
  let initials: string | null = null;
  if (values.initials !== undefined && values.initials !== null && values.initials.trim() !== '') {
    initials = values.initials.trim().toUpperCase();
    input(initialsPattern.test(initials));
  }
  let patient: DirectEvaluationPatientInput;
  if ('patient_id' in values.patient) {
    input(validId(values.patient.patient_id));
    patient = { patient_id: values.patient.patient_id };
  } else {
    const trimmedName = values.patient.new.full_name.trim();
    input(trimmedName.length >= 2 && trimmedName.length <= 120);
    patient = {
      new: {
        full_name: trimmedName,
        initials: values.patient.new.initials ?? null,
        disambiguation_note: values.patient.new.disambiguation_note ?? null,
        confirm_homonym: Boolean(values.patient.new.confirm_homonym),
      },
    };
  }
  return request(`/api/v1/projects/${projectId}/direct-evaluations`, {
    method: 'POST',
    headers: headers(csrfToken),
    body: JSON.stringify({
      operation_id: values.operation_id,
      patient,
      evaluator_id: values.evaluator_id,
      test_code,
      visit,
      initials,
      mode: values.mode,
    }),
  }, async response => {
    if (![200, 201].includes(response.status)) throw new ApiError('invalid_response', response.status);
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new ApiError('invalid_response', response.status); }
    return decodeDirectEvaluation(body, response.status);
  }, signal);
}

export function getDirectEvaluation(
  projectId: string,
  operationId: string,
  signal?: AbortSignal,
): Promise<DirectEvaluationResponse> {
  input(validId(projectId) && validId(operationId));
  return request(`/api/v1/projects/${projectId}/direct-evaluations/${operationId}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  }, async response => {
    if (response.status !== 200) throw new ApiError('invalid_response', response.status);
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new ApiError('invalid_response', response.status); }
    return decodeDirectEvaluation(body, response.status);
  }, signal);
}

export function handoffDirectEvaluation(
  projectId: string,
  operationId: string,
  code: string,
  csrfToken: string,
  signal?: AbortSignal,
): Promise<DirectHandoffResponse> {
  input(validId(projectId) && validId(operationId) && /^[A-Za-z0-9_-]{22,128}$/.test(code));
  return request(`/api/v1/projects/${projectId}/direct-evaluations/${operationId}/handoff`, {
    method: 'POST',
    headers: headers(csrfToken),
    body: JSON.stringify({ code }),
  }, async response => {
    if (response.status !== 200) throw new ApiError('invalid_response', response.status);
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new ApiError('invalid_response', response.status); }
    if (
      !record(body) ||
      !validId(body.session_id) ||
      body.state !== 'preparing' ||
      !validDate(body.activated_at) ||
      !validDate(body.expires_at) ||
      typeof body.csrf_token !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(body.csrf_token)
    ) {
      throw new ApiError('invalid_response', response.status);
    }
    return {
      session_id: body.session_id,
      state: 'preparing',
      activated_at: body.activated_at,
      expires_at: body.expires_at,
      csrf_token: body.csrf_token,
    };
  }, signal);
}
