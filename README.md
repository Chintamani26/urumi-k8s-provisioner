# Kubernetes Store Provisioning Platform

A production-ready platform for provisioning and managing **WooCommerce** and **MedusaJS** ecommerce stores on Kubernetes using Helm charts, with a modern React dashboard and Node.js control plane.

## 🎯 Features

- ✅ **Multi-Platform Support**: Deploy WooCommerce (WordPress) or MedusaJS stores
- ✅ **Full Ecommerce Functionality**: Complete stores with databases, ready for orders
- ✅ **Namespace Isolation**: Each store in its own Kubernetes namespace
- ✅ **Database Persistence**: MySQL for WooCommerce, PostgreSQL for MedusaJS
- ✅ **Secrets Management**: Auto-generated secure passwords and keys
- ✅ **Status Tracking**: Real-time status (Provisioning/Ready/Failed)
- ✅ **Store Deletion**: Clean teardown of all resources
- ✅ **Network Policies**: Security policies restricting ingress traffic
- ✅ **Resource Quotas & LimitRanges**: Multi-tenant isolation and guardrails
- ✅ **Health Checks**: Liveness and readiness probes
- ✅ **Environment Support**: Local (Kind/k3d/Minikube) and Production (k3s/VPS)
- ✅ **Concurrent Deployments**: Deploy multiple stores simultaneously
- ✅ **Idempotency**: Safe retries and recovery mechanisms
- ✅ **Audit Logging**: Track all store operations
- ✅ **Observability**: Events, metrics, and failure reporting
- ✅ **Security Hardening**: RBAC, non-root containers, network policies
- ✅ **Abuse Prevention**: Rate limiting, quotas, timeouts

## 📋 Table of Contents

