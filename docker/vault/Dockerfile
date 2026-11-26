# Key store of the tenants' data-encryption keys (#740, `.ai/specs/2026-11-26-vereino-key-store-and-key-inventory.md`,
# DD-K01, DD-K09). One HashiCorp Vault node with integrated (Raft) storage on a Railway volume mounted at /vault/data,
# reachable only on the Railway private network. The entry script unseals it after every restart from two of the
# three Shamir shares (VAULT_UNSEAL_KEY_1, VAULT_UNSEAL_KEY_2: sealed variables of this service only). Setup, policies,
# tokens, rotation and monitoring: docs/ops/key-store.md. Base image pinned by digest (S14.2); bump tag and digest
# together.
FROM hashicorp/vault:1.21@sha256:4e33b126a59c0c333b76fb4e894722462659a6bec7c48c9ee8cea56fccfd2569

COPY docker/vault/vault.hcl /vault/config/vault.hcl
# Policies for the setup shell (docs/ops/key-store.md); outside /vault/config, which the server loads as config.
COPY docker/vault/policies/ /vault/policies/
COPY docker/vault/vereino-vault-entry.sh /usr/local/bin/vereino-vault-entry.sh
RUN chmod 0755 /usr/local/bin/vereino-vault-entry.sh

# The listener has no TLS (Railway's private network is WireGuard-encrypted, D-039); the CLI inside the container talks
# to the local listener. VAULT_API_ADDR is overridden per environment with the service's private domain.
# SKIP_SETCAP: mlock is disabled for Raft storage (vault.hcl), so the image need not grant IPC_LOCK.
ENV VAULT_ADDR=http://127.0.0.1:8200 \
    SKIP_SETCAP=1 \
    VAULT_API_ADDR=http://vault.railway.internal:8200 \
    VAULT_CLUSTER_ADDR=http://127.0.0.1:8201

EXPOSE 8200
ENTRYPOINT ["/usr/local/bin/vereino-vault-entry.sh"]
