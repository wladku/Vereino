# Policy of the app, worker and scheduler token (#740, BR-K2): read and create tenant DEKs, nothing else. The platform
# adapter creates a DEK with check-and-set 0 and reads it; it never updates or deletes one (docs/ops/key-store.md).
path "secret/data/tenant_key_*" {
  capabilities = ["create", "read"]
}
