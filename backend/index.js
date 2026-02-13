import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const app = express();
const PORT = 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Store metadata (in production, use a database)
const storeMetadata = new Map(); // storeName -> { type, namespace, helmRelease, ingressHost, createdAt, status, userId }

// Audit log (in production, use a database)
const auditLog = [];

// Metrics
const metrics = {
  storesCreated: 0,
  storesDeleted: 0,
  provisioningFailures: 0,
  provisioningDurations: [],
  apiRequests: 0,
  errors: 0
};

// Rate limiting (simple in-memory, use Redis in production)
const rateLimits = new Map(); // userId -> { count, resetTime }
const MAX_STORES_PER_USER = 10;
const PROVISIONING_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Active provisioning operations (for concurrency control)
const activeProvisioning = new Map(); // storeName -> { startTime, timeout }

// Environment detection
const ENV = process.env.NODE_ENV || 'local';
const VALUES_FILE = ENV === 'production' ? 'values-prod.yaml' : 'values-local.yaml';

/**
 * Audit logging
 */
function auditLogEntry(action, details, userId = 'system') {
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    userId,
    details,
    success: true
  };
  auditLog.push(entry);
  console.log(`[AUDIT] ${action} by ${userId}:`, details);
  return entry;
}

/**
 * Rate limiting check
 */
function checkRateLimit(userId = 'default') {
  const now = Date.now();
  const userLimit = rateLimits.get(userId) || { count: 0, resetTime: now + 60000 }; // 1 minute window
  
  if (now > userLimit.resetTime) {
    userLimit.count = 0;
    userLimit.resetTime = now + 60000;
  }
  
  if (userLimit.count >= 10) { // 10 requests per minute
    return { allowed: false, error: 'Rate limit exceeded. Please try again later.' };
  }
  
  userLimit.count++;
  rateLimits.set(userId, userLimit);
  return { allowed: true };
}

/**
 * Check store quota per user
 */
function checkStoreQuota(userId = 'default') {
  const userStores = Array.from(storeMetadata.values()).filter(s => s.userId === userId);
  if (userStores.length >= MAX_STORES_PER_USER) {
    return { allowed: false, error: `Maximum ${MAX_STORES_PER_USER} stores per user exceeded` };
  }
  return { allowed: true };
}

/**
 * Validates store name: alphanumeric only, 3-30 characters
 */
function validateStoreName(storeName) {
  if (!storeName || typeof storeName !== 'string') {
    return { valid: false, error: 'Store name is required' };
  }
  
  if (storeName.length < 3 || storeName.length > 30) {
    return { valid: false, error: 'Store name must be between 3 and 30 characters' };
  }
  
  if (!/^[a-zA-Z0-9]+$/.test(storeName)) {
    return { valid: false, error: 'Store name must contain only alphanumeric characters' };
  }
  
  return { valid: true };
}

/**
 * Validates store type
 */
function validateStoreType(storeType) {
  const validTypes = ['woocommerce', 'medusa'];
  if (!storeType || !validTypes.includes(storeType.toLowerCase())) {
    return { valid: false, error: `Store type must be one of: ${validTypes.join(', ')}` };
  }
  return { valid: true, type: storeType.toLowerCase() };
}

/**
 * Get store status from Kubernetes
 */
async function getStoreStatus(namespace, storeType) {
  try {
    // Check if namespace exists
    try {
      await execAsync(`kubectl get namespace ${namespace}`);
    } catch {
      return 'Failed';
    }

    // Check deployment status - use release name (storeName) to find deployment
    const releaseName = namespace.replace('store-', '');
    
    try {
      // Try to get deployment
      const { stdout: deploymentStatus } = await execAsync(
        `kubectl get deployment -n ${namespace} -o jsonpath='{.items[?(@.metadata.labels.app\\.kubernetes\\.io/instance=="${releaseName}")].status.conditions[?(@.type=="Available")].status}'`
      );
      
      if (deploymentStatus.trim() === 'True') {
        // Check if pods are ready
        const { stdout: podStatus } = await execAsync(
          `kubectl get pods -n ${namespace} -l app.kubernetes.io/instance=${releaseName} -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Pending"`
        );
        
        if (podStatus.trim() === 'Running') {
          return 'Ready';
        }
        return 'Provisioning';
      }
      return 'Provisioning';
    } catch {
      // If deployment doesn't exist yet, check if namespace has any pods
      try {
        const { stdout: podCount } = await execAsync(
          `kubectl get pods -n ${namespace} --no-headers 2>/dev/null | wc -l || echo "0"`
        );
        if (parseInt(podCount.trim()) > 0) {
          return 'Provisioning';
        }
      } catch {}
      return 'Provisioning';
    }
  } catch (error) {
    console.error(`Error checking status for ${namespace}:`, error.message);
    return 'Unknown';
  }
}

