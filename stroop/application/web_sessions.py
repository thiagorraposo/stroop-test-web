"""Validacao e casos de uso do fluxo WEB de convites e sessoes."""

from __future__ import annotations

import re
import hashlib
import secrets
from uuid import UUID

from stroop.domain.auth import AppUser
from stroop.domain.registry import (
    DuplicateCandidateError,
    InvalidRegistryDataError,
    derive_initials,
    normalize_person_name,
    validate_disambiguation_note,
    validate_initials,
    validate_test_code,
)
from stroop.persistence import web_sessions as persistence
from stroop.persistence.auth import PersistenceError


LABEL = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
PROJECT_CODE = LABEL
APP_VERSION = re.compile(r"^[A-Za-z0-9_.+-]{1,64}$")
ABORT_REASONS = frozenset({
    "focus_lost", "visibility_hidden", "escape", "reload", "page_closed",
    "timing_invalid", "user_cancelled",
})


class InvalidDataError(ValueError):
    """Entrada que viola o contrato da sessao WEB."""


def _label(value: str) -> str:
    normalized = value.strip() if isinstance(value, str) else ""
    if LABEL.fullmatch(normalized) is None:
        raise InvalidDataError
    return normalized


def projects(database_url: str, actor: AppUser, limit: int = 25, offset: int = 0):
    return persistence.list_projects(
        database_url, actor.issuer, actor.subject,
        all_projects=actor.role == "administracao",
        limit=limit, offset=offset,
    )


def create_project(database_url: str, project_id: UUID, code: str, name: str,
                   actor: AppUser):
    code = _label(code)
    name = name.strip() if isinstance(name, str) else ""
    if not 1 <= len(name) <= 120 or any(ord(char) < 32 for char in name):
        raise InvalidDataError
    return persistence.create_project(database_url, project_id, code, name,
                                      actor.issuer, actor.subject)


def members(database_url: str, project_id: UUID, limit: int = 25, offset: int = 0):
    return persistence.list_members(database_url, project_id, limit, offset)


def project_invitation_access(database_url: str, project_id: UUID, actor: AppUser):
    return persistence.project_invitation_access(database_url, project_id,
                                                 actor.issuer, actor.subject)


def set_member(database_url: str, project_id: UUID, issuer: str, subject: str,
               active: bool, actor: AppUser) -> bool:
    if not isinstance(active, bool):
        raise InvalidDataError
    return persistence.set_member(database_url, project_id, issuer, subject, active,
                                  actor.issuer, actor.subject)


def create_invitation(database_url: str, invitation_id: UUID, session_id: UUID,
                      project_id: UUID, code_hash: str, participant_id: str,
                      visit: str, actor: AppUser):
    return persistence.create_invitation(
        database_url, invitation_id, session_id, project_id, code_hash,
        _label(participant_id), _label(visit), actor.issuer, actor.subject,
    )


def create_cadastral_invitation(
    database_url: str,
    invitation_id: UUID,
    session_id: UUID,
    project_id: UUID,
    code_hash: str,
    *,
    patient_id: UUID,
    evaluator_id: UUID,
    visit: str,
    test_code: str | None = None,
    initials: str | None = None,
    actor: AppUser,
):
    try:
        instrument = validate_test_code(test_code)
        cleaned_initials = (
            validate_initials(initials) if initials is not None else None
        )
    except InvalidRegistryDataError as exc:
        raise InvalidDataError from exc
    return persistence.create_cadastral_invitation(
        database_url,
        invitation_id,
        session_id,
        project_id,
        code_hash,
        patient_id=patient_id,
        evaluator_id=evaluator_id,
        visit=_label(visit),
        test_code=instrument["test_code"],
        test_version=instrument["test_version"],
        protocol_id=instrument["protocol_id"],
        initials=cleaned_initials,
        issuer=actor.issuer,
        subject=actor.subject,
    )


def revoke_invitation(database_url: str, project_id: UUID, invitation_id: UUID,
                      actor: AppUser) -> bool:
    return persistence.revoke_invitation(
        database_url, project_id, invitation_id, actor.issuer, actor.subject
    )


def _ordered_conditions() -> tuple[int, ...]:
    import secrets
    values = list(range(1, 17))
    secrets.SystemRandom().shuffle(values)
    return tuple(values)


def redeem(database_url: str, code_hash: str, token_hash: str):
    return persistence.redeem(database_url, code_hash, token_hash,
                               _ordered_conditions())


def participant_session(database_url: str, token_hash: str):
    return persistence.get_participant_session(database_url, token_hash)


