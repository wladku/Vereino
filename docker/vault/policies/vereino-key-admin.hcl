# Policy of the operator token (VAULT_ADMIN_TOKEN / VEREINO_KEY_IMPORT_VAULT_TOKEN, #740, DD-K05): import, inspect and
# delete tenant DEKs from a shell run. Held in the password manager only, never stored as a Railway variable.
path "secret/data/tenant_key_*" {
  capabilities = ["create", "read"]
}

path "secret/metadata/tenant_key_*" {
  capabilities = ["read", "delete"]
}

path "secret/metadata/" {
  capabilities = ["list"]
}
