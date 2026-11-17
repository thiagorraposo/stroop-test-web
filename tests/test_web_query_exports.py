"""EXPORT7: API/PG reais, SELECT restrito e conjuntos comparados, sem dados reais."""
import csv
from dataclasses import replace
import io
import unittest
from uuid import uuid4

import psycopg

from tests.test_web_assessments import WebAssessmentsTests
from stroop.domain.web_multi_export import GRANULARITY_COLUMNS
from stroop.domain.stroop import CANONICAL_COLUMNS


_set_up_class = WebAssessmentsTests.setUpClass.__func__
_set_up = WebAssessmentsTests.setUp
_complete = WebAssessmentsTests.complete
_analysis_body = WebAssessmentsTests.analysis_body


class QueryExportTests(unittest.TestCase):
    # Reusa preparação PG/HTTPS sintética, sem repetir a suite herdada.
    @classmethod
    def setUpClass(cls):
        _set_up_class(cls)

    setUp = _set_up
    complete = _complete
    analysis_body = _analysis_body

    legacy = WebAssessmentsTests.legacy
    link_legacy = WebAssessmentsTests.link_legacy

    def context(self, filters=None):
        response = self.h.consulta.post('/api/v1/analysis/query', json=self.analysis_body(filters))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def body(self, context, granularity='avaliacoes', columns=None):
        return {**{key: context[key] for key in ('query_id', 'query_fingerprint', 'content_fingerprint')},
                'granularity': granularity, 'columns': columns or list(GRANULARITY_COLUMNS[granularity]), 'identification_mode': 'deidentified'}

    def preview(self, body, status=200):
        response = self.h.consulta.post('/api/v1/exports/preview', json=body)
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def download(self, body, preview, status=200):
        response = self.h.consulta.post('/api/v1/exports/download', json={**body, 'export_token': preview['export_token']})
        self.assertEqual(response.status_code, status, response.text)
        return response

    def test_export7_quatro_projecoes_mesmo_conjunto_metricas_completas_e_csv21_oficial(self):
        first, _ = self.complete()
        other, _ = self.complete(no_responses=True)
        context = self.context({'test_code': ['stroop_go_nogo_ptbr'], 'condition': ['congruent'], 'response_type': ['hit']})
        self.assertEqual(context['counts']['assessments'], 1)
        self.assertEqual(context['counts']['trials'], 4)
        for granularity, expected in [('avaliacoes', 1), ('tentativas', 4), ('metricas', 12)]:
            with self.subTest(granularity=granularity):
                body = self.body(context, granularity)
                preview = self.preview(body)
                self.assertEqual(preview['total_rows'], expected)
                self.assertEqual(preview['counts'], context['counts'])
                response = self.download(body, preview)
                rows = list(csv.DictReader(io.StringIO(response.text)))
                self.assertEqual(len(rows), expected)
                self.assertEqual({row['assessment_id'] for row in rows}, {first['assessment_id']})
                self.assertEqual(preview['sample_rows'], rows[:5])
                if granularity == 'metricas':
                    self.assertEqual(next(row['metric_value'] for row in rows if row['metric_code'] == 'total_trials'), '16.0')
        self.preview(self.body(context, 'stroop_21_colunas'), 422)
        # Sem vínculo cadastral não inventa paciente nem exporta todos cadastros.
        self.preview(self.body(context, 'pacientes'), 422)
        complete = self.context({'test_code': ['stroop_go_nogo_ptbr']})
        body = self.body(complete, 'stroop_21_colunas')
        preview = self.preview(body)
        exported = self.download(body, preview)
        parsed = list(csv.DictReader(io.StringIO(exported.text)))
        self.assertEqual(list(parsed[0]), CANONICAL_COLUMNS)
        self.assertEqual(len(parsed), 32)
        for assessment in (first, other):
            single = self.h.consulta.get(self.path + '/' + assessment['assessment_id'] + '/export')
            self.assertEqual(single.status_code, 200, single.text)
            self.assertEqual([row for row in parsed if row['assessment_id'] == assessment['assessment_id']], list(csv.DictReader(io.StringIO(single.text))))

    def test_export7_go_nogo_mantem_tentativas_da_consulta_e_metricas_completas(self):
        receipt, _ = self.complete()
        context = self.context({'test_code': ['stroop_go_nogo_ptbr'], 'go_nogo': ['no_go']})
        self.assertEqual(context['counts']['trials'], 8)
        for granularity, expected in [('tentativas', 8), ('metricas', 12)]:
            with self.subTest(granularity=granularity):
                body = self.body(context, granularity)
                preview = self.preview(body)
                rows = list(csv.DictReader(io.StringIO(self.download(body, preview).text)))
                self.assertEqual(len(rows), expected)
                self.assertEqual(preview['counts'], context['counts'])
                self.assertEqual({row['assessment_id'] for row in rows}, {receipt['assessment_id']})
                if granularity == 'tentativas':
                    self.assertTrue(all(row['correct_response'] == '' for row in rows))
                else:
                    self.assertEqual(next(row['metric_value'] for row in rows if row['metric_code'] == 'total_trials'), '16.0')
        self.preview(self.body(context, 'stroop_21_colunas'), 422)

    def test_data7_agregacao_oficial_separa_proveniencia_e_mantem_nulos(self):
        self.complete()
        self.complete(no_responses=True)
        body = self.analysis_body({'test_code': ['stroop_go_nogo_ptbr']})
        body['grouping'] = {'level': 'project', 'dimension': 'date', 'time_bucket': 'week', 'metric_code': 'response_time'}
        response = self.h.consulta.post('/api/v1/analysis/query', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        groups = response.json()['analytics']['groups']
        self.assertEqual(len(groups), 1)
        self.assertEqual((groups[0]['assessments'], groups[0]['trials'], groups[0]['present'], groups[0]['missing']), (2, 32, 1, 1))
        self.assertAlmostEqual(groups[0]['value'], .51225)
        self.assertEqual(groups[0]['unit'], 'seconds')
        self.assertEqual(len(response.json()['analytics']['indicators']), 12)
        body['grouping'] = {'level': 'instrument', 'dimension': 'condition', 'metric_code': 'omission_errors_percentage'}
        response = self.h.consulta.post('/api/v1/analysis/query', json=body)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual({row['value'] for row in response.json()['analytics']['groups']}, {75.0})
        body['grouping'] = {'level': 'trial', 'dimension': 'go_nogo', 'metric_code': 'accuracy'}
        self.assertEqual(self.h.consulta.post('/api/v1/analysis/query', json=body).status_code, 422)

    def test_export7_colunas_mascaradas_desconhecidas_vazias_e_token_integral(self):
        self.complete()
        context = self.context()
        body = self.body(context, columns=['assessment_id'])
        preview = self.preview(body)
        self.assertEqual(set(preview['sample_rows'][0]), {'assessment_id'})
        for changes in ({'columns': []}, {'columns': ['assessment_id'] * 2}, {'columns': ['full_name']},
                        {'filters': {'unknown': 1}}, {'identification_mode': 'nominal'}):
            self.preview({**body, **changes}, 403 if changes.get('identification_mode') else 422)
        self.download({**body, 'columns': ['visit']}, preview, 422)
        self.download(body, {**preview, 'export_token': preview['export_token'][:-2] + 'XX'}, 422)
        self.preview({'project_id': str(self.h.project_id), 'granularity': 'avaliacoes', 'filters': {'visit': ['NEVER']}}, 422)

    def test_export7_mutacao_sem_alterar_ids_ou_total_e_revogacao_nao_liberam_bytes(self):
        receipt, _ = self.complete()
        context = self.context()
        body = self.body(context)
        preview = self.preview(body)
        with psycopg.connect(self.database_url) as connection:
            connection.execute("UPDATE trial_results SET word='SYNTHETIC_MUTATION' WHERE assessment_id=%s AND trial_number=1", (receipt['assessment_id'],))
        self.download(body, preview, 409)
        with psycopg.connect(self.database_url) as connection:
            connection.execute('UPDATE web_project_members SET active=false WHERE project_id=%s', (self.h.project_id,))
        self.download(body, preview, 404)

    def test_export7_contexto_perdido_expirado_e_reader_ausente_falham_fechados(self):
        self.complete()
        context = self.context()
        body = self.body(context)
        self.h.app.state.config = replace(self.h.app.state.config, read_database_url='')
        self.preview(body, 503)
        self.h.app.state.config = replace(self.h.app.state.config, read_database_url=self.read_url)
        self.h.app.state.analysis_contexts[context['query_id']]['expires'] = 0
        self.preview(body, 409)
        self.h.app.state.analysis_contexts.clear()
        self.preview(body, 409)

    def test_export7_paciente_vinculado_somente_ao_recorte_e_sem_ler_nominal(self):
        receipt, _ = self.complete()
        with psycopg.connect(self.database_url) as connection:
            actor = connection.execute('SELECT issuer,subject FROM app_users LIMIT 1').fetchone()
            selected = uuid4()
            for patient_id, code, name in ((selected, 'PAT-20261115-000001', 'SYNTHETIC_A'), (uuid4(), 'PAT-20261115-000002', 'SYNTHETIC_UNLINKED')):
                connection.execute("INSERT INTO web_patients(id,participant_code,full_name,normalized_name,created_by_issuer,created_by_subject) VALUES (%s,%s,%s,%s,%s,%s)", (patient_id, code, name, name.lower(), *actor))
            connection.execute('UPDATE web_assessments SET patient_id=%s WHERE assessment_id=%s', (selected, receipt['assessment_id']))
        context = self.context()
        body = self.body(context, 'pacientes')
        preview = self.preview(body)
        rows = list(csv.DictReader(io.StringIO(self.download(body, preview).text)))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['patient_id'], str(selected))
        self.assertNotIn('SYNTHETIC_A', str(preview))
        self.assertEqual(rows[0]['participant_name'], '')
        with psycopg.connect(self.read_url) as connection:
            with self.assertRaises(psycopg.errors.InsufficientPrivilege):
                connection.execute('SELECT full_name FROM web_patients')

    def test_export7_legado_so_exporta_paciente_com_mapa_explicito_ativo_do_projeto(self):
        assessment_id = self.legacy()
        self.link_legacy()
        with psycopg.connect(self.database_url) as connection:
            pseudonym = connection.execute('SELECT participant_id FROM assessments WHERE assessment_id=%s', (assessment_id,)).fetchone()[0]
            actor = connection.execute('SELECT issuer,subject FROM app_users LIMIT 1').fetchone()
            patient, participant = uuid4(), uuid4()
            connection.execute("INSERT INTO web_patients(id,participant_code,full_name,normalized_name,created_by_issuer,created_by_subject) VALUES (%s,'PAT-20261115-000001','SYNTHETIC_LEGACY','synthetic_legacy',%s,%s)", (patient, *actor))
            # Mesmo patient_id no participante não basta sem o mapa auditado ativo.
            connection.execute('INSERT INTO web_project_participants(participant_uuid,project_id,pseudonym,patient_id) VALUES (%s,%s,%s,%s)', (participant, self.h.project_id, pseudonym, patient))
        context = self.context()
        self.preview(self.body(context, 'pacientes'), 422)
        linked = self.h.admin.post('/api/v1/admin/legacy-links', json={
            'entity_type': 'patient', 'legacy_participant_uuid': str(participant),
            'patient_id': str(patient), 'reason_code': 'SYNTHETIC_EXPORT7'})
        self.assertEqual(linked.status_code, 201, linked.text)
        context = self.context()
        body = self.body(context, 'pacientes')
        preview = self.preview(body)
        rows = list(csv.DictReader(io.StringIO(self.download(body, preview).text)))
        self.assertEqual([row['patient_id'] for row in rows], [str(patient)])
        self.assertNotIn('SYNTHETIC_LEGACY', str(preview))
        with psycopg.connect(self.database_url) as connection:
            duplicate = uuid4()
            connection.execute("INSERT INTO web_legacy_entity_links(link_id,entity_type,legacy_participant_uuid,patient_id,reason_code,linked_by_issuer,linked_by_subject) VALUES (%s,'patient',%s,%s,'SYNTHETIC_AMBIGUOUS',%s,%s)", (duplicate, participant, patient, *actor))
        self.download(body, preview, 409)
        self.assertEqual(self.h.consulta.post('/api/v1/analysis/query', json=self.analysis_body()).status_code, 409)
        with psycopg.connect(self.database_url) as connection:
            connection.execute('UPDATE web_legacy_entity_links SET active=false WHERE link_id=%s', (duplicate,))
        unlinked = self.h.admin.post('/api/v1/admin/legacy-links/' + linked.json()['link_id'] + '/deactivate', json={'reason_code': 'SYNTHETIC_REVOKED'})
        self.assertEqual(unlinked.status_code, 200, unlinked.text)
        self.download(body, preview, 409)
        self.preview(self.body(self.context(), 'pacientes'), 422)

    def test_export7_mapa_legado_de_outro_projeto_nao_autoriza_identidade(self):
        assessment_id = self.legacy()
        self.link_legacy()
        with psycopg.connect(self.database_url) as connection:
            pseudonym = connection.execute('SELECT participant_id FROM assessments WHERE assessment_id=%s', (assessment_id,)).fetchone()[0]
            actor = connection.execute('SELECT issuer,subject FROM app_users LIMIT 1').fetchone()
            patient, participant, other_project = uuid4(), uuid4(), uuid4()
            connection.execute("INSERT INTO web_projects(project_id,code,name,created_by_issuer,created_by_subject) VALUES (%s,'SYNTHETIC_OTHER','Sintético',%s,%s)", (other_project, *actor))
            connection.execute("INSERT INTO web_patients(id,participant_code,full_name,normalized_name,created_by_issuer,created_by_subject) VALUES (%s,'PAT-20261115-000001','SYNTHETIC_OTHER','synthetic_other',%s,%s)", (patient, *actor))
            connection.execute('INSERT INTO web_project_participants(participant_uuid,project_id,pseudonym) VALUES (%s,%s,%s)', (participant, other_project, pseudonym))
            connection.execute("INSERT INTO web_legacy_entity_links(entity_type,legacy_participant_uuid,patient_id,reason_code,linked_by_issuer,linked_by_subject) VALUES ('patient',%s,%s,'SYNTHETIC_OTHER',%s,%s)", (participant, patient, *actor))
        self.preview(self.body(self.context(), 'pacientes'), 422)

    def test_export7_csv_injection_roundtrip_csv21_sqlite_e_revogacao_sessao_com_auditoria(self):
        from pathlib import Path
        import tempfile
        from stroop.application.import_sqlite import import_csv
        from stroop.domain.web_multi_export import serialize_multi_csv
        from stroop.ingestion.instruments import load_instrument_csv

        # 1. Neutralização de fórmula sem corromper números/ausências
        dangerous = serialize_multi_csv(
            [{'assessment_id': '=CMD()', 'project_code': '+1', 'participant_code': '-2',
              'visit': '@SUM(A1)', 'trial_number': 1, 'block': 'main',
              'word': '\tTAB\r\n"quoted";', 'ink_color': '\u202eVERDE', 'condition': 'congruent',
              'correct_response': 'space', 'key_pressed': 'space', 'correct': True,
              'error_type': 'hit', 'reaction_time_seconds': 0.512}],
            granularity='tentativas',
            columns=['assessment_id', 'project_code', 'participant_code', 'visit', 'word', 'ink_color', 'reaction_time_seconds'],
        )
        parsed_inj = list(csv.DictReader(io.StringIO(dangerous)))
        self.assertEqual(parsed_inj[0]['assessment_id'], "'=CMD()")
        self.assertEqual(parsed_inj[0]['project_code'], "'+1")
        self.assertEqual(parsed_inj[0]['participant_code'], "'-2")
        self.assertEqual(parsed_inj[0]['visit'], "'@SUM(A1)")
        self.assertTrue(parsed_inj[0]['word'].startswith("'\tTAB"))
        self.assertEqual(parsed_inj[0]['reaction_time_seconds'], '0.512')

        # 2. Roundtrip CSV21 oficial via /api/v1/exports/download + loader/SQLite + auditoria sanitizada
        receipt, _ = self.complete()
        context = self.context({'test_code': ['stroop_go_nogo_ptbr']})
        body = self.body(context, 'stroop_21_colunas')
        with self.assertLogs('stroop.api', level='INFO') as logs:
            preview = self.preview(body)
            csv_response = self.download(body, preview)
        self.assertEqual(len(logs.output), 2)
        self.assertIn('export_audit action=preview outcome=success', logs.output[0])
        self.assertIn('export_audit action=download outcome=success', logs.output[1])
        self.assertNotIn(preview['export_token'], '\n'.join(logs.output))

        with tempfile.TemporaryDirectory(prefix='stroop-export7-') as tmp:
            csv_path = Path(tmp) / 'export21.csv'
            csv_path.write_text(csv_response.text, encoding='utf-8')
            normalized = load_instrument_csv(csv_path)
            self.assertEqual(normalized.metadata['assessment_id'], receipt['assessment_id'])
            self.assertEqual(len(normalized.trial_values), 16)
            sqlite_path = Path(tmp) / 'roundtrip.sqlite'
            import_csv(csv_path, sqlite_path)

        # 3. Revogação da conta/sessão entre prévia e download nega antes de qualquer byte
        preview_before_revoke = self.preview(body)
        with psycopg.connect(self.database_url) as connection:
            connection.execute("UPDATE app_users SET active=false WHERE role='consulta'")
        self.download(body, preview_before_revoke, 403)


del WebAssessmentsTests
