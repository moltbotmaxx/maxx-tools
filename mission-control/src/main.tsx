import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-12 text-center space-y-6">
          <h1 className="text-6xl font-black uppercase tracking-tighter text-accent">Neural Link Failure</h1>
          <p className="text-white/40 font-mono text-sm max-w-md">Critical runtime error detected in Swarm OS. Neural link persistence interrupted.</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-accent text-white px-8 py-3 font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform"
          >
            Re-initialize Link
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
