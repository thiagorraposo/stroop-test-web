"""Decisão final de exportação serializada com revogação de conta/projeto/sessão."""
from contextlib import contextmanager
import psycopg

from stroop.persistence.auth import PersistenceError
from stroop.persistence.web_sessions import MissingError


@contextmanager
def export_access(database_url, actor, projects, token_hash, *, local):
    try:
        with psycopg.connect(database_url) as connection:
            if local:
                credential = connection.execute('''SELECT c.credential_version FROM web_local_credentials c
                    JOIN web_local_sessions s USING(principal_id) WHERE s.token_sha256=%s
                    AND c.principal_id::text=%s FOR SHARE OF c''', (token_hash, actor.subject)).fetchone()
                if not credential:
                    raise MissingError
            user = connection.execute('SELECT active,role FROM public.web_lock_emitter(%s,%s)',
                                      (actor.issuer, actor.subject)).fetchone()
            if not user or not user[0] or user[1] not in ('consulta', 'importacao', 'administracao'):
                raise MissingError
            if local:
                session = connection.execute('''SELECT 1 FROM web_local_sessions
                    WHERE token_sha256=%s AND credential_version=%s AND revoked_at IS NULL
                    AND absolute_expires_at>clock_timestamp()
                    AND last_activity_at+INTERVAL '30 minutes'>clock_timestamp() FOR SHARE''',
                    (token_hash, credential[0])).fetchone()
            else:
                session = connection.execute('''SELECT 1 FROM web_professional_sessions
                    WHERE token_sha256=%s AND issuer=%s AND subject=%s AND expires_at>clock_timestamp()
                    AND oidc_expires_at>clock_timestamp() FOR SHARE''', (token_hash, actor.issuer, actor.subject)).fetchone()
            if not session:
                raise MissingError
            for project in sorted(projects):
                project_row = connection.execute('SELECT active FROM web_projects WHERE project_id=%s FOR SHARE', (project,)).fetchone()
                member = connection.execute('''SELECT active FROM web_project_members
                    WHERE project_id=%s AND issuer=%s AND subject=%s FOR SHARE''', (project, actor.issuer, actor.subject)).fetchone()
                if not project_row or not project_row[0] or not member or not member[0]:
                    raise MissingError
            yield
    except psycopg.Error as exc:
        raise PersistenceError from exc
