"""Exportações vinculadas à consulta aplicada; sem fallback para consultas irrestritas."""
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import Response
from pydantic import Field

from api.analysis_context import identity, resolve
from api.assessments import _signed, _verified
from api.errors import APIError
from api.models import RequestModel
from api.sessions import _professional_write, _reject_query
from stroop.application.web_query_exports import prepare_export, UnsupportedProjection
from stroop.domain.web_multi_export import GRANULARITY_COLUMNS, validate_granularity_and_columns
from stroop.persistence.web_assessments import PersistenceError, SchemaError, SnapshotConflict, FacetLimitError
from stroop.persistence.web_export_access import export_access
from stroop.persistence.web_sessions import MissingError

router = APIRouter(prefix='/api/v1/exports', tags=['exports'])


class ExportPreviewRequest(RequestModel):
    query_id: str = Field(pattern=r'^[a-f0-9-]{36}$')
    query_fingerprint: str = Field(pattern=r'^[a-f0-9]{64}$')
    content_fingerprint: str = Field(pattern=r'^[a-f0-9]{64}$')
    granularity: Literal['pacientes', 'avaliacoes', 'tentativas', 'metricas', 'stroop_21_colunas']
    columns: list[str] = Field(min_length=1, max_length=32)
    identification_mode: Literal['deidentified', 'nominal'] = 'deidentified'


class ExportDownloadRequest(ExportPreviewRequest):
    export_token: str = Field(min_length=1, max_length=8192, pattern=r'^[A-Za-z0-9_-]+$')


def _selection(request, actor, body):
    if body.identification_mode == 'nominal':
        # Nenhuma habilitação institucional implementada em WEB-041/DEC-03.
        raise APIError('permission_denied')
    try:
        granularity, columns = validate_granularity_and_columns(body.granularity, body.columns)
    except ValueError:
        raise APIError('invalid_request') from None
    if granularity == 'stroop_21_colunas' and body.columns != list(GRANULARITY_COLUMNS[granularity]):
        raise APIError('invalid_request')
    context = resolve(request, actor, body.query_id)
    if context['fingerprint'] != body.query_fingerprint or context['content'] != body.content_fingerprint:
        raise APIError('state_conflict')
    claims = [body.query_id, *identity(request, actor), context['query']['projects'], context['fingerprint'],
              context['content'], granularity, columns, body.identification_mode, 'csv-v2.1', context['expires']]
    return context, columns, claims


def _prepare(request, actor, body, context, columns):
    return prepare_export(request.app.state.config.read_database_url, actor, query=context['query'],
                          filters=context['filters'], snapshot=context['content'], granularity=body.granularity, columns=columns)


def _errors(cause):
    if isinstance(cause, MissingError):
        return APIError('not_found')
    if isinstance(cause, SnapshotConflict):
        return APIError('state_conflict')
    if isinstance(cause, (UnsupportedProjection, FacetLimitError, ValueError, TypeError, KeyError)):
        return APIError('invalid_request')
    return APIError('service_unavailable')


@router.post('/preview')
async def preview_export(request: Request, body: ExportPreviewRequest):
    _reject_query(request)
    actor = _professional_write(request, 'export_dashboard')
    context, columns, claims = _selection(request, actor, body)
    config = request.app.state.config
    try:
        with export_access(config.database_url, actor, context['query']['projects'], identity(request, actor)[2], local=config.auth_mode == 'local'):
            rows, _, _ = _prepare(request, actor, body, context, columns)
    except (MissingError, SnapshotConflict, UnsupportedProjection, FacetLimitError, PersistenceError, SchemaError, ValueError, TypeError, KeyError) as cause:
        raise _errors(cause) from None
    return {'total_rows': len(rows), 'counts': context['counts'], 'columns': columns,
            'applied_criteria': {'query': context['query'], 'query_fingerprint': context['fingerprint'],
                                 'content_fingerprint': context['content'], 'granularity': body.granularity,
                                 'identification_mode': body.identification_mode},
            'sample_rows': rows[:5], 'export_token': _signed(config, 'export-token-v2', claims),
            'expires_at': datetime.fromtimestamp(context['expires'], timezone.utc).isoformat().replace('+00:00', 'Z')}


@router.post('/download')
async def download_export(request: Request, body: ExportDownloadRequest):
    _reject_query(request)
    actor = _professional_write(request, 'export_dashboard')
    context, columns, claims = _selection(request, actor, body)
    config = request.app.state.config
    if _verified(config, 'export-token-v2', body.export_token) != claims:
        raise APIError('invalid_request')
    try:
        with export_access(config.database_url, actor, context['query']['projects'], identity(request, actor)[2], local=config.auth_mode == 'local'):
            _, content, _ = _prepare(request, actor, body, context, columns)
            if context['expires'] <= int(datetime.now(timezone.utc).timestamp()):
                raise SnapshotConflict
            response = Response(content=content.encode('utf-8'), media_type='text/csv; charset=utf-8',
                headers={'Content-Disposition': f'attachment; filename="stroop-test-web_{body.granularity}_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}_{uuid4().hex[:8]}.csv"',
                         'Cache-Control': 'no-store'})
    except (MissingError, SnapshotConflict, UnsupportedProjection, FacetLimitError, PersistenceError, SchemaError, ValueError, TypeError, KeyError) as cause:
        raise _errors(cause) from None
    return response
