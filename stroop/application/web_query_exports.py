"""Projeções desidentificadas da mesma população A/T da consulta aplicada."""
import csv
import io

from stroop.application.web_assessments import analysis_dataset
from stroop.domain.web_export import serialize_assessment_csv
from stroop.domain.web_multi_export import format_csv_cell
from stroop.persistence import web_assessments as persistence


class UnsupportedProjection(ValueError):
    """Projeção incompleta ou incompatível com o recorte."""


def project_rows(rows, trials, granularity, columns, criteria):
    """Não lê nominal. CSV21 usa o exportador oficial sem reimplementar fórmulas."""
    by_id = {row['assessment_id']: row for row in rows}
    if granularity == 'stroop_21_colunas':
        if criteria.get('condition') or criteria.get('response_type') or criteria.get('go_nogo') or any(row['test_code'] != 'stroop_go_nogo_ptbr' for row in rows):
            raise UnsupportedProjection
    result = []
    if granularity == 'pacientes':
        seen = set()
        for row in rows:
            link = row['registry']
            if not link or not link['patient_id']:
                raise UnsupportedProjection
            if link['patient_id'] in seen:
                continue
            seen.add(link['patient_id'])
            result.append({'patient_id': str(link['patient_id']), 'participant_code': link['participant_code'],
                           'active': link['active'], 'created_at': persistence.iso_utc(link['created_at'])})
    elif granularity == 'avaliacoes':
        for row in rows:
            result.append({**row, 'project_id': str(row['project_id']), 'participant_code': row['participant_id'],
                           'evaluator_code': row['evaluator_id'], 'started_at': persistence.iso_utc(row['started_at']),
                           'completed_at': persistence.iso_utc(row['completed_at'])})
    elif granularity == 'tentativas':
        for trial in trials:
            row = by_id[trial['assessment_id']]
            canonical = persistence._canonical_trial(trial) if row['test_code'] == 'stroop_go_nogo_ptbr' else trial
            result.append({**trial, **canonical, 'project_code': row['project_code'], 'participant_code': row['participant_id'],
                           'visit': row['visit'], 'reaction_time_seconds': trial['reaction_time']})
    elif granularity == 'metricas':
        grouped = {}
        for trial in trials:
            grouped.setdefault(trial['assessment_id'], []).append(trial)
        for row in rows:
            if row['test_code'] != 'stroop_go_nogo_ptbr':
                raise UnsupportedProjection
            for metric in persistence._recalculate(grouped.get(row['assessment_id'], [])):
                value = metric['metric_value']
                if metric['metric_code'] == 'response_time' and not row['summary']['hits']:
                    value = None
                if metric['metric_code'] in ('accuracy_go_trials', 'omission_errors_percentage') and not row['summary']['total_go_trials']:
                    value = None
                if metric['metric_code'] == 'accuracy_no_go_trials' and not row['summary']['total_no_go_trials']:
                    value = None
                result.append({**metric, 'metric_value': value, 'assessment_id': row['assessment_id'],
                               'project_code': row['project_code'], 'participant_code': row['participant_id'], 'visit': row['visit']})
    else:
        for row in rows:
            source = [trial for trial in trials if trial['assessment_id'] == row['assessment_id']]
            metadata = {'project': row['project_code'], 'participant_id': row['participant_id'], 'visit': row['visit'],
                        'evaluator': row['evaluator_id'] or 'LEGADO_NAO_MAPEADO', 'assessment_id': row['assessment_id'],
                        'assessment_date': row['assessment_date'], 'started_at': persistence.iso_utc(row['started_at']),
                        'test_code': row['test_code'], 'test_version': row['test_version']}
            result.extend(csv.DictReader(io.StringIO(serialize_assessment_csv(metadata, source))))
    # A mesma projeção/neutralização serve à amostra e ao arquivo.
    return [{key: format_csv_cell(row.get(key), column=key, identification_mode='deidentified') for key in columns} for row in result]


def prepare_export(database_url, actor, *, query, filters, snapshot, granularity, columns):
    try:
        with persistence._connect(database_url) as connection:
            rows, trials, content, _ = analysis_dataset(database_url, actor, query=query, filters=filters,
                                                       snapshot=snapshot, connection=connection)
            # Métricas são da avaliação completa mesmo quando T é subconjunto.
            if granularity == 'metricas':
                ids = [row['assessment_id'] for row in rows]
                trials = connection.execute("SELECT * FROM (SELECT assessment_id,block,trial_number,condition,key_pressed,reaction_time FROM trial_results WHERE assessment_id=ANY(%s) AND block='main') t ORDER BY assessment_id,trial_number", (ids,)).fetchall() if ids else []
            projected = project_rows(rows, trials, granularity, columns, query['filters'])
            # Valores já escapados: csv.writer não aplica escape de fórmula novamente.
            output = io.StringIO(newline='')
            writer = csv.writer(output, lineterminator='\r\n')
            writer.writerow(columns)
            writer.writerows([row[key] for key in columns] for row in projected)
            return projected, output.getvalue(), content
    except persistence.psycopg.Error as exc:
        raise persistence.PersistenceError from exc
