"""Consultas somente leitura de avaliacoes WEB e legadas autorizadas."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any
import math
import hashlib
import json
from uuid import UUID

import psycopg
from psycopg.rows import dict_row, tuple_row

from stroop.persistence.auth import PersistenceError
from stroop.domain.stroop import ALLOWED_CONDITIONS, ALLOWED_KEYS, calculate_metrics, expected_outcome


REQUIRED_COLUMNS = {
    "assessments": {
        "assessment_id", "test_code", "test_version", "project", "participant_id",
        "visit", "evaluator", "assessment_date",
        "started_at", "imported_at", "import_status",
    },
    "assessment_metrics": {
        "assessment_id", "metric_code", "metric_label", "metric_value", "unit",
    },
    "trial_results": {
        "assessment_id", "block", "trial_number", "word", "ink_color", "condition",
        "correct_response", "key_pressed", "reaction_time", "correct", "error_type",
    },
    "web_patients": {"id", "participant_code", "active", "created_at"},
    "web_evaluators": {"id", "evaluator_code"},
    "web_project_participants": {"participant_uuid", "project_id", "pseudonym", "patient_id"},
    "web_legacy_entity_links": {"link_id", "entity_type", "legacy_participant_uuid", "patient_id", "active"},
    "web_projects": {"project_id", "code", "active"},
    "web_legacy_project_links": {"legacy_project", "project_id", "active"},
    "web_csv_imports": {"operation_id", "project_id", "status", "assessment_id"},
    "web_project_members": {"project_id", "issuer", "subject", "active"},
    "app_users": {"issuer", "subject", "role", "active"},
    "web_assessments": {
        "assessment_id", "session_id", "project_id", "platform", "protocol_id",
        "app_version", "frame_period_ms", "completed_at", "patient_id", "evaluator_uuid",
    },
    "web_session_invalidations": {"session_id", "reason", "recorded_at", "source", "event_at_ms"},
    "web_session_checkpoints": {"session_id", "confirmed_through", "prefix_hash", "received_at"},
    "web_participant_sessions": {
        "session_id", "state", "activated_at", "started_at", "expires_at",
        "abort_reason", "revoked_at", "app_version",
    },
    "web_invitations": {
        "session_id", "project_id", "revoked_at", "participant_id", "visit",
        "patient_id", "evaluator_uuid", "evaluator_id", "protocol_id",
        "test_code", "test_version", "created_at",
    },
    "web_trial_observations": {
        "assessment_id", "trial_number", "condition_id", "trial_start_ms",
        "stimulus_onset_ms", "stimulus_offset_ms", "trial_end_ms", "key_at_ms",
        "reaction_time_ms",
    },
}


class SchemaError(Exception):
    """Schema indisponivel ou incompativel com a consulta WEB."""


def _connect(database_url: str):
    if not database_url:
        raise PersistenceError("Credencial somente leitura nao configurada.")
    connection = None
    try:
        connection = psycopg.connect(database_url, connect_timeout=5, row_factory=dict_row)
        connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        return connection
    except psycopg.Error as exc:
        if connection is not None:
            connection.close()
        raise PersistenceError from exc


def _validate_schema(connection) -> None:
    try:
        rows = connection.execute(
            """SELECT table_name, column_name FROM information_schema.columns
               WHERE table_schema='public' AND table_name = ANY(%s)""",
            (sorted(REQUIRED_COLUMNS),),
        ).fetchall()
        found: dict[str, set[str]] = {}
        for row in rows:
            found.setdefault(row["table_name"], set()).add(row["column_name"])
        missing_tables: list[str] = []
        missing_columns: list[str] = []
        for table, expected in REQUIRED_COLUMNS.items():
            actual = found.get(table, set())
            if not actual:
                missing_tables.append(table)
            elif expected - actual:
                missing_columns.append(f"{table}: {', '.join(sorted(expected - actual))}")
        if missing_tables or missing_columns:
            raise SchemaError
    except psycopg.Error as exc:
        raise PersistenceError from exc


def _authorized_project(connection, project_id: UUID, issuer: str, subject: str) -> bool:
    row = connection.execute(
        """SELECT 1 FROM web_projects p
           JOIN web_project_members m ON m.project_id=p.project_id
           JOIN app_users u ON (u.issuer,u.subject)=(m.issuer,m.subject)
           WHERE p.project_id=%s AND p.active AND m.active AND u.active
             AND m.issuer=%s AND m.subject=%s
             AND u.role IN ('consulta','importacao','administracao')""",
        (project_id, issuer, subject),
    ).fetchone()
    return row is not None


def _base_query(where_clause: str, *, history=False, multi_project: bool = False) -> str:
    # where_clause is selected only from the fixed call sites below.
    valid_clause = "" if history else "AND NOT EXISTS (SELECT 1 FROM web_session_invalidations inv WHERE inv.session_id=wa.session_id)"
    project_col = "p.project_id AS scoped_project_id, " if multi_project else ""
    project_cond = "p.project_id = ANY(%s)" if multi_project else "p.project_id=%s"
    return f"""SELECT {project_col}a.assessment_id, a.participant_id, a.visit, p.code AS project_code,
                      CASE WHEN wa.assessment_id IS NULL THEN NULL ELSE a.evaluator END AS evaluator_id,
                      COALESCE(wa.completed_at, a.imported_at::timestamptz) AS created_at,
                      a.started_at, COALESCE(wa.platform, 'psychopy') AS platform,
                      a.test_code, a.test_version, wa.protocol_id, wa.app_version,
                      wa.session_id, wa.completed_at, wa.frame_period_ms,
                      a.assessment_date, a.import_status,
                      NOT EXISTS (SELECT 1 FROM web_session_invalidations inv WHERE inv.session_id=wa.session_id) AS valid_for_result,
                      (SELECT inv.reason FROM web_session_invalidations inv WHERE inv.session_id=wa.session_id) AS invalidation_reason
               FROM assessments a
               LEFT JOIN web_assessments wa ON wa.assessment_id=a.assessment_id
               LEFT JOIN web_csv_imports wi ON wi.assessment_id=a.assessment_id AND wi.status='importado'
               JOIN web_projects p ON {project_cond}
                 AND ((wa.assessment_id IS NOT NULL AND wa.project_id=p.project_id)
                   OR (wi.assessment_id IS NOT NULL AND wi.project_id=p.project_id)
                   OR (wa.assessment_id IS NULL AND wi.assessment_id IS NULL AND EXISTS (
                     SELECT 1 FROM web_legacy_project_links lp
                     WHERE lp.project_id=p.project_id AND lp.legacy_project=a.project AND lp.active
                   )))
               JOIN web_project_members m ON m.project_id=p.project_id
                 AND m.issuer=%s AND m.subject=%s AND m.active
               JOIN app_users u ON (u.issuer,u.subject)=(m.issuer,m.subject)
                 AND u.active AND u.role IN ('consulta','importacao','administracao')
               WHERE p.active AND a.import_status='valid' {valid_clause} {where_clause}"""


class SnapshotConflict(Exception):
    """Conjunto mudou entre paginas."""


class FacetLimitError(Exception):
    """Opcoes excederam limite explicito."""


def _filters(filters):
    clauses, values = [], []
    if filters.get('patient_search'):
        clauses.append('AND position(%s in lower(a.participant_id)) > 0')
        values.append(filters['patient_search'])
    if filters.get('patient_id'):
        patients = [str(UUID(value)) for value in filters['patient_id']]
        clauses.append(
            """AND ((wa.assessment_id IS NOT NULL AND wa.patient_id=ANY(%s::uuid[]))
                 OR (wa.assessment_id IS NULL AND EXISTS (
                     SELECT 1 FROM web_project_participants pp
                     JOIN web_legacy_entity_links l
                       ON l.legacy_participant_uuid=pp.participant_uuid
                      AND l.entity_type='patient' AND l.active
                     WHERE pp.project_id=p.project_id
                       AND pp.pseudonym=a.participant_id
                       AND l.patient_id=ANY(%s::uuid[])
                 )))"""
        )
        values.extend([patients, patients])
    columns = {'participant_id': 'a.participant_id', 'visit': 'a.visit', 'test_version': 'a.test_version',
               'platform': "COALESCE(wa.platform,'psychopy')"}
    for key, column in columns.items():
        if filters.get(key):
            clauses.append(f'AND {column}=ANY(%s)')
            values.append(list(filters[key]))
    if filters.get('evaluator_id'):
        evaluators = list(filters['evaluator_id'])
        clauses.append(
            """AND (COALESCE(CASE WHEN wa.assessment_id IS NULL THEN NULL ELSE a.evaluator END,'LEGADO_NAO_MAPEADO')=ANY(%s)
                 OR (wa.assessment_id IS NOT NULL AND wa.evaluator_uuid::text=ANY(%s)))"""
        )
        values.extend([evaluators, evaluators])
    for key, operator in [('start_date', '>='), ('end_date', '<=')]:
        if filters.get(key):
            clauses.append(f'AND a.assessment_date {operator} %s')
            values.append(filters[key])
    if filters.get('test_code'):
        clauses.append('AND a.test_code=ANY(%s)')
        instruments = filters['test_code']
        values.append([instruments] if isinstance(instruments, str) else list(instruments))
    if filters.get('condition') or filters.get('response_type') or filters.get('go_nogo'):
        # Resolve outcome categories through the official domain. One EXISTS
        # requires condition AND response on the SAME main trial; metrics below
        # continue to hydrate the full assessment.
        conditions = filters.get('condition') or ALLOWED_CONDITIONS
        responses = filters.get('response_type')
        pairs = []
        for condition in sorted(ALLOWED_CONDITIONS):
            for key in sorted(ALLOWED_KEYS):
                outcome = expected_outcome({'condition': condition, 'key_pressed': key})
                kind = ('go' if outcome[0] else 'no_go') if outcome else None
                if (outcome and condition in conditions and (not responses or outcome[2] in responses)
                        and (not filters.get('go_nogo') or kind in filters['go_nogo'])):
                    pairs.append((condition, key))
        if not pairs:
            clauses.append('AND FALSE')
        else:
            alternatives = " OR ".join("(tr.condition=%s AND COALESCE(tr.key_pressed,'')=%s)" for _ in pairs)
            clauses.append("AND EXISTS (SELECT 1 FROM trial_results tr WHERE tr.assessment_id=a.assessment_id "
                           "AND tr.block='main' AND (" + alternatives + '))')
            values.extend(value for pair in pairs for value in pair)
    return ' '.join(clauses), values


def assessment_options(database_url, project_id, issuer, subject, *, filters):
    try:
        with _connect(database_url) as connection:
            _validate_schema(connection)
            if not _authorized_project(connection, project_id, issuer, subject):
                return False, {}
            where, values = _filters(filters)
            base = _base_query(where)
            result = {}
            for key in ('participant_id', 'visit', 'evaluator_id', 'test_version', 'platform', 'test_code'):
                expression = "COALESCE(evaluator_id,'LEGADO_NAO_MAPEADO')" if key == 'evaluator_id' else key
                rows = connection.execute(f'SELECT DISTINCT {expression} AS value FROM ({base}) scoped ORDER BY value LIMIT 201',
                                          (project_id, issuer, subject, *values)).fetchall()
                if len(rows) > 200:
                    raise FacetLimitError
                result[key] = [row['value'] for row in rows]
            return True, result
    except psycopg.Error as exc:
        raise PersistenceError from exc


def _scoped_query(project_id, issuer, subject, filters, participant_id=None, visit=None, *, multi_project: bool = False):
    clauses, params = [], [project_id, issuer, subject]
    for column, value in (('participant_id', participant_id), ('visit', visit)):
        if value is not None:
            clauses.append(f'AND a.{column}=%s')
            params.append(value)
    where, values = _filters(filters)
    return _base_query(' '.join(clauses) + ' ' + where, multi_project=multi_project), [*params, *values]


def _snapshot(connection, base, params):
    entries = connection.execute('SELECT * FROM (' + base + ') scoped ORDER BY assessment_id LIMIT 5001', params).fetchall()
    if len(entries) > 5000:
        raise FacetLimitError
    digest = hashlib.sha256()
    digest.update(json.dumps(entries, sort_keys=True, default=str, separators=(',', ':')).encode())
    digest.update(b'\n')
    # Hash exactly the source values used by professional summaries, never names.
    stroop = [row['assessment_id'] for row in entries if row['test_code'] == 'stroop_go_nogo_ptbr']
    generic = [row['assessment_id'] for row in entries if row['test_code'] != 'stroop_go_nogo_ptbr']
    with connection.cursor(row_factory=tuple_row) as tcur:
        if stroop:
            trows = tcur.execute("""SELECT assessment_id,trial_number,condition,key_pressed,reaction_time
                FROM trial_results WHERE assessment_id=ANY(%s) AND block='main'
                ORDER BY assessment_id,trial_number""", (stroop,)).fetchall()
            digest.update(json.dumps(trows, default=str, separators=(',', ':')).encode())
        digest.update(b'\n"generic-metrics"\n')
        if generic:
            grows = tcur.execute("""SELECT assessment_id,metric_code,metric_value FROM assessment_metrics
                WHERE assessment_id=ANY(%s) ORDER BY assessment_id,metric_code""", (generic,)).fetchall()
            digest.update(json.dumps(grows, default=str, separators=(',', ':')).encode())
    return entries, digest.hexdigest()


def _hydrate(connection, rows, project_id, *, metrics_by_id=None, trials_by_id=None):
    if not rows:
        return []
    ids = [row["assessment_id"] for row in rows]
    if metrics_by_id is None:
        metrics = connection.execute(
            """SELECT assessment_id, metric_code, metric_value
               FROM assessment_metrics WHERE assessment_id = ANY(%s)
               ORDER BY assessment_id, metric_code""", (ids,),
        ).fetchall()
        metrics_by_id = {}
        for metric in metrics:
            metrics_by_id.setdefault(metric["assessment_id"], {})[
                metric["metric_code"]
            ] = float(metric["metric_value"])
    if trials_by_id is None:
        stroop_ids = [row["assessment_id"] for row in rows if row["test_code"] == "stroop_go_nogo_ptbr"]
        trials_by_id = {}
        if stroop_ids:
            source_trials = connection.execute(
                """SELECT assessment_id,condition,key_pressed,reaction_time FROM trial_results
                   WHERE assessment_id=ANY(%s) AND block='main' ORDER BY assessment_id,trial_number""",
                (stroop_ids,),
            ).fetchall()
            for trial in source_trials:
                trials_by_id.setdefault(trial["assessment_id"], []).append(trial)
    result = []
    for row in rows:
        item = dict(row)
        item["project_id"] = project_id
        values = metrics_by_id.get(item["assessment_id"], {})
        if item["test_code"] == "stroop_go_nogo_ptbr":
            values = {metric["metric_code"]: metric["metric_value"]
                      for metric in _recalculate(trials_by_id.get(item["assessment_id"], []))}
        item["summary"] = _summary(item["test_code"], values)
        item['official_metrics'] = dict(values)
        if item['test_code'] == 'stroop_go_nogo_ptbr':
            if not values.get('hits'):
                item['official_metrics']['response_time'] = None
            if not values.get('total_go_trials'):
                for code in ('accuracy_go_trials', 'omission_errors_percentage'):
                    item['official_metrics'][code] = None
            if not values.get('total_no_go_trials'):
                item['official_metrics']['accuracy_no_go_trials'] = None
        item.pop("import_status", None)
        result.append(item)
    return result


def list_assessments(database_url: str, project_id: UUID, issuer: str, subject: str,
                     *, participant_id: str | None = None, visit: str | None = None,
                     limit: int, offset: int, filters=None, snapshot=None, include_snapshot=False):
    try:
        with _connect(database_url) as connection:
            _validate_schema(connection)
            if not _authorized_project(connection, project_id, issuer, subject):
                return (False, [], None) if include_snapshot else (False, [])
            base, params = _scoped_query(project_id, issuer, subject, filters or {}, participant_id, visit)
            fingerprint = None
            if include_snapshot:
                _, fingerprint = _snapshot(connection, base, params)
                if snapshot is not None and snapshot != fingerprint:
                    raise SnapshotConflict
            rows = connection.execute(base + """
                ORDER BY COALESCE(wa.completed_at, a.imported_at::timestamptz), a.assessment_id
                LIMIT %s OFFSET %s""", (*params, limit, offset)).fetchall()
            result = _hydrate(connection, rows, project_id)
            return (True, result, fingerprint) if include_snapshot else (True, result)
    except psycopg.Error as exc:
        raise PersistenceError from exc


def aggregate_assessments(database_url, projects, issuer, subject, *, filters, view):
    """Reautoriza todos e compara os conjuntos originais em uma unica transacao RO."""
    if not 1 <= len(projects) <= 20:
        raise FacetLimitError
    try:
        with _connect(database_url) as connection:
            _validate_schema(connection)
            selected = []
            count = 0
            for project_id, expected in projects:
                if not _authorized_project(connection, project_id, issuer, subject):
                    return False, []
                base, params = _scoped_query(project_id, issuer, subject, filters)
                rows, fingerprint = _snapshot(connection, base, params)
                if fingerprint != expected:
                    raise SnapshotConflict
                count += len(rows)
                if count > 5000:
                    raise FacetLimitError
                selected.append((project_id, rows))
            result = []
            for project_id, rows in selected:
                visible = [row for row in rows if row['test_code'] == view['test_code']
                           and (not view.get('platform') or row['platform'] == view['platform'])]
                result.extend(_hydrate(connection, visible, project_id))
            return True, result
    except psycopg.Error as exc:
        raise PersistenceError from exc


def _canonical_trial(source: dict) -> dict:
    row = {"block": "main", "condition": source["condition"],
           "key_pressed": source["key_pressed"] or ""}
    outcome = expected_outcome(row)
    if outcome is None:
        raise PersistenceError
    row["correct_response"], row["correct"], row["error_type"] = outcome
    value = source["reaction_time"]
    if row["key_pressed"]:
        if value is None or not math.isfinite(float(value)) or float(value) <= 0:
            raise PersistenceError
        row["reaction_time"] = str(float(value))
    else:
        if value is not None:
            raise PersistenceError
        row["reaction_time"] = ""
    return row


def _recalculate(trials: list[dict]) -> list[dict]:
    if not trials:
        raise PersistenceError
    return calculate_metrics([_canonical_trial(row) for row in trials])


def _summary(test_code: str, metrics: dict[str, float]) -> dict[str, Any]:
    if test_code != "stroop_go_nogo_ptbr":
        return {"metrics": metrics}
    hits = int(metrics.get("hits", 0))
    return {
        "accuracy": metrics.get("accuracy"),
        "accuracy_go_trials": metrics.get("accuracy_go_trials") if metrics.get("total_go_trials", 0) else None,
        "accuracy_no_go_trials": metrics.get("accuracy_no_go_trials") if metrics.get("total_no_go_trials", 0) else None,
        "total_go_trials": int(metrics.get("total_go_trials", 0)),
        "total_no_go_trials": int(metrics.get("total_no_go_trials", 0)),
        "response_time_seconds": metrics.get("response_time") if hits else None,
        "total_trials": int(metrics.get("total_trials", 0)),
        "hits": hits,
        "omission_errors": int(metrics.get("omission_errors", 0)),
        "commission_errors": int(metrics.get("commission_errors", 0)),
        "correct_rejections": int(metrics.get("correct_rejections", 0)),
    }


def get_assessment(database_url: str, project_id: UUID, assessment_id: str,
                   issuer: str, subject: str) -> dict[str, Any] | None:
    try:
        with _connect(database_url) as connection:
            _validate_schema(connection)
            if not _authorized_project(connection, project_id, issuer, subject):
                return None
            rows = connection.execute(
                _base_query("AND a.assessment_id=%s", history=True),
                (project_id, issuer, subject, assessment_id),
            ).fetchone()
            if rows is None:
                return None
            item = dict(rows)
            item["project_id"] = project_id
            metric_rows = connection.execute(
                """SELECT metric_code, metric_label, metric_value, unit
                   FROM assessment_metrics WHERE assessment_id=%s ORDER BY metric_code""",
                (assessment_id,),
            ).fetchall()
            metric_values = {row["metric_code"]: float(row["metric_value"]) for row in metric_rows}
            hits = int(metric_values.get("hits", 0))
            item["metrics"] = [
                {**row, "metric_value": (None if item["test_code"] == "stroop_go_nogo_ptbr"
                                         and row["metric_code"] == "response_time" and hits == 0
                                         else float(row["metric_value"]))}
                for row in metric_rows
            ]
            item["summary"] = _summary(item["test_code"], metric_values)
            trial_rows = connection.execute(
                """SELECT tr.block, tr.trial_number, wto.condition_id, tr.word, tr.ink_color,
                          tr.condition, tr.correct_response, tr.key_pressed, tr.reaction_time,
                          tr.correct, tr.error_type, wto.trial_start_ms, wto.stimulus_onset_ms,
                          wto.stimulus_offset_ms, wto.trial_end_ms, wto.key_at_ms,
                          wto.reaction_time_ms
                   FROM trial_results tr
                   LEFT JOIN web_trial_observations wto
                     ON wto.assessment_id=tr.assessment_id AND wto.trial_number=tr.trial_number
                   WHERE tr.assessment_id=%s AND tr.block='main'
                   ORDER BY tr.trial_number""", (assessment_id,),
            ).fetchall()
            if item["test_code"] == "stroop_go_nogo_ptbr":
                recalculated = _recalculate(trial_rows)
                metric_values = {metric["metric_code"]: metric["metric_value"] for metric in recalculated}
                hits = int(metric_values["hits"])
                item["metrics"] = [
                    {**metric, "metric_value": (None if (
                        metric["metric_code"] == "response_time" and not hits
                        or metric["metric_code"] in ("accuracy_go_trials", "omission_errors_percentage") and not metric_values["total_go_trials"]
                        or metric["metric_code"] == "accuracy_no_go_trials" and not metric_values["total_no_go_trials"]
                    ) else metric["metric_value"])} for metric in recalculated
                ]
                item["summary"] = _summary(item["test_code"], metric_values)
                for trial in trial_rows:
                    canonical = _canonical_trial(trial)
                    trial.update(correct=canonical["correct"] == "1", error_type=canonical["error_type"],
                                 correct_response=canonical["correct_response"] or None)
            item["trials"] = [
                {**row, "trial_number": int(row["trial_number"]),
                 "condition_id": (None if row["condition_id"] is None else int(row["condition_id"])),
                 "correct": bool(row["correct"]),
                 "reaction_time_seconds": (None if row["reaction_time"] is None
                                           else float(row["reaction_time"]))}
                for row in trial_rows
            ]
            return item
    except (SchemaError, PersistenceError):
        raise
    except psycopg.Error as exc:
        raise PersistenceError from exc


def iso_utc(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        value = datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise PersistenceError from exc
    if not isinstance(value, datetime):
        raise PersistenceError
    if value.tzinfo is None:
        return value.isoformat()  # Legado sem fuso permanece sem fuso; nao inventar UTC.
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


__all__ = ["PersistenceError", "SchemaError", "SnapshotConflict", "FacetLimitError",
           "list_assessments", "assessment_options", "aggregate_assessments", "get_assessment", "iso_utc"]


def session_status(database_url, project_id, session_id, issuer, subject):
    """Estado de recepcao separado das consultas oficiais; sem observacoes brutas."""
    try:
        with _connect(database_url) as connection:
            _validate_schema(connection)
            if not _authorized_project(connection,project_id,issuer,subject):
                return None
            row = connection.execute(
                """SELECT s.session_id,s.state,s.expires_at,s.abort_reason,s.revoked_at,
                          i.revoked_at AS invitation_revoked_at,c.confirmed_through,c.prefix_hash,c.received_at,
                          inv.reason AS invalidation_reason,inv.source AS invalidation_source,
                          inv.recorded_at AS invalidated_at,inv.event_at_ms,
                          (s.expires_at <= clock_timestamp()) AS deadline_passed
                   FROM web_participant_sessions s JOIN web_invitations i USING(session_id)
                   LEFT JOIN web_session_checkpoints c USING(session_id)
                   LEFT JOIN web_session_invalidations inv USING(session_id)
                   WHERE i.project_id=%s AND s.session_id=%s""", (project_id,session_id),
            ).fetchone()
            if row is None:
                return None
            expired = row['deadline_passed'] and row['state'] in {'preparing','running'}
            return {
                'session_id':str(row['session_id']), 'state':'expired' if expired else row['state'],
                'expires_at':iso_utc(row['expires_at']),
                'complete':row['state']=='completed',
                'valid_for_result':row['state']=='completed' and row['invalidation_reason'] is None,
                'abort_reason':row['abort_reason'],
                'revoked':row['revoked_at'] is not None or row['invitation_revoked_at'] is not None,
                'invalidation':None if row['invalidation_reason'] is None else {
                    'reason':row['invalidation_reason'],'source':row['invalidation_source'],
                    'event_at_ms':row['event_at_ms'],'recorded_at':iso_utc(row['invalidated_at']),
                },
                'checkpoint':{'confirmed_through':row['confirmed_through'] or 0,
                              'prefix_hash':row['prefix_hash'],'received_at':iso_utc(row['received_at'])},
            }
    except psycopg.Error as exc:
        raise PersistenceError from exc


def _operational_sessions(connection, projects, filters):
    clauses, values = [], []
    if filters.get('patient_search'):
        clauses.append('AND position(%s in lower(i.participant_id)) > 0')
        values.append(filters['patient_search'])
    if filters.get('patient_id'):
        patients = [str(UUID(value)) for value in filters['patient_id']]
        clauses.append('AND COALESCE(wa.patient_id, i.patient_id) = ANY(%s::uuid[])')
        values.append(patients)
    for key, column in (('participant_id', 'i.participant_id'), ('visit', 'i.visit'),
                        ('test_version', 'i.test_version')):
        if filters.get(key):
            clauses.append(f'AND {column} = ANY(%s)')
            values.append(list(filters[key]))
    if filters.get('platform'):
        clauses.append("AND 'web' = ANY(%s)")
        values.append(list(filters['platform']))
    if filters.get('evaluator_id'):
        evaluators = list(filters['evaluator_id'])
        clauses.append(
            """AND (COALESCE(i.evaluator_id, 'LEGADO_NAO_MAPEADO') = ANY(%s)
                 OR (COALESCE(wa.evaluator_uuid, i.evaluator_uuid) IS NOT NULL
                     AND COALESCE(wa.evaluator_uuid, i.evaluator_uuid)::text = ANY(%s)))"""
        )
        values.extend([evaluators, evaluators])
    for key, operator in [('start_date', '>='), ('end_date', '<=')]:
        if filters.get(key):
            clauses.append(f"AND (COALESCE(s.started_at, s.activated_at) AT TIME ZONE 'UTC')::date {operator} %s::date")
            values.append(filters[key])
    if filters.get('test_code'):
        instruments = filters['test_code']
        clauses.append('AND i.test_code = ANY(%s)')
        values.append([instruments] if isinstance(instruments, str) else list(instruments))
    where_sql = ' '.join(clauses)
    op_rows = []
    rows = connection.execute(
        f"""SELECT s.session_id, i.project_id, p.code AS project_code,
                   i.participant_id, i.visit, i.evaluator_id,
                   i.test_code, i.test_version, i.protocol_id,
                   s.state, s.activated_at AS created_at, s.started_at, s.expires_at,
                   s.abort_reason, s.revoked_at, i.revoked_at AS invitation_revoked_at,
                   inv.reason AS invalidation_reason,
                   c.confirmed_through, c.prefix_hash,
                   (s.expires_at <= clock_timestamp()) AS deadline_passed
            FROM web_participant_sessions s
            JOIN web_invitations i USING (session_id)
            JOIN web_projects p ON p.project_id = i.project_id
            LEFT JOIN web_session_checkpoints c USING (session_id)
            LEFT JOIN web_session_invalidations inv USING (session_id)
            LEFT JOIN web_assessments wa ON wa.session_id = s.session_id
            WHERE i.project_id = ANY(%s) AND p.active
              AND (inv.session_id IS NOT NULL OR s.state <> 'completed')
              {where_sql}
            ORDER BY COALESCE(s.started_at, s.activated_at) DESC, s.session_id ASC
            LIMIT 5001""",
        (list(projects), *values),
    ).fetchall()
    if len(rows) > 5000:
        raise FacetLimitError
    for row in rows:
        if row['invalidation_reason'] is not None:
            op_status = 'invalidated'
        elif row['state'] == 'aborted' or row['revoked_at'] is not None or row['invitation_revoked_at'] is not None:
            op_status = 'aborted'
        elif row['state'] == 'expired' or row['deadline_passed']:
            op_status = 'expired'
        else:
            op_status = 'in_progress'
        op_rows.append({
            'session_id': str(row['session_id']),
            'project_id': str(row['project_id']),
            'project_code': row['project_code'],
            'participant_id': row['participant_id'],
            'visit': row['visit'],
            'evaluator_id': row['evaluator_id'],
            'test_code': row['test_code'],
            'test_version': row['test_version'],
            'protocol_id': row['protocol_id'],
            'platform': 'web',
            'status': op_status,
            'state': row['state'],
            'created_at': iso_utc(row['created_at']),
            'started_at': iso_utc(row['started_at']),
            'expires_at': iso_utc(row['expires_at']),
            'abort_reason': row['abort_reason'],
            'invalidation_reason': row['invalidation_reason'],
            'confirmed_through': int(row['confirmed_through'] or 0),
            'valid_for_result': False,
            '_prefix_hash': row['prefix_hash'],
        })
    counts = {
        'invalidated': sum(1 for row in op_rows if row['status'] == 'invalidated'),
        'aborted': sum(1 for row in op_rows if row['status'] == 'aborted'),
        'expired': sum(1 for row in op_rows if row['status'] == 'expired'),
        'in_progress': sum(1 for row in op_rows if row['status'] == 'in_progress'),
        'total': len(op_rows),
    }
    raw_statuses = filters.get('status') or ['valid']
    statuses = [raw_statuses] if isinstance(raw_statuses, str) else list(raw_statuses)
    requested_op = set(statuses) & {'invalidated', 'aborted', 'expired', 'in_progress'}
    digest_entries = [
        (row['session_id'], row['status'], row['state'], row['abort_reason'],
         row['invalidation_reason'], row['confirmed_through'], row['_prefix_hash'])
        for row in op_rows
    ]
    items = [
        {k: v for k, v in row.items() if k != '_prefix_hash'}
        for row in op_rows if row['status'] in requested_op
    ][:100] if requested_op else []
    return counts, items, digest_entries


def _registry_counts(connection, projects, issuer, subject, *, precomputed_valid=None):
    visible_patients = int(
        connection.execute('SELECT COUNT(*) AS cnt FROM web_patients').fetchone()['cnt']
    )
    project_list = list(projects)
    project_linked_patients = int(
        connection.execute(
            """SELECT COUNT(DISTINCT patient_id) AS cnt FROM (
                   SELECT pp.patient_id FROM web_project_participants pp
                   WHERE pp.project_id = ANY(%s) AND pp.patient_id IS NOT NULL
                   UNION
                   SELECT wa.patient_id FROM web_assessments wa
                   WHERE wa.project_id = ANY(%s) AND wa.patient_id IS NOT NULL
                   UNION
                   SELECT i.patient_id FROM web_invitations i
                   WHERE i.project_id = ANY(%s) AND i.patient_id IS NOT NULL
                   UNION
                   SELECT l.patient_id FROM web_legacy_entity_links l
                   JOIN web_project_participants pp ON pp.participant_uuid = l.legacy_participant_uuid
                   WHERE pp.project_id = ANY(%s)
                     AND l.entity_type = 'patient' AND l.active AND l.patient_id IS NOT NULL
               ) linked""",
            (project_list, project_list, project_list, project_list),
        ).fetchone()['cnt']
    )
    if precomputed_valid is not None:
        valid_identities = set()
        for project, aid, participant_id, pid in precomputed_valid:
            if pid is not None:
                valid_identities.add(('patient', str(pid)))
            else:
                valid_identities.add(('project_participant', str(project), participant_id))
        return {
            'visible_patients': visible_patients,
            'project_linked_patients': project_linked_patients,
            'valid_assessment_participants': len(valid_identities),
        }
    valid_entries = []
    for project in projects:
        rows = connection.execute(
            _base_query(''),
            (project, issuer, subject),
        ).fetchall()
        valid_entries.extend((project, row['assessment_id'], row['participant_id']) for row in rows)
    valid_identities = set()
    if valid_entries:
        links = connection.execute(
            """SELECT a.assessment_id, scope.project_id,
                      COALESCE(wa.patient_id, l.patient_id) AS patient_id, l.link_id
               FROM unnest(%s::uuid[], %s::text[]) AS scope(project_id, assessment_id)
               JOIN assessments a ON a.assessment_id = scope.assessment_id
               LEFT JOIN web_assessments wa ON wa.assessment_id = a.assessment_id AND wa.project_id = scope.project_id
               LEFT JOIN web_project_participants pp ON pp.project_id = scope.project_id AND pp.pseudonym = a.participant_id
               LEFT JOIN web_legacy_entity_links l ON wa.assessment_id IS NULL
                   AND l.legacy_participant_uuid = pp.participant_uuid
                   AND l.entity_type = 'patient' AND l.active
               ORDER BY scope.project_id, a.assessment_id, l.link_id""",
            ([p for p, _, _ in valid_entries], [aid for _, aid, _ in valid_entries]),
        ).fetchall()
        seen_keys = {}
        for link in links:
            key = (str(link['project_id']), link['assessment_id'])
            if key in seen_keys:
                raise SnapshotConflict
            seen_keys[key] = link['patient_id']
        for project, aid, participant_id in valid_entries:
            pid = seen_keys.get((str(project), aid))
            if pid is not None:
                valid_identities.add(('patient', str(pid)))
            else:
                valid_identities.add(('project_participant', str(project), participant_id))
    return {
        'visible_patients': visible_patients,
        'project_linked_patients': project_linked_patients,
        'valid_assessment_participants': len(valid_identities),
    }


def analysis_selection(database_url, projects, issuer, subject, *, filters, assessment_ids=None, connection=None):
    """Universo autorizado em uma transação RO; nunca publicar prefixo de 5.001."""
    if not 1 <= len(projects) <= 20:
        raise FacetLimitError
    if connection is None:
        try:
            with _connect(database_url) as owned:
                return analysis_selection(database_url, projects, issuer, subject, filters=filters,
                                          assessment_ids=assessment_ids, connection=owned)
        except psycopg.Error as exc:
            raise PersistenceError from exc
    _validate_schema(connection)
    # Reautorizar TODOS antes de ler/popular qualquer resultado.
    authorized_rows = connection.execute(
        """SELECT DISTINCT p.project_id
           FROM web_projects p
           JOIN web_project_members m ON m.project_id=p.project_id
           JOIN app_users u ON (u.issuer,u.subject)=(m.issuer,m.subject)
           WHERE p.project_id = ANY(%s) AND p.active AND m.active AND u.active
             AND m.issuer=%s AND m.subject=%s
             AND u.role IN ('consulta','importacao','administracao')""",
        (list(projects), issuer, subject),
    ).fetchall()
    if len({row['project_id'] for row in authorized_rows}) != len(set(projects)):
        return False, [], [], None, [], {}, {'population': 'segregated_non_official_sessions', 'counts': {'invalidated': 0, 'aborted': 0, 'expired': 0, 'in_progress': 0, 'total': 0}, 'items': []}
    raw_statuses = filters.get('status') or ['valid']
    statuses = [raw_statuses] if isinstance(raw_statuses, str) else list(raw_statuses)
    include_valid = 'valid' in statuses
    official_filters = {k: v for k, v in filters.items() if k != 'status'}
    selected, project_entries = [], []
    if include_valid:
        base, params = _scoped_query(list(projects), issuer, subject, official_filters, multi_project=True)
        if assessment_ids is not None:
            base += ' AND a.assessment_id=ANY(%s)'
            params.append(assessment_ids)
        all_rows = connection.execute(
            'SELECT * FROM (' + base + ') scoped ORDER BY scoped_project_id, assessment_id LIMIT 5001',
            params,
        ).fetchall()
        if len(all_rows) > 5000:
            raise FacetLimitError
        rows_by_project: dict[UUID, list[dict[str, Any]]] = {project: [] for project in projects}
        for row in all_rows:
            pid = row.pop('scoped_project_id')
            rows_by_project.setdefault(pid, []).append(row)
        for project in projects:
            proj_rows = rows_by_project.get(project, [])
            project_entries.append((project, proj_rows))
            selected.extend((project, row) for row in proj_rows)
    if len({row['assessment_id'] for _, row in selected}) != len(selected):
        # Vínculos legados ambíguos não podem duplicar o universo A/T.
        raise SnapshotConflict
    eligible = {row['assessment_id'] for _, row in selected}
    if assessment_ids is not None:
        if not set(assessment_ids) <= eligible:
            raise SnapshotConflict
        selected = [(project, row) for project, row in selected if row['assessment_id'] in assessment_ids]
    all_selected_ids = sorted({row['assessment_id'] for _, row in selected})
    # Pré-busca única de métricas e tentativas para snapshots e hidratação.
    metrics_by_id: dict[str, dict[str, float]] = {}
    generic_tuples_by_id: dict[str, list[tuple[Any, ...]]] = {}
    generic_ids = sorted({row['assessment_id'] for _, rows in project_entries for row in rows if row['test_code'] != 'stroop_go_nogo_ptbr'})
    if generic_ids:
        with connection.cursor(row_factory=tuple_row) as tcur:
            for aid, mcode, mval in tcur.execute(
                """SELECT assessment_id, metric_code, metric_value
                   FROM assessment_metrics WHERE assessment_id = ANY(%s)
                   ORDER BY assessment_id, metric_code""",
                (generic_ids,),
            ).fetchall():
                generic_tuples_by_id.setdefault(aid, []).append((aid, mcode, mval))
                metrics_by_id.setdefault(aid, {})[mcode] = float(mval)
    all_trial_aids = sorted({row['assessment_id'] for _, rows in project_entries for row in rows})
    trials: list[dict[str, Any]] = []
    trials_by_id: dict[str, list[dict[str, Any]]] = {}
    trial_tuples_by_id: dict[str, list[tuple[Any, ...]]] = {}
    trials_sha = hashlib.sha256()
    if all_trial_aids:
        selected_id_set = set(all_selected_ids)
        with connection.cursor(row_factory=tuple_row) as tcur:
            raw_trials = tcur.execute(
                '''SELECT tr.assessment_id,tr.trial_number,tr.block,tr.condition,tr.word,tr.ink_color,
                   tr.correct_response,tr.key_pressed,tr.reaction_time,tr.correct,tr.error_type
                   FROM trial_results tr WHERE tr.assessment_id=ANY(%s) AND tr.block='main'
                   ORDER BY tr.assessment_id,tr.trial_number''',
                (all_trial_aids,),
            ).fetchall()
        trials_sha.update(repr(raw_trials).encode())
        for t in raw_trials:
            aid = t[0]
            trial_tuples_by_id.setdefault(aid, []).append((aid, t[1], t[3], t[7], t[8]))
            if aid in selected_id_set:
                td = {
                    'assessment_id': aid, 'trial_number': t[1], 'block': t[2],
                    'condition': t[3], 'word': t[4], 'ink_color': t[5],
                    'correct_response': t[6], 'key_pressed': t[7],
                    'reaction_time': t[8], 'correct': t[9], 'error_type': t[10],
                }
                trials.append(td)
                trials_by_id.setdefault(aid, []).append(td)
    sources = []
    for project, entries in project_entries:
        pdigest = hashlib.sha256()
        pdigest.update(json.dumps(entries, sort_keys=True, default=str, separators=(',', ':')).encode())
        pdigest.update(b'\n')
        proj_trials = [tt for row in entries if row['test_code'] == 'stroop_go_nogo_ptbr' for tt in trial_tuples_by_id.get(row['assessment_id'], ())]
        if proj_trials:
            pdigest.update(json.dumps(proj_trials, default=str, separators=(',', ':')).encode())
        pdigest.update(b'\n"generic-metrics"\n')
        proj_generic = [gm for row in entries if row['test_code'] != 'stroop_go_nogo_ptbr' for gm in generic_tuples_by_id.get(row['assessment_id'], ())]
        if proj_generic:
            pdigest.update(json.dumps(proj_generic, default=str, separators=(',', ':')).encode())
        sources.append((str(project), pdigest.hexdigest()))
    ids = all_selected_ids
    result = []
    for project in projects:
        result.extend(
            _hydrate(
                connection,
                [row for scope, row in selected if scope == project],
                project,
                metrics_by_id=metrics_by_id,
                trials_by_id=trials_by_id,
            )
        )
    # WEB tem vínculo por avaliação. Legado só ganha identidade central pelo
    # mapa ativo explícito do projeto; pseudônimo sozinho nunca autoriza fusão.
    links = connection.execute('''SELECT a.assessment_id,scope.project_id,
        COALESCE(wa.patient_id,l.patient_id) AS patient_id,wa.evaluator_uuid,
        p.participant_code,p.active,p.created_at,e.evaluator_code,l.link_id
        FROM unnest(%s::uuid[],%s::text[]) AS scope(project_id,assessment_id)
        JOIN assessments a ON a.assessment_id=scope.assessment_id
        LEFT JOIN web_assessments wa ON wa.assessment_id=a.assessment_id AND wa.project_id=scope.project_id
        LEFT JOIN web_project_participants pp ON pp.project_id=scope.project_id AND pp.pseudonym=a.participant_id
        LEFT JOIN web_legacy_entity_links l ON wa.assessment_id IS NULL
            AND l.legacy_participant_uuid=pp.participant_uuid AND l.entity_type='patient' AND l.active
        LEFT JOIN web_patients p ON p.id=COALESCE(wa.patient_id,l.patient_id)
        LEFT JOIN web_evaluators e ON e.id=wa.evaluator_uuid
        ORDER BY scope.project_id,a.assessment_id,l.link_id''',
        ([row['project_id'] for row in result], [row['assessment_id'] for row in result])).fetchall() if ids else []
    by_id = {}
    selected_keys = {(str(row['project_id']), row['assessment_id']) for row in result}
    for link in links:
        key = (str(link['project_id']), link['assessment_id'])
        if key not in selected_keys:
            continue
        if key in by_id:
            # Nem mesmo dois mapas ativos para o mesmo paciente são resolvidos
            # por ordem arbitrária; o operador precisa reconciliar a ambiguidade.
            raise SnapshotConflict
        by_id[key] = dict(link)
    for row in result:
        row['registry'] = by_id.get((str(row['project_id']), row['assessment_id']))
    precomputed_valid = None
    unfiltered_official = (
        not any(k != 'include_null_rt' for k in official_filters)
        and official_filters.get('include_null_rt', True)
    )
    if include_valid and unfiltered_official and assessment_ids is None:
        precomputed_valid = [
            (
                row['project_id'],
                row['assessment_id'],
                row['participant_id'],
                row['registry']['patient_id'] if row['registry'] else None,
            )
            for row in result
        ]
    registry_base = _registry_counts(connection, projects, issuer, subject, precomputed_valid=precomputed_valid)
    op_counts, op_items, op_digest = _operational_sessions(connection, projects, filters)
    operational = {
        'population': 'segregated_non_official_sessions',
        'counts': op_counts,
        'items': op_items,
    }
    result_digest = [
        (
            r['project_id'], r['assessment_id'], r['participant_id'], r['visit'],
            r['test_code'], r['test_version'], r['evaluator_id'], r['started_at'],
            r['summary'], r['registry'],
        )
        for r in result
    ]
    content = hashlib.sha256(
        json.dumps([sources, result_digest, trials_sha.hexdigest(), registry_base, op_digest], default=str, separators=(',', ':')).encode()
    ).hexdigest()
    return True, result, trials, content, sources, registry_base, operational
