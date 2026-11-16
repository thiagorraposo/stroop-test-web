"""Contexto efêmero limitado; reinício/evicção exige consulta nova (409)."""
from collections import OrderedDict
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
from threading import RLock

from api.auth import PROFESSIONAL_COOKIE, _cookie
from api.errors import APIError

_LOCK = RLock()

def identity(request, actor):
    token = _cookie(request, PROFESSIONAL_COOKIE)
    if not token:
        raise APIError('authentication_required')
    return actor.issuer, actor.subject, hashlib.sha256(token.encode('ascii')).hexdigest()


def remember(request, actor, query_id, **values):
    now = int(datetime.now(timezone.utc).timestamp())
    with _LOCK:
        cache = getattr(request.app.state, 'analysis_contexts', None)
        if cache is None:
            cache = request.app.state.analysis_contexts = OrderedDict()
        for key in list(cache):
            if cache[key]['expires'] <= now:
                del cache[key]
        cache[query_id] = deepcopy({'identity': identity(request, actor), **values})
        cache.move_to_end(query_id)
        while len(cache) > 256:
            cache.popitem(last=False)


def resolve(request, actor, query_id):
    now = int(datetime.now(timezone.utc).timestamp())
    with _LOCK:
        entry = getattr(request.app.state, 'analysis_contexts', {}).get(query_id)
        if not entry or entry['identity'] != identity(request, actor) or entry['expires'] <= now:
            raise APIError('state_conflict')
        return deepcopy(entry)
