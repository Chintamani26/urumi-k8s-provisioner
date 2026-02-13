# Troubleshooting Guide

## Common Issues and Solutions

### Deployment Fails

**Symptoms:**
- Store status stuck on "Provisioning"
- Error messages in console output
- Helm deployment fails

**Diagnosis:**
```bash
# Check namespace
kubectl get namespace store-mystore

# Check Helm release status
helm status mystore --namespace store-mystore

# Check pods
kubectl get pods -n store-mystore

# Check events
kubectl get events -n store-mystore --sort-by='.lastTimestamp'
```

**Solutions:**
1. **Insufficient Resources:**
   ```bash
   # Check node resources
   kubectl top nodes
   
   # Check resource quotas
   kubectl describe resourcequota -n store-mystore
   ```

2. **Image Pull Errors:**
   ```bash
   # Check image pull secrets
   kubectl get secrets -n store-mystore
   
   # Check pod events
   kubectl describe pod -n store-mystore
   ```

3. **Helm Chart Issues:**
   ```bash
   # Validate chart
   helm lint ./charts/woocommerce
   
   # Dry-run deployment
   helm install mystore ./charts/woocommerce \
     --namespace store-mystore \
     --dry-run --debug
   ```

### Store Status Stuck on "Provisioning"

**Symptoms:**
- Status never changes to "Ready"
- Pods are running but not ready

**Diagnosis:**
```bash
# Check pod status
kubectl get pods -n store-mystore

# Check pod logs
kubectl logs -n store-mystore -l app.kubernetes.io/name=woocommerce

# Check readiness probe
kubectl describe pod -n store-mystore
```

**Solutions:**
1. **Database Not Ready:**
   ```bash
   # Check database pod
   kubectl get pods -n store-mystore | grep mysql
   
   # Check database logs
   kubectl logs -n store-mystore mystore-mysql-0
   ```

2. **Readiness Probe Failing:**
   ```bash
   # Test endpoint manually
   kubectl exec -it mystore-woocommerce-xxx -n store-mystore -- curl http://localhost:80
   
   # Adjust readiness probe timing
   helm upgrade mystore ./charts/woocommerce \
     --namespace store-mystore \
     --set healthCheck.readinessProbe.initialDelaySeconds=60
   ```

### Network Policy Blocks Traffic

**Symptoms:**
- Store is accessible internally but not via Ingress
- 503 errors from Ingress

**Diagnosis:**
```bash
# Check NetworkPolicy
kubectl get networkpolicy -n store-mystore

# Describe NetworkPolicy
kubectl describe networkpolicy -n store-mystore

# Check Ingress Controller
kubectl get pods -n ingress-nginx
```

**Solutions:**
1. **Verify Ingress Controller Labels:**
   ```bash
   # Check Ingress Controller pod labels
   kubectl get pods -n ingress-nginx --show-labels
   
   # Update NetworkPolicy to match
   # Edit values.yaml:
   networkPolicy:
     ingressController:
       namespace: ingress-nginx
       labels:
         app.kubernetes.io/name: ingress-nginx
   ```

2. **Temporarily Disable NetworkPolicy:**
   ```bash
   helm upgrade mystore ./charts/woocommerce \
     --namespace store-mystore \
     --set networkPolicy.enabled=false
   ```

### Database Connection Issues

**Symptoms:**
- Application can't connect to database
- Database connection errors in logs

**Diagnosis:**
```bash
# Check database pod
kubectl get pods -n store-mystore | grep -E 'mysql|postgres'

# Check database service
kubectl get svc -n store-mystore | grep -E 'mysql|postgres'

# Test database connection
kubectl exec -it mystore-woocommerce-xxx -n store-mystore -- \
  mysql -h mystore-mysql -u wordpress -p
```

**Solutions:**
1. **Check Secrets:**
   ```bash
   # Verify secrets exist
   kubectl get secrets -n store-mystore
   
   # Check secret values
   kubectl get secret mystore-secrets -n store-mystore -o yaml
   ```

2. **Verify Database Credentials:**
   ```bash
   # Check environment variables
   kubectl exec -it mystore-woocommerce-xxx -n store-mystore -- env | grep DB
   ```

### Resource Quota Exceeded

**Symptoms:**
- Pods stuck in Pending state
- "exceeded quota" errors

**Diagnosis:**
```bash
# Check ResourceQuota
kubectl describe resourcequota -n store-mystore

# Check LimitRange
kubectl describe limitrange -n store-mystore
```

