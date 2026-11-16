"""Preparacao sintetica isolada W15; banco descartavel validado por common."""
import csv
import io
import json
from pathlib import Path
import sys
import tempfile
from uuid import UUID, uuid4

from common import ROOT, ISSUER, PASSWORD, database_url, fixture_user, fixture_session, primary_subject
import psycopg
from api.auth import PROFESSIONAL_COOKIE
from stroop.domain.auth import opaque_user_id
from stroop.application.import_postgres import import_csv


def execute(value):
    database = database_url()
    if value.get('action') == 'revoke':
        with psycopg.connect(database) as connection:
            connection.execute('UPDATE web_project_members SET active=false WHERE project_id=%s AND subject=%s',
                               (UUID(value['project_id']), value['subject']))
        return {}
    if value.get('action') == 'link_patient':
        actor_subject = primary_subject()
        patient_id, participant_uuid = uuid4(), uuid4()
        code = f'PAT-20261116-{patient_id.int % 900000 + 100000}'
        with psycopg.connect(database) as connection:
            connection.execute(
                "INSERT INTO web_patients(id,participant_code,full_name,normalized_name,created_by_issuer,created_by_subject) VALUES (%s,%s,'SYNTHETIC_PATIENT_RESTRICTED','synthetic_patient_restricted',%s,%s)",
                (patient_id, code, ISSUER, actor_subject),
            )
            connection.execute(
                "INSERT INTO web_project_participants(participant_uuid,project_id,pseudonym,patient_id) VALUES (%s,%s,'P_SINTETICO_W15',%s)",
                (participant_uuid, UUID(value['project_id']), patient_id),
            )
            connection.execute(
                "INSERT INTO web_legacy_entity_links(entity_type,legacy_participant_uuid,patient_id,reason_code,linked_by_issuer,linked_by_subject) VALUES ('patient',%s,%s,'SYNTHETIC_E2E_QUERY7',%s,%s)",
                (participant_uuid, patient_id, ISSUER, actor_subject),
            )
        return {'patient_id': str(patient_id), 'participant_code': code}
    if value.get('action') == 'seed_operational':
        actor_subject = primary_subject()
        project_uuid = UUID(value['project_id'])
        session_aborted = uuid4()
        inv_aborted = uuid4()
        participant_uuid, visit_uuid = uuid4(), uuid4()
        unlinked_patient = uuid4()
        unlinked_code = f'PAT-20261116-{unlinked_patient.int % 900000 + 100000}'
        with psycopg.connect(database) as connection:
            connection.execute(
                "INSERT INTO web_patients(id,participant_code,full_name,normalized_name,created_by_issuer,created_by_subject) VALUES (%s,%s,'SYNTHETIC_UNLINKED_PATIENT','synthetic_unlinked_patient',%s,%s)",
                (unlinked_patient, unlinked_code, ISSUER, actor_subject),
            )
            connection.execute(
                "INSERT INTO web_project_participants(participant_uuid,project_id,pseudonym) VALUES (%s,%s,'P_SINTETICO_ABORTADO')",
                (participant_uuid, project_uuid),
            )
            connection.execute(
                "INSERT INTO web_participant_visits(visit_uuid,project_id,participant_uuid,label) VALUES (%s,%s,%s,'V_ABORT')",
                (visit_uuid, project_uuid, participant_uuid),
            )
            connection.execute(
                """INSERT INTO web_invitations(
                       invitation_id,session_id,project_id,code_sha256,participant_id,visit,
                       evaluator_issuer,evaluator_subject,state,created_at,expires_at,redeemed_at,
                       participant_uuid,visit_uuid,test_code,test_version
                   ) VALUES (
                       %s,%s,%s,%s,'P_SINTETICO_ABORTADO','V_ABORT',%s,%s,'redeemed',
                       CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + interval '12 hours',CURRENT_TIMESTAMP,
                       %s,%s,'stroop_go_nogo_ptbr','0.2.2-web.1'
                   )""",
                (inv_aborted, session_aborted, project_uuid, f'{session_aborted.hex}{inv_aborted.hex}', ISSUER, actor_subject, participant_uuid, visit_uuid),
            )
            connection.execute(
                """INSERT INTO web_participant_sessions(
                       session_id,participant_token_sha256,state,activated_at,expires_at,
                       started_at,app_version,abort_reason
                   ) VALUES (
                       %s,%s,'aborted',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + interval '20 minutes',
                       CURRENT_TIMESTAMP,'web-0.1.0','focus_lost'
                   )""",
                (session_aborted, f'{inv_aborted.hex}{session_aborted.hex}'),
            )
        return {'session_id': str(session_aborted)}
    role = value['role']
    if role not in ('consulta', 'importacao', 'administracao'):
        raise ValueError('Perfil sintetico invalido')
    subject = fixture_user(role)
    actor_subject = primary_subject()
    project_id = uuid4()
    label = 'SYNTHETIC_DASH_' + uuid4().hex
    with psycopg.connect(database) as connection:
        connection.execute('''INSERT INTO web_projects(project_id,code,name,created_by_issuer,created_by_subject)
            VALUES(%s,%s,'Pesquisa sintetica W15',%s,%s)''', (project_id, label, ISSUER, actor_subject))
        connection.execute('INSERT INTO web_project_members(project_id,issuer,subject) VALUES(%s,%s,%s)',
                           (project_id, ISSUER, subject))
        connection.execute('INSERT INTO web_legacy_project_links(legacy_project,project_id) VALUES(%s,%s)',
                           (label, project_id))
    fixture = json.loads((ROOT / 'tests/fixtures/web_results_summary.json').read_text())['cases'][1]
    rows = list(csv.DictReader(io.StringIO(fixture['expected_csv'])))
    assessment_id = str(uuid4())
    for row in rows:
        row.update(project=label, assessment_id=assessment_id, participant_id='P_SINTETICO_W15',
                   visit='V_SINTETICA', participant_name='NOME_SINTETICO_RESTRITO', initials='SS')
    with tempfile.TemporaryDirectory(prefix='synthetic-w15-') as directory:
        path = Path(directory) / 'synthetic.csv'
        with path.open('w', newline='') as output:
            writer = csv.DictWriter(output, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
        import_csv(path, database)
    token, _ = fixture_session(subject)
    from api.auth import _csrf_token
    from api.config import APIConfig
    from common import environment
    csrf = _csrf_token(APIConfig.from_env(environment()), token)
    return {'cookie_name': PROFESSIONAL_COOKIE, 'token': token, 'csrf': csrf, 'project_id': str(project_id),
            'subject': subject, 'assessment_id': assessment_id,
            'evaluator_id': opaque_user_id(ISSUER, subject),
            'username': f'synthetic-{UUID(subject).hex}', 'password': PASSWORD}


if __name__ == '__main__':
    try:
        sys.stdout.write(json.dumps(execute(json.loads(sys.stdin.read()))))
    except Exception:
        sys.stderr.write('Preparacao sintetica W15 indisponivel.\n')
        raise SystemExit(1) from None