- [Local Setup Instructions](#-local-setup-instructions)
- [VPS/Production Setup Instructions](#-vpsproduction-setup-instructions-k3s)
- [Creating a Store and Placing an Order](#-creating-a-store-and-placing-an-order)
- [System Design & Tradeoffs](#-system-design--tradeoffs)
- [API Documentation](#-api-documentation)
- [Troubleshooting](#-troubleshooting)

---

## 🖥️ Local Setup Instructions

### Prerequisites

- **Node.js 18+** and npm
- **Docker Desktop** (for Kind/k3d) or **Minikube**
- **kubectl** configured
- **Helm 3.x** installed

### Step 1: Create Local Kubernetes Cluster

**Option A: Using Kind**
```bash
# Install Kind
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# Create cluster
kind create cluster --name store-provisioner

# Configure kubectl
kubectl cluster-info --context kind-store-provisioner
```

**Option B: Using k3d**
```bash
# Install k3d
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash

# Create cluster
k3d cluster create store-provisioner --port "8080:80@loadbalancer"

# Configure kubectl
kubectl cluster-info
```

**Option C: Using Minikube**
```bash
# Install Minikube (see https://minikube.sigs.k8s.io/docs/start/)
minikube start

# Enable ingress addon
minikube addons enable ingress
```

### Step 2: Install NGINX Ingress Controller

```bash
# Install NGINX Ingress
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Wait for ingress to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

### Step 3: Configure Local DNS (Optional but Recommended)

**macOS/Linux:**
```bash
# Add to /etc/hosts
echo "127.0.0.1 mystore.local" | sudo tee -a /etc/hosts
```

**Windows:**
```powershell
# Run as Administrator
Add-Content C:\Windows\System32\drivers\etc\hosts "127.0.0.1 mystore.local"
```

### Step 4: Install Platform Dependencies

**Option A: Quick Start Script (Recommended)**

**Windows PowerShell:**
```powershell
.\start.ps1
```

**Linux/macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Option B: Manual Installation**
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Step 5: Start the Platform

**Terminal 1 - Backend:**
```bash
cd backend
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Step 6: Access the Dashboard

Open `http://localhost:3000` in your browser.

---

## 🚀 VPS/Production Setup Instructions (k3s)

### Prerequisites

- **Ubuntu 20.04+** or **Debian 11+** VPS
- **2+ GB RAM**, **2+ CPU cores**
- **Root or sudo access**
- **Domain name** (optional, for production)

### Step 1: Install k3s

```bash
# Install k3s
curl -sfL https://get.k3s.io | sh -

# Verify installation
sudo k3s kubectl get nodes

# Configure kubectl
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER ~/.kube/config
export KUBECONFIG=~/.kube/config
```

### Step 2: Install NGINX Ingress

```bash
# Install NGINX Ingress
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

# Wait for ingress to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s

# Get ingress IP
kubectl get svc -n ingress-nginx
```

### Step 3: Configure DNS (Production)

```bash
# Point your domain to the VPS IP
# Example: store.example.com -> YOUR_VPS_IP

# Verify DNS propagation
dig store.example.com
```

### Step 4: Install cert-manager (Optional - for TLS)

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Wait for cert-manager to be ready
kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager \
  --timeout=90s

# Create ClusterIssuer for Let's Encrypt
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Step 5: Deploy Platform Components

```bash
# Clone repository
git clone <your-repo-url>
cd urumi-k8s-provisioner

# Set production environment
export NODE_ENV=production

# Install backend dependencies
cd backend
npm install --production

# Install frontend dependencies and build
cd ../frontend
npm install
npm run build

# Start backend (use PM2 or systemd for production)
cd ../backend
npm start
```

### Step 6: Configure Production Values

Update `charts/woocommerce/values-prod.yaml` and `charts/medusa/values-prod.yaml`:

```yaml
ingress:
  hosts:
    - host: your-store.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: store-tls
      hosts:
        - your-store.example.com

persistence:
  storageClassName: "local-path"  # k3s default

database:
  persistence:
    storageClassName: "local-path"
```

### Step 7: Access the Platform

- **Dashboard**: `http://YOUR_VPS_IP:3000` or `https://dashboard.example.com`
- **API**: `http://YOUR_VPS_IP:3001` or `https://api.example.com`

---

## 🛍️ Creating a Store and Placing an Order

### WooCommerce Store

#### Step 1: Deploy Store

1. Open the dashboard at `http://localhost:3000`
2. Select **WooCommerce** as store type
3. Enter store name (e.g., `mystore`)
4. Click **"Deploy Store"**
5. Wait for status to change to **"Ready"** (2-5 minutes)

#### Step 2: Complete WordPress Setup

1. Click **"Open Store"** or navigate to `http://mystore.local`
2. Select language and click **"Continue"**
3. Fill in site information:
   - Site Title: `My Store`
   - Username: `admin`
   - Password: (choose a strong password)
   - Email: `admin@example.com`
4. Click **"Install WordPress"**

#### Step 3: Install WooCommerce

1. After WordPress installation, log in to admin panel
2. Navigate to **Plugins → Add New**
3. Search for **"WooCommerce"**
4. Click **"Install Now"** then **"Activate"**
5. Complete WooCommerce setup wizard:
   - Store details
   - Industry
   - Product types
   - Business details
   - Theme selection

#### Step 4: Add a Product

1. Navigate to **Products → Add New**
2. Enter product details:
   - Name: `Test Product`
   - Price: `$19.99`
   - Description: `This is a test product`
3. Click **"Publish"**

#### Step 5: Place an Order

1. Visit storefront: `http://mystore.local`
2. Click on the product
3. Click **"Add to cart"**
4. Click **"View cart"**
5. Click **"Proceed to checkout"**
6. Fill in checkout details:
   - First name, Last name
   - Address
   - City, State, ZIP
   - Email, Phone
7. Select payment method (Cash on Delivery or test gateway)
8. Click **"Place order"**
9. Verify order in **WooCommerce → Orders**

### MedusaJS Store

#### Step 1: Deploy Store

1. Open the dashboard at `http://localhost:3000`
2. Select **MedusaJS** as store type
3. Enter store name (e.g., `medusastore`)
4. Click **"Deploy Store"**
5. Wait for status to change to **"Ready"** (2-5 minutes)

#### Step 2: Access Store

1. Click **"Open Store"** or navigate to `http://medusastore.local`
2. MedusaJS should be running with default starter

#### Step 3: Add a Product (via Admin or API)

**Via Admin UI:**
1. Access admin panel (if configured)
2. Navigate to Products
3. Add new product with details

**Via API:**
```bash
# Create a product
curl -X POST http://medusastore.local/admin/products \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Product",
    "description": "Test product description",
    "price": 1999,
    "status": "published"
  }'
```

#### Step 4: Place an Order

1. Visit storefront: `http://medusastore.local`
2. Browse products
3. Add product to cart
4. Complete checkout flow
5. Verify order via admin UI or API

---

## 🏗️ System Design & Tradeoffs

### Architecture Choice

**Control Plane Pattern**: The platform uses a Node.js backend as a control plane that orchestrates Kubernetes resources via Helm. This design was chosen for:

**Pros:**
- **Simplicity**: Single API layer abstracts Kubernetes complexity
- **Flexibility**: Easy to add features (monitoring, backups, scaling)
- **Portability**: Works with any Kubernetes cluster
- **Developer Experience**: REST API is easier than direct kubectl/helm

**Cons:**
- **Single Point of Failure**: Backend must be highly available
- **Latency**: Additional hop compared to direct Kubernetes API
- **State Management**: Requires external state (database) for production

**Alternative Considered**: Direct Kubernetes Operator pattern
- More complex but more Kubernetes-native
- Better for large-scale deployments
- Requires deeper Kubernetes expertise

### Idempotency/Failure Handling/Cleanup Approach

#### Idempotency

1. **Namespace Check**: Before creating namespace, check if it exists
2. **Helm Upgrade**: Use `helm upgrade --install` which is idempotent
3. **Metadata Tracking**: In-memory store tracks deployment state
4. **Retry Logic**: Failed deployments can be retried safely

**Implementation:**
```javascript
// Check if store already exists
if (storeMetadata.has(storeName)) {
  return res.status(409).json({ error: 'Store already exists' });
}

// Helm upgrade --install is idempotent
helm upgrade --install ${releaseName} ${chartPath} ...
```

#### Failure Handling

1. **Status Tracking**: Stores have states (Provisioning/Ready/Failed)
2. **Error Recovery**: Failed stores can be deleted and recreated
3. **Timeout Protection**: Helm commands have 10-minute timeout
4. **Cleanup on Failure**: Failed deployments are marked but not auto-deleted

**Recovery Strategy:**
- If backend restarts mid-provisioning, status is checked on next API call
- Kubernetes resources remain, allowing manual cleanup
- Store metadata is in-memory (use database for production persistence)

#### Cleanup Approach

1. **Helm Uninstall**: Removes all Helm-managed resources
2. **Namespace Deletion**: Cascading delete removes all resources
3. **Wait for Completion**: `--wait` flag ensures clean teardown
4. **Metadata Cleanup**: Remove from tracking after successful deletion

**Cleanup Flow:**
```bash
# 1. Uninstall Helm release
helm uninstall ${releaseName} --namespace ${namespace}

# 2. Delete namespace (removes all resources)
kubectl delete namespace ${namespace} --wait=true --timeout=5m

# 3. Remove from metadata
storeMetadata.delete(storeName)
```

### Production Changes

#### DNS

**Local:**
- Uses `.local` domains
- Requires `/etc/hosts` entries
- No DNS resolution needed

**Production:**
- Real domain names (e.g., `store.example.com`)
- DNS A record pointing to VPS IP
- Optional: Wildcard DNS for dynamic subdomains

#### Ingress

**Local:**
```yaml
ingress:
  className: "nginx"
  annotations: {}
  hosts:
    - host: mystore.local
```

**Production:**
```yaml
ingress:
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: store.example.com
  tls:
    - secretName: store-tls
      hosts:
        - store.example.com
```

#### Storage Class

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
persistence:
  storageClassName: "gp3"  # AWS EBS
  # or
  storageClassName: "pd-ssd"  # GCP Persistent Disk
```

#### Secrets

**Local:**
- Auto-generated secrets stored in Kubernetes
- No external secret management needed

**Production:**
- Consider using **External Secrets Operator**
- Integrate with **AWS Secrets Manager**, **HashiCorp Vault**, or **Google Secret Manager**
- Rotate secrets periodically
- Use **Sealed Secrets** for GitOps workflows

**Example External Secrets:**
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: store-secrets
spec:
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: store-secrets
  data:
    - secretKey: db-password
      remoteRef:
        key: stores/mystore/db-password
```

#### Additional Production Considerations

1. **High Availability**: Run backend with multiple replicas
2. **Database**: Use managed databases (RDS, Cloud SQL) instead of in-cluster
3. **Monitoring**: Integrate Prometheus/Grafana
4. **Logging**: Centralized logging (ELK, Loki)
5. **Backup**: Automated backups for databases and volumes
6. **Scaling**: Horizontal Pod Autoscaler for backend
7. **Load Balancing**: Use cloud load balancer for ingress

---

## 📊 API Documentation

### `POST /api/deploy`
Deploy a new store.

**Request:**
```json
{
  "storeName": "mystore",
  "storeType": "woocommerce"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Store \"mystore\" deployed successfully",
  "store": {
    "name": "mystore",
    "type": "woocommerce",
    "namespace": "store-mystore",
    "status": "Provisioning",
    "storeUrl": "http://mystore.local",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### `GET /api/status`
Get all stores with status.

### `DELETE /api/store/:storeName`
Delete a store.

### `GET /api/metrics`
Get platform metrics (stores created, failures, etc.).

### `GET /api/audit`
Get audit log of all operations.

---

## 🛠️ Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed troubleshooting guide.

---

## 📝 License

MIT

---

**Built with ❤️ for Kubernetes Store Provisioning**
