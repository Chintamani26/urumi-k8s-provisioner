# Scaling Guide

## Horizontal Scaling

### Backend API Scaling

The backend API is stateless and can be scaled horizontally.

#### Kubernetes Deployment Scaling

```yaml
# backend-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: store-provisioner-api
spec:
  replicas: 3  # Scale to 3 replicas
  selector:
    matchLabels:
      app: store-provisioner-api
  template:
    metadata:
      labels:
        app: store-provisioner-api
    spec:
      containers:
        - name: api
          image: store-provisioner-api:latest
          ports:
            - containerPort: 3001
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: store-provisioner-api
spec:
  type: ClusterIP
  selector:
    app: store-provisioner-api
  ports:
    - port: 3001
      targetPort: 3001
```

#### Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: store-provisioner-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: store-provisioner-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

**Apply HPA:**
```bash
kubectl apply -f backend-hpa.yaml
```

### Frontend Scaling

Frontend can be scaled similarly:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: store-provisioner-frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: store-provisioner-frontend
  template:
    metadata:
      labels:
        app: store-provisioner-frontend
    spec:
      containers:
        - name: frontend
          image: store-provisioner-frontend:latest
          ports:
            - containerPort: 3000
```

## Concurrency Controls

### Semaphore-Based Rate Limiting

The backend implements semaphore-based concurrency control:

```javascript
// Maximum concurrent provisioning operations
const MAX_CONCURRENT_PROVISIONING = 5;
const activeProvisioning = new Map();

// Check if we can start a new provisioning
if (activeProvisioning.size >= MAX_CONCURRENT_PROVISIONING) {
  return res.status(429).json({
    error: 'Too many concurrent provisioning operations'
  });
}
```

### Per-User Store Quotas

```javascript
const MAX_STORES_PER_USER = 10;

function checkStoreQuota(userId) {
  const userStores = Array.from(storeMetadata.values())
    .filter(s => s.userId === userId);
  
  if (userStores.length >= MAX_STORES_PER_USER) {
    return { allowed: false };
  }
  return { allowed: true };
}
```

### Provisioning Timeouts

```javascript
const PROVISIONING_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Track provisioning start time
activeProvisioning.set(storeName, { startTime: Date.now() });

// Cleanup timeout operations
setInterval(() => {
  const now = Date.now();
  for (const [storeName, operation] of activeProvisioning.entries()) {
    if (now - operation.startTime > PROVISIONING_TIMEOUT) {
      // Mark as failed and cleanup
      activeProvisioning.delete(storeName);
    }
  }
}, 60000);
```

## Store Workload Scaling

### WooCommerce Store Scaling

Scale WordPress pods:

```bash
# Scale WooCommerce store
kubectl scale deployment mystore-woocommerce \
  --replicas=3 \
  --namespace store-mystore

# Or via Helm
helm upgrade mystore ./charts/woocommerce \
  --namespace store-mystore \
  --set replicaCount=3 \
  --reuse-values
```

**Considerations:**
- WordPress is stateful (file uploads, sessions)
- Use shared storage (NFS, S3) for multi-pod deployments
- Database connection pooling recommended

### MedusaJS Store Scaling

```bash
# Scale MedusaJS store
kubectl scale deployment medusastore-medusa \
  --replicas=3 \
  --namespace store-medusastore
```

**Considerations:**
- MedusaJS is more stateless-friendly
- Use Redis for session storage
- Database connection pooling required

## Database Scaling

### Read Replicas

For high-traffic stores, use database read replicas:

```yaml
# MySQL read replica
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mystore-mysql-replica
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: mysql
          env:
            - name: MYSQL_REPLICATION_MODE
              value: "slave"
            - name: MYSQL_MASTER_HOST
              value: "mystore-mysql"
```

### Managed Databases

For production, use managed databases:
- **AWS RDS**: MySQL/PostgreSQL
- **Google Cloud SQL**: MySQL/PostgreSQL
- **Azure Database**: MySQL/PostgreSQL

**Benefits:**
- Automatic backups
- High availability
- Read replicas
- Automated scaling

## Load Balancing

### Ingress Load Balancing

NGINX Ingress automatically load balances across pods:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mystore-ingress
  annotations:
    nginx.ingress.kubernetes.io/load-balance: "round_robin"
spec:
  rules:
    - host: mystore.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: mystore-woocommerce
                port:
                  number: 80
```

## Monitoring Scaling

### Metrics to Monitor

1. **API Metrics:**
   - Request rate
   - Response time
   - Error rate
   - Active provisioning operations

2. **Store Metrics:**
   - Pod CPU/Memory usage
   - Request rate per store
   - Database connections

3. **Cluster Metrics:**
   - Node CPU/Memory
   - Pod scheduling
   - Resource quotas

### Prometheus Integration

```yaml
apiVersion: v1
kind: Service
metadata:
  name: store-provisioner-api-metrics
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "3001"
    prometheus.io/path: "/metrics"
spec:
  ports:
    - port: 3001
      name: metrics
```

## Scaling Best Practices

1. **Start Small**: Begin with 1-2 replicas
2. **Monitor First**: Watch metrics before scaling
3. **Scale Gradually**: Increase replicas incrementally
4. **Test Load**: Use load testing tools
5. **Set Limits**: Use HPA with reasonable min/max
6. **Monitor Costs**: Track resource usage

## Cost Optimization

### Right-Sizing Resources

```bash
# Analyze resource usage
kubectl top pods -n store-mystore

# Adjust resources based on actual usage
helm upgrade mystore ./charts/woocommerce \
  --namespace store-mystore \
  --set resources.requests.cpu=200m \
  --set resources.requests.memory=256Mi \
  --set resources.limits.cpu=500m \
  --set resources.limits.memory=512Mi
```

### Cluster Autoscaling

Enable cluster autoscaling to automatically add/remove nodes:

```yaml
# For cloud providers
apiVersion: autoscaling/v2
kind: ClusterAutoscaler
metadata:
  name: cluster-autoscaler
spec:
  minNodes: 2
  maxNodes: 10
  scaleDownDelayAfterAdd: 10m
```

## Production Scaling Plan

1. **Backend API**: 3-5 replicas with HPA (2-10 range)
2. **Frontend**: 2-3 replicas
3. **Stores**: Scale individually based on traffic
4. **Database**: Use managed databases with read replicas
5. **Monitoring**: Prometheus + Grafana for metrics
6. **Alerting**: Set up alerts for high resource usage
