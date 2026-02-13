import { useState, useEffect } from 'react';
import axios from 'axios';

function App() {
  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState('woocommerce');
  const [loading, setLoading] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState([]);
  const [activeStores, setActiveStores] = useState([]);
  const [error, setError] = useState(null);

  // Fetch active stores on component mount and periodically
  useEffect(() => {
    fetchActiveStores();
    const interval = setInterval(fetchActiveStores, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchActiveStores = async () => {
    try {
      const response = await axios.get('/api/status');
      if (response.data.success) {
        setActiveStores(response.data.stores);
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err);
    }
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleOutput(prev => [
      ...prev,
      { timestamp, message, type }
    ]);
  };

  const handleDeploy = async (e) => {
    e.preventDefault();
    
    if (!storeName.trim()) {
      setError('Store name is required');
      return;
    }

    setLoading(true);
    setError(null);
    addLog(`🚀 Initiating deployment for ${storeType} store: ${storeName}`, 'info');
    addLog('Creating namespace...', 'info');

    try {
      const response = await axios.post('/api/deploy', { 
        storeName, 
        storeType 
      });
      
      if (response.data.success) {
        addLog(`✅ Successfully deployed store: ${storeName}`, 'success');
        addLog(`📦 Type: ${response.data.store.type}`, 'info');
        addLog(`📦 Namespace: ${response.data.store.namespace}`, 'info');
        addLog(`🌐 Store URL: ${response.data.store.storeUrl}`, 'info');
        addLog(`📋 Helm Release: ${response.data.store.helmRelease}`, 'info');
        addLog(`📊 Status: ${response.data.store.status}`, 'info');
        
        if (response.data.logs) {
          addLog('📝 Helm Output:', 'info');
          response.data.logs.split('\n').forEach(line => {
            if (line.trim()) addLog(`   ${line}`, 'output');
          });
        }
        
        setStoreName('');
        await fetchActiveStores();
      } else {
        throw new Error(response.data.error || 'Deployment failed');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Unknown error';
      setError(errorMessage);
      addLog(`❌ Deployment failed: ${errorMessage}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (storeName) => {
    if (!window.confirm(`Are you sure you want to delete store "${storeName}"? This will remove all resources.`)) {
      return;
    }

    addLog(`🗑️ Deleting store: ${storeName}`, 'info');

    try {
      const response = await axios.delete(`/api/store/${storeName}`);
      
      if (response.data.success) {
        addLog(`✅ Successfully deleted store: ${storeName}`, 'success');
        await fetchActiveStores();
      } else {
        throw new Error(response.data.error || 'Deletion failed');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Unknown error';
      addLog(`❌ Deletion failed: ${errorMessage}`, 'error');
      alert(`Failed to delete store: ${errorMessage}`);
    }
  };

  const getLogColor = (type) => {
    switch (type) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'output': return 'text-gray-300';
      default: return 'text-blue-400';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Ready':
        return 'bg-green-600';
      case 'Provisioning':
        return 'bg-yellow-600';
      case 'Failed':
        return 'bg-red-600';
      default:
        return 'bg-gray-600';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <h1 className="text-3xl font-bold text-blue-400">
            🚀 Kubernetes Store Provisioning Platform
          </h1>
          <p className="text-gray-400 mt-1">
            Deploy and manage WooCommerce & MedusaJS stores on Kubernetes
          </p>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Deployment Form */}
          <div className="space-y-6">
            {/* Deployment Form */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
              <h2 className="text-2xl font-semibold mb-4 text-blue-400">
                Create New Store
              </h2>
              
              <form onSubmit={handleDeploy} className="space-y-4">
                <div>
                  <label htmlFor="storeType" className="block text-sm font-medium text-gray-300 mb-2">
                    Store Type
                  </label>
                  <select
                    id="storeType"
                    value={storeType}
                    onChange={(e) => setStoreType(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                    disabled={loading}
                  >
                    <option value="woocommerce">WooCommerce (WordPress)</option>
                    <option value="medusa">MedusaJS</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Choose your ecommerce platform
                  </p>
                </div>

                <div>
                  <label htmlFor="storeName" className="block text-sm font-medium text-gray-300 mb-2">
                    Store Name
                  </label>
                  <input
                    id="storeName"
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="e.g., mystore"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-400"
                    disabled={loading}
                    pattern="[a-zA-Z0-9]+"
                    title="Alphanumeric characters only"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Alphanumeric only, 3-30 characters
                  </p>
                </div>

                {error && (
                  <div className="bg-red-900/30 border border-red-500 rounded-lg p-3">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !storeName.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Deploying...
                    </>
                  ) : (
                    '🚀 Deploy Store'
                  )}
                </button>
              </form>
            </div>

            {/* Console Output */}
            <div className="bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-blue-400">
                  Console Output
                </h2>
                <button
                  onClick={() => setConsoleOutput([])}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
                {consoleOutput.length === 0 ? (
                  <p className="text-gray-500 italic">No logs yet. Deploy a store to see output.</p>
                ) : (
                  consoleOutput.map((log, idx) => (
                    <div key={idx} className={`mb-1 ${getLogColor(log.type)}`}>
                      <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Active Stores */}
          <div className="bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-blue-400">
                Active Stores ({activeStores.length})
              </h2>
            </div>
            
            {activeStores.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg mb-2">No stores deployed yet</p>
                <p className="text-gray-500 text-sm">Deploy your first store to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeStores.map((store, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-white">{store.name}</h3>
                        <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded uppercase">
                          {store.type}
                        </span>
                      </div>
                      <span className={`px-2 py-1 ${getStatusColor(store.status)} text-white text-xs rounded-full`}>
                        {store.status}
                      </span>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-300 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 min-w-[80px]">URL:</span>
                        <a 
                          href={store.storeUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300 underline truncate"
                        >
                          {store.storeUrl}
                        </a>
                      </div>
                      <p><span className="text-gray-500">Namespace:</span> {store.namespace}</p>
                      <p><span className="text-gray-500">Created:</span> {formatDate(store.createdAt)}</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <a
                        href={store.storeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-center py-2 px-4 rounded-lg transition-colors text-sm"
                      >
                        Open Store
                      </a>
                      <button
                        onClick={() => handleDelete(store.name)}
                        className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors text-sm"
                        disabled={store.status === 'Provisioning'}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 mt-12">
        <div className="container mx-auto px-6 py-4 text-center text-gray-400 text-sm">
          Kubernetes Store Provisioning Platform | Built with React, Node.js, and Helm
        </div>
      </footer>
    </div>
  );
}

export default App;
