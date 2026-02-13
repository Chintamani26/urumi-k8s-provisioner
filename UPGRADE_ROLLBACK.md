# Upgrade & Rollback Guide

## Helm Upgrade & Rollback Strategy

Helm tracks release history, enabling safe upgrades and easy rollbacks.

## Upgrading a Store

### Upgrade Store Image Version

```bash
# Upgrade WooCommerce store to new WordPress version
helm upgrade mystore ./charts/woocommerce \
  --namespace store-mystore \
  --set image.tag=6.4 \
  --reuse-values

# Upgrade MedusaJS store
helm upgrade medusastore ./charts/medusa \
  --namespace store-medusastore \
  --set image.tag=v1.19.0 \
  --reuse-values
```

### Upgrade with New Values

```bash
# Upgrade with new resource limits
helm upgrade mystore ./charts/woocommerce \
  --namespace store-mystore \
  -f charts/woocommerce/values-prod.yaml \
  --set resources.limits.memory=1Gi \
  --set resources.requests.memory=512Mi
```

### Zero-Downtime Upgrades

Helm uses Kubernetes rolling updates by default:

1. **New pods are created** with updated configuration
2. **Readiness probes** ensure new pods are healthy
3. **Old pods are terminated** only after new ones are ready
4. **Service** routes traffic to new pods automatically

**Verification:**
```bash
# Watch rollout status
kubectl rollout status deployment/mystore-woocommerce -n store-mystore

# Check pod status
kubectl get pods -n store-mystore -w
```

## Rolling Back a Store

### View Release History

```bash
# List all revisions
helm history mystore --namespace store-mystore

# Output:
# REVISION  UPDATED                  STATUS     CHART              APP VERSION DESCRIPTION
# 1         Mon Jan 1 12:00:00 2024   deployed   woocommerce-0.1.0   latest      Install complete
# 2         Mon Jan 1 13:00:00 2024   deployed   woocommerce-0.1.0   latest      Upgrade complete
```

### Rollback to Previous Version

```bash
# Rollback to previous revision
helm rollback mystore --namespace store-mystore

# Rollback to specific revision
helm rollback mystore 1 --namespace store-mystore
```

### Verify Rollback

```bash
# Check deployment status
kubectl get deployment mystore-woocommerce -n store-mystore

# Check pod status
kubectl get pods -n store-mystore

# Check store is accessible
curl http://mystore.local
```

## Database Migration Considerations

### WooCommerce/WordPress

WordPress handles database migrations automatically:
- **Minor updates**: Automatic migration
- **Major updates**: May require manual intervention
- **Backup recommended** before major upgrades

**Backup before upgrade:**
```bash
# Backup database
kubectl exec -it mystore-mysql-0 -n store-mystore -- \
  mysqldump -u wordpress -p wordpress > backup.sql

# Backup WordPress files
kubectl exec -it mystore-woocommerce-xxx -n store-mystore -- \
  tar czf /tmp/backup.tar.gz /var/www/html
```

### MedusaJS

MedusaJS requires database migrations:
- **Automatic migrations** on startup (if configured)
- **Manual migrations** may be required for major versions

**Run migrations:**
```bash
# MedusaJS handles migrations automatically on startup
# For manual migrations:
kubectl exec -it medusastore-medusa-xxx -n store-medusastore -- \
  medusa migrations run
```

## Upgrade Scenarios

### Scenario 1: Image Version Update

```bash
# 1. Check current version
helm get values mystore --namespace store-mystore

# 2. Upgrade to new version
helm upgrade mystore ./charts/woocommerce \
  --namespace store-mystore \
  --set image.tag=6.4 \
  --reuse-values

# 3. Monitor upgrade
kubectl rollout status deployment/mystore-woocommerce -n store-mystore

# 4. Verify functionality
curl http://mystore.local
```

### Scenario 2: Resource Increase

```bash
# Upgrade with increased resources
helm upgrade mystore ./charts/woocommerce \
  --namespace store-mystore \
  --set resources.limits.cpu=1000m \
  --set resources.limits.memory=1Gi \
  --set resources.requests.cpu=500m \
  --set resources.requests.memory=512Mi \
  --reuse-values
```

### Scenario 3: Configuration Change

```bash
# Update ingress host
helm upgrade mystore ./charts/woocommerce \
  --namespace store-mystore \
  --set ingress.hosts[0].host=newstore.example.com \
  --reuse-values
```

## Automated Upgrade Script

Create `scripts/upgrade-store.sh`:

```bash
#!/bin/bash

STORE_NAME=$1
NAMESPACE="store-${STORE_NAME}"
CHART_TYPE=$2  # woocommerce or medusa
NEW_VERSION=$3

if [ -z "$STORE_NAME" ] || [ -z "$CHART_TYPE" ] || [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 <store-name> <chart-type> <new-version>"
  exit 1
fi

echo "Upgrading ${STORE_NAME} to version ${NEW_VERSION}..."

# Backup before upgrade
echo "Creating backup..."
kubectl get deployment -n ${NAMESPACE} -o yaml > backup-${STORE_NAME}-$(date +%Y%m%d).yaml

# Upgrade
helm upgrade ${STORE_NAME} ./charts/${CHART_TYPE} \
  --namespace ${NAMESPACE} \
  --set image.tag=${NEW_VERSION} \
  --reuse-values \
  --wait

# Verify
echo "Verifying upgrade..."
kubectl rollout status deployment/${STORE_NAME}-${CHART_TYPE} -n ${NAMESPACE}

echo "Upgrade complete!"
```

**Usage:**
```bash
chmod +x scripts/upgrade-store.sh
./scripts/upgrade-store.sh mystore woocommerce 6.4
```

## Rollback Best Practices

1. **Always backup** before upgrades
2. **Test upgrades** in staging first
3. **Monitor** during and after upgrades
4. **Keep release history** (Helm default: 10 revisions)
5. **Document** upgrade procedures

## Troubleshooting Failed Upgrades

### Check Release Status

```bash
helm status mystore --namespace store-mystore
```

### Check Pod Logs

```bash
kubectl logs -n store-mystore -l app.kubernetes.io/instance=mystore --tail=100
```

### Check Events

```bash
kubectl get events -n store-mystore --sort-by='.lastTimestamp'
```

### Rollback on Failure

```bash
# If upgrade fails, immediately rollback
helm rollback mystore --namespace store-mystore

# Then investigate the issue
helm diff revision mystore 1 2 --namespace store-mystore
```

## Production Upgrade Checklist

- [ ] Backup database
- [ ] Backup application files
- [ ] Review release notes
- [ ] Test in staging environment
- [ ] Schedule maintenance window (if needed)
- [ ] Notify users (if downtime expected)
- [ ] Execute upgrade
- [ ] Monitor deployment status
- [ ] Verify functionality
- [ ] Check logs for errors
- [ ] Monitor metrics
- [ ] Document upgrade results

## Version Pinning

For production, pin specific versions:

```yaml
# values-prod.yaml
image:
  repository: wordpress
  tag: "6.4"  # Pin to specific version, not "latest"
  pullPolicy: IfNotPresent
```

This ensures:
- **Reproducible deployments**
- **Controlled upgrades**
- **Easier rollbacks**