/**
 * Cleanup timeout provisioning operations
 */
function cleanupTimeoutOperations() {
  const now = Date.now();
  for (const [storeName, operation] of activeProvisioning.entries()) {
    if (now - operation.startTime > PROVISIONING_TIMEOUT) {
      console.warn(`Provisioning timeout for ${storeName}`);
      const metadata = storeMetadata.get(storeName);
      if (metadata) {
        metadata.status = 'Failed';
        storeMetadata.set(storeName, metadata);
      }
      activeProvisioning.delete(storeName);
      metrics.provisioningFailures++;
    }
  }
}

// Cleanup timeout operations every minute
setInterval(cleanupTimeoutOperations, 60000);

/**
 * POST /api/deploy
 * Deploys a new store (WooCommerce or Medusa) to Kubernetes
 */
app.post('/api/deploy', async (req, res) => {
  const startTime = Date.now();
  const userId = req.headers['x-user-id'] || 'default';
  metrics.apiRequests++;
  
  try {
    const { storeName, storeType = 'woocommerce' } = req.body;
    
    // Rate limiting
    const rateLimitCheck = checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      metrics.errors++;
      const auditEntry = auditLogEntry('DEPLOY_ATTEMPT', { storeName, storeType, reason: 'rate_limit' }, userId);
      auditEntry.success = false;
      return res.status(429).json({ 
        success: false, 
        error: rateLimitCheck.error 
      });
    }
    
    // Store quota check
    const quotaCheck = checkStoreQuota(userId);
    if (!quotaCheck.allowed) {
      metrics.errors++;
      const auditEntry = auditLogEntry('DEPLOY_ATTEMPT', { storeName, storeType, reason: 'quota_exceeded' }, userId);
      auditEntry.success = false;
      return res.status(403).json({ 
        success: false, 
        error: quotaCheck.error 
      });
    }
    
    // Validate store name
    const nameValidation = validateStoreName(storeName);
    if (!nameValidation.valid) {
      metrics.errors++;
      const auditEntry = auditLogEntry('DEPLOY_ATTEMPT', { storeName, storeType, reason: nameValidation.error }, userId);
      auditEntry.success = false;
      return res.status(400).json({ 
        success: false, 
        error: nameValidation.error 
      });
    }
    
    // Validate store type
    const typeValidation = validateStoreType(storeType);
    if (!typeValidation.valid) {
      metrics.errors++;
      const auditEntry = auditLogEntry('DEPLOY_ATTEMPT', { storeName, storeType, reason: typeValidation.error }, userId);
      auditEntry.success = false;
      return res.status(400).json({ 
        success: false, 
        error: typeValidation.error 
      });
    }
    
    const validatedType = typeValidation.type;
    
    // Check if store already exists (idempotency)
    if (storeMetadata.has(storeName)) {
      const existing = storeMetadata.get(storeName);
      // If provisioning, return current status
      if (existing.status === 'Provisioning') {
        return res.json({
          success: true,
          message: `Store "${storeName}" is already being provisioned`,
          store: {
            ...existing,
            status: await getStoreStatus(existing.namespace, existing.type)
          }
        });
      }
      // If ready or failed, return error
      const auditEntry = auditLogEntry('DEPLOY_ATTEMPT', { storeName, storeType, reason: 'already_exists' }, userId);
      auditEntry.success = false;
      return res.status(409).json({ 
        success: false, 
        error: `Store "${storeName}" already exists` 
      });
    }
    
    // Check if provisioning is already in progress
    if (activeProvisioning.has(storeName)) {
      return res.status(409).json({
        success: false,
        error: `Store "${storeName}" is already being provisioned`
      });
    }
    
    const namespace = `store-${storeName}`;
    const helmReleaseName = storeName;
    const ingressHost = ENV === 'production' 
      ? `${storeName}.example.com`
      : `${storeName}.local`;
    
    // Mark store as provisioning
    storeMetadata.set(storeName, {
      type: validatedType,
      namespace,
      helmRelease: helmReleaseName,
      ingressHost,
      createdAt: new Date().toISOString(),
      status: 'Provisioning',
      userId
    });
    
    activeProvisioning.set(storeName, { startTime: Date.now() });
    auditLogEntry('DEPLOY_START', { storeName, storeType: validatedType, namespace }, userId);
    
    // Step 1: Create namespace (idempotent)
    console.log(`Creating namespace: ${namespace}`);
    try {
      await execAsync(`kubectl create namespace ${namespace}`);
      console.log(`Namespace ${namespace} created successfully`);
    } catch (error) {
      if (!error.message.includes('AlreadyExists')) {
        throw error;
      }
      console.log(`Namespace ${namespace} already exists`);
    }
    
    // Step 2: Install Helm chart with appropriate values file
    console.log(`Installing Helm release: ${helmReleaseName} (${validatedType})`);
    const chartPath = `./charts/${validatedType}`;
    const helmCommand = `helm upgrade --install ${helmReleaseName} ${chartPath} --namespace ${namespace} -f ${chartPath}/${VALUES_FILE} --set ingress.hosts[0].host=${ingressHost} --wait --timeout 10m`;
    
    const { stdout, stderr } = await execAsync(helmCommand);
    
    if (stderr && !stderr.includes('Release') && !stderr.includes('has been upgraded') && !stderr.includes('WARNING')) {
      console.error('Helm stderr:', stderr);
    }
    
    console.log('Helm output:', stdout);
    
    // Update status
    const status = await getStoreStatus(namespace, validatedType);
    const metadata = storeMetadata.get(storeName);
    if (metadata) {
      metadata.status = status;
      storeMetadata.set(storeName, metadata);
    }
    
    activeProvisioning.delete(storeName);
    
    const duration = Date.now() - startTime;
    metrics.provisioningDurations.push(duration);
    metrics.storesCreated++;
    
    if (status === 'Ready') {
      auditLogEntry('DEPLOY_SUCCESS', { storeName, storeType: validatedType, duration }, userId);
    } else {
      metrics.provisioningFailures++;
      const auditEntry = auditLogEntry('DEPLOY_FAILED', { storeName, storeType: validatedType, status }, userId);
      auditEntry.success = false;
    }
    
    res.json({
      success: true,
      message: `Store "${storeName}" deployed successfully`,
      store: {
        name: storeName,
        type: validatedType,
        namespace,
        helmRelease: helmReleaseName,
        ingressHost,
        status,
        createdAt: metadata.createdAt,
        storeUrl: `http://${ingressHost}`
      },
      logs: stdout
    });
    
  } catch (error) {
    console.error('Deployment error:', error);
    const { storeName } = req.body;
    if (storeName) {
      if (storeMetadata.has(storeName)) {
        const metadata = storeMetadata.get(storeName);
        metadata.status = 'Failed';
        storeMetadata.set(storeName, metadata);
      }
      activeProvisioning.delete(storeName);
    }
    
    metrics.provisioningFailures++;
    metrics.errors++;
    const auditEntry = auditLogEntry('DEPLOY_ERROR', { 
      storeName: req.body.storeName, 
      error: error.message 
    }, userId);
    auditEntry.success = false;
    
    res.status(500).json({
      success: false,
      error: 'Failed to deploy store',
      details: error.message
    });
  }
});

