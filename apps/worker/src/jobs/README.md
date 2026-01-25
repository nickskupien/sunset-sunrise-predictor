# Job: ping
curl -X POST http://localhost:3001/jobs \
  -H "content-type: application/json" \
  -d '{"type":"ping","key":"ping:test","payload":{"msg":"hi"}}'

# Job: locationUpsert
curl -X POST http://localhost:3001/jobs \
  -H "content-type: application/json" \
  -d '{"type":"location.upsert","key":"location:test","payload":{"lat":43.25512,"lon":-79.87149}}'
