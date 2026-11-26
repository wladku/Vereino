# Vault server configuration of the Vereino key store (#740, DD-K01). One node, Raft storage on the Railway volume.
# The audit device (one JSON line per request to stdout, values HMAC'd) is enabled once at setup with
# `vault audit enable file file_path=stdout` and kept in Raft (docs/ops/key-store.md, step 4).
ui = false

# Raft storage keeps its data in memory-mapped files; HashiCorp recommends disabling mlock with integrated storage.
disable_mlock = true

storage "raft" {
  path    = "/vault/data/raft"
  node_id = "vereino-vault-1"
}

# Private network only (no public domain). Railway's private network is IPv6, so listen on every address.
listener "tcp" {
  address     = "[::]:8200"
  tls_disable = true
}

# api_addr and cluster_addr come from VAULT_API_ADDR and VAULT_CLUSTER_ADDR (docker/vault/Dockerfile).