/**
 * GET /api/status
 * Returns list of deployed stores with their status
 */
app.get('/api/status', async (req, res) => {
  metrics.apiRequests++;
  try {
    const stores = [];
    
    // Update status for all stores
    for (const [storeName, metadata] of storeMetadata.entries()) {
      const status = await getStoreStatus(metadata.namespace, metadata.type);
      if (status !== metadata.status) {
        metadata.status = status;
        storeMetadata.set(storeName, metadata);
      }
      
      stores.push({
        name: storeName,
        type: metadata.type,
        namespace: metadata.namespace,
        status,
        ingressHost: metadata.ingressHost,
        storeUrl: `http://${metadata.ingressHost}`,
        createdAt: metadata.createdAt
      });
    }
    
    res.json({
      success: true,
      stores,
      count: stores.length
    });
  } catch (error) {
    console.error('Status error:', error);
    metrics.errors++;
    res.status(500).json({
      success: false,
      error: 'Failed to fetch store status',
      details: error.message
    });
  }
});

/**
 * DELETE /api/store/:storeName
 * Deletes a store and all its resources
 */
app.delete('/api/store/:storeName', async (req, res) => {
  const userId = req.headers['x-user-id'] || 'default';
  metrics.apiRequests++;
  
  try {
    const { storeName } = req.params;
    
    if (!storeMetadata.has(storeName)) {
      metrics.errors++;
      return res.status(404).json({
        success: false,
        error: `Store "${storeName}" not found`
      });
    }
    
    const metadata = storeMetadata.get(storeName);
    const namespace = metadata.namespace;
    const helmReleaseName = metadata.helmRelease;
    
    auditLogEntry('DELETE_START', { storeName, namespace }, userId);
    
    console.log(`Deleting store: ${storeName}`);
    
    // Step 1: Uninstall Helm release
    try {
      await execAsync(`helm uninstall ${helmReleaseName} --namespace ${namespace}`);
      console.log(`Helm release ${helmReleaseName} uninstalled`);
    } catch (error) {
      console.error(`Error uninstalling Helm release: ${error.message}`);
      // Continue with namespace deletion even if Helm uninstall fails
    }
    
    // Step 2: Delete namespace (this removes all resources)
    try {
      await execAsync(`kubectl delete namespace ${namespace} --wait=true --timeout=5m`);
      console.log(`Namespace ${namespace} deleted`);
    } catch (error) {
      console.error(`Error deleting namespace: ${error.message}`);
      // Still remove from metadata even if deletion fails
    }
    
    // Remove from metadata
    storeMetadata.delete(storeName);
    activeProvisioning.delete(storeName);
    
    metrics.storesDeleted++;
    auditLogEntry('DELETE_SUCCESS', { storeName, namespace }, userId);
    
    res.json({
      success: true,
      message: `Store "${storeName}" deleted successfully`
    });
    
  } catch (error) {
    console.error('Deletion error:', error);
    metrics.errors++;
    const auditEntry = auditLogEntry('DELETE_ERROR', { 
      storeName: req.params.storeName, 
      error: error.message 
    }, userId);
    auditEntry.success = false;
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete store',
      details: error.message
    });
  }
});

/**
 * GET /api/metrics
 * Returns platform metrics
 */
app.get('/api/metrics', (req, res) => {
  const avgProvisioningTime = metrics.provisioningDurations.length > 0
    ? metrics.provisioningDurations.reduce((a, b) => a + b, 0) / metrics.provisioningDurations.length
    : 0;
  
  res.json({
    success: true,
    metrics: {
      ...metrics,
      averageProvisioningTime: Math.round(avgProvisioningTime),
      activeStores: storeMetadata.size,
      activeProvisioning: activeProvisioning.size
    }
  });
});

/**
 * GET /api/audit
 * Returns audit log
 */
app.get('/api/audit', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = auditLog.slice(-limit).reverse();
  
  res.json({
    success: true,
    logs,
    count: logs.length,
    total: auditLog.length
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: ENV,
    storesCount: storeMetadata.size,
    activeProvisioning: activeProvisioning.size
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Kubernetes Store Provisioning API running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${ENV}`);
  console.log(`📝 Using values file: ${VALUES_FILE}`);
  console.log(`🔒 Rate limiting: 10 requests/minute`);
  console.log(`📦 Store quota: ${MAX_STORES_PER_USER} stores per user`);
});
