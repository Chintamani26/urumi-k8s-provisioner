# System Design & Tradeoffs

## Architecture Decisions

### Control Plane Pattern

The platform uses a **Node.js Express backend** as a control plane that orchestrates Kubernetes deployments via Helm charts.

**Why this approach?**

1. **Simplicity**: Single API layer abstracts Kubernetes complexity from users
2. **Flexibility**: Easy to add features (monitoring, backups, scaling) without changing Helm charts
3. **Portability**: Works with any Kubernetes distribution (k3s, EKS, GKE, AKS)
4. **Developer Experience**: REST API is more intuitive than direct kubectl/helm commands

**Tradeoffs:**

- ✅ **Pros**: Easy to understand, quick to implement, good for MVP
- ❌ **Cons**: Single point of failure, requires state management, additional latency

**Alternative Considered**: Kubernetes Operator Pattern
- More Kubernetes-native
- Better for large-scale, production deployments
- Requires deeper Kubernetes/Go expertise
- Better for GitOps workflows

**Decision**: Control plane pattern chosen for rapid development and ease of use.

---

## Idempotency & Failure Handling

### Idempotency Strategy

All operations are designed to be **idempotent** (safe to retry):

1. **Namespace Creation**: Check existence before creating
2. **Helm Deployments**: Use `helm upgrade --install` (idempotent by design)
3. **Metadata Tracking**: Prevent duplicate deployments
4. **Resource Naming**: Deterministic naming based on store name

**Implementation:**
```javascript
// Idempotent namespace creation
try {
  await execAsync(`kubectl create namespace ${namespace}`);
} catch (error) {
  if (!error.message.includes('AlreadyExists')) {
    throw error;
  }
}

// Idempotent Helm deployment
helm upgrade --install ${releaseName} ${chartPath} ...
// This will:
// - Install if release doesn't exist
// - Upgrade if release exists
// - No-op if values haven't changed
```

### Failure Handling

**Failure States:**
- **Provisioning**: Deployment in progress
- **Ready**: Store is operational
- **Failed**: Deployment failed or store unhealthy

**Recovery Mechanisms:**

1. **Status Polling**: Backend periodically checks Kubernetes for actual status
2. **Manual Recovery**: Failed stores can be deleted and recreated
3. **Partial Cleanup**: Failed deployments leave resources for inspection
4. **Timeout Protection**: Helm commands have 10-minute timeout

**Backend Restart Recovery:**

If the backend restarts mid-provisioning:
- Store metadata is lost (in-memory storage)
- Kubernetes resources remain intact
- Next status check will discover existing stores
- Manual cleanup required for orphaned resources

**Production Improvement**: Use database for persistent metadata storage.

### Cleanup Approach

**Two-Phase Deletion:**

1. **Phase 1**: Uninstall Helm release (removes Helm-managed resources)
2. **Phase 2**: Delete namespace (cascading delete removes all resources)

**Cleanup Flow:**
```bash
# Step 1: Uninstall Helm release
helm uninstall ${releaseName} --namespace ${namespace}
# Removes: Deployments, Services, Ingress, PVCs (if managed by Helm)

# Step 2: Delete namespace
kubectl delete namespace ${namespace} --wait=true --timeout=5m
# Removes: Everything else (PVCs, Secrets, NetworkPolicies, etc.)

# Step 3: Remove from metadata
storeMetadata.delete(storeName)
```

**Safety Features:**
- `--wait` flag ensures operations complete
- Timeout prevents hanging operations
- Cascading delete ensures nothing is left behind

---

## Production Changes

### DNS Configuration

**Local Development:**
- Uses `.local` domains (e.g., `mystore.local`)
- Requires `/etc/hosts` entries or local DNS resolver
- No external DNS needed

**Production:**
- Real domain names (e.g., `store.example.com`)
- DNS A record pointing to VPS/load balancer IP
- Optional: Wildcard DNS (`*.stores.example.com`) for dynamic subdomains

**Implementation:**
```yaml
# values-local.yaml
ingress:
  hosts:
    - host: mystore.local

# values-prod.yaml
ingress:
  hosts:
    - host: store.example.com
```

### Ingress Configuration

**Local:**
- Basic NGINX Ingress
- No TLS/SSL
- Simple annotations

**Production:**
- NGINX Ingress with TLS
- cert-manager for automatic SSL certificates
- SSL redirect enabled
- Rate limiting annotations

**Implementation:**
```yaml
# values-prod.yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/rate-limit: "100"
  tls:
    - secretName: store-tls
      hosts:
        - store.example.com
```

### Storage Classes

