# Run after Minikube is installed (choco install minikube)
# Start Minikube cluster and enable Ingress

Write-Host "Starting Minikube cluster..." -ForegroundColor Cyan
minikube start
if ($LASTEXITCODE -ne 0) {
    Write-Host "Minikube start failed. Ensure Minikube is installed and Docker/VM driver is available." -ForegroundColor Red
    exit 1
}

Write-Host "Enabling Ingress addon..." -ForegroundColor Cyan
minikube addons enable ingress
if ($LASTEXITCODE -ne 0) {
    Write-Host "Ingress enable failed." -ForegroundColor Red
    exit 1
}

Write-Host "Verifying cluster..." -ForegroundColor Cyan
kubectl cluster-info
kubectl get nodes
Write-Host "Done. kubectl is now configured for the Minikube cluster." -ForegroundColor Green
