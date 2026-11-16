"""Contrato estrito da borda analítica, sem fontes operacionais."""
import unittest
from uuid import uuid4

from pydantic import ValidationError

from api.analysis import AnalysisRequest, QuerySelection, normalize
from api.errors import APIError


class AnalysisSchemaTests(unittest.TestCase):
    def test_go_nogo_exige_instrumento_e_normaliza_conjunto_sem_aceitar_outros_tipos(self):
        project = str(uuid4())
        for instruments in ([], ['other'], ['stroop_go_nogo_ptbr', 'other']):
            with self.subTest(instruments=instruments), self.assertRaises(APIError):
                normalize(QuerySelection.model_validate({'projects': [project], 'filters': {
                    'test_code': instruments, 'go_nogo': ['go']}}))
        for value in (['GO'], ['no-go'], 'go', [True], ['go'] * 3):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                QuerySelection.model_validate({'projects': [project], 'filters': {'go_nogo': value}})
        query, filters = normalize(QuerySelection.model_validate({'projects': [project], 'filters': {
            'test_code': ['stroop_go_nogo_ptbr'], 'go_nogo': ['no_go', 'go']}}))
        self.assertEqual(query['filters']['go_nogo'], ['go', 'no_go'])
        self.assertEqual(filters['go_nogo'], ['go', 'no_go'])
        empty, _ = normalize(QuerySelection.model_validate({'projects': [project], 'filters': {'go_nogo': []}}))
        self.assertNotIn('go_nogo', empty['filters'])

    def test_aliases_equivalentes_e_limites_sem_coercao(self):
        project = str(uuid4())
        first, filters = normalize(QuerySelection.model_validate({'projects': [project], 'filters': {
            'start_date': '2026-11-11', 'participant_id': ['B', 'A', 'A'], 'platform': ['psychopy']}}))
        second, _ = normalize(QuerySelection.model_validate({'projects': [project], 'filters': {
            'date_from': '2026-11-11', 'participant_code': ['A', 'B'], 'platform': ['psychopy_local']}}))
        self.assertEqual(first, second)
        self.assertEqual(filters, {'start_date': '2026-11-11', 'participant_id': ['A', 'B'], 'platform': ['psychopy']})
        for query in ({'projects': [project, project], 'filters': {}},
                      {'projects': [project], 'filters': {'date_from': ''}},
                      {'projects': [project], 'filters': {'date_from': '2026-02-30'}},
                      {'projects': [project], 'filters': {'participant_id': ['A'], 'participant_code': ['B']}}):
            with self.subTest(query=query), self.assertRaises(APIError):
                normalize(QuerySelection.model_validate(query))
        base = {'query': {'projects': [project], 'filters': {}},
                'grouping': {'level': 'assessment', 'dimension': 'project'}, 'page': {}}
        for page in ({'size': True}, {'size': '10'}, {'size': 101}, {'size': 0}, {'cursor': ''}, {'sort': 'unknown'}):
            with self.subTest(page=page), self.assertRaises(ValidationError):
                AnalysisRequest.model_validate({**base, 'page': page})
        for filters in ({'patient_id': 'SYNTHETIC'}, {'patient_id': ['SYNTHETIC']},
                        {'patient_id': ['PAT-20261116-000001']}, {'accuracy_min': True}, {'status': 'unknown'},
                        {'status': []}, {'status': ['valid'] * 6},
                        {'rt_mean_min_ms': 0}, {'rt_mean_max_ms': 1000},
                        {'include_null_rt': 'false'}, {'platform': ['legacy']}, {'visit': ['A'] * 101}):
            with self.subTest(filters=filters), self.assertRaises(ValidationError):
                AnalysisRequest.model_validate({**base, 'query': {'projects': [project], 'filters': filters}})
        for status_input, expected_norm, expected_list in (
                ('valid', 'valid', None),
                (['valid'], 'valid', None),
                ('invalidated', 'invalidated', ['invalidated']),
                (['aborted', 'invalidated', 'aborted'], ['aborted', 'invalidated'], ['aborted', 'invalidated']),
                (['valid', 'expired', 'in_progress'], ['expired', 'in_progress', 'valid'], ['expired', 'in_progress', 'valid'])):
            norm_q, norm_f = normalize(QuerySelection.model_validate({'projects': [project], 'filters': {'status': status_input}}))
            self.assertEqual(norm_q['filters']['status'], expected_norm)
            self.assertEqual(norm_f.get('status'), expected_list)
        for bad_op in (
                {'status': 'aborted', 'test_code': ['stroop_go_nogo_ptbr'], 'accuracy_min': 50},
                {'status': 'invalidated', 'test_code': ['stroop_go_nogo_ptbr'], 'condition': ['congruent']},
                {'status': ['expired', 'in_progress'], 'test_code': ['stroop_go_nogo_ptbr'], 'go_nogo': ['go']}):
            with self.subTest(bad_op=bad_op), self.assertRaises(APIError):
                normalize(QuerySelection.model_validate({'projects': [project], 'filters': bad_op}))
        pid_a, pid_b, ev_uuid = str(uuid4()), str(uuid4()), str(uuid4())
        upper_query, upper_filters = normalize(QuerySelection.model_validate({'projects': [project], 'filters': {
            'patient_id': [pid_b.upper(), pid_a, pid_a], 'evaluator_id': [ev_uuid.upper(), 'EVA-000001']}}))
        lower_query, _ = normalize(QuerySelection.model_validate({'projects': [project], 'filters': {
            'patient_id': [pid_a, pid_b], 'evaluator_id': [ev_uuid, 'EVA-000001']}}))
        self.assertEqual(upper_query, lower_query)
        self.assertEqual(upper_filters['patient_id'], sorted([pid_a, pid_b]))
        self.assertEqual(upper_filters['evaluator_id'], sorted([ev_uuid, 'EVA-000001']))
        for grouping in ({'level': 'unknown', 'dimension': 'condition'},
                         {'level': 'assessment', 'dimension': 'project', 'metric_code': 'unknown'}):
            with self.subTest(grouping=grouping), self.assertRaises(ValidationError):
                AnalysisRequest.model_validate({**base, 'grouping': grouping})

    def test_metricas_exigem_capacidade_faixas_finitas_e_busca_apenas_codigo(self):
        project = str(uuid4())
        for filters in ({'accuracy_min': 50}, {'include_null_rt': False},
                        {'go_accuracy_min': 20}, {'no_go_accuracy_max': 80}, {'has_commission_errors': False},
                        {'test_code': ['stroop_go_nogo_ptbr'], 'accuracy_min': 80, 'accuracy_max': 50},
                        {'patient_search': 'CODIGO\x00'}):
            with self.subTest(filters=filters), self.assertRaises(APIError):
                normalize(QuerySelection.model_validate({'projects': [project], 'filters': filters}))
        query, filters = normalize(QuerySelection.model_validate({'projects': [project], 'filters': {
            'test_code': ['stroop_go_nogo_ptbr'], 'patient_search': '  SYNTH  ', 'accuracy_min': 50,
            'rt_median_max_ms': 1000, 'include_null_rt': False}}))
        self.assertEqual(query['filters']['patient_search'], 'synth')
        self.assertEqual(filters['patient_search'], 'synth')
        for value in (float('nan'), float('inf'), '50', True):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                QuerySelection.model_validate({'projects': [project], 'filters': {'accuracy_min': value}})

    def test_precisao_por_tipo_e_presenca_de_erros_estritas(self):
        project = str(uuid4())
        base = {'test_code': ['stroop_go_nogo_ptbr']}
        for field in ('go_accuracy_min', 'go_accuracy_max', 'no_go_accuracy_min', 'no_go_accuracy_max'):
            for value in (-1, 101, True, '50', float('nan'), float('inf')):
                with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                    QuerySelection.model_validate({'projects': [project], 'filters': {**base, field: value}})
        for prefix in ('go_accuracy', 'no_go_accuracy'):
            with self.subTest(prefix=prefix), self.assertRaises(APIError):
                normalize(QuerySelection.model_validate({'projects': [project], 'filters': {
                    **base, f'{prefix}_min': 80, f'{prefix}_max': 80}}))
        for field in ('has_commission_errors', 'has_omission_errors'):
            for value in ('false', 0, 1):
                with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                    QuerySelection.model_validate({'projects': [project], 'filters': {**base, field: value}})
        query, filters = normalize(QuerySelection.model_validate({'projects': [project], 'filters': {
            **base, 'has_commission_errors': False, 'has_omission_errors': True, 'go_accuracy_min': 0}}))
        self.assertIs(query['filters']['has_commission_errors'], False)
        self.assertIs(query['filters']['has_omission_errors'], True)
        self.assertEqual(query['filters']['go_accuracy_min'], 0)
        self.assertNotIn('has_commission_errors', filters)