**Local (Kind/k3d/Minikube):**
```yaml
persistence:
  storageClassName: "standard"  # Default local storage
```

**Production (k3s):**
```yaml
persistence:
  storageClassName: "local-path"  # k3s default
```

**Production (Cloud):**
```yaml
# AWS
persistence:
  storageClassName: "gp3"  # EBS GP3

# GCP
persistence:
  storageClassName: "pd-ssd"  # Persistent Disk SSD

# Azure
persistence:
  storageClassName: "managed-premium"  # Premium SSD
```

### Secrets Management

**Local:**
- Secrets stored in Kubernetes (auto-generated)
- No external secret management
- Suitable for development

**Production Options:**

1. **External Secrets Operator** (Recommended)
   - Integrates with AWS Secrets Manager, HashiCorp Vault, Google Secret Manager
   - Syncs secrets from external systems
   - Automatic rotation support

2. **Sealed Secrets**
   - Encrypt secrets for Git storage
   - Good for GitOps workflows
   - Secrets decrypted in cluster

3. **Vault Integration**
   - Centralized secret management
   - Dynamic secrets
   - Audit logging

**Example External Secrets:**
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: store-secrets
spec:
  secretStoreRef:
    name: vault-backend
  target:
    name: store-secrets
  data:
    - secretKey: db-password
      remoteRef:
        key: stores/mystore/db-password
```

### Additional Production Considerations

1. **High Availability**
   - Run backend with multiple replicas
   - Use Kubernetes Deployment with 3+ replicas
   - Load balancer in front

2. **Database**
   - Use managed databases (RDS, Cloud SQL, Azure Database)
   - Better performance, backups, and maintenance
   - Connection pooling

3. **Monitoring**
   - Prometheus for metrics
   - Grafana for dashboards
   - AlertManager for alerts

4. **Logging**
   - Centralized logging (ELK stack, Loki)
   - Structured logging (JSON)
   - Log aggregation and search

5. **Backup**
   - Automated database backups
   - Volume snapshots
   - Point-in-time recovery

6. **Scaling**
   - Horizontal Pod Autoscaler for backend
   - Vertical Pod Autoscaler for resource optimization
   - Cluster Autoscaler for node scaling

---

## Security Considerations

### Network Policies

- **Deny-by-default**: All ingress traffic denied except from Ingress Controller
- **Egress allowed**: Pods can make outbound connections
- **Namespace isolation**: Stores cannot communicate with each other

### RBAC

- Backend service account with minimal required permissions
- Role-based access control for different operations
- Audit logging of all API calls

### Non-Root Containers

- All containers run as non-root users
- Security contexts configured
- Read-only root filesystems where possible

### Secrets

- No hardcoded secrets in source code
- Auto-generated secure passwords
- Secrets stored in Kubernetes Secrets (encrypted at rest)

---

## Scalability

### Horizontal Scaling

- Backend can be scaled horizontally (multiple replicas)
- Stateless API design
- Shared state in database (for production)

### Concurrency Controls

- Semaphore-based rate limiting
- Per-user store quotas
- Provisioning timeouts

### Resource Limits

- ResourceQuotas per namespace
- LimitRanges for default requests/limits
- Prevents resource exhaustion

---

## Observability

### Metrics

- Stores created/deleted
- Provisioning success/failure rates
- Provisioning duration
- API request rates

### Events

- Store creation/deletion events
- Provisioning status changes
- Error events with details

### Logging

- Structured JSON logging
- Request/response logging
- Error stack traces
- Audit trail

---

## Upgrade & Rollback Strategy

### Helm Upgrades

Helm tracks release history, enabling easy rollbacks:

```bash
# Upgrade store
helm upgrade mystore ./charts/woocommerce \
  --namespace store-mystore \
  --set image.tag=v2.0.0

# Rollback if needed
helm rollback mystore --namespace store-mystore
```

### Zero-Downtime Upgrades

- Rolling updates for Deployments
- Readiness probes ensure new pods are ready
- Old pods remain until new ones are healthy

### Database Migrations

- WordPress/WooCommerce: Handled by application
- MedusaJS: Database migrations via application
- Backup before major upgrades

---

## Future Improvements

1. **State Persistence**: Database for store metadata
2. **Operator Pattern**: Kubernetes-native controller
3. **GitOps Integration**: ArgoCD/Flux for declarative deployments
4. **Multi-Region**: Support for multiple Kubernetes clusters
5. **Auto-Scaling**: HPA for store workloads
6. **Backup Automation**: Scheduled backups
7. **Monitoring Integration**: Prometheus/Grafana dashboards
8. **Cost Optimization**: Resource right-sizing recommendations
