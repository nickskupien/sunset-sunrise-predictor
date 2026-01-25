# Check Job Status

## Get all jobs
curl -s http://localhost:3001/jobs | jq

## Get queued jobs (filter by job status)
curl -s "http://localhost:3001/jobs?status=queued&limit=20" | jq

## Get job 1
curl -s http://localhost:3001/jobs/1 | jq

## Get runs for job 1
curl -s http://localhost:3001/jobs/1/runs | jq

---

# Run Jobs

## Job: ping
curl -X POST http://localhost:3001/jobs \
  -H "content-type: application/json" \
  -d '{"type":"ping","key":"ping:test","payload":{"msg":"hi"}}'

## Job: locationUpsert
curl -X POST http://localhost:3001/jobs \
  -H "content-type: application/json" \
  -d '{"type":"location.upsert","key":"location:test","payload":{"lat":43.25512,"lon":-79.87149}}'
