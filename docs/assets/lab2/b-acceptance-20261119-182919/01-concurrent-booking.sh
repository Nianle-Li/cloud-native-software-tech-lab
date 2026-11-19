export POD_A="$(kubectl --context kind-venue-lab2 -n venue-booking get pods -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}')"
export POD_B="$(kubectl --context kind-venue-lab2 -n venue-booking get pods -l app.kubernetes.io/component=api -o jsonpath='{.items[1].metadata.name}')"
(
  set -e -o pipefail
  test -n "$POD_A" && test -n "$POD_B" && test "$POD_A" != "$POD_B"
  kubectl --context kind-venue-lab2 -n venue-booking port-forward "pod/$POD_A" 18081:8080 > "$EVIDENCE/pod-a-port-forward.txt" 2>&1 &
  PF_A=$!
  kubectl --context kind-venue-lab2 -n venue-booking port-forward "pod/$POD_B" 18082:8080 > "$EVIDENCE/pod-b-port-forward.txt" 2>&1 &
  PF_B=$!
  trap 'kill "$PF_A" "$PF_B" 2>/dev/null || true' EXIT
  python3 - <<'PY' 2>&1 | tee "$EVIDENCE/concurrent-booking.txt"
import concurrent.futures
import datetime as dt
import http.client
import json
import os
import threading
import time
import uuid
from pathlib import Path
from zoneinfo import ZoneInfo

def call(port, path, body=None):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=30)
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode()
    headers = {} if body is None else {'Content-Type': 'application/json; charset=utf-8'}
    try:
        connection.request('GET' if body is None else 'POST', path, payload, headers)
        response = connection.getresponse()
        return response.status, json.loads(response.read())
    finally:
        connection.close()

instances = []
for port in (18081, 18082):
    for _ in range(40):
        try:
            status, result = call(port, '/api/instance')
            assert status == 200
            instances.append(result['instance_id'])
            break
        except (OSError, AssertionError, ValueError, KeyError):
            time.sleep(0.25)
    else:
        raise RuntimeError(f'API Pod on local port {port} did not become ready')
assert len(set(instances)) == 2, instances

batch = 'lab2-b-conflict-' + uuid.uuid4().hex[:10]
day = (dt.datetime.now(ZoneInfo('Asia/Shanghai')).date() + dt.timedelta(days=30)).isoformat()
status, venue = call(18081, '/api/venues', {
    'name': batch, 'location': 'Lab 2 验收', 'capacity': 10,
    'open_time': '08:00', 'close_time': '22:00'
})
assert status == 201, (status, venue)
print(json.dumps({'batch': batch, 'venue_id': venue['id'], 'date': day}, ensure_ascii=False), flush=True)
booking = {
    'venue_id': venue['id'], 'booked_by': batch, 'purpose': batch,
    'reservation_date': day, 'start_time': '10:00', 'end_time': '11:00',
    'attendee_count': 1
}
gate = threading.Barrier(3)
def create(port):
    gate.wait()
    return call(port, '/api/reservations', booking)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    futures = [pool.submit(create, port) for port in (18081, 18082)]
    gate.wait()
    results = [future.result() for future in futures]
print(json.dumps({'responses': results}, ensure_ascii=False), flush=True)
assert sorted(status for status, _ in results) == [201, 409], results
assert next(body for status, body in results if status == 409)['error']['code'] == 'TIME_CONFLICT'
status, rows = call(18081, '/api/reservations')
assert status == 200
active = [row for row in rows if row['venue_id'] == venue['id'] and
          row['reservation_date'] == day and row['status'] == 'ACTIVE']
assert len(active) == 1, active
summary = {'batch': batch, 'pods': [os.environ['POD_A'], os.environ['POD_B']],
           'instances': instances, 'venue_id': venue['id'], 'date': day,
           'results': results, 'active_reservation_id': active[0]['id']}
Path(os.environ['EVIDENCE'], 'business-ids.json').write_text(
    json.dumps({'venue_id': venue['id'], 'reservation_id': active[0]['id']},
               ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False, indent=2))
PY
)
