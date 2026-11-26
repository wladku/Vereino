# Policy of the backup job's token (#740, DD-K10): take Raft snapshots only.
path "sys/storage/raft/snapshot" {
  capabilities = ["read"]
}
