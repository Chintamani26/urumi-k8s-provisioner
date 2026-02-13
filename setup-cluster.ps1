# Quick Setup Script for Kubernetes Cluster (Kind)
# Run this script to set up a local Kubernetes cluster

Write-Host "🚀 Setting up local Kubernetes cluster with Kind..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
$dockerRunning = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker is running" -ForegroundColor Green

# Check if Kind is installed
Write-Host "Checking Kind installation..." -ForegroundColor Yellow
$kindInstalled = Get-Command kind -ErrorAction SilentlyContinue
if (-not $kindInstalled) {
    Write-Host "Kind is not installed. Installing..." -ForegroundColor Yellow
    
    # Download Kind for Windows
    $kindUrl = "https://kind.sigs.k8s.io/dl/v0.20.0/kind-windows-amd64"
    $kindPath = "$env:TEMP\kind.exe"
    
    Write-Host "Downloading Kind..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $kindUrl -OutFile $kindPath
    
    # Move to system path (requires admin)
    Write-Host "Installing Kind (requires admin privileges)..." -ForegroundColor Yellow
    try {
        Copy-Item $kindPath "C:\Windows\kind.exe" -Force
        Write-Host "✅ Kind installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Could not install to C:\Windows. Please run as Administrator or add $kindPath to PATH" -ForegroundColor Yellow
        Write-Host "You can also manually download from: https://kind.sigs.k8s.io/dl/v0.20.0/kind-windows-amd64" -ForegroundColor Yellow
        Write-Host "Or use: choco install kind" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "✅ Kind is already installed" -ForegroundColor Green
}

# Check if cluster already exists
Write-Host "Checking for existing cluster..." -ForegroundColor Yellow
$clusterExists = kind get clusters 2>&1 | Select-String "store-provisioner"
if ($clusterExists) {
    Write-Host "⚠️  Cluster 'store-provisioner' already exists" -ForegroundColor Yellow
    $response = Read-Host "Do you want to delete and recreate it? (y/N)"
    if ($response -eq "y" -or $response -eq "Y") {
        Write-Host "Deleting existing cluster..." -ForegroundColor Yellow
        kind delete cluster --name store-provisioner
    } else {
        Write-Host "Using existing cluster..." -ForegroundColor Yellow
        kubectl cluster-info --context kind-store-provisioner
        exit 0
    }
}

# Create Kind cluster
Write-Host "Creating Kind cluster 'store-provisioner'..." -ForegroundColor Yellow
kind create cluster --name store-provisioner
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create cluster" -ForegroundColor Red
    exit 1
}

# Configure kubectl context
Write-Host "Configuring kubectl..." -ForegroundColor Yellow
kubectl cluster-info --context kind-store-provisioner

# Install NGINX Ingress
Write-Host "Installing NGINX Ingress Controller..." -ForegroundColor Yellow
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

Write-Host "Waiting for Ingress Controller to be ready (this may take a minute)..." -ForegroundColor Yellow
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=90s

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ NGINX Ingress Controller is ready" -ForegroundColor Green
} else {
    Write-Host "⚠️  Ingress Controller may still be starting. Check with: kubectl get pods -n ingress-nginx" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Kubernetes cluster setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Verify setup:" -ForegroundColor Cyan
Write-Host "  kubectl get nodes" -ForegroundColor White
Write-Host "  kubectl get pods -A" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start backend: cd backend && npm start" -ForegroundColor White
Write-Host "  2. Start frontend: cd frontend && npm run dev" -ForegroundColor White
Write-Host "  3. Open dashboard: http://localhost:3000" -ForegroundColor White
Write-Host ""
