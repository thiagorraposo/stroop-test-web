"""Agregação descritiva de métricas oficiais, estratificada por proveniência."""
from collections import defaultdict
from datetime import datetime, timedelta
from statistics import fmean

from stroop.domain.stroop import METRIC_DEFINITIONS, expected_outcome


def indicator_catalog():
    return [{'code': code, 'label': label, 'unit': unit, 'source': 'stroop.domain.stroop.calculate_metrics',
             'population': 'complete_assessment', 'aggregation': 'mean_of_assessment_values',
             'missing': 'excluded_from_mean_and_counted', 'denominator': 'assessments_with_value',
             'numerator': 'sum_of_official_assessment_values'} for code, (label, unit) in METRIC_DEFINITIONS.items()]


def descriptive_groups(rows, trials, grouping):
    """Não recalcula métricas sobre T nem combina versões/protocolos/plataformas."""
    dimension = grouping['dimension']
    metric = grouping.get('metric_code') or 'assessments'
    level = grouping['level']
    by_id = {row['assessment_id']: row for row in rows}
    buckets = defaultdict(lambda: {'rows': {}, 'trials': []})
    temporal = dimension == 'date'
    def key(row, trial=None):
        stratum = (row['test_code'], row['test_version'], row['protocol_id'], row['platform'])
        identity = ()
        if level in ('project', 'instrument'):
            identity = (str(row['project_id']),) if level == 'project' else ()
        elif level == 'participant':
            identity = (str(row['project_id']), row['participant_id'], row['visit'])
        elif level in ('assessment', 'trial'):
            identity = (str(row['project_id']), row['assessment_id'])
            if level == 'trial' and trial:
                identity += (trial['trial_number'],)
        if temporal:
            started = row['started_at']
            date = (datetime.fromisoformat(started.replace('Z', '+00:00')) if isinstance(started, str) else started).date()
            bucket = grouping.get('time_bucket', 'day')
            date = date - timedelta(days=date.weekday()) if bucket == 'week' else date.replace(day=1) if bucket == 'month' else date
            value = date.isoformat()
        else:
            value = {'project': str(row['project_id']), 'visit': row['visit'], 'evaluator': row['evaluator_id'] or 'LEGADO_NAO_MAPEADO',
                     'instrument_version': row['test_code'] + '/' + row['test_version']}.get(dimension)
            if trial:
                outcome = expected_outcome({'condition': trial['condition'], 'key_pressed': trial['key_pressed'] or ''})
                value = trial['condition'] if dimension == 'condition' else ('go' if outcome and outcome[0] == 'space' else 'no_go') if dimension == 'go_nogo' else outcome[2] if dimension == 'response_type' and outcome else value
        return (*stratum, *identity, value)
    trial_dimension = dimension in ('condition', 'go_nogo', 'response_type') or level == 'trial'
    if trial_dimension:
        for trial in trials:
            row = by_id[trial['assessment_id']]
            bucket = buckets[key(row, trial)]
            bucket['rows'][row['assessment_id']] = row
            bucket['trials'].append(trial)
    else:
        trial_map = defaultdict(list)
        for trial in trials:
            trial_map[trial['assessment_id']].append(trial)
        for row in rows:
            bucket = buckets[key(row)]
            bucket['rows'][row['assessment_id']] = row
            bucket['trials'].extend(trial_map[row['assessment_id']])
    result = []
    for group_key, bucket in sorted(buckets.items(), key=lambda entry: str(entry[0])):
        selected = list(bucket['rows'].values())
        values = [row.get('official_metrics', {}).get(metric) for row in selected] if metric in METRIC_DEFINITIONS else []
        measured = [value for value in values if value is not None]
        value = len(selected) if metric == 'assessments' else len(bucket['trials']) if metric == 'trials' else fmean(measured) if measured else None
        result.append({'key': list(group_key), 'label': str(group_key[-1]), 'assessments': len(selected), 'trials': len(bucket['trials']),
                       'value': value, 'present': len(measured) if values else len(selected),
                       'missing': len(values) - len(measured), 'unit': METRIC_DEFINITIONS[metric][1] if metric in METRIC_DEFINITIONS else 'count'})
    return {'grouping': grouping, 'timezone': 'UTC', 'week_start': 'monday', 'population': 'complete_assessment_metrics_and_selected_main_trials',
            'compatibility': 'stratified_by_test_version_protocol_platform', 'groups': result, 'indicators': indicator_catalog()}
