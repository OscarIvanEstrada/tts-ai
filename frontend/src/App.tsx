import React from 'react';
import HomePage from './pages/HomePage';

const App = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="container mx-auto p-4">
          <h1 className="text-2xl font-bold">TTS Streaming</h1>
        </div>
      </header>
      <main className="container mx-auto p-4">
        <HomePage />
      </main>
    </div>
  );
};

export default App;