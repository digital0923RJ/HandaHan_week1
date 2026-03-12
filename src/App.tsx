import { useState } from 'react';
import './App.css';

function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  return (
    <div className={`App${darkMode ? ' dark' : ''}`}>
      <header className="App-header">
        <div className="header-titles">
          <h1>Hi, What do you want to say in Korean?</h1>
          <p className="header-subtitle">I want to say that...</p>
        </div>
        <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
      </header>
      <main className="learning-container">
        <section className="input-section">
          <textarea placeholder="Enter English sentence here..."></textarea>
          <button onClick={() => setAnalyzed(true)}>Analyze & Explain</button>
        </section>

        {analyzed && (
          <>
            <section className="output-section">
              <div className="result-box"></div>
            </section>
            <section className="explanation-section">
              <div className="result-box"></div>
            </section>
            <div className="practice-cta">
              <button className="practice-btn" onClick={() => window.location.href = '/subscribe'}>
                Practice Similar Sentences →
              </button>
            </div>
          </>
        )}

        <section className="practice-section">
          <div className="result-box"></div>
          <input type="text" placeholder="Enter your English translation..." />
          <button>Check Answer</button>
        </section>
      </main>
    </div>
  );
}

export default App;