def start(database_url: str, token_hash: str, app_version: str):
    normalized = app_version.strip() if isinstance(app_version, str) else ""
    if APP_VERSION.fullmatch(normalized) is None:
        raise InvalidDataError
    return persistence.start_participant_session(database_url, token_hash, normalized)


def abort(database_url: str, token_hash: str, reason: str):
    if reason not in ABORT_REASONS:
        raise InvalidDataError
    return persistence.abort_participant_session(database_url, token_hash, reason)


def redeem_limit(database_url: str, remote_hash: str, limit: int, window_seconds: int):
    return persistence.redeem_limit(database_url, remote_hash, limit, window_seconds)


__all__ = ["InvalidDataError", "ConflictError", "ExpiredError", "MissingError",
           "ForbiddenError", "DuplicateCandidateError",
           "PersistenceError", "projects", "create_project", "members", "set_member",
           "create_invitation", "create_cadastral_invitation", "revoke_invitation",
           "create_direct_evaluation", "get_direct_evaluation", "handoff_direct_evaluation",
           "redeem", "participant_session", "start", "abort", "redeem_limit", "logout"]


ConflictError = persistence.ConflictError
ExpiredError = persistence.ExpiredError
MissingError = persistence.MissingError
ForbiddenError = persistence.ForbiddenError
UnknownCredentialError = persistence.UnknownCredentialError


def create_direct_evaluation(
    database_url: str,
    *,
    operation_id: UUID,
    request_hash: str,
    invitation_id: UUID,
    session_id: UUID,
    project_id: UUID,
    code_hash: str,
    patient_id: UUID | None,
    new_patient: dict | None,
    evaluator_id: UUID,
    visit: str,
    test_code: str | None,
    initials: str | None,
    mode: str,
    actor: AppUser,
) -> dict:
    if mode not in {"onsite", "remote"}:
        raise InvalidDataError
    try:
        instrument = validate_test_code(test_code)
        cleaned_initials = validate_initials(initials) if initials is not None else None
        prepared_new_patient: dict | None = None
        if patient_id is None:
            if not isinstance(new_patient, dict):
                raise InvalidDataError
            cleaned_full_name, normalized_full_name = normalize_person_name(
                new_patient.get("full_name", "")
            )
            cleaned_pat_initials = (
                validate_initials(new_patient["initials"])
                if new_patient.get("initials") is not None
                else derive_initials(cleaned_full_name)
            )
            cleaned_note = validate_disambiguation_note(new_patient.get("disambiguation_note"))
            prepared_new_patient = {
                "full_name": cleaned_full_name,
                "normalized_name": normalized_full_name,
                "initials": cleaned_pat_initials,
                "disambiguation_note": cleaned_note,
                "confirm_homonym": bool(new_patient.get("confirm_homonym", False)),
            }
    except InvalidRegistryDataError as exc:
        raise InvalidDataError from exc
    return persistence.create_direct_evaluation(
        database_url,
        operation_id=operation_id,
        request_hash=request_hash,
        invitation_id=invitation_id,
        session_id=session_id,
        project_id=project_id,
        code_hash=code_hash,
        patient_id=patient_id,
        new_patient=prepared_new_patient,
        evaluator_id=evaluator_id,
        visit=_label(visit),
        test_code=instrument["test_code"],
        test_version=instrument["test_version"],
        protocol_id=instrument["protocol_id"],
        initials=cleaned_initials,
        mode=mode,
        issuer=actor.issuer,
        subject=actor.subject,
    )


def get_direct_evaluation(
    database_url: str,
    *,
    project_id: UUID,
    operation_id: UUID,
    actor: AppUser,
) -> dict | None:
    return persistence.get_direct_evaluation(
        database_url,
        project_id=project_id,
        operation_id=operation_id,
        issuer=actor.issuer,
        subject=actor.subject,
    )


def handoff_direct_evaluation(
    database_url: str,
    *,
    project_id: UUID,
    operation_id: UUID,
    code_hash: str,
    token_hash: str,
    actor: AppUser,
    professional_token_hash: str,
    local_auth: bool,
) -> dict:
    return persistence.handoff_direct_evaluation(
        database_url,
        project_id=project_id,
        operation_id=operation_id,
        code_hash=code_hash,
        token_hash=token_hash,
        condition_order=_ordered_conditions(),
        issuer=actor.issuer,
        subject=actor.subject,
        professional_token_hash=professional_token_hash,
        local_auth=local_auth,
    )


def logout(database_url: str, token_hash: str) -> None:
    replacement_hash = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
    persistence.logout_participant_session(database_url, token_hash, replacement_hash)