**Solutions:**
1. **Increase Quota:**
   ```bash
   # Edit ResourceQuota
   kubectl edit resourcequota mystore-quota -n store-mystore
   
   # Or via Helm
   helm upgrade mystore ./charts/woocommerce \
     --namespace store-mystore \
     --set resourceQuota.hard.limits.cpu="8"
   ```

2. **Delete Unused Resources:**
   ```bash
   # List all resources
   kubectl get all -n store-mystore
   
   # Delete unused PVCs
   kubectl delete pvc -n store-mystore <unused-pvc>
   ```

### Ingress Not Working

**Symptoms:**
- Can't access store via URL
- 404 or connection refused

**Diagnosis:**
```bash
# Check Ingress
kubectl get ingress -n store-mystore

# Describe Ingress
kubectl describe ingress -n store-mystore

# Check Ingress Controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller
```

**Solutions:**
1. **Verify DNS:**
   ```bash
   # Test DNS resolution
   dig mystore.local
   nslookup mystore.local
   ```

2. **Check Ingress Controller:**
   ```bash
   # Verify Ingress Controller is running
   kubectl get pods -n ingress-nginx
   
   # Check Ingress Controller service
   kubectl get svc -n ingress-nginx
   ```

3. **Verify Service:**
   ```bash
   # Check service exists
   kubectl get svc -n store-mystore
   
   # Test service endpoint
   kubectl port-forward -n store-mystore svc/mystore-woocommerce 8080:80
   curl http://localhost:8080
   ```

### Store Deletion Fails

**Symptoms:**
- Delete operation hangs
- Resources not fully removed

**Diagnosis:**
```bash
# Check namespace finalizers
kubectl get namespace store-mystore -o yaml

# Check remaining resources
kubectl get all -n store-mystore

# Check Helm release
helm list -n store-mystore
```

**Solutions:**
1. **Force Delete Namespace:**
   ```bash
   # Remove finalizers
   kubectl patch namespace store-mystore -p '{"metadata":{"finalizers":[]}}' --type=merge
   
   # Delete namespace
   kubectl delete namespace store-mystore --force --grace-period=0
   ```

2. **Manual Cleanup:**
   ```bash
   # Uninstall Helm release
   helm uninstall mystore --namespace store-mystore
   
   # Delete PVCs
   kubectl delete pvc -n store-mystore --all
   
   # Delete namespace
   kubectl delete namespace store-mystore
   ```

### Backend API Issues

**Symptoms:**
- API returns errors
- Stores not appearing in dashboard

**Diagnosis:**
```bash
# Check backend logs
kubectl logs -n default -l app=store-provisioner-api

# Check API health
curl http://localhost:3001/health

# Check metrics
curl http://localhost:3001/api/metrics
```

**Solutions:**
1. **Check Kubernetes Access:**
   ```bash
   # Verify kubectl access
   kubectl cluster-info
   
   # Check RBAC
   kubectl auth can-i create namespaces
   ```

2. **Restart Backend:**
   ```bash
   # Restart deployment
   kubectl rollout restart deployment store-provisioner-api
   ```

### Performance Issues

**Symptoms:**
- Slow provisioning
- High resource usage
- Timeouts

**Diagnosis:**
```bash
# Check resource usage
kubectl top pods -n store-mystore

# Check node resources
kubectl top nodes

# Check metrics
curl http://localhost:3001/api/metrics
```

**Solutions:**
1. **Increase Resources:**
   ```bash
   helm upgrade mystore ./charts/woocommerce \
     --namespace store-mystore \
     --set resources.limits.cpu=1000m \
     --set resources.limits.memory=1Gi
   ```

2. **Optimize Database:**
   ```bash
   # Check database performance
   kubectl exec -it mystore-mysql-0 -n store-mystore -- \
     mysql -u root -p -e "SHOW PROCESSLIST;"
   ```

## Getting Help

1. **Check Logs:**
   ```bash
   # Application logs
   kubectl logs -n store-mystore -l app.kubernetes.io/name=woocommerce
   
   # Backend logs
   kubectl logs -n default -l app=store-provisioner-api
   ```

2. **Check Events:**
   ```bash
   kubectl get events -n store-mystore --sort-by='.lastTimestamp'
   ```

3. **Describe Resources:**
   ```bash
   kubectl describe pod -n store-mystore
   kubectl describe deployment -n store-mystore
   ```

4. **Debug Commands:**
   ```bash
   # Shell into pod
   kubectl exec -it mystore-woocommerce-xxx -n store-mystore -- /bin/sh
   
   # Port forward for testing
   kubectl port-forward -n store-mystore svc/mystore-woocommerce 8080:80
   ```
